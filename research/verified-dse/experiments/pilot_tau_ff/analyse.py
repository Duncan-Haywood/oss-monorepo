"""Milestone 148: at SKY130 ff_n40C_1v95, does a routed-pilot rank check that falls back to random routing when the mapped rung
disagrees with a few routed points fix the clipped ladder's (SWC's) losses? A replay on the four ff tables (milestones 144 to 147),
parameters chosen leave-one-milestone-out. No flow run.

Usage: python3 analyse.py [out.txt]

Why: milestone 147's "Next". Neither shift-amount structure nor mapped delay predicts where SWC loses at ff (milestones 145 to 147),
but milestone 145 found the mapped rung ranks routed points worse on the designs where SWC's edge shrinks (median full-pool tau-b 0.27
against 0.47). If the loss is per-design rung mis-ranking, a pilot that measures it on the design itself could catch it. Milestone
111 tested this guard at tt (G(p, tau0), experiments/switch_guard/rule.py) and found it did not help; milestones 126 and 133 found
probe-rank guards on random points cannot see where the ladder fails at tt. Whether that holds at ff, where the rung is worse, is
the open question.

Guard GC(p, tau0), on SWC's ladder branch only (routed/r2 > theta = 3; below it every rule here is equal-cost random routing):
route p uniformly drawn points in full; Kendall tau-b of the clipped mapped score r2c(1.25) (the score SWC ranks by) against the
routed score on them (None, a constant score, counts as 0). If tau-b >= tau0, rank the other points by r2c and route the best 8 - p
(8 routed points in all, SWC's count); otherwise route k - p more uniformly drawn points (k in all, equal-cost random's count from
switch_guard/rule.py's cell()). The pick is the best routed point. 200 draws per design, seed "m148" + table + design + p + tau0.
This is milestone 111's G with SWC's clipped score in place of r2. Grid: p in {3, 4, 6}, tau0 in {-1, 0, 0.2, 0.4}; tau0 = -1
never falls back and prices the pilot alone. SWC (no guard) is also in the grid, so the selection can choose no guard.

Pool: every complete design of the four ff tables, one clock each, with its own milestone's random seed (m144ff, m145ff, m146ff,
m146ffd). Milestone 144's 31 complete designs (its analysis capped at 27 by STOP_RULE.md; the cap was about stopping, not about
which designs count). The five designs milestones 146 and 147 both ran are counted once, from milestone 147 (identical routed
results, milestone 147's post hoc). d = rule - random regret, points.

Selection, leave-one-milestone-out: for each milestone, choose the grid entry with the lowest mean regret on the other three
milestones' designs (ties to SWC, then grid order), apply it to the held-out milestone's designs. The pooled held-out regrets are
the guard procedure's out-of-sample estimate. All four tables were seen by earlier milestones (SWC and random numbers, full-pool
tau-b); the guard's own regrets on them were not computed before this file was committed.

Predictions, written here and committed before the script first ran:
 (1) PRIMARY: the leave-one-milestone-out guard has lower pooled mean regret than SWC. Prior 30% (the tt evidence is against it).
 (2) the design-bootstrap 95% interval (2,000 resamples, seed 148) of mean (guard - SWC) over the pooled designs lies below 0.
     Prior 12%.
 (3) mechanism: the full-pool tau-b of r2c against routed score separates the designs where SWC loses to random (d > 0) from the
     rest with AUC >= 0.70 (lower tau on losers). Prior 55%.
 (4) the pilot sees it: for GC(6, 0.2), the mean fall-back share over draws is at least 0.15 higher on designs where SWC loses than
     on designs where it wins. Prior 40%.
 (5) the leave-one-milestone-out guard is better than random on more designs than it is worse. Prior 80%.
 (6) in sample, no fixed grid entry other than SWC has lower pooled mean regret than SWC. Prior 45%.
 (7) the four folds choose the same grid entry. Prior 40%.
Reported, not predicted: per-milestone means, the full grid, the per-design table, fall-back shares by outcome, and the full-pool
tau-b oracle (fall back exactly where the full-pool tau-b is below a cut; not implementable, an upper bound on what a tau-b reading
could give).
"""
import importlib.util
import json
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import stats  # noqa: E402

