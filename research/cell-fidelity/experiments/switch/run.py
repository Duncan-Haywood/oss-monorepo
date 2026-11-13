"""Milestone 5f: decide from a small pilot whether the two-part rule is worth running at all, and read the answer
from verified designs only.

    python experiments/switch/run.py dev      # post hoc replay on the seven committed cells -> dev.txt (stdlib)
    python experiments/switch/run.py bench    # 64 Sobol (seed 5) designs x SPMe/DFN@100 on the plan's cells, V1 re-solves (resumable)
    python experiments/switch/run.py report   # results.txt, summary.json (stdlib)

The switch's constants (pilot of 8 SPMe runs, DFN on the first 2 of them in queue order, r* = 0.10) were chosen on the
`dev` replay of the seven committed cells, which is post hoc; the bench tests them unchanged on fresh designs.
The switch, the answer step and hypotheses H46 to H50 are fixed in ../../LOG.md (milestone 5f plan) before the bench.
The rule's screen and queue are milestone 5e's (../rule/run.py), imported unchanged, and so are the design mapping,
protocol and solver variants behind it.
"""
import importlib.util
import json
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

CELLS = ("Mohtat2020", "Ai2020", "NCA_Kim2011", "Ecker2015")
SOBOL_SEED = 5
PILOT = 8
DRAWS = 30
PILOT_DFN = 2
R_STAR = 0.10
DECISIVE = 0.10   # a cell counts for H46 when the two branches' wall times differ by more than this


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


RU = _mod("rule_run", EXP / "rule" / "run.py")


# ---------- pure helpers (stdlib; tested) ----------

def predicted_share(pilot_rows, n, run_of=RU.RUN_OF):
    """Variant A (development only): both models on every pilot design. Predicted rule wall time as a share of
    all-DFN = SPMe/DFN time ratio + the pilot's mis-scored share + run_of/n."""
    ts = sum(r["t_spme"] for r in pilot_rows)
    td = sum(r["t_dfn"] for r in pilot_rows)
    p = sum(1 for r in pilot_rows if RU.mis_scored(r["score"], r["dfn"])) / len(pilot_rows)
    return (ts / td if td else float("inf")) + p + run_of / n, p


def suspect(row, r_star=R_STAR):
    """SPMe-only flag: the screen failed, or its minimum salt ratio is below r_star."""
    return row["kind"] == "fail" or row["r"] < r_star


def spme_pilot(pilot_rows, n, n_dfn=PILOT_DFN, r_star=R_STAR, run_of=RU.RUN_OF):
    """The pre-registered switch: SPMe on the pilot, DFN on the first n_dfn of the pilot in the rule's queue order.
    ratio = median SPMe time over the pilot's non-failed runs / mean DFN time of those n_dfn designs (all pilot SPMe
    runs if every one failed); s = the pilot's suspect share. Returns (predicted share, s, pilot positions given DFN)."""
    q = RU.queue(pilot_rows)[:n_dfn]
    ok = [r["t_spme"] for r in pilot_rows if r["kind"] != "fail"] or [r["t_spme"] for r in pilot_rows]
    td = statistics.mean(pilot_rows[i]["t_dfn"] for i in q)
    s = sum(suspect(r, r_star) for r in pilot_rows) / len(pilot_rows)
    return (statistics.median(ok) / td if td else float("inf")) + s + run_of / n, s, q


def iterate_pick(rows, verified):
    """Answer step: while the best of (DFN where verified, screen score elsewhere) is unverified, verify it.
    Returns (pick index, set of verified indices)."""
    ver = set(verified)
    while True:
        merged = [r["dfn"] if i in ver else r["score"] for i, r in enumerate(rows)]
        p = max(range(len(rows)), key=lambda i: (merged[i], -i))
        if p in ver:
            return p, ver
        ver.add(p)


def rule_from(rows, pre_verified, run_of=RU.RUN_OF):
    """5e's queue, stopping after run_of consecutive sound designs. Designs already verified cost nothing but still
    count toward (or reset) the run, so the verified set contains the no-pilot rule's. Then iterate_pick."""
    bad = [RU.mis_scored(r["score"], r["dfn"]) for r in rows]
    verified, run = set(pre_verified), 0
    for i in RU.queue(rows):
        verified.add(i)
        run = 0 if bad[i] else run + 1
        if run >= run_of:
            break
    return iterate_pick(rows, verified)


