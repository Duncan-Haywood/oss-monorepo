"""Milestone 131: a sharper test for the pilot-probe guard. Before falling back, confirm the alarm with a second probe that the
fall-back routes anyway; or demand a margin. Priced by replay (no flow run) on all 90 cells of milestones 119 to 125, paired draw for
draw with milestone 129's SWP(32), against SWC, SWG(32) and equal-cost random.

Usage: python3 analyse.py [out.txt]

Why: milestone 130 found the hedge nearly useless (4.37% against SWP(32)'s 4.39%): a 32-point subset rarely holds the cell's best
point, so the fall-back is not where the loss is. What SWP(32) pays for is its false alarms (distrust 0.12 on the 40 cells where SWC
is at 0.5% or less, costing 1.15 points there). Its "Next": a sharper test, a second pilot or a margin on y[t] - y[u].

Costs, budget and the pilot are milestone 129's (units of one r2 score; R = routed/r2; a routed point costs R from scratch and R - 1
once mapped; B = n + 8 (R - 1); the pilot u is routed outside B and not counted in the pick).

Rules, fixed in this file before their replay table existed. On the ladder branch (R > theta = 3; below it, equal-cost random):
  SWQ(s, k), confirmation: stage 1 as SWP(s) (map s uniform points, route the subset's best t by r2c(1.25)). Alarm when y[u] < y[t].
     On an alarm, route the first k of SWP's own uniform order of the subset's other mapped points (c_1..c_k, R - 1 each; these are
     exactly the first points SWP's fall-back would route). Distrust only if every c_j also beats t (y[c_j] < y[t]); the draw then
     continues exactly as SWP's fall-back (which already routed c_1..c_k), so it is SWP's distrusting draw unchanged. Otherwise trust:
     map the other n - s points and route global ladder ranks, skipping t and the c_j, until 8 are routed (t and the c_j count).
     Every branch costs at most B. A non-alarm draw is SWP's trusting draw unchanged.
  SWM(s, f), margin: as SWP(s) but alarm (and distrust) only when y[u] < (1 - f) y[t]; otherwise SWP's trust branch.
Primary SWQ(32, 1). Reported alongside, not chosen: SWQ(32, 2), and SWM(32, f) for f in {0.005, 0.01, 0.02, 0.05}.

Paired design: one draw stream per cell, seed "m129" + cell key + s, consumed exactly as milestone 129/130's SWP loop (the subset
shuffle and fresh shuffle happen on every SWP alarm), so the SWP(32) column must reproduce milestone 129's table, and every rule here
differs from SWP(32) only on SWP's alarming draws.

All 90 cells are seen (SWG(32) was placed on 74 of them, and milestones 126 to 130 were read before this rule was written), so this
prices SWQ, it does not test it blind. The failing/winning split is SWC's own outcome, as in milestones 126 to 130.

Predictions, written in this file before the replay table existed (checked in main()):
 (1) over the 90 cells, SWQ(32, 1) has lower mean regret than SWP(32) (4.39%);
 (2) over the 90 cells, SWQ(32, 1) has higher mean regret than SWG(32) (3.91%);
 (3) SWQ(32, 1)'s distrust share is below 0.06 on the cells where SWC is at most 0.5% and above 0.2 on the cells where SWC loses to
     random by more than 1 point: on a failing cell t is beaten by random points often, so a second random point confirms;
 (4) on the cells where SWC is at most 0.5%, SWQ(32, 1) gives up less than 0.6 points against SWC (SWP(32): 1.15);
 (5) on the cells where SWC loses by more than 1 point, SWQ(32, 1) is above SWP(32) (11.83%) but below SWC (16.63%);
 (6) per cell, SWQ(32, 1) is better than SWP(32) on more cells than it is worse (ties within 0.01 points).
"""
import importlib.util
import statistics
import sys
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 131
DRAWS = 200
S = 32
KS = (1, 2)
FS = (0.005, 0.01, 0.02, 0.05)
EPS = 1e-9


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pp = _sibling(EXP / "pilot_probe" / "analyse.py", "verified_dse_m131_pp")
st, tp = pp.st, pp.tp
score, rule, pool, sp = tp.score, tp.rule, tp.pool, tp.sp
ALPHA = tp.ALPHA
swc, rand, swg, oracle, mean, lad = tp.swc, tp.rand, tp.swg, tp.oracle, tp.mean, st.lad


