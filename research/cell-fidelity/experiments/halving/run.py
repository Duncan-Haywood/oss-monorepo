"""Milestone 5m: where fade keeps growing after cycle 10, a successive-halving ladder over resumed DFN runs.

    python experiments/halving/run.py dev      # replay on the 27 seen conditions (5b to 5l), stdlib -> dev.txt, dev.json
    python experiments/halving/run.py probe    # baseline design, SPMe and DFN for 2 cycles at each fresh condition -> probe.json
    python experiments/halving/run.py bench    # 64 Sobol (seed 11) designs x one DFN run resumed at 10, 20, 50, 100 cycles,
                                               # plus an uninterrupted DFN@100 on designs 0-7 (resume check); resumable
    python experiments/halving/run.py report   # results.txt, summary.json (stdlib)

5l's screen (DFN@10 on every design, DFN@100 on the top 3) missed by 7.2% and 6.0% on Ai2020 at 0.25x and 0.375x, where
fade keeps growing after cycle 10. The procedure tested here, fixed on development data before the fresh bench: DFN to
cycle 10 on every design, keep the top 16 by cycle-10 Wh/kg and resume them to cycle 20, keep the top 8 and resume them to
50, keep the top 3 and resume them to 100; answer the best DFN@100 among those 3. Every segment is a continuation of the
same PyBaMM solution (`Simulation.solve(starting_solution=...)`), so a design is never re-simulated from cycle 1, and the
wall time charged is each design's measured segments up to the rung it reached. The plan and H82 to H86 are in
../../LOG.md (milestone 5m plan), written before the fresh bench. Simulation and pools are 5g's, unchanged.
"""
import importlib.util
import json
import os
import statistics
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

SOBOL_SEED = 11
WORKERS = int(os.environ.get("WORKERS", "3"))
RUNGS = (10, 20, 50, 100)
PLAN = ((10, 16), (20, 8), (50, 3))   # (cycle reached, designs kept for the next rung); the last 3 go to cycle 100
CHECK_J = range(8)                     # designs that also get an uninterrupted DFN@100 (resume check)
# fresh conditions, fixed before any run: Ai2020 at two currents no milestone ran, inside the low-current regime where 5l's
# screen missed (0.25x, 0.375x) and between it and the exact one (0.5x and up), and Ecker2015 at a current no milestone
# ran, between 0.5x (where every fixed screen missed by 2.3%) and 1x
CONDITIONS = (("Ai2020", 0.3), ("Ai2020", 0.4375), ("Ecker2015", 0.75))


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


F = _mod("fade_run", EXP / "fade" / "run.py")
E, P, G, R = F.E, F.P, F.G, F.R
spearman = E.spearman


# ---------- pure helpers (stdlib; tested) ----------

def at(row, k):
    """Wh/kg delivered at cycle k (1-based)."""
    return row["wh"][k - 1] / row["m"]


def top(rows, k, m, idx):
    return sorted(idx, key=lambda i: -at(rows[i], k))[:m]


def cost_to(row, k):
    """Wall time to bring one design's resumed run to cycle k: its measured segments (fresh), or k/100 of its DFN@100
    time (development, where only uninterrupted runs exist)."""
    seg = row.get("seg")
    if seg:
        return sum(s for r, s in zip(RUNGS, seg) if r <= k)
    return row["t100"] * k / 100


def halving(rows, plan=PLAN):
    """Successive halving over cycles, resumed runs. rows: dicts with wh (per-cycle Wh), m (kg), score (DFN@100 Wh/kg),
    t100 and optionally seg (seconds per segment of RUNGS). Returns (gap, picked, seconds, reached)."""
    alive = list(range(len(rows)))
    reached = {i: 0 for i in alive}
    for k, keep in plan:
        for i in alive:
            reached[i] = k
        alive = top(rows, k, keep, alive)
    for i in alive:
        reached[i] = 100
    best = max(r["score"] for r in rows)
    got = max(rows[i]["score"] for i in alive)
    return 1 - got / best, alive, sum(cost_to(rows[i], k) for i, k in reached.items()), reached


