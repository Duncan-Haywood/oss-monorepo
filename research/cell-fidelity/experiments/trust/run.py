"""Milestone 1: does SPMe's own minimum electrolyte concentration flag the designs where its score is wrong?

    python experiments/trust/run.py probe    # 2-cycle SPMe per design -> probe.jsonl (one process per design)
    python experiments/trust/run.py cost     # 2-cycle SPM / SPMe / DFN wall time on the baseline -> cost.json
    python experiments/trust/run.py cost100  # 100-cycle SPM / SPMe / DFN wall time on the baseline -> cost100.json
    python experiments/trust/run.py report   # results.txt from probe.jsonl, cost.json and the committed scores

The 100-cycle SPMe and DFN scores are read from research/energy-cell-dfn (dfn.jsonl), not re-run.
Hypotheses and the untrusted label were fixed in ../../LOG.md before the first run. Needs numpy, pybamm.
"""
import json
import math
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parents[2]
DFN_DIR = RESEARCH / "energy-cell-dfn" / "experiments"
sys.path.insert(0, str(RESEARCH / "energy-cell" / "src"))

GAP_UNTRUSTED = 0.25   # fixed in LOG.md before the run
C0 = 1000.0            # OKane2022 initial electrolyte concentration, mol/m3 (checked in probe())
KS = (1, 3, 5, 10, 15, 20)


# ---------- pure analysis (stdlib only; tested) ----------

def auc(pos, neg):
    """P(score of a positive > score of a negative), ties count half (Mann-Whitney)."""
    if not pos or not neg:
        return float("nan")
    s = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    return s / (len(pos) * len(neg))


def ranks(a):
    order = sorted(range(len(a)), key=lambda i: a[i])
    r = [0.0] * len(a)
    i = 0
    while i < len(a):
        j = i
        while j + 1 < len(a) and a[order[j + 1]] == a[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2.0
        i = j + 1
    return r


def spearman(a, b):
    ra, rb = ranks(a), ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))
    return num / den


def rel_gap(spme, dfn):
    return (dfn - spme) / dfn


def untrusted(spme, dfn):
    return spme <= 0 or rel_gap(spme, dfn) > GAP_UNTRUSTED


def screen_verify(rows, k, flag=None):
    """DFN-verify the top-k designs by SPMe (plus, if flag is given, every design with flag(row) true).
    Returns (number of DFN calls, best DFN score among verified)."""
    top = sorted(rows, key=lambda r: -r["spme"])[:k]
    chosen = {id(r): r for r in top}
    if flag:
        for r in rows:
            if flag(r):
                chosen[id(r)] = r
    return len(chosen), max(r["dfn"] for r in chosen.values())


def bootstrap_auc(pos, neg, n=2000, seed=0):
    import random
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        p = [rng.choice(pos) for _ in pos]
        q = [rng.choice(neg) for _ in neg]
        out.append(auc(p, q))
    out.sort()
    return out[int(0.025 * n)], out[int(0.975 * n) - 1]


# ---------- data ----------

def committed():
    sel = json.loads((DFN_DIR / "selected.json").read_text())
    rows = []
    for line in (DFN_DIR / "dfn.jsonl").read_text().splitlines():
        r = json.loads(line)
        rows.append(dict(i=r["i"], x=sel[r["i"]]["x"], source=sel[r["i"]]["source"],
                         spme=r["spme_now"]["score"], dfn=r["dfn"]["score"]))
    return sorted(rows, key=lambda r: r["i"])


# ---------- simulation (pybamm) ----------