def confirm_regret(rs, s, seed):
    """One cell's ladder branch, draw for draw as pilot_probe.pilot_regret: mean regret (%) of SWP(s), SWQ(s, k) for k in KS and
    SWM(s, f) for f in FS, with each rule's distrust share."""
    y = [rule.flow.scores(r)["r4"] for r in rs]
    key = [score.r2c(r, ALPHA) for r in rs]
    best, n = min(y), len(y)
    t_ = rule.stage_times(rs)
    R = (t_["r2"] + t_["r3"] + t_["r4"]) / t_["r2"]
    s = min(s, n)
    rng = random.Random(seed)
    names = ["P"] + [f"Q{k}" for k in KS] + [f"M{f}" for f in FS]
    tot = {m: 0.0 for m in names}
    fell = {m: 0 for m in names}
    for _ in range(DRAWS):
        tb = [rng.random() for _ in range(n)]
        u = rng.randrange(n)
        sub = rng.sample(range(n), s)
        t = min(sub, key=lambda i: (key[i], tb[i]))
        order = sorted(range(n), key=lambda i: (key[i], tb[i]))

        def trust(first):
            fs = set(first)
            return rule.draw_regret(y, best, list(first) + [i for i in order if i not in fs][:8 - len(first)])

        if y[t] <= y[u]:
            r = trust([t])
            for m in names:
                tot[m] += r
            continue
        L = n - s + 7 * (R - 1)
        mapped = [i for i in sub if i != t]
        rng.shuffle(mapped)
        sset = set(sub)
        fresh = [i for i in range(n) if i not in sset]
        rng.shuffle(fresh)
        chosen, left = [t], L
        for i in mapped:
            if left + EPS < R - 1:
                break
            chosen.append(i)
            left -= R - 1
        for i in fresh:
            if left + EPS < R:
                break
            chosen.append(i)
            left -= R
        r_fall = rule.draw_regret(y, best, chosen)
        tot["P"] += r_fall
        fell["P"] += 1
        for k in KS:
            c = mapped[:k]
            if all(y[i] < y[t] for i in c):
                tot[f"Q{k}"] += r_fall
                fell[f"Q{k}"] += 1
            else:
                tot[f"Q{k}"] += trust([t] + c)
        for f in FS:
            if y[u] < (1 - f) * y[t]:
                tot[f"M{f}"] += r_fall
                fell[f"M{f}"] += 1
            else:
                tot[f"M{f}"] += trust([t])
    return {m: 100 * tot[m] / DRAWS for m in names}, {m: fell[m] / DRAWS for m in names}


def cells():
    rows = st.cells()
    raw = {}
    for t in sorted({c["table"] for c in rows}):
        raw.update(rule.load_table(EXP / t / "results.jsonl", t))
    for c in rows:
        rs = raw[(c["clock"], c["design"], c["table"])]
        c["q"], c["fell"] = confirm_regret(rs, S, f"m129{c['table']}{c['clock']}{c['design']}{S}")
    return rows


def ruleof(m):
    return lambda c: c["q"][m] if lad(c) else c["rand"]


swp, swq = ruleof("P"), ruleof("Q1")
RULES = (("SWC", swc), ("SWG(32)", swg), ("SWP(32)", swp), ("SWQ(32,1)", swq), ("SWQ(32,2)", ruleof("Q2")),
         ("SWM(32,0.01)", ruleof("M0.01")), ("random", rand), ("oracle switch", oracle))


def means(rows):
    return ", ".join(f"{n} {mean(rows, f):.2f}" for n, f in RULES)


def sign(rows, f, g):
    b = sum(f(c) < g(c) - 0.01 for c in rows)
    w = sum(f(c) > g(c) + 0.01 for c in rows)
    return b, w, len(rows) - b - w


