"""Milestone 5zk: where through the negative electrode does the plating happen, and does the lever read there give the
plating exponent the ten-cycle forecast needs?

    WORKERS=3 python experiments/depth/run.py bench    # DFN (SEI + plating) to cycle 100, x-resolved plating (pybamm; resumable)
    python experiments/depth/run.py report             # H191 to H194 (stdlib) -> results.txt, summary.json

5zi read the plating lever (the rise of the negative OCP at end of charge) at one node, the separator side of the negative
electrode, and found it explains the exponent kappa* on OKane2022 and NCA_Kim2011 but overshoots threefold on Ai2020 and
undershoots on Chen2020; 5zj found the separator node's other terms do not close that. This bench re-runs 5z's 40
designs and records, per cycle and per negative-electrode node, the plating current integrated over the cycle and the
end-of-charge OCP, so the lever can be read where the plating actually is. Plan in ../../LOG.md (5zk plan).
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
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


M = _mod("mechanism_run", EXP / "mechanism" / "run.py")
B = M.B

CYCLES = 100
WORKERS = int(os.environ.get("WORKERS", "3"))
LO, HI = 2, 99                                   # 1-based cycles compared, as 5z
SETS = {"Ai2020": "Ai2020@0.45x", "Chen2020": "Chen2020@1.5x", "OKane2022": "OKane2022@1.5x",
        "NCA_Kim2011": "NCA_Kim2011@0.875x"}
LGM50 = ("Chen2020@1.5x", "OKane2022@1.5x")
NCA, AI = "NCA_Kim2011@0.875x", "Ai2020@0.45x"
# 5zi's set medians over its 24 pools (experiments/lever/summary.json), fixed in the plan
K_PATH = {"Ai2020": 73.5, "Chen2020": 33.0, "OKane2022": 36.6, "NCA_Kim2011": 22.6}
K_STAR = {"Ai2020": 20.8, "Chen2020": 52.3, "OKane2022": 38.1, "NCA_Kim2011": 23.0}


# ---------- pure helpers (stdlib; tested) ----------

def weights(p):
    """Node shares of one cycle's plating (uniform mesh)."""
    s = sum(p)
    return [v / s for v in p] if s > 0 else [float("nan")] * len(p)


def centroid(w, xs, L):
    """Plating-weighted depth from the current collector, as a fraction of the electrode thickness (1 = separator)."""
    return sum(wi * xi for wi, xi in zip(w, xs)) / L


def weighted_rise(w_lo, u_lo, u_hi):
    """OCP rise between two cycles weighted by where the plating was at the earlier one."""
    return sum(w * (b - a) for w, a, b in zip(w_lo, u_lo, u_hi))


def design_row(r, lo=LO, hi=HI):
    P, U = r["pl_node"], r["u_node"]
    a, b = lo - 1, hi - 1
    w_lo, w_hi = weights(P[a]), weights(P[b])
    tot = lambda n: sum(P[n])
    d_tot = math.log(tot(b) / tot(a))
    d_sep = math.log(P[b][-1] / P[a][-1])
    m_sep = U[b][-1] - U[a][-1]
    m_w = weighted_rise(w_lo, U[a], U[b])
    m_w99 = weighted_rise(w_hi, U[a], U[b])
    L = r["L_n"]
    booked = M.increments(r["pl_mol"])
    d_booked = math.log(booked[b] / booked[a])
    return dict(j=r["j"], s_lo=w_lo[-1], s_hi=w_hi[-1], c_lo=centroid(w_lo, r["x_n"], L), c_hi=centroid(w_hi, r["x_n"], L),
                d_tot=d_tot, d_sep=d_sep, gap=abs(d_sep - d_tot), d_booked=d_booked, m_sep=m_sep, m_w=m_w, m_w99=m_w99,
                pl99=r["pl_mol"][b], u99_sep=U[b][-1], dx_spread=r.get("dx_spread"))


def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "mixed")


def rel(a, b):
    return abs(a - b) / abs(b) if b else float("inf")


