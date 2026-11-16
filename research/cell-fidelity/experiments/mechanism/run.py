"""Milestone 5z: on the LG M50 sets (Chen2020, OKane2022), what slows the lithium loss over 100 cycles?

    WORKERS=3 python experiments/mechanism/run.py bench    # DFN (SEI + plating) to cycle 100 with the plating terms (pybamm; resumable)
    python experiments/mechanism/run.py report             # H139 to H142 (stdlib) -> results.txt, summary.json

5x derived the self-limiting correction from the plating law's own exponential acting through the negative electrode's
open-circuit potential at top of charge. That works on NCA_Kim2011 and predicts no feedback on the LG M50 sets, whose
graphite sits on its plateau at the cut-off (dU 0.5 and 8.9 mV), yet there the per-cycle loss falls about threefold from
cycle 2 to 99. A charge-throughput feedback (dev, 5z plan) does not explain it either. This bench re-runs committed designs
of 5w's two LG M50 pools, plus controls on NCA_Kim2011 and Ai2020, and records per cycle the lithium lost to SEI and to
plating, the charge time, and at the separator-side node of the negative electrode, where plating is fastest, the terms of
PyBaMM's plating exponent: surface potential difference dphi = U(surface stoichiometry) + eta_int, the SEI film
overpotential eta_SEI and the electrolyte concentration c_e that sets j0. Plan in ../../LOG.md (5z plan).
"""
import importlib.util
import json
import math
import os
import random
import statistics
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


B = _mod("balance_run", EXP / "balance" / "run.py")
spearman = B.spearman

CYCLES = 100
WORKERS = int(os.environ.get("WORKERS", "3"))
ALPHA, T_K = 0.65, 298.15                      # OKane2022 plating transfer coefficient; ambient of every set (as 5x)
KAPPA = ALPHA * 96485.33212 / (8.314462618 * T_K)
# (committed pool, condition, designs re-run): the two LG M50 pools of 5w, and one control pool each where 5x's OCP
# feedback works (NCA_Kim2011) and half-works (Ai2020); designs drawn with random.Random(18) from each pool's 64
POOLS = (("crossset", "Chen2020@1.5x", 12), ("crossset", "OKane2022@1.5x", 12),
         ("crossset", "NCA_Kim2011@0.875x", 8), ("calmap", "Ai2020@0.45x", 8))
LGM50 = ("Chen2020@1.5x", "OKane2022@1.5x")
LO, HI = 2, 99                                 # cycles compared (1-based), as the 100-cycle milestones read cycle 99


def picks(n_pool, k):
    return sorted(random.Random(18).sample(range(n_pool), k))


# ---------- pure helpers (stdlib; tested) ----------

def increments(cum):
    """Per-cycle amounts from end-of-cycle cumulative ones (cycle 1 keeps its own)."""
    return [cum[0]] + [cum[i] - cum[i - 1] for i in range(1, len(cum))]


def trapz(y, t):
    return sum(0.5 * (y[i] + y[i - 1]) * (t[i] - t[i - 1]) for i in range(1, len(t)))


def rate_index(t, dphi, eta_sei, ce, kappa=KAPPA):
    """int c_e exp(-kappa (dphi + eta_SEI)) dt over the charge: the irreversible plating rate at one node, up to j0's
    constant (PyBaMM: j = -j0(c_e) exp(-alpha F (dphi + eta_SEI) / RT), j0 proportional to c_e for OKane2022)."""
    return trapz([c * math.exp(-kappa * (p + s)) for p, s, c in zip(dphi, eta_sei, ce)], t)


def decompose(lo, hi, kappa=KAPPA):
    """Log change of the separator-node plating exponent between two cycles' end of charge, split into its terms."""
    return dict(ocp=-kappa * (hi["u_end"] - lo["u_end"]), eta_int=-kappa * (hi["eint_end"] - lo["eint_end"]),
                film=-kappa * (hi["sei_end"] - lo["sei_end"]), ce=math.log(hi["ce_end"] / lo["ce_end"]),
                time=math.log(hi["t_ch"] / lo["t_ch"]))


def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "mixed")


# ---------- pybamm ----------