def simulate(rows, order, pilot=PILOT, mode="spme"):
    """One draw; the pilot is the first `pilot` designs of `order`. mode 'spme' (pre-registered): spme_pilot;
    mode 'both' (variant A): DFN on every pilot design. If the predicted share is >= 1, run DFN on the rest and return
    its best; otherwise SPMe on the rest, the rule with the pilot's DFN runs already verified, iterate_pick."""
    n = len(rows)
    P = order[:pilot]
    prow = [rows[i] for i in P]
    if mode == "both":
        share, p_hat = predicted_share(prow, n)
        dfn_done = list(P)
    else:
        share, p_hat, q = spme_pilot(prow, n)
        dfn_done = [P[k] for k in q]
    best = max(r["dfn"] for r in rows)
    bad = [RU.mis_scored(r["score"], r["dfn"]) for r in rows]
    if share >= 1.0:
        pick = max(range(n), key=lambda i: (rows[i]["dfn"], -i))
        t = sum(rows[i]["t_spme"] for i in P) + sum(r["t_dfn"] for r in rows)
        ver = set(range(n))
        switched = True
    else:
        pick, ver = rule_from(rows, dfn_done)
        t = sum(r["t_spme"] for r in rows) + sum(rows[i]["t_dfn"] for i in ver)
        switched = False
    nb = sum(bad)
    return dict(switched=switched, share=share, p_hat=p_hat, t=t, calls=len(ver),
                recall=(sum(1 for i in ver if bad[i]) / nb) if nb else None,
                gap=(best - rows[pick]["dfn"]) / best if best > 0 else None)


def branches(rows):
    """Wall time of the two fixed branches with the same answer step: the full rule (no pilot) and DFN on everything."""
    pick, ver = rule_from(rows, [])
    best = max(r["dfn"] for r in rows)
    t_rule = sum(r["t_spme"] for r in rows) + sum(rows[i]["t_dfn"] for i in ver)
    t_all = sum(r["t_dfn"] for r in rows)
    return dict(t_rule=t_rule, t_all=t_all, rule_calls=len(ver), rule_gap=(best - rows[pick]["dfn"]) / best)


def evaluate(rows, draws=DRAWS, pilot=PILOT, mode="spme"):
    b = branches(rows)
    sims = [simulate(rows, random.Random(s).sample(range(len(rows)), len(rows)), pilot, mode) for s in range(draws)]
    cheaper_is_all = b["t_all"] < b["t_rule"]
    decisive = abs(b["t_rule"] - b["t_all"]) / min(b["t_rule"], b["t_all"]) > DECISIVE
    best_t = min(b["t_rule"], b["t_all"])
    rec = [s["recall"] for s in sims if not s["switched"] and s["recall"] is not None]
    return dict(b, decisive=decisive, cheaper="all-DFN" if cheaper_is_all else "rule",
                right=sum(1 for s in sims if s["switched"] == cheaper_is_all) / draws,
                switched=sum(s["switched"] for s in sims) / draws,
                t_med=statistics.median(s["t"] for s in sims), t_ratio=statistics.median(s["t"] for s in sims) / best_t,
                t_ratio_max=max(s["t"] for s in sims) / best_t,
                gap_max=max(s["gap"] for s in sims), recall_min=min(rec) if rec else None,
                share_med=statistics.median(s["share"] for s in sims),
                calls_med=statistics.median(s["calls"] for s in sims))


def verdict(values, ok, bad):
    return RU.verdict(values, ok, bad)


# ---------- dev replay (post hoc, committed cells) ----------

def dev_cells():
    by = {}
    for r in RU._load(EXP / "rule" / "bench.jsonl"):
        by.setdefault(r["set"], {})[(r["j"], r["what"])] = r
    out = dict(RU.replay_runs())
    out.update(by)
    return out


def _lines(name, ev, n, drop):
    """Report lines for one cell."""
    return [f"{name}: {n} designs ({len(drop)} dropped)",
            f"  branches: rule {ev['t_rule']:.0f} s ({ev['rule_calls']} DFN calls, gap {ev['rule_gap']:.4f}) vs all-DFN {ev['t_all']:.0f} s;"
            f" cheaper {ev['cheaper']} ({'decisive' if ev['decisive'] else 'within 10%'})",
            f"  switch over {DRAWS} pilots of {PILOT}: switched {ev['switched']:.0%}, right branch {ev['right']:.0%};"
            f" median predicted share {ev['share_med']:.2f}; median calls {ev['calls_med']:.0f}",
            f"  wall time: median {ev['t_med']:.0f} s = {ev['t_ratio']:.3f} x the cheaper branch (worst {ev['t_ratio_max']:.3f});"
            f" worst pick gap {ev['gap_max']:.4f}; worst recall when not switched {RU._fmt(ev['recall_min'], 2)}"]