def verdicts(C, repro):
    """C: per-condition medians (s_lo, gap, ratio); repro: per-design (pl_rel, u_mV, d_err) against 5z's records."""
    s = {c: C[c]["s_lo"] for c in C}
    h191 = verdict(len(s) == 4 and all(v < 0.5 for v in s.values()), any(v > 0.8 for v in s.values()))
    g = {c: C[c]["gap"] for c in C}
    h192 = verdict(NCA in g and g[NCA] >= 0.2 and all(c in g and g[c] <= 0.1 for c in LGM50), NCA in g and g[NCA] < 0.1)
    kw = {st: K_PATH[st] * C[c]["ratio"] for st, c in SETS.items() if c in C}
    hit = {st: abs(kw[st] / K_STAR[st] - 1) <= 0.25 for st in kw}
    h193 = verdict(sum(hit.values()) >= 3 and hit.get("Ai2020", False), kw.get("Ai2020", 0) > 1.5 * K_STAR["Ai2020"])
    ok = all(p <= 1e-3 and u <= 0.1 and d <= 0.02 for p, u, d in repro)
    bad = any(p > 1e-2 or u > 1.0 or d > 0.2 for p, u, d in repro)
    h194 = verdict(bool(repro) and ok, bad)
    return dict(H191=h191, H192=h192, H193=h193, H194=h194), dict(k_w=kw, hit=hit)


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
    key = "Negative electrode lithium plating volumetric interfacial current density [A.m-3]"
    try:
        sol = pybamm.Simulation(pybamm.lithium_ion.DFN(B.VARIANTS["both"]), parameter_values=pv,
                                experiment=exp).solve(initial_soc=1.0)
        xn = sol.cycles[0].steps[0]["x_n [m]"].entries
        xn = xn[:, 0] if xn.ndim == 2 else xn
        L_n = float(pv["Negative electrode thickness [m]"])
        out["x_n"] = [float(v) for v in xn]
        out["L_n"] = L_n
        edges = [0.0] + [0.5 * (xn[i] + xn[i + 1]) for i in range(len(xn) - 1)] + [L_n]
        dx = [edges[i + 1] - edges[i] for i in range(len(xn))]
        out["dx_spread"] = float(max(dx) / min(dx) - 1)
        rec = {k: [] for k in ("pl_node", "pl_ch_node", "u_node", "dphi_node", "eta_pl_node", "pl_mol", "lost_mol", "t_ch")}
        for cy in sol.cycles:
            p = np.zeros(len(xn))
            for k, st in enumerate(cy.steps):
                t = st["Time [s]"].entries
                q = -np.trapezoid(st[key].entries, t, axis=1)
                p += q
                if k == 1:
                    rec["pl_ch_node"].append([float(v) for v in q])
            ch = cy.steps[1]
            rec["pl_node"].append([float(v) for v in p])
            rec["u_node"].append([float(v) for v in ch["Negative electrode open-circuit potential [V]"].entries[:, -1]])
            rec["dphi_node"].append([float(v) for v in
                                     ch["Negative electrode surface potential difference [V]"].entries[:, -1]])
            rec["eta_pl_node"].append([float(v) for v in
                                       ch["Negative electrode lithium plating reaction overpotential [V]"].entries[:, -1]])
            rec["pl_mol"].append(float(cy["Loss of lithium to negative lithium plating [mol]"].entries[-1]))
            rec["lost_mol"].append(float(cy["Total lithium lost [mol]"].entries[-1]))
            tc = ch["Time [s]"].entries
            rec["t_ch"].append(float(tc[-1] - tc[0]))
        out.update(rec, ok_cycles=len(sol.cycles))
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}")
    out["seconds"] = time.perf_counter() - t0
    return out


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"]) for r in B._load(path)} if path.exists() else set()
    todo = [(c, j, x) for _, c, j, x in M.jobs() if (c, j) not in done]
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

