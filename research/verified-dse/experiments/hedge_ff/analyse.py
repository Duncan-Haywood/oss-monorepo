"""Milestone 149: at SKY130 ff_n40C_1v95, does hedging the pilot guard's fall-back (keep part of the ladder instead of abandoning it
for random routing) move the break-even far enough that a routed-pilot tau-b guard beats the unguarded clipped ladder (SWC)? A replay
on milestone 148's 77 ff designs (milestones 144 to 147), parameters chosen leave-one-milestone-out. No flow run.

Usage: python3 analyse.py [out.txt]

Why: milestone 148's "Next". Its guard GC(p, tau0) fell back to equal-cost random routing, which saves 6.77 points on a design where
SWC loses to random and costs 9.39 on any other, so a guard pays only when its false-alarm rate is below 0.171 x its hit rate; the
best pilot reached a ratio near 0.59. A fall-back that keeps some of the ladder's ranks should cost less on the designs where the
ladder works and save less where it fails. Whether that trade raises the break-even ratio past what a pilot can reach is open.
At tt, milestone 130 hedged a different guard (SWP) inside its mapped subset and found the hedge nearly free and nearly useless.

Costs (units of one r2 score; R = routed/r2 for the design; budget B = n + 8 (R - 1), SWC's and equal-cost random's wall-clock).
The guard's pilot and its trust branch are milestone 148's GC(p, tau0) exactly: route p uniformly drawn points (p R); tau-b of the
clipped mapped score r2c(1.25) against the routed score on them (None counts as 0); trust when tau-b >= tau0 (map the rest, route
the r2c best 8 - p). Only the distrust branch changes.

Hedged fall-back HF(s, h), L = B - p R left after the pilot: map s uniformly drawn points of the other n - p (cost s); route their
r2c best h (R - 1 each); then the subset's other mapped points in uniform order at R - 1 while L covers it; then fresh uniform points
at R. HF(0, 0) is milestone 148's random fall-back (k - p fresh points). s in {8, 16, 32}, h in {1, 2, 3}, so 9 hedges; with
p in {3, 4, 6} and tau0 in {0, 0.2, 0.4} that is 81 hedged guards GH(p, tau0, s, h), next to milestone 148's 12 GC entries and SWC.

Paired design: the pilot, the trust decision and the trust branch use milestone 148's random stream (seed "m148" + milestone +
design + p + tau0) unchanged, and so does the random fall-back, so every GC number must reproduce milestone 148's table and every
hedge shares GC's fall-back draws. Hedges draw their subset, tie-breaks and uniform order from a second stream (that seed + "-h").
An always-distrust run (tau0 = 2, which no tau-b reaches) prices each fall-back on its own, for the break-even analysis.

Selection, leave-one-milestone-out over the full grid (SWC, the 12 GC and the 81 GH entries): for each milestone, the entry with the
lowest mean regret on the other three milestones' designs (ties to SWC, then grid order), applied to the held-out milestone. All four
tables were seen (milestone 148 computed the GC regrets); no hedged regret existed before this file was committed.

Predictions, written here and committed before the script first ran:
 (1) PRIMARY: the leave-one-milestone-out guard over the full grid has lower pooled mean regret than SWC (2.98%). Prior 20%.
 (2) in sample, at least one GH entry has lower pooled mean regret than SWC. Prior 35%.
 (3) the hedge cuts the cost where the ladder works: the always-distrust HF(32, 3) with p = 4 costs at least 3 points less than the
     random fall-back (p = 4) on the 59 designs where SWC does not lose to random. Prior 70%.
 (4) and gives up part of the saving where it fails: on the 14 losers, the always-distrust HF(32, 3) (p = 4) is worse than the random
     fall-back by less than 2 points. Prior 45%.
 (5) break-even: for at least one hedge, the post hoc break-even ratio (losers x saving over others x cost, always-distrust, p = 4)
     is above 0.5, three times milestone 148's 0.171. Prior 40%.
 (6) the best GH entry in sample beats the best GC entry in sample (GC(3, -1), 3.21%). Prior 75%.
 (7) the 12 GC entries reproduce milestone 148's in-sample means to the hundredth (a code check). Prior 97%.
Reported, not predicted: the full grid, per-milestone means, each fall-back's saving, cost and break-even ratio, and the per-design
table for the chosen entries.
"""
import importlib.util
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import stats  # noqa: E402