def fixed(rows, k=10, m=3, resume=True):
    """5l's screen at cycle k: DFN@k on every design, the top m to 100. resume=False charges 5l's way (separate DFN@k runs,
    then fresh DFN@100 runs); resume=True continues the top m from cycle k."""
    plan = ((k, m),)
    gap, picked, t, _ = halving(rows, plan)
    if not resume:
        t = sum(r.get("tk", cost_to(r, k)) for r in rows) + sum(rows[i]["t100"] for i in picked)
    return gap, picked, t


def stable_set(rows, k=10, prev=5, m=3):
    """Does the top-m set at cycle k equal the one at cycle `prev`? (the stopping signal development rejected)"""
    idx = range(len(rows))
    return set(top(rows, k, m, idx)) == set(top(rows, prev, m, idx))


def condition(rows):
    t_all = sum(cost_to(r, 100) for r in rows)
    sc = [r["score"] for r in rows]
    gap, picked, t, reached = halving(rows)
    out = dict(n=len(rows), t_all=t_all, gap=gap, t_ratio=t / t_all, picked=[rows[i]["j"] for i in picked],
               best_j=max(rows, key=lambda r: r["score"])["j"],
               rho = {k: spearman([at(r, k) for r in rows], sc) for k in (5, 10, 20, 50)},
               rho_5_10=spearman([at(r, 5) for r in rows], [at(r, 10) for r in rows]),
               stable_5_10=stable_set(rows))
    for k in (10, 20):
        g, _, tt = fixed(rows, k)
        out[f"fixed{k}"] = dict(gap=g, t_ratio=tt / t_all)
    g, _, tt, _ = halving(rows, ((10, 16), (20, 3)))
    out["half_10_20"] = dict(gap=g, t_ratio=tt / t_all)
    return out


def verdicts(C, ai):
    """H82 to H85 as registered in the 5m plan (LOG.md). C: {condition: condition()}; ai: the Ai2020 condition names.
    H86 (resume exact) is read from the resume check in report()."""
    v = R.verdict
    return dict(
        H82=v([c["gap"] for c in C.values()], lambda x: x <= 0.01, lambda x: x > 0.03),
        H83=v([c["t_ratio"] for c in C.values()], lambda x: x <= 0.25, lambda x: x > 0.35),
        H84=v([c["gap"] - c["fixed10"]["gap"] for c in C.values()], lambda x: x <= 0.0, lambda x: x > 0.01),
        H85=("supported" if any(C[c]["rho"][10] < 0.85 for c in ai if c in C)
             else "refuted" if all(C[c]["rho"][10] >= 0.92 for c in ai if c in C) else "mixed"))


# ---------- development ----------

def dev_conditions():
    """{condition: rows} for the 27 seen conditions (5b to 5l), DFN@100 runs only; pool membership as 5k/5l."""
    conds = dict(P._sand().committed_conditions())
    for f in ("prescreen", "edge", "fade"):
        by = {}
        for r in R._load(EXP / f / "bench.jsonl"):
            by.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
        for c, runs in by.items():
            for (j, w), r in list(runs.items()):
                if w == "DFN":
                    runs.setdefault((j, "V0"), r)   # 5l's bench has no SPMe; pool membership only
            conds[c] = runs
    out = {}
    for c, runs in conds.items():
        js = {j for j, _ in runs}
        base, _ = E.rows_for(runs, {j: 1.0 for j in js}, {j: 0.0 for j in js})
        out[c] = [dict(j=r["j"], score=r["score"], wh=runs[(r["j"], "DFN")]["cycle_wh"][:100],
                       m=runs[(r["j"], "DFN")]["mass_kg"], t100=runs[(r["j"], "DFN")]["seconds"]) for r in base]
    return out


def _line(name, c):
    rho = ", ".join(f"{k} {c['rho'][k]:+.2f}" for k in (5, 10, 20, 50))
    return (f"{name}: n {c['n']}; Spearman(cycle-k Wh/kg, DFN@100): {rho}; cycle 5 ~ cycle 10 {c['rho_5_10']:+.2f},"
            f" top-3 set unchanged 5->10: {c['stable_5_10']}\n"
            f"  halving 10->16, 20->8, 50->3: gap {c['gap']:.4f}, wall / all-DFN@100 {c['t_ratio']:.3f}, picked {c['picked']}, best {c['best_j']}\n"
            f"  fixed DFN@10 top 3 {c['fixed10']['gap']:.4f} ({c['fixed10']['t_ratio']:.3f}); fixed DFN@20 top 3 {c['fixed20']['gap']:.4f}"
            f" ({c['fixed20']['t_ratio']:.3f}); halving 10->16, 20->3 {c['half_10_20']['gap']:.4f} ({c['half_10_20']['t_ratio']:.3f})"
            f" (all resumed)")