def report():
    runs = [r for r in B._load(HERE / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= CYCLES]
    ref = {(r["cond"], r["j"]): r for r in B._load(EXP / "mechanism" / "bench.jsonl") if r.get("ok")}
    med = statistics.median
    C, Rows, repro = {}, {}, []
    for st, c in SETS.items():
        rows = [design_row(r) for r in runs if r["cond"] == c]
        if not rows:
            continue
        for row in rows:
            z = ref.get((c, row["j"]))
            if z:
                zb = M.increments(z["pl_mol"])
                row["repro"] = (rel(row["pl99"], z["pl_mol"][HI - 1]), 1e3 * abs(row["u99_sep"] - z["u_end"][HI - 1]),
                                abs(row["d_tot"] - math.log(zb[HI - 1] / zb[LO - 1])))
                repro.append(row["repro"])
        m_sep, m_w = med([r["m_sep"] for r in rows]), med([r["m_w"] for r in rows])
        C[c] = dict(n=len(rows), **{k: med([r[k] for r in rows]) for k in
                                   ("s_lo", "s_hi", "c_lo", "c_hi", "d_tot", "d_sep", "gap", "m_sep", "m_w", "m_w99")},
                    ratio=m_w / m_sep, ratio99=med([r["m_w99"] for r in rows]) / m_sep,
                    no_ref=sum("repro" not in r for r in rows))
        Rows[c] = rows
    V, N = verdicts(C, repro)
    L = ["cell-fidelity milestone 5zk: where through the negative electrode does the plating happen? DFN (SEI + plating) to"
         " cycle 100,", f"5z's re-run designs; per-node plating integrated over each cycle; cycle {LO} against {HI}"
         " (medians over designs)", "",
         f"{'condition':20s}{'n':>3s}{'sep2':>6s}{'sep99':>6s}{'cen2':>6s}{'cen99':>6s}{'D_tot':>7s}{'D_sep':>7s}"
         f"{'|gap|':>7s}{'Msep mV':>8s}{'Mw mV':>7s}{'ratio':>7s}{'ratio99':>8s}"]
    for c, d in C.items():
        L.append(f"{c:20s}{d['n']:3d}{d['s_lo']:6.3f}{d['s_hi']:6.3f}{d['c_lo']:6.3f}{d['c_hi']:6.3f}{d['d_tot']:7.3f}"
                 f"{d['d_sep']:7.3f}{d['gap']:7.3f}{1e3 * d['m_sep']:8.1f}{1e3 * d['m_w']:7.1f}{d['ratio']:7.3f}"
                 f"{d['ratio99']:8.3f}")
    L += ["", "(sep = separator-node share of the cycle's plating; cen = plating-weighted depth, 1 = separator side;"
              " D = log change of plating, cycle 2 to 99; M = end-of-charge OCP rise, sep node or plating-weighted;"
              " ratio = median Mw / median Msep, ratio99 with cycle-99 weights)", "",
          f"{'set':14s}{'kappa_path':>11s}{'ratio':>7s}{'kappa_w':>9s}{'kappa*':>8s}{'within25%':>10s}"]
    for st, c in SETS.items():
        if c in C:
            L.append(f"{st:14s}{K_PATH[st]:11.1f}{C[c]['ratio']:7.3f}{N['k_w'][st]:9.1f}{K_STAR[st]:8.1f}"
                     f"{'yes' if N['hit'][st] else 'no':>10s}")
    worst = [max(x[i] for x in repro) for i in range(3)] if repro else [None] * 3
    L += ["", f"reproduction against 5z (worst over {len(repro)} designs): booked plating at cycle 99 {worst[0]:.2e}"
              f" relative; separator-node OCP {worst[1]:.4f} mV; D_tot against 5z's booked log change {worst[2]:.4f}",
          "", f"H191 (the separator node carries under half of the cycle-2 plating on all four sets): {V['H191']}",
          f"H192 (location explains 5z's NCA_Kim2011 index miss: |D_sep - D_tot| >= 0.2 there, <= 0.1 on LG M50): {V['H192']}",
          f"H193 (the lever read where the plating is puts kappa within 25% of kappa* on >= 3 of 4 sets, Ai2020 among them):"
          f" {V['H193']}",
          f"H194 (the re-runs reproduce 5z: plating 0.1%, OCP 0.1 mV, log change 0.02): {V['H194']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, numbers=N, rows=Rows), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "child":
        if len(sys.argv) > 3:
            CYCLES = int(sys.argv[3])
        print(json.dumps(simulate(json.loads(sys.argv[2]))))
    else:
        {"bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