def dev():
    L = [f"cell-fidelity milestone 5f, development replay (post hoc: these cells built the rule; pilot {PILOT} SPMe runs, DFN on {PILOT_DFN}, r* {R_STAR}, {DRAWS} draws)", ""]
    summ = {}
    for s, runs in dev_cells().items():
        rows, drop = RU.pool(runs)
        ev = evaluate(rows)
        L += _lines(s, ev, len(rows), drop)
        a = evaluate(rows, mode="both")
        L.append(f"  variant A (DFN on all {PILOT} pilot designs): switched {a['switched']:.0%}, right {a['right']:.0%},"
                 f" median wall {a['t_ratio']:.3f} x the cheaper branch, worst gap {a['gap_max']:.4f}")
        summ[s] = dict(ev, variant_A=a)
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L))


# ---------- simulation (pybamm) ----------

def designs():
    import numpy as np
    from scipy.stats import qmc
    from energy_cell import cell
    u = qmc.Sobol(d=4, scramble=True, seed=SOBOL_SEED).random_base2(RU.N_LOG2)
    return [list(map(float, r)) for r in np.asarray(cell.BOUNDS[:, 0] + u * (cell.BOUNDS[:, 1] - cell.BOUNDS[:, 0]))]


def bench():
    path = HERE / "bench.jsonl"
    xs = designs()
    done = {(r["set"], r["j"], r["what"]) for r in RU._load(path)}
    RU._write(path, [(s, j, w, xs[j]) for s in CELLS for w in ("V0", "DFN") for j in range(len(xs)) if (s, j, w) not in done])
    rows = RU._load(path)
    stops = [(r["set"], r["j"]) for r in rows if r["what"] == "V0" and RU.SV.kind(r) == "stop"]
    done = {(r["set"], r["j"], r["what"]) for r in rows}
    RU._write(path, [(s, j, "V1", xs[j]) for s, j in stops if (s, j, "V1") not in done])


def report():
    by = {}
    for r in RU._load(HERE / "bench.jsonl"):
        by.setdefault(r["set"], {})[(r["j"], r["what"])] = r
    L = [f"cell-fidelity milestone 5f: pilot switch (pilot {PILOT}, {DRAWS} draws) and iterate answer step, fresh Sobol seed {SOBOL_SEED}", ""]
    summ = dict(cells={})
    for s in CELLS:
        rows, drop = RU.pool(by.get(s, {}))
        if not rows:
            L.append(f"{s}: no complete design yet")
            continue
        ev = evaluate(rows)
        stops = [r for r in rows if r["v0kind"] == "stop"]
        resc = [r for r in rows if r["kind"] == "rescued"]
        nb = sum(RU.mis_scored(r["score"], r["dfn"]) for r in rows)
        L += _lines(s, ev, len(rows), drop)
        L.append(f"  SPMe V0: ok {sum(r['v0kind'] == 'ok' for r in rows)}, stop {len(stops)}, fail {sum(r['v0kind'] == 'fail' for r in rows)};"
                 f" V1 rescued {len(resc)}; mis-scored {nb} ({nb / len(rows):.0%})")
        for r in resc:
            L.append(f"    rescued stop {r['j']}: SPMe@100 {r['score']:.1f} vs DFN@100 {r['dfn']:.1f}, gap {RU.SV.rel_gap(r['score'], r['dfn']):+.3f}")
        summ["cells"][s] = dict(ev, n=len(rows), dropped=drop, n_bad=nb, stops=len(stops),
                                rescued_gaps=[RU.SV.rel_gap(r["score"], r["dfn"]) for r in resc])
    C = list(summ["cells"].values())
    v = dict(
        H46=verdict([c["right"] if c["decisive"] else None for c in C], lambda x: x >= 0.8, lambda x: x < 0.6),
        H47=verdict([c["t_ratio"] for c in C], lambda x: x <= 1.10, lambda x: x > 1.20),
        H48=verdict([c["gap_max"] for c in C], lambda x: x <= 0.01, lambda x: x > 0.02),
        H49=verdict([sum(1 for g in c["rescued_gaps"] if g > RU.GAP) if c["stops"] else None for c in C], lambda x: x == 0, lambda x: x > 1),
        H50=verdict([c["recall_min"] for c in C], lambda x: x >= 0.9, lambda x: x < 0.8))
    summ["verdicts"] = v
    L += ["", "Verdicts: " + ", ".join(f"{k} {w}" for k, w in v.items())]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    {"dev": dev, "bench": bench, "report": report}.get(cmd[0] if cmd else "", lambda: print(__doc__))()