SEED = 149
EPS = 1e-9
SS = (8, 16, 32)
HS = (1, 2, 3)
HEDGES = [(s, h) for s in SS for h in HS]
PS = (3, 4, 6)
TAUS = (0, 0.2, 0.4)
ALWAYS = 2  # no tau-b reaches it: always distrust


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m148 = _sibling(EXP / "pilot_tau_ff" / "analyse.py", "verified_dse_m149_m148")
score, swc, rand, sign, rule = m148.score, m148.swc, m148.rand, m148.sign, m148.rule
DRAWS, TOP, r2c, boot = m148.DRAWS, m148.TOP, m148.r2c, m148.boot
GC = m148.GRID[1:]
GRID = ["SWC"] + GC + [(p, t, s, h) for p in PS for t in TAUS for s, h in HEDGES]


def hedge_pick(n, s_key, R, L, others, s, h, rng_h):
    """HF(s, h)'s routed points after the pilot, with L budget left: s mapped uniformly, their r2c best h, then mapped at R - 1,
    then fresh at R."""
    s = min(s, len(others))
    sub = rng_h.sample(others, s)
    tb = {i: rng_h.random() for i in sub}
    ranked = sorted(sub, key=lambda i: (s_key[i], tb[i]))
    L -= s
    chosen = []
    for i in ranked[:h]:
        if L + EPS < R - 1:
            break
        chosen.append(i)
        L -= R - 1
    mapped = ranked[h:]
    rng_h.shuffle(mapped)
    for i in mapped:
        if L + EPS < R - 1:
            break
        chosen.append(i)
        L -= R - 1
    sset = set(sub)
    fresh = [i for i in others if i not in sset]
    rng_h.shuffle(fresh)
    for i in fresh:
        if L + EPS < R:
            break
        chosen.append(i)
        L -= R
    return chosen


