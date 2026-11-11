"""Milestone 2a: is a short DFN run a better screen than a full SPMe run?

    python experiments/horizon/run.py sweep    # SPM 100, SPMe 100, DFN 30 cycles per design -> horizon.jsonl
    python experiments/horizon/run.py check    # DFN 100 cycles on design 0 against its committed score -> check.json
    python experiments/horizon/run.py report   # results.txt and summary.json

Every run records the discharge energy of each cycle and the wall time at the end of each cycle
(set-up included), so one 30-cycle DFN run gives the cycle-2, 10 and 30 rungs and their cost.
The 100-cycle DFN reference scores are the committed ones (research/energy-cell-dfn). Hypotheses
were fixed in ../../LOG.md before the first run. Needs numpy, pybamm (26.10.1.1 for the committed numbers).
"""
import importlib.util
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("cell_fidelity_trust", HERE.parent / "trust" / "run.py")
trust = importlib.util.module_from_spec(_spec)  # milestone 1 helpers: committed(), spearman(), untrusted()
_spec.loader.exec_module(trust)
sys.path.insert(0, str(trust.RESEARCH / "energy-cell" / "src"))

RUNS = {"SPM": 100, "SPMe": 100, "DFN": 30}
RUNGS = (2, 10, 30, 100)
KS = (1, 3, 5, 10)
SPEARMAN_SPME100 = 0.834  # committed SPMe 100 vs DFN 100, written into the plan before the run


# ---------- pure analysis (stdlib only; tested) ----------

def score_at(rec, n):
    """energy-cell score with cycles = n: discharge Wh of cycle n per kg; 0 if the run stopped before n."""
    e = rec.get("cycle_wh") or []
    if rec.get("cycles_done", 0) < n or len(e) < n or e[1] <= 0:
        return 0.0
    return e[n - 1] / rec["mass_kg"]


def time_at(rec, n):
    t = rec.get("cycle_end_s") or []
    return t[n - 1] if len(t) >= n else None


def extrapolate(rec, a=2, b=10, to=100):
    """Linear fade from cycles a and b carried to cycle `to` (floor at 0)."""
    sa, sb = score_at(rec, a), score_at(rec, b)
    if sa <= 0 or sb <= 0:
        return 0.0
    return max(0.0, sb + (sb - sa) * (to - b) / (b - a))


def screen_regret(screen, truth, k):
    """DFN-verify the top-k by `screen`; return (best truth found, regret to the best truth overall)."""
    order = sorted(range(len(screen)), key=lambda i: -screen[i])[:k]
    found = max(truth[i] for i in order)
    return found, max(truth) - found