def _pooled(C):
    out = {}
    for name, get in (("gap", lambda c: c["gap"]), ("t_ratio", lambda c: c["t_ratio"]),
                      ("fixed10_gap", lambda c: c["fixed10"]["gap"]), ("fixed20_gap", lambda c: c["fixed20"]["gap"]),
                      ("half_10_20_gap", lambda c: c["half_10_20"]["gap"])):
        xs = [get(c) for c in C.values()]
        out[name] = dict(median=statistics.median(xs), max=max(xs), exact=sum(1 for x in xs if x < 1e-12))
    return out


def dev():
    D = dev_conditions()
    C = {c: condition(rows) for c, rows in sorted(D.items())}
    p = _pooled(C)
    L = ["cell-fidelity milestone 5m, development (27 conditions seen by milestones 5b to 5l; resumed runs charged k/100 of"
         " each DFN@100 run's time)", ""] + [_line(c, C[c]) for c in C]
    L += ["", "Pooled over conditions (median, max, exact):"] + [
        f"  {k}: {d['median']:.4f}, {d['max']:.4f}, {d['exact']} of {len(C)}" for k, d in p.items()]
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(dict(conditions=C, pooled=p), indent=1) + "\n")
    print("\n".join(L))


# ---------- fresh conditions (pybamm) ----------

def _child(args):
    """One DFN run at a scaled current, solved to each rung of RUNGS in turn, each segment resumed from the last."""
    import numpy as np
    import pybamm
    from energy_cell import cell
    TR = G.TR
    pybamm.set_logging_level("ERROR")
    x = cell.clip(args["x"])
    pv, _, cur = TR.params(x, args["set"])
    cur *= args["rate"]
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    step = (f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")
    out = dict(ok=True, error=None, mass_kg=float(TR.stack_mass(x, pv)), current_A=cur, seg=[])
    sol, last = None, 0
    try:
        for k in RUNGS:
            t0 = time.perf_counter()
            sim = pybamm.Simulation(pybamm.lithium_ion.DFN(TR.OPTS), parameter_values=pv,
                                    experiment=pybamm.Experiment([step] * (k - last)))
            sol = sim.solve(initial_soc=1.0) if sol is None else sim.solve(starting_solution=sol)
            out["seg"].append(time.perf_counter() - t0)
            last = k
            if len(sol.cycles) < k:
                break
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}")
    wh = []
    for c in (sol.cycles if sol is not None else []):
        d = c.steps[0]
        wh.append(float(np.trapezoid(d["Terminal voltage [V]"].entries * d["Current [A]"].entries, d["Time [s]"].entries)) / 3600.0)
    out.update(cycle_wh=wh, ok_cycles=len(wh), seconds=sum(out["seg"]))
    out["ok"] = out["ok"] and len(wh) >= 100
    return out


def _spawn(args, timeout=3600):
    try:
        p = subprocess.run([sys.executable, __file__, "child", json.dumps(args)], capture_output=True, text=True, timeout=timeout)
        if p.stdout.strip():
            return json.loads(p.stdout.strip().splitlines()[-1])
        err = f"process exit {p.returncode}: {p.stderr[-160:]}"
    except subprocess.TimeoutExpired:
        err = f"timeout {timeout} s"
    return dict(ok=False, error=err, cycle_wh=[], ok_cycles=0, seg=[], seconds=None)


def _run(job):
    c, j, what, x = job
    s, rate = G._parse(c)
    if what == "RES":
        r = _spawn(dict(x=x, set=s, rate=rate))
    else:
        r = G._spawn(dict(x=x, set=s, rate=rate, what="DFN", cycles=100))
        r.pop("copied", None)
    return dict(cond=c, set=s, rate=rate, j=j, what=what, x=x, **r)


