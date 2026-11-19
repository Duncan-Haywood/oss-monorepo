"""Milestone 152: is csum2's area-only miss at ff rare? SWC(0) against SWC(1.25) on fresh short add chains (flow run in run.py).

Usage: python3 analyse.py [out.txt]

Question: milestone 151 found ranking the ff ladder by mapped area alone (SWC(0), the clip's alpha -> 0 limit) better than the
paper's SWC(1.25) on 76 of 77 ff designs and catastrophically worse on one, csum2, a short add chain with a fast mapped path.
If misses like csum2's are common on short add chains, SWC(1.25) is the right ff rule; if they are rare, area-only's ff gain is
real and the paper's corner section should say so.

Rule and scoring (unchanged from milestone 151): SWC(alpha) routes the best 8 mapped points by r2c(alpha) = mapped area x
max(period, alpha x mapped delay) on the ladder branch (routed/r2 > theta = 3), else equal-cost random routing. Per-design
regrets come from milestone 141's cell builder (clip_score/score.py's build()) with its alpha grid widened as milestone 151's
analyse.py widens it; tag "m152ff". Regret is the routed-best score's shortfall, in percent, as everywhere in the programme.
d(alpha) = SWC(alpha) - SWC(1.25), points, per design.
Interval: design bootstrap of the mean d (2,000 resamples, seed 152). Sign test: two-sided exact binomial on non-tied designs.

Predictions, written here and committed (with run.py) before any point, baselines included, ran:
 (1) PRIMARY: on the fresh designs, mean d(0) > 0, i.e. area-only has higher mean regret than SWC(1.25). Prior 45%.
 (2) at least one fresh design is a csum2-like miss: SWC(0) regret >= 20% while SWC(1.25) regret <= 5%. Prior 50%.
 (3) SWC(0) is better than SWC(1.25) on more fresh designs than it is worse (milestone 151: 12 better, 4 worse). Prior 55%.
 (4) SWC(1.25) has lower mean regret than equal-cost random routing on the fresh designs. Prior 75%.
 (5) pooled with milestone 151's 77 ff designs, the in-sample best alpha in {0, 0.5, 0.8, 1, 1.25} is still below 1. Prior 55%.
 (6) leave-one-milestone-out over the five ff folds (144 to 147 and 152), the chosen alpha's pooled mean regret is higher than
     SWC(1.25)'s (milestone 151's primary, re-asked with a fifth fold). Prior 60%.
 (7) on the csum designs (csum4, csum7, csum9), d(0) > 0 on at least two of three. Prior 35%.
Reported, not predicted: the per-design table for every alpha, routed/r2 ratios, the csum2 comparison, and per-family means.
"""
import importlib.util
import json
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 152
BOOT = 2000


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ac = _sibling(EXP / "alpha_corner" / "analyse.py", "verified_dse_m152_ac")
run = _sibling(HERE / "run.py", "verified_dse_m152_run")
GRID, INCUMBENT, THETA = ac.GRID, ac.INCUMBENT, ac.THETA
TABLE = HERE / "results.jsonl"
CSUM = ("csum4", "csum7", "csum9")


def rows():
    return [json.loads(l) for l in TABLE.read_text().splitlines()] if TABLE.exists() else []


def fresh_units():
    """[{corner, fold, design, cell, rows}] for this milestone's complete designs (alpha grid widened by ac.units())."""
    ac.units()  # widens every reachable ALPHAS, including the cell builder used below
    meta = json.loads(run.META.read_text())
    rs = rows()
    done = run.complete(rs, meta["order"])
    keep = [r for r in rs if r["design"] in set(done)]
    if not done:
        return [], meta
    cc = ac.m148.m141.cells(keep, "addshort_ff", "m152ff")
    out = [{"corner": "ff", "fold": "m152", "design": f"m152:{x}", "name": x, "cell": cc[x],
            "rows": [r for r in keep if r["design"] == x and r["status"] == "ok"]} for x in done]
    for u in out:
        missing = [a for a in GRID if a not in u["cell"]["clip"]]
        assert not missing, (u["design"], missing)
    return out, meta


def swc(u, a):
    return ac.swc(u["cell"], a)


def boot(v, seed=SEED, n=BOOT):
    rng = random.Random(seed)
    ms = sorted(statistics.mean(rng.choice(v) for _ in v) for _ in range(n))
    return ms[int(0.025 * n)], ms[int(0.975 * n) - 1]


def sign_p(b, w):
    n, k = b + w, min(b, w)
    if n == 0:
        return 1.0
    from math import comb
    return min(1.0, 2 * sum(comb(n, i) for i in range(k + 1)) / 2 ** n)


def lomo(us, folds):
    """Leave-one-fold-out alpha choice over GRID (ties to the larger alpha); returns {fold: alpha} and the pooled mean."""
    pick, tot = {}, []
    for f in folds:
        rest = [u for u in us if u["fold"] != f]
        best = min(GRID, key=lambda a: (round(ac.mean(rest, a), 9), -a))
        pick[f] = best
        tot += [ac.swc(u["cell"], best) for u in us if u["fold"] == f]
    return pick, statistics.mean(tot)


