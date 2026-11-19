"""Milestone 151: should the clipped ladder take its clip alpha per process corner? A leave-one-milestone-out choice of alpha at
SKY130 ff_n40C_1v95 on the 77 ff designs of milestones 144 to 147, and the same alpha grid replayed on 118 tt cells (milestones
110, 115, 116, 125, 132, 133). No flow run.

Usage: python3 analyse.py [out.txt]

Why: milestone 150's post hoc section found that ranking the ff ladder by mapped area alone (the clip's alpha -> 0 limit; with
alpha = 0, r2c = area x period, and period is fixed within a design) beats SWC's alpha = 1.25 in sample at ff (2.69% against 2.98%,
interval -2.19 to +2.07), winning milestones 144 and 145 and losing 147, with csum2's 66.62% as its tail. Milestone 32 found area
alone a poor pick at tt. alpha = 1.25 was chosen in milestone 115 on 52 tt held-out cells from {unclipped, 1, 1.25, 1.5, 2, 3}; no
alpha below 1 has ever been scored as SWC. So: (i) does a leave-one-milestone-out choice over alphas below and at 1.25 beat 1.25 at
ff, (ii) what does the same grid do on the tt cells, and (iii) is a per-corner alpha better than one alpha for both corners?

Rule: SWC(alpha) = milestone 115's switch with r2c(alpha) = mapped area x max(period, alpha x mapped delay): on the ladder branch
(routed/r2 > theta = 3) route the best 8 by r2c(alpha), else equal-cost random. Per-cell regrets come from clip_score/score.py's
build(), unchanged, with its ALPHAS grid widened to include the new values; each alpha's seed is build()'s own
("m115" + clock + design + table + alpha), so alpha = 1.25 reproduces every published SWC number (milestone 148's 2.98% at ff,
milestone 136's 3.30% on the 42 tt blind cells), and a test checks it.

Grid, fixed here before the script first ran: GRID = (0, 0.5, 0.8, 1, 1.25). alpha = 0 is area-only; 0.5 and 0.8 clip unless the
mapped delay exceeds 2 and 1.25 periods. Reported, not selectable: unclipped, 1.5, 2, 3 (the rest of milestone 115's grid).

Units and folds:
  ff  77 designs, one clock each (milestone 148's pool), folds = milestones 144 (31), 145, 146, 147.
  tt  118 cells (design x clock), folds = H52 (milestone 110's 52 held-out cells, where 1.25 was chosen), B24 (milestones 115 and
      116, the first blind cells for 1.25), B42 (milestones 125, 132 and 133, the paper's blind table).
Selection: for a held-out fold, the alpha in GRID with the lowest mean regret over the other folds' units of the same corner (ties go
to the larger alpha, nearest the incumbent 1.25). Intervals: design bootstrap of the mean paired difference (a design's cells
resampled together), 2,000 resamples, seed 151.

Analyses: (a) ff: every alpha's pooled and per-milestone mean, worst design, better/worse/tied against SWC(1.25) and the interval;
(b) ff leave-one-milestone-out (PRIMARY); (c) tt: the same table per fold and pooled; (d) per-corner against single-alpha selection
over the 7 folds (single: a held-out fold's alpha is chosen on all 6 other folds, both corners; per-corner: on the other folds of
its own corner), scored on all 195 units; (e) the clip's binding share per alpha at each corner (points where max picks period).

Predictions, written here and committed before the script first ran:
 (1) PRIMARY: at ff the leave-one-milestone-out SWC(alpha) has lower pooled mean regret than SWC(1.25) (2.98%) on the 77 designs.
     Prior 40%.
 (2) in sample at ff, the best alpha in GRID is below 1 (0, 0.5 or 0.8). Prior 70% (milestone 150's post hoc area-only reading,
     made with different seeds, informs this one; disclosed).
 (3) at tt, on the 42 blind cells, SWC(0) has higher mean regret than SWC(1.25) (3.30%). Prior 75%.
 (4) at tt, pooled over all 118 cells, SWC(0) has higher mean regret than SWC(1.25). Prior 80%.
 (5) at tt, the leave-one-fold-out choice picks 1.25 in all three folds. Prior 55%.
 (6) the per-corner selection has lower pooled mean regret over the 195 units than the single-alpha selection. Prior 50%.
 (7) at ff, SWC(1) has lower pooled mean regret than SWC(1.25). Prior 50%.
Reported, not predicted: per-design ff table for alpha in GRID, binding shares, and the csum2 tail per alpha.
"""
import importlib.util
import random
import statistics
import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