SEED = 148
DRAWS = 200
BOOT = 2000
GRID = ["SWC"] + [(p, t) for p in (3, 4, 6) for t in (-1, 0, 0.2, 0.4)]
TOP = 8
ALPHA = 1.25


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m147 = _sibling(EXP / "addchain_delay" / "analyse.py", "verified_dse_m148_m147")
m145, m141 = m147.m145, m147.m141
score, swc, rand, sign = m141.score, m141.swc, m141.rand, m141.sign
rule = score.rule
run144 = _sibling(EXP / "corner_ff_blind" / "run.py", "verified_dse_m148_run144")
run146 = _sibling(EXP / "delay_split_ff" / "run.py", "verified_dse_m148_run146")


def _rows(path):
    return [json.loads(l) for l in Path(path).read_text().splitlines()]


def pool():
    """[(milestone, design, cell, ok rows)] over the four ff tables, deduplicated as the docstring says."""
    out = []
    r47 = _rows(EXP / "addchain_delay" / "results.jsonl")
    meta47 = json.loads((EXP / "addchain_delay" / "meta.json").read_text())
    d47 = m147.complete(r47, meta47["order"]) + m147.complete(r47, meta47["batch2"]["order"])
    r46 = _rows(EXP / "delay_split_ff" / "results.jsonl")
    d46 = [x for x in run146.complete(r46, json.loads((EXP / "delay_split_ff" / "meta.json").read_text())["order"]) if x not in d47]
    r45 = _rows(EXP / "addchain_ff" / "results.jsonl")
    d45 = m145.run.complete(r45)
    r44 = _rows(EXP / "corner_ff_blind" / "results.jsonl")
    d44 = run144.complete(r44)
    for ms, rs, done, src, tag in ((144, r44, d44, "corner_ff_blind", "m144ff"), (145, r45, d45, "addchain_ff", "m145ff"),
                                   (146, r46, d46, "delay_split_ff", "m146ff"), (147, r47, d47, "addchain_delay", "m146ffd")):
        keep = [r for r in rs if r["design"] in set(done)]
        cc = m141.cells(keep, src, tag)
        for x in done:
            out.append((ms, x, cc[x], [r for r in keep if r["design"] == x and r["status"] == "ok"]))
    return out


def r2c(r):
    return score.r2c(r, ALPHA)