def main(dst):
    fu, meta = fresh_units()
    out = ["# Milestone 152: SWC(0) (area-only) against SWC(1.25) on fresh short add chains at ff_n40C_1v95 (flow run)", "",
           f"theta = {THETA}; grid {', '.join(f'{a:g}' for a in GRID)}; bootstrap {BOOT} resamples, seed {SEED}",
           f"tools: {meta['tools']}", ""]
    out.append("candidate | baseline no-wire period ns | kept (FAST <= 15.0) | clock")
    for d in run.CANDIDATES:
        p = meta["base_period_ns"][d]
        out.append(f"{d} | {'-' if p is None else f'{p:.3f}'} | {'yes' if d in meta['order'] else 'no'} | {meta['clock'].get(d, '-')}")
    out.append("")
    out.append(f"complete designs (order prefix): {len(fu)} of {len(meta['order'])}")
    if not fu:
        Path(dst).write_text("\n".join(out) + "\n")
        print("\n".join(out))
        return
    out += ["", "## Per design (regret %)", "",
            "design | clock | routed/r2 | branch | random | " + " | ".join(f"SWC({a:g})" for a in GRID) + " | d(0)"]
    d0 = []
    for u in fu:
        c = u["cell"]
        d = swc(u, 0) - swc(u, INCUMBENT)
        d0.append(d)
        out.append(f"{u['name']} | {meta['clock'][u['name']]} | {c['ratio']:.2f} | {'ladder' if c['ratio'] > THETA else 'random'} | "
                   f"{c['rand']:.2f} | " + " | ".join(f"{swc(u, a):.2f}" for a in GRID) + f" | {d:+.2f}")
    n = len(fu)
    better = sum(x < -1e-9 for x in d0)
    worse = sum(x > 1e-9 for x in d0)
    lo, hi = boot(d0)
    m0, m125 = ac.mean(fu, 0), ac.mean(fu, INCUMBENT)
    mr = statistics.mean(u["cell"]["rand"] for u in fu)
    miss = [u["name"] for u in fu if swc(u, 0) >= 20 and swc(u, INCUMBENT) <= 5]
    out += ["", "## Fresh designs", "",
            f"designs {n}, ladder branch {sum(u['cell']['ratio'] > THETA for u in fu)}",
            "alpha | mean regret % | worst % (design)"]
    for a in GRID:
        w = max(fu, key=lambda u: swc(u, a))
        out.append(f"{a:g} | {ac.mean(fu, a):.2f} | {swc(w, a):.2f} ({w['name']})")
    out.append(f"random | {mr:.2f} |")
    out += ["",
            f"(1) PRIMARY mean d(0) = {statistics.mean(d0):+.2f} points (SWC(0) {m0:.2f}% against SWC(1.25) {m125:.2f}%), "
            f"95% interval {lo:+.2f} to {hi:+.2f}: {'held' if statistics.mean(d0) > 0 else 'refuted'}",
            f"(2) csum2-like misses (SWC(0) >= 20%, SWC(1.25) <= 5%): {', '.join(miss) or 'none'}: {'held' if miss else 'refuted'}",
            f"(3) SWC(0) better / worse / tied against SWC(1.25): {better} / {worse} / {n - better - worse} (sign p = "
            f"{sign_p(better, worse):.3f}): {'held' if better > worse else 'refuted'}",
            f"(4) SWC(1.25) {m125:.2f}% against random {mr:.2f}%: {'held' if m125 < mr else 'refuted'}"]
    old = ac.units()
    ff = [u for u in old if u["corner"] == "ff"] + fu
    best = min(GRID, key=lambda a: (round(ac.mean(ff, a), 9), -a))
    out.append(f"(5) pooled ff ({len(ff)} designs): " + ", ".join(f"{a:g} {ac.mean(ff, a):.2f}%" for a in GRID)
               + f"; best {best:g}: {'held' if best < 1 else 'refuted'}")
    pick, lm = lomo(ff, ["m144", "m145", "m146", "m147", "m152"])
    inc = ac.mean(ff, INCUMBENT)
    out.append(f"(6) leave-one-milestone-out picks {', '.join(f'{f} {a:g}' for f, a in pick.items())}; pooled {lm:.2f}% against "
               f"SWC(1.25) {inc:.2f}%: {'held' if lm > inc else 'refuted'}")
    cs = {u["name"]: swc(u, 0) - swc(u, INCUMBENT) for u in fu if u["name"] in CSUM}
    out.append(f"(7) csum d(0): " + (", ".join(f"{k} {v:+.2f}" for k, v in cs.items()) or "none complete")
               + f": {'held' if sum(v > 1e-9 for v in cs.values()) >= 2 else 'refuted'}")
    fam = {}
    for u in fu:
        fam.setdefault(u["name"].rstrip("0123456789r").rstrip("0123456789"), []).append(swc(u, 0) - swc(u, INCUMBENT))
    out += ["", "## Reported, not predicted", "", "family | designs | mean d(0) points"]
    out += [f"{k} | {len(v)} | {statistics.mean(v):+.2f}" for k, v in sorted(fam.items())]
    w76 = [u for u in ff if u["design"] != "m147:csum2"]
    out += ["", f"pooled ff without m147:csum2 ({len(w76)} designs): SWC(0) {ac.mean(w76, 0):.2f}% against SWC(1.25) "
            f"{ac.mean(w76, INCUMBENT):.2f}%"]
    pd = [swc(u, 0) - swc(u, INCUMBENT) for u in ff]
    plo, phi = boot(pd)
    out.append(f"pooled ff mean d(0) {statistics.mean(pd):+.2f} points, 95% interval {plo:+.2f} to {phi:+.2f}; designs with "
               f"d(0) >= 20: {', '.join(u['design'] for u in ff if swc(u, 0) - swc(u, INCUMBENT) >= 20) or 'none'}")
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