SEED = 151
BOOT = 2000
GRID = (0, 0.5, 0.8, 1, 1.25)
EXTRA = (None, 1.5, 2, 3)
INCUMBENT = 1.25


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _widen(root, seen=None):
    """Add GRID to ALPHAS in every clip_score/score.py instance reachable from module root (each _sibling load is its own copy)."""
    seen = set() if seen is None else seen
    if id(root) in seen:
        return 0
    seen.add(id(root))
    n = 0
    if hasattr(root, "ALPHAS") and hasattr(root, "clipped_skip"):
        root.ALPHAS = tuple(dict.fromkeys(tuple(root.ALPHAS) + GRID))
        n += 1
    for v in list(vars(root).values()):
        if isinstance(v, types.ModuleType) and getattr(v, "__name__", "").startswith("verified_dse"):
            n += _widen(v, seen)
    return n


m148 = _sibling(EXP / "pilot_tau_ff" / "analyse.py", "verified_dse_m151_m148")
guard = _sibling(EXP / "pilot_clip" / "guard.py", "verified_dse_m151_guard")
bpool = _sibling(EXP / "blind_pooled" / "analyse.py", "verified_dse_m151_bpool")
score = m148.score
THETA = score.THETA


def aname(a):
    return "unclipped" if a is None else f"{a:g}"


def swc(c, a):
    return c["clip"][a] if c["ratio"] > THETA else c["rand"]


def binds(rs, a):
    if a is None:
        return 0.0
    return statistics.mean(a * (r["period_ns"] - r["synth_netlist_wns"]) <= r["period_ns"] for r in rs)


def units():
    """[{corner, fold, design, clock, cell, rows}] for the 77 ff designs and the 118 tt cells."""
    n = _widen(m148) + _widen(guard) + _widen(bpool)
    assert n >= 3, n
    out = []
    for ms, x, c, rs in m148.pool():
        out.append({"corner": "ff", "fold": f"m{ms}", "design": f"m{ms}:{x}", "cell": c, "rows": rs})
    held, _dear, _pool, m115, m116 = guard.tables()
    for fold, cs in (("H52", held), ("B24", m115 + m116), ("B42", bpool.cells())):
        for c in cs:
            out.append({"corner": "tt", "fold": fold, "design": f"{c['table']}:{c['design']}", "cell": c, "rows": None})
    for u in out:
        missing = [a for a in GRID + EXTRA if a not in u["cell"]["clip"]]
        assert not missing, (u["design"], missing)
    return out


def counts(us, folds):
    return ", ".join("%s %d" % (f, sum(u["fold"] == f for u in us)) for f in folds)


def mean(us, a):
    return statistics.mean(swc(u["cell"], a) for u in us)


def boot_diff(us, a, b, seed=SEED, n=BOOT):
    """Design bootstrap 95% interval of mean(SWC(a) - SWC(b)) over units, a design's units resampled together."""
    by = {}
    for u in us:
        by.setdefault(u["design"], []).append(swc(u["cell"], a) - swc(u["cell"], b))
    groups = list(by.values())
    rng = random.Random(seed)
    ms = []
    for _ in range(n):
        pick = [rng.choice(groups) for _ in groups]
        flat = [d for g in pick for d in g]
        ms.append(statistics.mean(flat))
    ms.sort()
    return ms[int(0.025 * n)], ms[int(0.975 * n) - 1]


def bwt(us, a, b, eps=1e-9):
    d = [swc(u["cell"], a) - swc(u["cell"], b) for u in us]
    return sum(x < -eps for x in d), sum(x > eps for x in d), sum(abs(x) <= eps for x in d)


def choose(us, grid=GRID):
    """alpha in grid with the lowest mean regret over us; ties to the larger alpha."""
    return min(grid, key=lambda a: (round(mean(us, a), 9), -a))


