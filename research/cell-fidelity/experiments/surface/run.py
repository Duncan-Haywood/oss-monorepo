"""Milestone 5za: does the plating feedback, read at the separator-side particle surface instead of at open circuit,
predict the 100-cycle lithium loss on the LG M50 sets from ten cycles, with no constant fitted?

    python experiments/surface/run.py dev       # 5z's designs re-run to cycle 10 for the surface offset (pybamm), then
                                                # the dev table on 5z's committed 100-cycle curves -> dev.jsonl, dev.txt
    python experiments/surface/run.py tables    # balance tables of the fresh designs (pybamm, no simulation)
    WORKERS=3 python experiments/surface/run.py bench   # DFN (SEI + plating) to cycle 100 with the surface terms (resumable)
    python experiments/surface/run.py report    # H143 to H146 (stdlib) -> results.txt, summary.json

5x read the plating law's feedback through the negative electrode's open-circuit potential at the upper cut-off,
dU(L) = U_n(x1(n_Li - L)) - U_n(x1(n_Li)), and 5y fitted a power law to R = int_0^L exp(kappa dU) dl over cycles 2 to 10.
On the LG M50 sets (Chen2020, OKane2022) the open-circuit x1 sits on the graphite plateau, dU is under 9 mV, and the
predictor over-predicts the cycle-99 loss by about 35%. 5z found the lever at the loaded surface by the separator: its
OCP rises 38 mV by cycle 99. This milestone shifts the stoichiometry 5x reads by the surface-over-bulk offset at end of
charge, delta = x_surf(separator, end of charge) - x1(n_Li - L), averaged over cycles 2 to 10 of the design's own run:
dU_s(L) = U_n(x1(n_Li - L) + delta) - U_n(x1(n_Li) + delta). Everything else is 5y's predictor unchanged.
Plan in ../../LOG.md (5za plan), written before any fresh run.
"""
import importlib.util
import json
import math
import os
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


RL = _mod("rlaw_run", EXP / "rlaw" / "run.py")
D, CS, CM, FL, S, B = RL.D, RL.CS, RL.CM, RL.FL, RL.S, RL.B
K, TO = D.K, D.TO
KAPPA, NGRID = D.KAPPA, D.NGRID
spearman, sign_p = B.spearman, FL.sign_p

CYCLES = TO
WORKERS = int(os.environ.get("WORKERS", "3"))
SOBOL_SEED = 19        # used by no milestone (5y used 17, 5z drew re-runs with random.Random(18))
N_LOG2 = 5             # 32 designs per pool
# fixed before any run: the two LG M50 sets at 5w's current (where 5y over-predicts by 35%), and one control each
# where 5y works (NCA_Kim2011, Ai2020) at the currents 5z re-ran
CONDITIONS = ("Chen2020@1.5x", "OKane2022@1.5x", "NCA_Kim2011@0.875x", "Ai2020@0.45x")
LGM50 = CONDITIONS[:2]
DEV_POOLS = (("crossset", "Chen2020@1.5x"), ("crossset", "OKane2022@1.5x"), ("crossset", "NCA_Kim2011@0.875x"),
             ("calmap", "Ai2020@0.45x"))


# ---------- pure helpers (stdlib; tested) ----------

def du_surf(l, b, delta):
    """Rise of the negative OCP at the open-circuit upper-cut-off stoichiometry shifted by delta, after losing l mol."""
    x_full = B.window(b["n_li"], b)[1] + delta
    x_lost = B.window(b["n_li"] - l, b)[1] + delta
    return B.interp(b["g"], b["Un"], x_lost) - B.interp(b["g"], b["Un"], x_full)


def r_table(b, l_max, delta, kappa=KAPPA, n=NGRID):
    """(L, R) on [0, l_max]: R(L) = int_0^L exp(kappa dU_s(l)) dl (5x's table with the surface offset)."""
    ls = [l_max * i / n for i in range(n + 1)]
    gs = [math.exp(kappa * du_surf(l, b, delta)) for l in ls]
    rs = [0.0]
    for i in range(1, n + 1):
        rs.append(rs[-1] + 0.5 * (gs[i] + gs[i - 1]) * (ls[i] - ls[i - 1]))
    return ls, rs