def guard(rs, k, p, tau0, seed):
    """Mean regret (%) and fall-back share of GC(p, tau0) over DRAWS draws."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    s = [r2c(r) for r in rs]
    best, n = min(y), len(y)
    rng = random.Random(seed)
    tot = fell = 0.0
    for _ in range(DRAWS):
        pilot = rng.sample(range(n), p)
        tau = stats.kendall_tau_b([s[i] for i in pilot], [y[i] for i in pilot])
        rest = [i for i in range(n) if i not in set(pilot)]
        if (0.0 if tau is None else tau) >= tau0:
            tb = {i: rng.random() for i in rest}
            chosen = pilot + sorted(rest, key=lambda i: (s[i], tb[i]))[:TOP - p]
        else:
            fell += 1
            chosen = pilot + rng.sample(rest, max(k - p, 0))
        tot += rule.draw_regret(y, best, chosen)
    return 100 * tot / DRAWS, fell / DRAWS


def full_tau(rs):
    return stats.kendall_tau_b([r2c(r) for r in rs], [rule.flow.scores(r)["r4"] for r in rs])


def auc(pos, neg):
    """P(a loser's tau < a winner's tau), ties half."""
    if not pos or not neg:
        return float("nan")
    return statistics.mean((a < b) + 0.5 * (a == b) for a in pos for b in neg)


def boot(v, seed=SEED, n=BOOT):
    rng = random.Random(seed)
    ms = sorted(statistics.mean(rng.choice(v) for _ in v) for _ in range(n))
    return ms[int(0.025 * n)], ms[int(0.975 * n) - 1]


def name(g):
    return g if g in ("SWC", "rand") else f"GC({g[0]}, {g[1]})"


def main(dst):
    P = pool()
    reg = {}  # (ms, design) -> {grid entry: regret}, plus fall-back shares
    fell = {}
    for ms, x, c, rs in P:
        e = {"SWC": swc(c), "rand": rand(c)}
        for g in GRID[1:]:
            if c["ratio"] > score.THETA:
                e[g], fell[(ms, x, g)] = guard(rs, c["k"], g[0], g[1], f"m148{ms}{x}{g[0]}{g[1]}")
            else:
                e[g], fell[(ms, x, g)] = c["rand"], None
        reg[(ms, x)] = e
    keys = list(reg)
    mss = sorted({k[0] for k in keys})

    def mean_of(ks, g):
        return statistics.mean(reg[k][g] for k in ks)

    out = ["# Milestone 148: a routed-pilot tau-b guard on the clipped ladder at SKY130 ff_n40C_1v95, leave-one-milestone-out "
           "(replay of milestones 144 to 147, no flow run)", "",
           f"theta = {score.THETA}; clip alpha = {ALPHA}; {DRAWS} draws per design; pool {len(keys)} designs: " +
           ", ".join(f"milestone {m} {sum(k[0] == m for k in keys)}" for m in mss),
           f"ladder branch: {sum(c['ratio'] > score.THETA for _, _, c, _ in P)} of {len(P)}", ""]
    out += ["## In sample: every grid entry on the pooled designs", "", "rule | mean regret % | " +
            " | ".join(f"m{m}" for m in mss) + " | better / worse / tied than SWC"]
    for g in ["rand"] + GRID:
        dd = {k: reg[k][g] - reg[k]["SWC"] for k in keys}
        b, w, t, _ = sign(dd)
        out.append(f"{name(g)} | {mean_of(keys, g):.2f} | " + " | ".join(f"{mean_of([k for k in keys if k[0] == m], g):.2f}" for m in mss)
                   + (f" | {b} / {w} / {t}" if g != "SWC" else " | -"))
    chosen, lomo = {}, {}
    for m in mss:
        train = [k for k in keys if k[0] != m]
        g = min(GRID, key=lambda g: (round(mean_of(train, g), 9), GRID.index(g)))
        chosen[m] = g
        for k in keys:
            if k[0] == m:
                lomo[k] = reg[k][g]
    gl = statistics.mean(lomo.values())
    sl = mean_of(keys, "SWC")
    rl = mean_of(keys, "rand")
    diff = [lomo[k] - reg[k]["SWC"] for k in keys]
    lo, hi = boot(diff)
    bR, wR, tR, pR = sign({k: lomo[k] - reg[k]["rand"] for k in keys})
    bS, wS, tS, pS = sign({k: lomo[k] - reg[k]["SWC"] for k in keys})
    out += ["", "## Leave-one-milestone-out", "", "held-out milestone | chosen on the other three | held-out mean regret: guard | SWC | random"]
    for m in mss:
        ks = [k for k in keys if k[0] == m]
        out.append(f"{m} | {name(chosen[m])} | {statistics.mean(lomo[k] for k in ks):.2f} | {mean_of(ks, 'SWC'):.2f} | "
                   f"{mean_of(ks, 'rand'):.2f}")
    out += ["", f"pooled: guard {gl:.2f}%, SWC {sl:.2f}%, random {rl:.2f}%",
            f"guard - SWC: mean {statistics.mean(diff):+.2f} points, design bootstrap 95% interval {lo:+.2f} to {hi:+.2f}; "
            f"guard better on {bS}, worse on {wS}, tied on {tS} (sign p = {pS:.4f})",
            f"guard against random: better on {bR}, worse on {wR}, tied on {tR} (sign p = {pR:.4f})"]
    # mechanism
    d = {k: reg[k]["SWC"] - reg[k]["rand"] for k in keys}
    ft = {(ms, x): full_tau(rs) for ms, x, _, rs in P}
    lad = {(ms, x) for ms, x, c, _ in P if c["ratio"] > score.THETA}
    losers = [k for k in keys if k in lad and d[k] > 0]
    winners = [k for k in keys if k in lad and d[k] <= 0]
    a = auc([ft[k] for k in losers], [ft[k] for k in winners])
    g6 = (6, 0.2)
    fl = statistics.mean(fell[(k[0], k[1], g6)] for k in losers) if losers else float("nan")
    fw = statistics.mean(fell[(k[0], k[1], g6)] for k in winners) if winners else float("nan")
    out += ["", "## Mechanism: does a tau-b reading see SWC's losses?", "",
            f"ladder-branch designs where SWC loses to random: {len(losers)}; wins or ties: {len(winners)}",
            f"full-pool tau-b (r2c vs routed): median {statistics.median(ft[k] for k in losers):.3f} on losers, "
            f"{statistics.median(ft[k] for k in winners):.3f} on the rest; AUC (lower on losers) {a:.4f}",
            "fall-back share by outcome (mean over designs): grid entry | losers | rest"]
    for g in GRID[1:]:
        if g[1] == -1:
            continue
        out.append(f"{name(g)} | {statistics.mean(fell[(k[0], k[1], g)] for k in losers):.3f} | "
                   f"{statistics.mean(fell[(k[0], k[1], g)] for k in winners):.3f}")
    # oracle: fall back to random where the full-pool tau-b is below a cut (not implementable)
    out += ["", "full-pool tau-b oracle (route randomly where full-pool tau-b < cut, else SWC; an upper bound, in sample):",
            "cut | mean regret % | designs switched"]
    for cut in (0.1, 0.2, 0.3, 0.4, 0.5):
        v = [reg[k]["rand"] if (k in lad and ft[k] < cut) else reg[k]["SWC"] for k in keys]
        out.append(f"{cut} | {statistics.mean(v):.2f} | {sum(k in lad and ft[k] < cut for k in keys)}")
    # Post hoc (added after the first run read the results; not a test): the ceiling for ANY detector that falls back to random,
    # i.e. one that knew which designs SWC loses on, and what the losers cost each rule.
    perfect = [reg[k]["rand"] if k in set(losers) else reg[k]["SWC"] for k in keys]
    out += ["", "post hoc ceiling (not a test): a detector that falls back exactly on the losers: "
            f"{statistics.mean(perfect):.2f}% (SWC {sl:.2f}%); on the {len(losers)} losers SWC "
            f"{statistics.mean(reg[k]['SWC'] for k in losers):.2f}%, random {statistics.mean(reg[k]['rand'] for k in losers):.2f}%; "
            f"on the {len(winners)} others SWC {statistics.mean(reg[k]['SWC'] for k in winners):.2f}%, "
            f"random {statistics.mean(reg[k]['rand'] for k in winners):.2f}%"]
    gain = statistics.mean(reg[k]["SWC"] - reg[k]["rand"] for k in losers)
    cost = statistics.mean(reg[k]["rand"] - reg[k]["SWC"] for k in winners)
    ratio = len(losers) * gain / (len(winners) * cost)
    out.append(f"break-even (post hoc): a fall-back saves {gain:.2f} points on a loser and costs {cost:.2f} on any other design, so "
               f"a guard helps only if its false-alarm rate is below {ratio:.3f} x its hit rate; GC(6, 0.2): hit {fl:.3f}, "
               f"false alarm {fw:.3f} (needs below {ratio * fl:.3f})")
    out += ["", "## Per design", "", "milestone | design | routed/r2 | full tau-b | random % | SWC % | GC(6, 0.2) % | fall-back | LOMO guard %"]
    cmap = {(ms, x): c for ms, x, c, _ in P}
    for k in sorted(keys, key=lambda k: (k[0], d[k])):
        f6 = fell[(k[0], k[1], g6)]
        out.append(f"{k[0]} | {k[1]} | {cmap[k]['ratio']:.2f} | {ft[k] if ft[k] is None else f'{ft[k]:.3f}'} | {reg[k]['rand']:.2f} | "
                   f"{reg[k]['SWC']:.2f} | {reg[k][g6]:.2f} | {'-' if f6 is None else f'{f6:.2f}'} | {lomo[k]:.2f}")
    better_in = [g for g in GRID[1:] if mean_of(keys, g) < sl]
    out += ["", "## Predictions", "",
            f"(1) PRIMARY: LOMO guard pooled mean regret below SWC's: {gl < sl} ({gl:.2f} against {sl:.2f})",
            f"(2) bootstrap interval of guard - SWC below 0: {hi < 0} ({lo:+.2f} to {hi:+.2f})",
            f"(3) full-pool tau-b AUC >= 0.70: {a >= 0.70} ({a:.4f})",
            f"(4) GC(6, 0.2) fall-back share at least 0.15 higher on losers: {fl - fw >= 0.15} ({fl:.3f} against {fw:.3f})",
            f"(5) LOMO guard better than random on more designs than worse: {bR > wR} ({bR} to {wR})",
            f"(6) in sample, no grid entry beats SWC: {not better_in} ({', '.join(name(g) for g in better_in) or 'none'})",
            f"(7) all four folds choose the same entry: {len(set(map(str, chosen.values()))) == 1} "
            f"({', '.join(name(chosen[m]) for m in mss)})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return {"lomo": gl, "swc": sl, "rand": rl, "auc": a, "chosen": {m: name(g) for m, g in chosen.items()}, "n": len(keys)}


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