def lofo(us, pool_for):
    """Leave-one-fold-out: {fold: chosen alpha}, and per-unit regret under the chosen alpha."""
    folds = sorted({u["fold"] for u in us})
    pick, reg = {}, {}
    for f in folds:
        train = [u for u in pool_for(f) if u["fold"] != f]
        pick[f] = choose(train)
        for u in us:
            if u["fold"] == f:
                reg[id(u)] = swc(u["cell"], pick[f])
    return pick, reg


def table(us, label, out):
    out += [f"alpha | {label} mean % | worst % (design) | better / worse / tied vs 1.25 | 95% interval of mean (alpha - 1.25), points"]
    for a in GRID + EXTRA:
        w = max(us, key=lambda u: swc(u["cell"], a))
        b, l, t = bwt(us, a, INCUMBENT)
        lo, hi = boot_diff(us, a, INCUMBENT) if a != INCUMBENT else (0.0, 0.0)
        tag = "" if a in GRID else " (not selectable)"
        out.append(f"{aname(a)}{tag} | {mean(us, a):.2f} | {swc(w['cell'], a):.2f} ({w['design']}) | {b} / {l} / {t} | "
                   f"{lo:+.2f} to {hi:+.2f}")


def main(dst):
    U = units()
    ff = [u for u in U if u["corner"] == "ff"]
    tt = [u for u in U if u["corner"] == "tt"]
    out = ["# Milestone 151: the clip's alpha per corner, chosen leave-one-milestone-out at ff and replayed at tt (no flow run)", "",
           f"theta = {THETA}; grid {', '.join(aname(a) for a in GRID)}; {score.DRAWS} draws per cell; design bootstrap {BOOT} "
           f"resamples, seed {SEED}.",
           f"ff: {len(ff)} designs ({counts(ff, sorted({u['fold'] for u in ff}))}), "
           f"ladder branch {sum(u['cell']['ratio'] > THETA for u in ff)}.",
           f"tt: {len(tt)} cells ({counts(tt, ('H52', 'B24', 'B42'))}), "
           f"ladder branch {sum(u['cell']['ratio'] > THETA for u in tt)}.", ""]
    check = {"ff SWC(1.25)": mean(ff, 1.25), "tt B42 SWC(1.25)": mean([u for u in tt if u["fold"] == "B42"], 1.25)}
    out += ["reproduction: " + "; ".join(f"{k} {v:.2f}%" for k, v in check.items()) + " (published 2.98% and 3.30%)", ""]

    # (a) ff table
    out += ["## (a) ff, every alpha, 77 designs", ""]
    table(ff, "ff", out)
    out += ["", "per milestone (mean %):", "alpha | " + " | ".join(sorted({u['fold'] for u in ff}))]
    for a in GRID + EXTRA:
        fs = sorted({u["fold"] for u in ff})
        out.append(f"{aname(a)} | " + " | ".join("%.2f" % mean([u for u in ff if u["fold"] == f], a) for f in fs))
    best_ff = choose(ff)

    # (b) ff LOMO (primary)
    pick_ff, reg_ff = lofo(ff, lambda f: ff)
    lomo_ff = statistics.mean(reg_ff[id(u)] for u in ff)
    d = [reg_ff[id(u)] - swc(u["cell"], INCUMBENT) for u in ff]
    by = {}
    for u, x in zip(ff, d):
        by.setdefault(u["design"], []).append(x)
    rng = random.Random(SEED)
    g = list(by.values())
    bs = sorted(statistics.mean([x for gg in [rng.choice(g) for _ in g] for x in gg]) for _ in range(BOOT))
    lo, hi = bs[int(0.025 * BOOT)], bs[int(0.975 * BOOT) - 1]
    out += ["", "## (b) ff leave-one-milestone-out (PRIMARY)", "",
            "held-out milestone | alpha chosen on the other three | its mean % | SWC(1.25) there %"]
    for f in sorted(pick_ff):
        fu = [u for u in ff if u["fold"] == f]
        out.append(f"{f} | {aname(pick_ff[f])} | {statistics.mean(reg_ff[id(u)] for u in fu):.2f} | {mean(fu, INCUMBENT):.2f}")
    nb, nw = sum(x < -1e-9 for x in d), sum(x > 1e-9 for x in d)
    out += [f"pooled: LOMO {lomo_ff:.2f}% against SWC(1.25) {mean(ff, INCUMBENT):.2f}%; difference {statistics.mean(d):+.2f} points, "
            f"design-bootstrap 95% interval {lo:+.2f} to {hi:+.2f}; better on {nb}, worse on {nw}, tied on {len(d) - nb - nw}",
            f"in-sample best alpha at ff: {aname(best_ff)} ({mean(ff, best_ff):.2f}%)"]

    # (c) tt
    out += ["", "## (c) tt, every alpha", ""]
    for f in ("H52", "B24", "B42"):
        out += [f"### {f}", ""]
        table([u for u in tt if u["fold"] == f], f, out)
        out.append("")
    out += ["### all 118 tt cells", ""]
    table(tt, "tt", out)
    pick_tt, reg_tt = lofo(tt, lambda f: tt)
    lomo_tt = statistics.mean(reg_tt[id(u)] for u in tt)
    out += ["", "tt leave-one-fold-out: " + ", ".join(f"{f} -> {aname(pick_tt[f])}" for f in ("H52", "B24", "B42")) +
            f"; pooled {lomo_tt:.2f}% against SWC(1.25) {mean(tt, INCUMBENT):.2f}%", f"in-sample best alpha at tt: {aname(choose(tt))}"]

    # (d) per-corner vs single
    pick_s, reg_s = lofo(U, lambda f: U)
    reg_pc = {**reg_ff, **reg_tt}
    single = statistics.mean(reg_s[id(u)] for u in U)
    percorner = statistics.mean(reg_pc[id(u)] for u in U)
    out += ["", "## (d) per-corner against single-alpha selection, 7 folds, 195 units", "",
            "fold | single (chosen on the 6 other folds) | per-corner (chosen on its own corner's other folds)"]
    for f in sorted(pick_s):
        out.append(f"{f} | {aname(pick_s[f])} | {aname((pick_ff if f.startswith('m') else pick_tt)[f])}")
    out += [f"pooled over 195 units: single {single:.2f}%, per-corner {percorner:.2f}%, SWC(1.25) everywhere {mean(U, INCUMBENT):.2f}%"]

    # (e) binding shares
    out += ["", "## (e) clip binding share (points where max(period, alpha x mapped delay) = period), median over ladder-branch ff designs", "",
            "alpha | ff median | ff mean"]
    lad_ff = [u for u in ff if u["cell"]["ratio"] > THETA]
    for a in GRID:
        v = [binds(u["rows"], a) for u in lad_ff]
        out.append(f"{aname(a)} | {statistics.median(v):.3f} | {statistics.mean(v):.3f}")

    # per-design ff table
    out += ["", "## ff per design (ladder branch marked *)", "", "design | routed/r2 | " + " | ".join(aname(a) for a in GRID)]
    for u in sorted(ff, key=lambda u: u["design"]):
        star = "*" if u["cell"]["ratio"] > THETA else ""
        out.append(f"{u['design']}{star} | {u['cell']['ratio']:.2f} | " + " | ".join(f"{swc(u['cell'], a):.2f}" for a in GRID))

    # predictions
    b42 = [u for u in tt if u["fold"] == "B42"]
    preds = [
        ("(1) PRIMARY: ff LOMO below SWC(1.25)", lomo_ff < mean(ff, INCUMBENT)),
        ("(2) in-sample best ff alpha below 1", best_ff < 1),
        ("(3) tt B42: SWC(0) above SWC(1.25)", mean(b42, 0) > mean(b42, INCUMBENT)),
        ("(4) tt all 118: SWC(0) above SWC(1.25)", mean(tt, 0) > mean(tt, INCUMBENT)),
        ("(5) tt LOFO picks 1.25 in all three folds", all(v == INCUMBENT for v in pick_tt.values())),
        ("(6) per-corner below single-alpha over 195 units", percorner < single),
        ("(7) ff SWC(1) below SWC(1.25)", mean(ff, 1) < mean(ff, INCUMBENT)),
    ]
    out += ["", "## Predictions", ""] + [f"{p}: {'held' if ok else 'refuted'}" for p, ok in preds]
    text = "\n".join(out) + "\n"
    if dst:
        Path(dst).write_text(text)
    print(text)
    return {"lomo_ff": lomo_ff, "ff125": mean(ff, INCUMBENT), "pick_ff": pick_ff, "pick_tt": pick_tt, "check": check}


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