def guard_all(rs, k, R, p, tau0, seed):
    """GC(p, tau0) as milestone 148 (same stream) and GH(p, tau0, s, h) for every hedge, paired draw for draw.
    Returns ({hedge or 'GC': mean regret %}, fall-back share)."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    sk = [r2c(r) for r in rs]
    best, n = min(y), len(y)
    B = n + TOP * (R - 1)
    rng = random.Random(seed)
    rng_h = random.Random(f"{seed}-h")
    tot = {"GC": 0.0, **{hh: 0.0 for hh in HEDGES}}
    fell = 0
    for _ in range(DRAWS):
        pilot = rng.sample(range(n), p)
        tau = stats.kendall_tau_b([sk[i] for i in pilot], [y[i] for i in pilot])
        rest = [i for i in range(n) if i not in set(pilot)]
        if (0.0 if tau is None else tau) >= tau0:
            tb = {i: rng.random() for i in rest}
            r = rule.draw_regret(y, best, pilot + sorted(rest, key=lambda i: (sk[i], tb[i]))[:TOP - p])
            for key in tot:
                tot[key] += r
            continue
        fell += 1
        tot["GC"] += rule.draw_regret(y, best, pilot + rng.sample(rest, max(k - p, 0)))
        for s, h in HEDGES:
            tot[(s, h)] += rule.draw_regret(y, best, pilot + hedge_pick(n, sk, R, B - p * R, rest, s, h, rng_h))
    return {key: 100 * v / DRAWS for key, v in tot.items()}, fell / DRAWS


def name(g):
    if g in ("SWC", "rand"):
        return g
    if len(g) == 2:
        return f"GC({g[0]}, {g[1]})"
    return f"GH({g[0]}, {g[1]}, {g[2]}, {g[3]})"


def fb_name(f):
    return "random" if f == "GC" else f"HF({f[0]}, {f[1]})"


def main(dst):
    P = m148.pool()
    reg, always = {}, {}
    for ms, x, c, rs in P:
        e = {"SWC": swc(c), "rand": rand(c)}
        lad = c["ratio"] > score.THETA
        R = c["ratio"]
        for p in PS:
            for t in (-1,) + TAUS:
                if lad:
                    v, _ = guard_all(rs, c["k"], R, p, t, f"m148{ms}{x}{p}{t}")
                else:
                    v = {key: c["rand"] for key in ["GC"] + HEDGES}
                e[(p, t)] = v["GC"]
                if t != -1:
                    for hh in HEDGES:
                        e[(p, t) + hh] = v[hh]
            if lad:
                always[(ms, x, p)], _ = guard_all(rs, c["k"], R, p, ALWAYS, f"m149{ms}{x}{p}")
            else:
                always[(ms, x, p)] = {key: c["rand"] for key in ["GC"] + HEDGES}
        reg[(ms, x)] = e
    keys = list(reg)
    mss = sorted({k[0] for k in keys})

    def mean_of(ks, g):
        return statistics.mean(reg[k][g] for k in ks)

    sl = mean_of(keys, "SWC")
    out = ["# Milestone 149: hedged fall-backs for the routed-pilot tau-b guard at SKY130 ff_n40C_1v95, leave-one-milestone-out "
           "(replay of milestones 144 to 147, no flow run)", "",
           f"theta = {score.THETA}; clip alpha = {m148.ALPHA}; {DRAWS} draws per design; pool {len(keys)} designs: " +
           ", ".join(f"milestone {m} {sum(k[0] == m for k in keys)}" for m in mss),
           f"ladder branch: {sum(c['ratio'] > score.THETA for _, _, c, _ in P)} of {len(P)}; grid {len(GRID)} entries "
           f"(SWC, {len(GC)} GC, {len(GRID) - 1 - len(GC)} GH)", ""]
    out += ["## In sample: every grid entry on the pooled designs, best first", "", "rule | mean regret % | " +
            " | ".join(f"m{m}" for m in mss) + " | better / worse / tied than SWC"]
    for g in sorted(["rand"] + GRID, key=lambda g: mean_of(keys, g)):
        b, w, t, _ = sign({k: reg[k][g] - reg[k]["SWC"] for k in keys})
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
    diff = [lomo[k] - reg[k]["SWC"] for k in keys]
    lo, hi = boot(diff, SEED)
    bS, wS, tS, pS = sign({k: lomo[k] - reg[k]["SWC"] for k in keys})
    bR, wR, tR, pR = sign({k: lomo[k] - reg[k]["rand"] for k in keys})
    out += ["", "## Leave-one-milestone-out over the full grid", "",
            "held-out milestone | chosen on the other three | held-out mean regret: guard | SWC | random"]
    for m in mss:
        ks = [k for k in keys if k[0] == m]
        out.append(f"{m} | {name(chosen[m])} | {statistics.mean(lomo[k] for k in ks):.2f} | {mean_of(ks, 'SWC'):.2f} | "
                   f"{mean_of(ks, 'rand'):.2f}")
    out += ["", f"pooled: guard {gl:.2f}%, SWC {sl:.2f}%, random {mean_of(keys, 'rand'):.2f}%",
            f"guard - SWC: mean {statistics.mean(diff):+.2f} points, design bootstrap 95% interval {lo:+.2f} to {hi:+.2f}; "
            f"guard better on {bS}, worse on {wS}, tied on {tS} (sign p = {pS:.4f})",
            f"guard against random: better on {bR}, worse on {wR}, tied on {tR} (sign p = {pR:.4f})"]
    # break-even per fall-back, always distrusting
    d = {k: reg[k]["SWC"] - reg[k]["rand"] for k in keys}
    lad = {(ms, x) for ms, x, c, _ in P if c["ratio"] > score.THETA}
    losers = [k for k in keys if k in lad and d[k] > 0]
    winners = [k for k in keys if k in lad and d[k] <= 0]
    out += ["", "## Each fall-back on its own (always distrust; post hoc break-even, as milestone 148)", "",
            f"ladder-branch designs where SWC loses to random: {len(losers)}; wins or ties: {len(winners)}",
            "p | fall-back | mean regret % | on losers % | on others % | saving on a loser | cost on another | break-even ratio"]
    be = {}
    for p in PS:
        for f in ["GC"] + HEDGES:
            al = {k: always[(k[0], k[1], p)][f] for k in keys}
            gain = statistics.mean(reg[k]["SWC"] - al[k] for k in losers)
            cost = statistics.mean(al[k] - reg[k]["SWC"] for k in winners)
            ratio = len(losers) * gain / (len(winners) * cost) if cost > 0 else float("inf")
            be[(p, f)] = (gain, cost, ratio, statistics.mean(al[k] for k in losers), statistics.mean(al[k] for k in winners))
            out.append(f"{p} | {fb_name(f)} | {statistics.mean(al.values()):.2f} | {be[(p, f)][3]:.2f} | {be[(p, f)][4]:.2f} | "
                       f"{gain:+.2f} | {cost:+.2f} | {ratio:.3f}")
    out += ["", f"for reference, SWC on losers {statistics.mean(reg[k]['SWC'] for k in losers):.2f}%, "
            f"on others {statistics.mean(reg[k]['SWC'] for k in winners):.2f}%"]
    out += ["", "## Per design (chosen entries)", "",
            "milestone | design | routed/r2 | random % | SWC % | LOMO guard % | always HF(32, 3), p = 4 %"]
    cmap = {(ms, x): c for ms, x, c, _ in P}
    for k in sorted(keys, key=lambda k: (k[0], d[k])):
        out.append(f"{k[0]} | {k[1]} | {cmap[k]['ratio']:.2f} | {reg[k]['rand']:.2f} | {reg[k]['SWC']:.2f} | {lomo[k]:.2f} | "
                   f"{always[(k[0], k[1], 4)][(32, 3)]:.2f}")
    gh = [g for g in GRID if g != "SWC" and len(g) == 4]
    best_gh = min(gh, key=lambda g: mean_of(keys, g))
    best_gc = min(GC, key=lambda g: mean_of(keys, g))
    m148_means = {"GC(3, -1)": 3.21, "GC(3, 0)": 4.56, "GC(3, 0.2)": 4.53, "GC(3, 0.4)": 6.67, "GC(4, -1)": 4.05, "GC(4, 0)": 4.54,
                  "GC(4, 0.2)": 5.23, "GC(4, 0.4)": 6.30, "GC(6, -1)": 5.56, "GC(6, 0)": 5.87, "GC(6, 0.2)": 6.03, "GC(6, 0.4)": 6.73}
    repro = all(f"{mean_of(keys, g):.2f}" == f"{m148_means[name(g)]:.2f}" for g in GC)
    g32, c32 = be[(4, (32, 3))], be[(4, "GC")]
    best_ratio = max(be[(4, hh)][2] for hh in HEDGES)
    out += ["", "## Predictions", "",
            f"(1) PRIMARY: LOMO guard over the full grid below SWC: {gl < sl} ({gl:.2f} against {sl:.2f})",
            f"(2) in sample, some GH entry below SWC: {mean_of(keys, best_gh) < sl} (best {name(best_gh)} {mean_of(keys, best_gh):.2f})",
            f"(3) always HF(32, 3), p = 4, costs at least 3 points less than random fall-back on the others: "
            f"{c32[4] - g32[4] >= 3} ({g32[4]:.2f}% against {c32[4]:.2f}%)",
            f"(4) and is worse than random fall-back on the losers by less than 2 points: {g32[3] - c32[3] < 2} "
            f"({g32[3]:.2f}% against {c32[3]:.2f}%)",
            f"(5) some hedge's break-even ratio (p = 4) above 0.5: {best_ratio > 0.5} (best {best_ratio:.3f}; random {c32[2]:.3f})",
            f"(6) best GH in sample beats best GC in sample: {mean_of(keys, best_gh) < mean_of(keys, best_gc)} "
            f"({name(best_gh)} {mean_of(keys, best_gh):.2f} against {name(best_gc)} {mean_of(keys, best_gc):.2f})",
            f"(7) GC entries reproduce milestone 148: {repro}",
            "", f"chosen per fold: {', '.join(name(chosen[m]) for m in mss)}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return {"lomo": gl, "swc": sl, "repro": repro, "chosen": {m: name(g) for m, g in chosen.items()}}


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