def simulate(job):
    import numpy as np
    import pybamm
    fc = B._fc()
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    c, j, x = job
    s, rate = fc.G._parse(c)
    x = cell.clip(x)
    S, TR = fc.P._sand(), fc.G.TR
    _, _, _, _, cur = S.geometry(x, s, rate)
    pv, _, _ = TR.params(x, s)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    out = dict(cond=c, j=j, x=list(map(float, x)), current_A=cur, ok=True, error=None)
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * CYCLES)
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(pybamm.lithium_ion.DFN(B.VARIANTS["both"]), parameter_values=pv,
                                experiment=exp).solve(initial_soc=1.0)
        rec = {k: [] for k in ("lost_mol", "sei_mol", "pl_mol", "cycle_wh", "t_ch", "u_end", "eint_end", "sei_end",
                               "ce_end", "dphi_end", "idx")}
        for cy in sol.cycles:
            d, ch = cy.steps[0], cy.steps[1]
            i, t = d["Current [A]"].entries, d["Time [s]"].entries
            rec["cycle_wh"].append(float(np.trapezoid(d["Terminal voltage [V]"].entries * i, t)) / 3600)
            rec["lost_mol"].append(float(cy["Total lithium lost [mol]"].entries[-1]))
            rec["sei_mol"].append(float(cy["Loss of lithium to negative SEI [mol]"].entries[-1]))
            rec["pl_mol"].append(float(cy["Loss of lithium to negative lithium plating [mol]"].entries[-1]))
            tc = ch["Time [s]"].entries
            dphi = ch["Negative electrode surface potential difference [V]"].entries[-1, :]   # separator-side node
            u = ch["Negative electrode open-circuit potential [V]"].entries[-1, :]
            film = ch["Negative electrode SEI film overpotential [V]"].entries
            film = film[-1, :] if film.ndim == 2 else film
            ce = ch["Negative electrolyte concentration [mol.m-3]"].entries[-1, :]
            rec["t_ch"].append(float(tc[-1] - tc[0]))
            rec["dphi_end"].append(float(dphi[-1]))
            rec["u_end"].append(float(u[-1]))
            rec["eint_end"].append(float(dphi[-1] - u[-1]))
            rec["sei_end"].append(float(film[-1]))
            rec["ce_end"].append(float(ce[-1]))
            rec["idx"].append(rate_index(list(tc), list(dphi), list(film), list(ce)))
        out.update(rec, ok_cycles=len(sol.cycles))
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}")
    out["seconds"] = time.perf_counter() - t0
    return out


def jobs():
    J = []
    for d, c, k in POOLS:
        rows = [r for r in B._load(EXP / d / "bench.jsonl") if r["cond"] == c and r.get("ok")]
        by_j = {r["j"]: r for r in rows}
        for j in picks(64, k):
            if j in by_j:
                J.append((d, c, j, by_j[j]["x"]))
    return J


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"]) for r in B._load(path)}
    todo = [(c, j, x) for _, c, j, x in jobs() if (c, j) not in done]
    print(f"{len(todo)} runs to go", flush=True)

    def one(job):
        c, j, x = job
        try:
            p = subprocess.run([sys.executable, __file__, "child", json.dumps([c, j, x])], capture_output=True, text=True,
                               timeout=2400)
            if p.returncode == 0 and p.stdout.strip():
                return json.loads(p.stdout.strip().splitlines()[-1])
            err = f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
        except subprocess.TimeoutExpired:
            err = "timeout 2400s"
        return dict(cond=c, j=j, x=x, ok=False, error=err, seconds=None)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], "ok" if r["ok"] else r["error"], r.get("seconds"), flush=True)


# ---------- report (stdlib) ----------

def design_row(r, ref):
    pl, sei = increments(r["pl_mol"]), increments(r["sei_mol"])
    lo, hi = {k: r[k][LO - 1] for k in ("u_end", "eint_end", "sei_end", "ce_end", "t_ch")}, \
        {k: r[k][HI - 1] for k in ("u_end", "eint_end", "sei_end", "ce_end", "t_ch")}
    dec = decompose(lo, hi)
    actual = math.log(pl[HI - 1] / pl[LO - 1])
    index = math.log(r["idx"][HI - 1] / r["idx"][LO - 1])
    end = sum(dec[k] for k in ("ocp", "eta_int", "film", "ce"))
    return dict(j=r["j"], pl_share=r["pl_mol"][HI - 1] / r["lost_mol"][HI - 1],
                sei_share=r["sei_mol"][HI - 1] / r["lost_mol"][HI - 1],
                repro=(r["lost_mol"][HI - 1] / ref["lost_mol"][HI - 1] - 1) if ref else None,
                actual=actual, index=index, end=end, **{f"d_{k}": v for k, v in dec.items()},
                ocp_share=dec["ocp"] / end if end else None,
                du_mV=1e3 * (hi["u_end"] - lo["u_end"]), dsei_mV=1e3 * (hi["sei_end"] - lo["sei_end"]),
                deint_mV=1e3 * (hi["eint_end"] - lo["eint_end"]))