def surface_loss(lost, b, delta, law=RL.R_LAW, kappa=KAPPA):
    """L_s(99): 5y's power law fitted to R_s over cycles 2 to 10, read at cycle 99, inverted to L. None if no fit."""
    l_max = min(0.9 * b["n_li"], max(4 * max(lost[:K]), 1e-12))
    tab = None
    for _ in range(8):
        tab = r_table(b, l_max, delta, kappa)
        rk = [B.interp(tab[0], tab[1], v) if v <= l_max else None for v in lost[:K]]
        if None in rk:
            l_max = min(0.95 * b["n_li"], 2 * l_max)
            continue
        r99 = FL.law_l(rk, law, TO - 1)
        if r99 is None:
            return None
        if r99 <= tab[1][-1] or l_max >= 0.95 * b["n_li"] - 1e-15:
            return D.l_of_r(tab, r99)
        l_max = min(0.95 * b["n_li"], 2 * l_max)
    return D.l_of_r(tab, r99)


def offset(xs_end, lost, b, k=K):
    """delta: mean over cycles 2..k of the separator-node surface stoichiometry at end of charge minus the open-circuit
    upper-cut-off stoichiometry with the lithium left at that time (end of cycle n holds cycle n's charge)."""
    d = [xs_end[n - 1] - B.window(b["n_li"] - lost[n - 1], b)[1] for n in range(2, k + 1)]
    return statistics.mean(d)


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
    S_, TR = fc.P._sand(), fc.G.TR
    _, _, _, _, cur = S_.geometry(x, s, rate)
    pv, _, _ = TR.params(x, s)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    out = dict(cond=c, j=j, x=list(map(float, x)), current_A=cur, ok=True, error=None)
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * CYCLES)
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(pybamm.lithium_ion.DFN(B.VARIANTS["both"]), parameter_values=pv,
                                experiment=exp).solve(initial_soc=1.0)
        rec = {k: [] for k in ("cycle_wh", "lost_mol", "pl_mol", "sei_mol", "xs_end", "u_end")}
        for cy in sol.cycles:
            d, ch = cy.steps[0], cy.steps[1]
            i, t = d["Current [A]"].entries, d["Time [s]"].entries
            rec["cycle_wh"].append(float(np.trapezoid(d["Terminal voltage [V]"].entries * i, t)) / 3600)
            rec["lost_mol"].append(float(cy["Total lithium lost [mol]"].entries[-1]))
            rec["pl_mol"].append(float(cy["Loss of lithium to negative lithium plating [mol]"].entries[-1]))
            rec["sei_mol"].append(float(cy["Loss of lithium to negative SEI [mol]"].entries[-1]))
            rec["xs_end"].append(float(ch["Negative particle surface stoichiometry"].entries[-1, -1]))   # separator node
            rec["u_end"].append(float(ch["Negative electrode open-circuit potential [V]"].entries[-1, -1]))
        out.update(rec, ok_cycles=len(sol.cycles),
                   n_parallel=float(pv["Number of electrodes connected in parallel to make a cell"]))
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}")
    out["seconds"] = time.perf_counter() - t0
    return out


def _run(todo, path, timeout=2400):
    def one(job):
        c, j, x = job
        try:
            p = subprocess.run([sys.executable, __file__, "child", json.dumps([c, j, x]), str(CYCLES)],
                               capture_output=True, text=True, timeout=timeout)
            if p.returncode == 0 and p.stdout.strip():
                return json.loads(p.stdout.strip().splitlines()[-1])
            err = f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
        except subprocess.TimeoutExpired:
            err = f"timeout {timeout}s"
        return dict(cond=c, j=j, x=x, ok=False, error=err, seconds=None)
    print(f"{len(todo)} runs to go", flush=True)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], "ok" if r["ok"] else r["error"], r.get("seconds"), flush=True)


def tables():
    FL.HERE, FL.SOBOL_SEED, FL.CONDITIONS, FL.N_LOG2 = HERE, SOBOL_SEED, CONDITIONS, N_LOG2
    FL.tables()


def bench():
    path = HERE / "bench.jsonl"
    # a run the kernel killed for memory (exit -9) is retried; the report keeps the last record per design
    done = {(r["cond"], r["j"]) for r in B._load(path)
            if not str(r.get("error") or "").startswith("exit -9")} if path.exists() else set()
    rows = B._load(HERE / "balance.jsonl")
    _run([(r["cond"], r["j"], r["x"]) for r in rows if (r["cond"], r["j"]) not in done], path)