def bench():
    kept = json.loads((HERE / "probe.json").read_text())["kept"]
    path = HERE / "bench.jsonl"
    xs = G.designs()
    done = {(r["cond"], r["j"], r["what"]) for r in R._load(path)}
    jobs = [(c, j, "RES", xs[j]) for c in kept for j in range(len(xs))]
    jobs += [(c, j, "DFN", xs[j]) for c in kept for j in CHECK_J]
    G._run = _run
    G._write(path, [jb for jb in jobs if (jb[0], jb[1], jb[2]) not in done])


def report():
    kept = json.loads((HERE / "probe.json").read_text())["kept"]
    by = {}
    for r in R._load(HERE / "bench.jsonl"):
        by.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
    L = ["cell-fidelity milestone 5m: successive halving over resumed DFN runs, on fresh conditions", "",
         "Probe (baseline design, 2 cycles): " + ", ".join(f"{G.cid(s, r)} {'ok' if G.cid(s, r) in kept else 'fails'}" for s, r in CONDITIONS), ""]
    C, extra, resume = {}, {}, {}
    for c in kept:
        runs = by.get(c, {})
        rows, dropped = [], []
        for j in sorted({j for j, w in runs if w == "RES"}):
            r = runs[(j, "RES")]
            wh = r.get("cycle_wh") or []
            if not r.get("ok") or len(wh) < 100 or wh[0] <= 0:
                dropped.append(j)
                continue
            rows.append(dict(j=j, wh=wh[:100], m=r["mass_kg"], score=wh[99] / r["mass_kg"], seg=r["seg"], t100=r["seconds"]))
        if not rows:
            continue
        diffs, ratios = [], []
        for j in CHECK_J:
            a, b = runs.get((j, "RES")), runs.get((j, "DFN"))
            if a and b and a.get("ok") and b.get("ok") and len(b.get("cycle_wh") or []) >= 100:
                diffs.append(max(abs(p / q - 1) for p, q in zip(a["cycle_wh"][:100], b["cycle_wh"][:100])))
                ratios.append(a["seconds"] / b["seconds"])
        resume[c] = dict(n=len(diffs), max_rel_diff=max(diffs) if diffs else None,
                         time_ratio_median=statistics.median(ratios) if ratios else None)
        C[c] = condition(rows)
        extra[c] = dict(dropped=dropped, seg_median=[statistics.median(r["seg"][i] for r in rows) for i in range(len(RUNGS))],
                        rows=[{k: r[k] for k in ("j", "score", "seg", "t100")} | {"wh_kg": [x / r["m"] for x in r["wh"]]} for r in rows])
        L.append(_line(c, C[c]) + f"\n  dropped: {dropped}; median segment seconds {[round(s, 1) for s in extra[c]['seg_median']]};"
                 f" resume check on {resume[c]['n']} designs: max relative difference {R._fmt(resume[c]['max_rel_diff'], 2) if resume[c]['max_rel_diff'] is None else format(resume[c]['max_rel_diff'], '.2e')},"
                 f" resumed / uninterrupted time median {R._fmt(resume[c]['time_ratio_median'], 3)}")
    ai = [c for c in C if c.startswith("Ai2020")]
    vd = verdicts(C, ai) if C else {}
    md = [d["max_rel_diff"] for d in resume.values() if d["max_rel_diff"] is not None]
    vd["H86"] = R.verdict(md, lambda x: x <= 1e-4, lambda x: x > 1e-2)
    p = _pooled(C)
    L += ["", "Pooled over conditions (median, max, exact):"] + [
        f"  {k}: {d['median']:.4f}, {d['max']:.4f}, {d['exact']} of {len(C)}" for k, d in p.items()]
    L += ["", "Verdicts: " + ", ".join(f"{k} {w}" for k, w in vd.items())]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(kept=kept, conditions=C, pooled=p, verdicts=vd, resume=resume, extra=extra), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["child"]:
        print(json.dumps(_child(json.loads(sys.argv[2]))))
    elif cmd == ["dev"]:
        dev()
    elif cmd in (["probe"], ["bench"]):
        P._use_gate_machinery(CONDITIONS)
        G.HERE, G.SOBOL_SEED, G.WORKERS = HERE, SOBOL_SEED, WORKERS
        G.probe() if cmd == ["probe"] else bench()
    elif cmd == ["report"]:
        report()
    else:
        print(__doc__)