def report():
    runs = [r for r in B._load(HERE / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= CYCLES]
    refs = {}
    for d, c, _ in POOLS:
        for r in B._load(EXP / d / "bench.jsonl"):
            if r["cond"] == c and r.get("ok"):
                refs[(c, r["j"])] = r
    C, Rows = {}, {}
    for _, c, k in POOLS:
        rows = [design_row(r, refs.get((c, r["j"]))) for r in runs if r["cond"] == c]
        if not rows:
            continue
        med = lambda key: statistics.median(x[key] for x in rows if x[key] is not None)
        C[c] = dict(n=len(rows), planned=k, **{key: med(key) for key in rows[0] if key != "j"},
                    idx_err=statistics.median(abs(x["index"] - x["actual"]) for x in rows),
                    repro_max=max(abs(x["repro"]) for x in rows if x["repro"] is not None))
        Rows[c] = rows
    lg = [C[c] for c in LGM50 if c in C]
    ctl = C.get("NCA_Kim2011@0.875x")
    V = dict(
        H139=verdict(all(min(x["pl_share"] for x in Rows[c]) >= 0.90 for c in LGM50 if c in Rows),
                     any(C[c]["pl_share"] < 0.75 for c in LGM50 if c in C)),
        H140=verdict(all(c["idx_err"] <= 0.20 for c in lg), any(c["idx_err"] > 0.40 for c in lg)),
        H141=verdict(all(c["ocp_share"] < 0.5 for c in lg) and ctl is not None and ctl["ocp_share"] > 0.5,
                     all(c["ocp_share"] > 0.5 for c in lg) or (ctl is not None and ctl["ocp_share"] < 0.5)),
        H142=verdict(all(c["repro_max"] <= 0.01 for c in C.values()), any(c["repro_max"] > 0.05 for c in C.values())))
    L = ["cell-fidelity milestone 5z: what slows the lithium loss? DFN (SEI + plating) to cycle 100, re-run designs of committed",
         f"pools; terms of PyBaMM's plating exponent at the separator-side node, cycle {LO} against cycle {HI} (log units,",
         "negative = slows plating; kappa = alpha F / RT = 25.3 per volt)", "",
         f"{'condition':20s}{'n':>3s}{'plat%':>7s}{'SEI%':>6s}{'repro':>7s}{'actual':>8s}{'index':>7s}{'|i-a|':>7s}"
         f"{'end':>7s}{'ocp':>7s}{'eta_i':>7s}{'film':>7s}{'c_e':>7s}{'time':>7s}{'ocp/end':>8s}{'dU mV':>7s}{'dfilm':>7s}{'deta_i':>7s}"]
    for c, d in C.items():
        L.append(f"{c:20s}{d['n']:3d}{100 * d['pl_share']:7.1f}{100 * d['sei_share']:6.1f}{d['repro_max']:7.4f}{d['actual']:8.3f}"
                 f"{d['index']:7.3f}{d['idx_err']:7.3f}{d['end']:7.3f}{d['d_ocp']:7.3f}{d['d_eta_int']:7.3f}{d['d_film']:7.3f}"
                 f"{d['d_ce']:7.3f}{d['d_time']:7.3f}{d['ocp_share']:8.2f}{d['du_mV']:7.1f}{d['dsei_mV']:7.1f}{d['deint_mV']:7.1f}")
    L += ["", "(columns are medians over the pool's re-run designs; repro is the largest |relative difference| of the cycle-99",
          " lithium loss from the committed run of the same design)", "",
          f"H139 (plating is at least 90% of the lithium lost by cycle 99 on every LG M50 design): {V['H139']}",
          f"H140 (the separator-node rate index tracks the per-cycle plating change within 0.20 on both LG M50 pools): {V['H140']}",
          f"H141 (the surface-OCP term is under half the end-of-charge exponent change on both LG M50 pools and over half on"
          f" NCA_Kim2011): {V['H141']}",
          f"H142 (re-runs reproduce the committed cycle-99 loss within 1%): {V['H142']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=Rows), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "child":
        if len(sys.argv) > 3:
            CYCLES = int(sys.argv[3])
        print(json.dumps(simulate(json.loads(sys.argv[2]))))
    else:
        {"bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