# ---------- rows ----------

def _bal(d):
    return {(r["cond"], r["j"]): r for r in B._load(d / "balance.jsonl")}, json.loads((d / "ocp.json").read_text())


def row(b, lost, xs_end, l_true):
    """Per design: 5y's open-circuit predictor, the surface-shifted one, and the offset."""
    delta = offset(xs_end, lost, b)
    l_rp = RL.rlaw_loss(lost, b)
    l_s = surface_loss(lost, b, delta)
    return dict(delta=delta, l_rp=l_rp, l_s=l_s, l_true=l_true, n_li=b["n_li"],
                du99_oc=du_surf(l_true, b, 0.0), du99_s=du_surf(l_true, b, delta))


def summarise(rows):
    ok = [r for r in rows if r["l_rp"] and r["l_s"]]
    return dict(n=len(ok), lerr_rp=RL.med_abs_log(ok, "l_rp"), lerr_s=RL.med_abs_log(ok, "l_s"),
                sgn_rp=RL.med_signed_log(ok, "l_rp"), sgn_s=RL.med_signed_log(ok, "l_s"),
                delta_med=statistics.median(r["delta"] for r in ok),
                du99_oc_mV=1e3 * statistics.median(r["du99_oc"] for r in ok),
                du99_s_mV=1e3 * statistics.median(r["du99_s"] for r in ok),
                rhoL_s=spearman([r["l_s"] for r in ok], [r["l_true"] for r in ok]),
                rhoL_rp=spearman([r["l_rp"] for r in ok], [r["l_true"] for r in ok]),
                wins=sum(CM.log_err(r["l_s"], r["l_true"]) < CM.log_err(r["l_rp"], r["l_true"]) for r in ok))


# ---------- dev (seen) ----------

def dev():
    """5z's 39 committed 100-cycle curves (seen at the aggregate level) with the offset from a 10-cycle re-run."""
    global CYCLES
    path = HERE / "dev.jsonl"
    done = {(r["cond"], r["j"]) for r in B._load(path)} if path.exists() else set()
    mz = {(r["cond"], r["j"]): r for r in B._load(EXP / "mechanism" / "bench.jsonl") if r.get("ok")}
    CYCLES = K
    _run([(c, j, r["x"]) for (c, j), r in sorted(mz.items()) if (c, j) not in done], path)
    short = {(r["cond"], r["j"]): r for r in B._load(path) if r.get("ok")}
    L, out = [], {}
    for d, c in DEV_POOLS:
        bal, ocp = _bal(EXP / d)
        rows = []
        for (cc, j), f in sorted(mz.items()):
            if cc != c or (c, j) not in short:
                continue
            b = dict(bal[(c, j)]) | dict(g=ocp["grid"]) | ocp["sets"][bal[(c, j)]["pset"]]
            rows.append(row(b, f["lost_mol"], short[(c, j)]["xs_end"], f["lost_mol"][TO - 2]))
        out[c] = summarise(rows)
        p = out[c]
        L.append(f"{c:20s} n {p['n']:2d}  |ln err| 5y {p['lerr_rp']:.3f} surface {p['lerr_s']:.3f}  signed 5y {p['sgn_rp']:+.3f}"
                 f" surface {p['sgn_s']:+.3f}  wins {p['wins']}/{p['n']}  delta {p['delta_med']:+.4f}"
                 f"  dU99 oc {p['du99_oc_mV']:.1f} mV surface {p['du99_s_mV']:.1f} mV")
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


# ---------- report ----------

def verdicts(C):
    lg = [C[c] for c in LGM50 if c in C]
    ctl = [C[c] for c in CONDITIONS[2:] if c in C]
    w143 = sum(c["lerr_s"] < c["lerr_rp"] for c in lg)
    w144 = sum(c["lerr_s"] <= 0.15 for c in lg)
    f144 = sum(c["lerr_s"] > 0.25 for c in lg)
    w145 = sum(c["lerr_s"] > c["lerr_rp"] + 0.03 for c in ctl)      # dev: the surface reading hurts where 5y works
    f145 = sum(c["lerr_s"] <= c["lerr_rp"] for c in ctl)
    return dict(H143=S.verdict(w143 == len(lg), w143 == 0), H143_wins=w143,
                H144=S.verdict(w144 == len(lg), f144 >= 1), H144_wins=w144,
                H145=S.verdict(w145 == len(ctl), f145 >= 1), H145_wins=w145,
                H146=S.verdict(all(c["rhoL_s"] >= 0.9 for c in lg), any(c["rhoL_s"] < 0.8 for c in lg)))