def _sim(x, model_name, cycles=2):
    import numpy as np
    import pybamm
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    pv = cell._params(cell.clip(x))
    assert abs(pv["Initial concentration in electrolyte [mol.m-3]"] - C0) < 1e-9
    opts = {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"}
    model = getattr(pybamm.lithium_ion, model_name)(opts)
    exp = pybamm.Experiment([(f"Discharge at {cell.I_DISCHARGE} A until 2.5 V",
                              f"Charge at {cell.I_CHARGE} A until 4.2 V")] * cycles)
    t0 = time.perf_counter()
    out = dict(ok=True, error=None)
    try:
        sol = pybamm.Simulation(model, parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        ce = sol["Electrolyte concentration [mol.m-3]"].entries
        out["r_min"] = float(np.min(ce)) / C0
        out["cycles_done"] = len(sol.cycles)
        ah = []
        for c in sol.cycles:
            for st in c.steps:
                ah.append(abs(float(np.trapezoid(st["Current [A]"].entries, st["Time [s]"].entries))) / 3600.0)
        out["step_ah"] = ah
    except Exception as ex:  # SPMe raises SolverError on some designs; a failure is the strongest flag
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", r_min=0.0, cycles_done=0)
    out["seconds"] = time.perf_counter() - t0
    return out


def child(i, model_name, cycles=2):
    rows = {r["i"]: r for r in committed()}
    print(json.dumps(dict(i=i, model=model_name, cycles=cycles, **_sim(rows[i]["x"], model_name, cycles))))


def probe():
    path = HERE / "probe.jsonl"
    done = {json.loads(l)["i"] for l in path.read_text().splitlines()} if path.exists() else set()
    for r in committed():
        if r["i"] in done:
            continue
        p = subprocess.run([sys.executable, __file__, "child", str(r["i"]), "SPMe"], capture_output=True, text=True)
        line = p.stdout.strip().splitlines()[-1] if p.stdout.strip() else json.dumps(
            dict(i=r["i"], model="SPMe", ok=False, error=f"process exit {p.returncode}: {p.stderr[-160:]}",
                 r_min=0.0, cycles_done=0, seconds=None))
        with path.open("a") as f:
            f.write(line + "\n")
        print(line[:200], flush=True)


def cost():
    out = {}
    for m in ("SPM", "SPMe", "DFN"):
        ts = []
        for _ in range(3):  # fresh process each time: DFN does not release memory, and it times the whole call
            p = subprocess.run([sys.executable, __file__, "child", "0", m], capture_output=True, text=True)
            ts.append(json.loads(p.stdout.strip().splitlines()[-1])["seconds"])
        out[m] = ts
        print(m, ts, flush=True)
    (HERE / "cost.json").write_text(json.dumps(out, indent=1) + "\n")


def cost100():
    """Added after the logged plan (not a hypothesis): one 100-cycle run per model on the baseline,
    since the search score is a 100-cycle score and H3's 2-cycle timing is dominated by set-up."""
    out = {}
    for m in ("SPM", "SPMe", "DFN"):
        p = subprocess.run([sys.executable, __file__, "child", "0", m, "100"], capture_output=True, text=True)
        r = json.loads(p.stdout.strip().splitlines()[-1])
        out[m] = dict(seconds=r["seconds"], ok=r["ok"], cycles_done=r["cycles_done"])
        print(m, out[m], flush=True)
    (HERE / "cost100.json").write_text(json.dumps(out, indent=1) + "\n")


def report():
    rows = committed()
    probes = {}
    for l in (HERE / "probe.jsonl").read_text().splitlines():
        p = json.loads(l)
        probes[p["i"]] = p
    for r in rows:
        r.update(r_min=probes[r["i"]]["r_min"], ok=probes[r["i"]]["ok"], secs=probes[r["i"]]["seconds"])
        r["gap"] = rel_gap(r["spme"], r["dfn"])
        r["untrusted"] = untrusted(r["spme"], r["dfn"])
    pos = [-r["r_min"] for r in rows if r["untrusted"]]
    neg = [-r["r_min"] for r in rows if not r["untrusted"]]
    a = auc(pos, neg)
    lo, hi = bootstrap_auc(pos, neg)
    rho = spearman([r["r_min"] for r in rows], [r["gap"] for r in rows])
    L = ["cell-fidelity milestone 1: SPMe's minimum electrolyte concentration as a trust flag",
         f"designs: {len(rows)} (energy-cell-dfn selected.json); untrusted = SPMe 0 or (DFN-SPMe)/DFN > {GAP_UNTRUSTED}",
         f"untrusted: {len(pos)}, trusted: {len(neg)}", ""]
    L.append("A. per design (sorted by r_min = SPMe 2-cycle min c_e / initial)")
    L.append(f"{'i':>3} {'source':<9} {'SPMe100':>8} {'DFN100':>7} {'gap':>6} {'r_min':>7} {'solve':<6} {'sec':>6} untrusted")
    for r in sorted(rows, key=lambda r: r["r_min"]):
        L.append(f"{r['i']:>3} {r['source']:<9} {r['spme']:8.1f} {r['dfn']:7.1f} {r['gap']:6.2f} {r['r_min']:7.3f} "
                 f"{'ok' if r['ok'] else 'FAIL':<6} {r['secs'] if r['secs'] is None else round(r['secs'], 1):>6} {'yes' if r['untrusted'] else ''}")
    L += ["", "B. hypotheses",
          f"H1 ROC AUC of -r_min for untrusted: {a:.3f} (bootstrap 95% {lo:.3f}-{hi:.3f}, 2000 resamples); "
          f"supported if >= 0.90, refuted if < 0.80",
          f"H2 Spearman(r_min, relative gap) over all {len(rows)}: {rho:.3f}; supported if <= -0.5, refuted if > -0.3"]
    for thr in (0.0, 0.05, 0.1, 0.2, 0.3):
        flagged = [r for r in rows if r["r_min"] <= thr]
        tp = sum(r["untrusted"] for r in flagged)
        L.append(f"   flag r_min <= {thr:.2f}: {len(flagged)} flagged, {tp} of {len(pos)} untrusted caught, {len(flagged) - tp} false flags")
    pos2 = [-r["r_min"] for r in rows if r["untrusted"] and r["ok"]]
    neg2 = [-r["r_min"] for r in rows if not r["untrusted"] and r["ok"]]
    a2 = auc(pos2, neg2)
    L.append(f"   (extra, not in the plan) AUC over solved designs only, the {len(pos2)} untrusted that SPMe solved "
             f"against {len(neg2)} trusted: {a2:.3f}")
    cpath = HERE / "cost.json"
    if cpath.exists():
        c = json.loads(cpath.read_text())
        med = {m: sorted(v)[1] for m, v in c.items()}
        L.append(f"H3 2-cycle wall time on the baseline, median of 3 (s): " +
                 ", ".join(f"{m} {med[m]:.1f}" for m in med) +
                 f"; SPMe/DFN = {med['SPMe'] / med['DFN']:.3f} (supported if < 0.10, refuted if > 0.25)")
    c100 = HERE / "cost100.json"
    if c100.exists():
        c = json.loads(c100.read_text())
        L.append("   (extra, not in the plan) 100-cycle wall time on the baseline, one run each (s): " +
                 ", ".join(f"{m} {v['seconds']:.1f}" for m, v in c.items()) +
                 f"; SPMe/DFN = {c['SPMe']['seconds'] / c['DFN']['seconds']:.3f}")
    best = max(r["dfn"] for r in rows)
    L += ["", f"C. screen-then-verify replay on the committed 100-cycle scores (DFN best of the {len(rows)}: {best:.1f} Wh/kg)",
          f"{'k':>3} {'DFN calls':>9} {'best':>7} {'regret':>7}   {'+flag r_min<=0.1: calls':>24} {'best':>7}"]
    for k in KS:
        n0, b0 = screen_verify(rows, k)
        n1, b1 = screen_verify(rows, k, flag=lambda r: r["r_min"] <= 0.1)
        L.append(f"{k:>3} {n0:>9} {b0:7.1f} {best - b0:7.1f}   {n1:>24} {b1:7.1f}")
    L.append("(the 49 were chosen to spread over the SPMe ranking, so this is a replay on a stratified sample, not a search)")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    summary = dict(auc=a, auc_ci=[lo, hi], auc_solved_only=a2, spearman=rho, n_untrusted=len(pos), n=len(rows))
    (HERE / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "child":
        child(int(sys.argv[2]), sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 2)
    else:
        {"probe": probe, "cost": cost, "cost100": cost100, "report": report}[cmd]()