def main(dst):
    rows = cells()
    ladder = [c for c in rows if lad(c)]
    bad = [c for c in ladder if swc(c) > c["rand"] + 1]
    good = [c for c in ladder if swc(c) <= 0.5]
    fs = lambda cs, m: statistics.mean(c["fell"][m] for c in cs) if cs else float("nan")
    out = ["# Milestone 131: a confirmation probe SWQ(32, k) and a margin SWM(32, f) for the pilot-probe guard, priced by replay on "
           "milestones 119 to 125 (no flow run)", "",
           f"theta = {score.THETA}, alpha = {ALPHA}; {DRAWS} draws per cell, paired with milestone 129's SWP(32) draws; design "
           f"bootstrap {pool.BOOT} resamples, seed {SEED}.",
           f"{len(rows)} cells on {len({(c['table'], c['design']) for c in rows})} designs; {len(ladder)} on the ladder branch. All are "
           "seen (see the docstring); the rules' parameters were fixed before this table existed.", "",
           "## Per cell, ladder branch (distrust = share of draws that fall back)", "",
           "table | clock | design | k | random % | SWC % | SWP(32) % | SWQ(32,1) % | SWQ(32,2) % | SWM(32,0.01) % | "
           "distrust SWP | distrust SWQ(32,1)"]
    for c in sorted(ladder, key=lambda c: (swc(c) - c["rand"], c["table"], c["design"], c["clock"])):
        q = c["q"]
        out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['k']} | {c['rand']:.2f} | {swc(c):.2f} | {q['P']:.2f} | "
                   f"{q['Q1']:.2f} | {q['Q2']:.2f} | {q['M0.01']:.2f} | {c['fell']['P']:.2f} | {c['fell']['Q1']:.2f}")
    out += ["", f"## Mean regret % over all {len(rows)} cells", "", means(rows), "",
            f"ladder-branch cells only ({len(ladder)}): {means(ladder)}",
            f"cells where SWC loses to random by > 1 point ({len(bad)}): {means(bad)}",
            f"cells where SWC <= 0.5% ({len(good)}): {means(good)}",
            f"distrust share, SWP(32): {fs(bad, 'P'):.2f} where SWC loses, {fs(good, 'P'):.2f} where SWC <= 0.5%",
            f"distrust share, SWQ(32,1): {fs(bad, 'Q1'):.2f} where SWC loses, {fs(good, 'Q1'):.2f} where SWC <= 0.5%",
            f"confirmation rate given an alarm (descriptive, added after the table): {fs(bad, 'Q1') / fs(bad, 'P'):.2f} where SWC "
            f"loses, {fs(good, 'Q1') / fs(good, 'P'):.2f} where SWC <= 0.5%", ""]
    out += sp.compare_lines(rows, ((swq, swp, "SWQ(32,1)", "SWP(32)"), (swq, swc, "SWQ(32,1)", "SWC"),
                                   (swq, rand, "SWQ(32,1)", "random"), (swq, swg, "SWQ(32,1)", "SWG(32)")), SEED)
    out += ["", "## Grid (descriptive; SWQ(32, 1) was fixed before the table)", "",
            "rule | mean %, all cells | ladder branch | where SWC loses | where SWC <= 0.5% | distrust where SWC loses / <= 0.5% | "
            "better / worse / tied against SWP(32)"]
    for m, name in [(f"Q{k}", f"SWQ(32,{k})") for k in KS] + [(f"M{f}", f"SWM(32,{f})") for f in FS]:
        f_ = ruleof(m)
        b, w, t = sign(ladder, f_, swp)
        out.append(f"{name} | {mean(rows, f_):.2f} | {mean(ladder, f_):.2f} | {mean(bad, f_):.2f} | {mean(good, f_):.2f} | "
                   f"{fs(bad, m):.2f} / {fs(good, m):.2f} | {b} / {w} / {t}")
    lo, hi = pool.boot_ci(rows, lambda c: swq(c) - swp(c), seed=SEED)
    a, p_, g = mean(rows, swq), mean(rows, swp), mean(rows, swg)
    gap = mean(good, swq) - mean(good, swc)
    b, w, t = sign(rows, swq, swp)
    out += ["", "## Predictions", "",
            f"(1) SWQ(32,1) below SWP(32): {a < p_} ({a:.2f}% against {p_:.2f}%)",
            f"(2) SWQ(32,1) above SWG(32): {a > g} ({a:.2f}% against {g:.2f}%)",
            f"(3) SWQ(32,1) distrust below 0.06 where SWC <= 0.5% and above 0.2 where SWC loses: "
            f"{fs(good, 'Q1') < 0.06 and fs(bad, 'Q1') > 0.2} ({fs(good, 'Q1'):.3f} and {fs(bad, 'Q1'):.3f})",
            f"(4) where SWC <= 0.5%, SWQ(32,1) gives up less than 0.6 points: {gap < 0.6} ({gap:.2f} points; SWP(32) "
            f"{mean(good, swp) - mean(good, swc):.2f})",
            f"(5) where SWC loses by > 1 point, SWQ(32,1) above SWP(32) and below SWC: "
            f"{mean(bad, swp) < mean(bad, swq) < mean(bad, swc)} ({mean(bad, swq):.2f}% against {mean(bad, swp):.2f}% and "
            f"{mean(bad, swc):.2f}%)",
            f"(6) SWQ(32,1) better than SWP(32) on more cells than worse: {b > w} (better {b}, worse {w}, tied {t})",
            "",
            f"design-bootstrap 95% interval of mean (SWQ(32,1) - SWP(32)): {lo:+.2f} to {hi:+.2f} points"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