def report():
    runs = {(r["cond"], r["j"]): r for r in B._load(HERE / "bench.jsonl")}
    bal, ocp = _bal(HERE)
    C, Rows, dropped = {}, {}, {}
    for c in CONDITIONS:
        rows = []
        for (cc, j), f in sorted(runs.items()):
            if cc != c:
                continue
            if not f.get("ok") or f.get("ok_cycles", 0) < CYCLES:
                dropped[c] = dropped.get(c, 0) + 1
                continue
            b = dict(bal[(c, j)]) | dict(g=ocp["grid"]) | ocp["sets"][bal[(c, j)]["pset"]]
            r = row(b, f["lost_mol"], f["xs_end"], f["lost_mol"][TO - 2])
            n = f.get("n_parallel", 1.0)
            r.update(j=j, pl_share=n * f["pl_mol"][TO - 2] / f["lost_mol"][TO - 2],
                     sei_share=n * f["sei_mol"][TO - 2] / f["lost_mol"][TO - 2],
                     book_ratio=f["lost_mol"][TO - 2] / (f["pl_mol"][TO - 2] + f["sei_mol"][TO - 2]) / n)
            rows.append(r)
        if rows:
            C[c] = summarise(rows) | dict(dropped=dropped.get(c, 0),
                                          pl_share=statistics.median(r["pl_share"] for r in rows),
                                          book_ratio_max=max(abs(r["book_ratio"] - 1) for r in rows))
            Rows[c] = rows
    V = verdicts(C)
    L = ["cell-fidelity milestone 5za: the plating feedback read at the separator-side surface (5y's predictor with the",
         "surface-over-bulk offset at end of charge, from cycles 2 to 10). DFN (SEI + plating) to cycle 100, fresh Sobol",
         f"designs (seed {SOBOL_SEED}); median |ln(L_pred(99) / L_DFN(99))|", "",
         f"{'condition':20s}{'n':>3s}{'drop':>5s}{'5y':>7s}{'surf':>7s}{'sgn 5y':>8s}{'sgn s':>7s}{'wins':>6s}{'rhoL s':>8s}"
         f"{'rhoL 5y':>8s}{'delta':>8s}{'dU oc':>7s}{'dU s':>7s}{'plat%':>7s}{'|book-1|':>9s}"]
    for c, d in C.items():
        L.append(f"{c:20s}{d['n']:3d}{d['dropped']:5d}{d['lerr_rp']:7.3f}{d['lerr_s']:7.3f}{d['sgn_rp']:+8.3f}{d['sgn_s']:+7.3f}"
                 f"{d['wins']:6d}{d['rhoL_s']:8.3f}{d['rhoL_rp']:8.3f}{d['delta_med']:+8.4f}{d['du99_oc_mV']:7.1f}"
                 f"{d['du99_s_mV']:7.1f}{100 * d['pl_share']:7.1f}{d['book_ratio_max']:9.5f}")
    L += ["", "(dU: median rise of the negative OCP by cycle 99 at open circuit and at the shifted stoichiometry, mV; plat%:",
          " plating's share of the cycle-99 loss with the booked mol times the parallel-electrode count; |book-1|: largest",
          " |total lost / (count x booked side-reaction loss) - 1|)", "",
          f"H143 (surface predictor beats 5y's on both LG M50 pools): {V['H143']}",
          f"H144 (surface predictor within 0.15 on both LG M50 pools): {V['H144']}",
          f"H145 (not universal: worse than 5y by more than 0.03 on both controls): {V['H145']}",
          f"H146 (surface predictor ranks the cycle-99 loss at 0.9 or above on both LG M50 pools): {V['H146']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=Rows), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "child":
        CYCLES = int(sys.argv[3])
        print(json.dumps(simulate(json.loads(sys.argv[2]))))
    else:
        {"dev": dev, "tables": tables, "bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