def bootstrap_diff(a, b, truth, n=2000, seed=0):
    """Paired bootstrap over designs of spearman(a, truth) - spearman(b, truth): (median, 2.5%, 97.5%)."""
    import random
    rng = random.Random(seed)
    m = len(truth)
    out = []
    for _ in range(n):
        idx = [rng.randrange(m) for _ in range(m)]
        t = [truth[i] for i in idx]
        out.append(trust.spearman([a[i] for i in idx], t) - trust.spearman([b[i] for i in idx], t))
    out.sort()
    return out[n // 2], out[int(0.025 * n)], out[int(0.975 * n) - 1]


def median(xs):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    m = len(xs) // 2
    return xs[m] if len(xs) % 2 else 0.5 * (xs[m - 1] + xs[m])


# ---------- simulation (pybamm) ----------

def _sim(x, model_name, cycles):
    import numpy as np
    import pybamm
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    xc = cell.clip(x)
    pv = cell._params(xc)
    mass = cell.stack_mass_kg(xc, pv)
    opts = {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"}
    model = getattr(pybamm.lithium_ion, model_name)(opts)
    exp = pybamm.Experiment([(f"Discharge at {cell.I_DISCHARGE} A until 2.5 V",
                              f"Charge at {cell.I_CHARGE} A until 4.2 V")] * cycles)
    t0 = time.perf_counter()
    ends = []

    class Clock(pybamm.callbacks.Callback):
        def on_cycle_end(self, logs):
            ends.append(time.perf_counter() - t0)

    out = dict(ok=True, error=None, mass_kg=mass)
    try:
        sol = pybamm.Simulation(model, parameter_values=pv, experiment=exp).solve(
            initial_soc=1.0, callbacks=[Clock()])
        wh = []
        for c in sol.cycles:
            d = c.steps[0]
            v, i, t = d["Terminal voltage [V]"].entries, d["Current [A]"].entries, d["Time [s]"].entries
            wh.append(float(np.trapezoid(v * i, t)) / 3600.0)
        out.update(cycles_done=len(sol.cycles), cycle_wh=wh)
    except Exception as ex:  # solver failure: score 0 at every rung, as in energy-cell
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", cycles_done=0, cycle_wh=[])
    out["seconds"] = time.perf_counter() - t0
    out["cycle_end_s"] = ends
    return out


def child(i, model_name, cycles):
    rows = {r["i"]: r for r in trust.committed()}
    print(json.dumps(dict(i=i, model=model_name, cycles=cycles, **_sim(rows[i]["x"], model_name, cycles))))


def _spawn(i, m, n, timeout=600):
    try:
        p = subprocess.run([sys.executable, __file__, "child", str(i), m, str(n)],
                           capture_output=True, text=True, timeout=timeout)
        if p.stdout.strip():
            return p.stdout.strip().splitlines()[-1]
        err = f"process exit {p.returncode}: {p.stderr[-160:]}"
    except subprocess.TimeoutExpired:
        err = f"timeout {timeout} s"
    return json.dumps(dict(i=i, model=m, cycles=n, ok=False, error=err, cycles_done=0, cycle_wh=[],
                           cycle_end_s=[], seconds=None, mass_kg=None))


def sweep():
    path = HERE / "horizon.jsonl"
    done = set()
    if path.exists():
        done = {(json.loads(l)["i"], json.loads(l)["model"]) for l in path.read_text().splitlines()}
    for r in trust.committed():
        for m, n in RUNS.items():
            if (r["i"], m) in done:
                continue
            line = _spawn(r["i"], m, n)
            with path.open("a") as f:
                f.write(line + "\n")
            print(line[:160], flush=True)


def check():
    rec = json.loads(_spawn(0, "DFN", 100, timeout=1200))
    committed = {r["i"]: r for r in trust.committed()}[0]["dfn"]
    out = dict(rerun=score_at(rec, 100), committed=committed, seconds=rec["seconds"],
               cycle_end_s_10=time_at(rec, 10), cycle_end_s_30=time_at(rec, 30))
    (HERE / "check.json").write_text(json.dumps(out, indent=1) + "\n")
    print(out)


def report():
    rows = trust.committed()
    recs = {}
    for l in (HERE / "horizon.jsonl").read_text().splitlines():
        p = json.loads(l)
        recs[(p["i"], p["model"])] = p
    truth = [r["dfn"] for r in rows]
    best = max(truth)
    rungs = []  # (name, scores, median wall seconds to reach that rung)
    for m, nmax in RUNS.items():
        for n in RUNGS:
            if n > nmax:
                continue
            rungs.append((f"{m}@{n}", [score_at(recs[(r['i'], m)], n) for r in rows],
                          median([time_at(recs[(r['i'], m)], n) for r in rows])))
    rungs.append(("SPMe@100 committed", [r["spme"] for r in rows], None))
    rungs.append(("DFN 2->10 extrap@100", [extrapolate(recs[(r['i'], 'DFN')]) for r in rows],
                  median([time_at(recs[(r['i'], 'DFN')], 10) for r in rows])))
    L = ["cell-fidelity milestone 2a: model x cycle-count rungs against committed 100-cycle DFN",
         f"designs: {len(rows)}; DFN best of the {len(rows)}: {best:.1f} Wh/kg; PyBaMM per run in one process, set-up included",
         "", "A. rungs (median wall s to the end of that cycle over the designs; failures excluded from timing)",
         f"{'rung':<22} {'spearman':>8} {'med s':>6} {'zeros':>5} " + " ".join(f"{'k=' + str(k) + ' regret':>12}" for k in KS)]
    table = {}
    rs = [r["spme"] for r in rows]
    for name, s, t in rungs:
        rho = trust.spearman(s, truth)
        regs = [screen_regret(s, truth, k)[1] for k in KS]
        table[name] = dict(spearman=rho, median_s=t, regret=dict(zip(KS, regs)), zeros=sum(v <= 0 for v in s))
        L.append(f"{name:<22} {rho:8.3f} {'' if t is None else round(t, 1):>6} {table[name]['zeros']:>5} "
                 + " ".join(f"{g:12.1f}" for g in regs))
    resc = [score_at(recs[(r['i'], 'SPMe')], 100) for r in rows]
    diffs = sorted(abs(a - b) for a, b in zip(rs, resc))
    L += ["", f"reproduction: SPMe@100 re-run against committed spme_now, max |diff| {diffs[-1]:.3g} Wh/kg, "
              f"median {median(diffs):.3g}"]
    cpath = HERE / "check.json"
    if cpath.exists():
        c = json.loads(cpath.read_text())
        L.append(f"reproduction: DFN@100 re-run on design 0 {c['rerun']:.3f} against committed {c['committed']:.3f} Wh/kg "
                 f"({c['seconds']:.1f} s; cycle 10 at {c['cycle_end_s_10']:.1f} s, cycle 30 at {c['cycle_end_s_30']:.1f} s)")
    d10, s100 = table["DFN@10"], table["SPMe@100"]
    t_spme100 = median([recs[(r['i'], 'SPMe')]["seconds"] for r in rows if recs[(r['i'], 'SPMe')]["ok"]])
    L += ["", "B. hypotheses",
          f"H4 Spearman(DFN@10, DFN@100) = {d10['spearman']:.3f}; supported if >= 0.90, refuted if < {SPEARMAN_SPME100}",
          "   paired bootstrap over designs (2000) of Spearman(DFN@10) - Spearman(SPMe@100): "
          "median {:.3f}, 95% {:.3f} to {:.3f}".format(*bootstrap_diff(
              [score_at(recs[(r['i'], 'DFN')], 10) for r in rows], rs, truth)),
          f"H5 median DFN wall s to cycle 10 = {d10['median_s']:.1f} against median SPMe 100-cycle run {t_spme100:.1f} "
          f"(ratio {d10['median_s'] / t_spme100:.2f}); supported if <= 1, refuted if > 1.5",
          f"   (extra) cycle-end to cycle-end: DFN to cycle 10 {d10['median_s']:.1f} against SPMe to cycle 100 "
          f"{s100['median_s']:.1f} (ratio {d10['median_s'] / s100['median_s']:.2f}); DFN to cycle 30 {table['DFN@30']['median_s']:.1f}",
          f"H6 top-5 regret: DFN@10 {d10['regret'][5]:.1f} against SPMe@100 {s100['regret'][5]:.1f} Wh/kg "
          f"(committed SPMe@100 {table['SPMe@100 committed']['regret'][5]:.1f}); supported if not larger"]
    unt = [i for i, r in enumerate(rows) if trust.untrusted(r["spme"], r["dfn"])]
    d10s = table and [score_at(recs[(r['i'], 'DFN')], 10) for r in rows]
    order = sorted(range(len(rows)), key=lambda i: -d10s[i])
    rank = {i: k + 1 for k, i in enumerate(order)}
    tord = sorted(range(len(rows)), key=lambda i: -truth[i])
    trank = {i: k + 1 for k, i in enumerate(tord)}
    sord = sorted(range(len(rows)), key=lambda i: -rs[i])
    srank = {i: k + 1 for k, i in enumerate(sord)}
    L += ["", "C. the milestone-1 untrusted designs: rank (of 49) under DFN@100, DFN@10, SPMe@100",
          f"{'i':>3} {'DFN100':>7} {'DFN10':>7} {'rk100':>5} {'rkD10':>5} {'rkS100':>6}"]
    for j in unt:
        L.append(f"{rows[j]['i']:>3} {truth[j]:7.1f} {d10s[j]:7.1f} {trank[j]:>5} {rank[j]:>5} {srank[j]:>6}")
    L.append(f"mean |rank error| on these: DFN@10 {sum(abs(rank[j] - trank[j]) for j in unt) / len(unt):.1f}, "
             f"SPMe@100 {sum(abs(srank[j] - trank[j]) for j in unt) / len(unt):.1f}")
    fails = [(k[0], k[1], v["error"]) for k, v in sorted(recs.items()) if not v["ok"]]
    L += ["", f"D. failed runs: {len(fails)}"] + [f"  design {a} {b}: {e}" for a, b, e in fails]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(rungs=table, spme100_median_s=t_spme100), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "child":
        child(int(sys.argv[2]), sys.argv[3], int(sys.argv[4]))
    else:
        {"sweep": sweep, "check": check, "report": report}[cmd]()
