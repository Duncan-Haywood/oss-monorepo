"""Milestone 117: what the out-of-sample evidence for the cost-ratio switch adds up to, pooled over milestones 112 to 116 and
split by what each rule saw when its parameters were fixed. No flow run and no new rule: every per-cell regret is
pilot_clip/guard.py's (which imports clip_score/score.py and switch_guard/rule.py unchanged with each table's seeds), so each
cell equals the number already published in that milestone's results.txt.

Usage: python3 pool.py [out.txt]

Rules (all route 8 points on the ladder branch and spend the same wall-clock):
  SW   the switch of milestone 111: time one routed point; if routed/r2 > 3 rank by r2 (mapped area x mapped delay) and route the
       best 8 ("skip-r1"), else route the same wall-clock's worth of random points. theta = 3 fixed in milestone 111 on the 52
       held-out cells of milestone 110.
  SWC  the same switch ranking by milestone 115's clipped score r2c(1.25) = mapped area x max(period, 1.25 x mapped delay).
       alpha = 1.25 chosen in milestone 115 on the held-out cells, after an exploration that also read the dear pools of
       milestones 112 and 113 and the fresh pool of milestone 108.
  random  equal-cost random routing; ladder = skip-r1 everywhere; clipped ladder = clipped skip-r1 everywhere.

Test sets, fixed by the dates above, not by the numbers:
  SW   is tested on every cell run after milestone 111: milestone 112 (12 cells, fresh sequences on designs that informed theta),
       113 (16 cells, 8 designs no table had run), 115 (14 cells, 7 blind designs), 116 (10 cells, 5 blind designs): 52 cells.
  SWC  is tested only on the cells of designs run after alpha was fixed: milestones 115 and 116, 24 cells on 12 designs.
Reported per test set: mean regret of each rule, cells better / worse / tied against random and against SW (exact two-sided sign
test over the untied cells), a design bootstrap 95% interval (both clocks of a design resampled together, 2,000 resamples, seed
117) of the mean difference, the worst cell, and the share of cells at 0.00% regret. Then the same by design family on SWC's test
set, and the oracle switch (the per-cell better of the clipped ladder and random) as the headroom a perfect switch would have.

Nothing here is a prediction: the per-cell numbers were all published before this file existed. The point is the paper's
headline, which until now (PAPER.md's abstract and Section 6) predated the switch.
"""
import importlib.util
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
BOOT = 2000
SEED = 117


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sign_p(better, worse):
    """Exact two-sided sign test over the untied cells."""
    n = better + worse
    if n == 0:
        return 1.0
    k = min(better, worse)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)


def boot_ci(rows, f, seed=SEED, boot=BOOT):
    designs = sorted({(c["table"], c["design"]) for c in rows})
    by = {d: [c for c in rows if (c["table"], c["design"]) == d] for d in designs}
    rng = random.Random(seed)
    ms = sorted(statistics.mean(f(c) for d in rng.choices(designs, k=len(designs)) for c in by[d]) for _ in range(boot))
    return ms[int(0.025 * boot)], ms[int(0.975 * boot) - 1]


def compare(rows, f, g, eps=1e-9):
    better = sum(f(c) < g(c) - eps for c in rows)
    worse = sum(f(c) > g(c) + eps for c in rows)
    return better, worse, len(rows) - better - worse


def policies(guard):
    a = guard.ALPHA
    return {
        "SW": guard.sw,
        "SWC": guard.swc,
        "random": lambda c: c["rand"],
        "ladder": lambda c: c["skip"],
        "clipped ladder": lambda c: c["clip"][a],
        "oracle switch": lambda c: min(c["clip"][a], c["rand"]),
    }


def block(label, rows, rule, pol, against):
    f = pol[rule]
    out = [f"## {label}: {len(rows)} cells on {len({(c['table'], c['design']) for c in rows})} designs", "",
           "mean regret %: " + ", ".join(f"{k} {statistics.mean(v(c) for c in rows):.2f}" for k, v in pol.items())]
    for other in against:
        g = pol[other]
        b, w, t = compare(rows, f, g)
        lo, hi = boot_ci(rows, lambda c: f(c) - g(c))
        out.append(f"{rule} vs {other}: better {b}, worse {w}, tied {t}; sign p = {sign_p(b, w):.3f}; design bootstrap 95% interval "
                   f"of mean ({rule} - {other}) {lo:+.2f} to {hi:+.2f} points")
    worst = max(rows, key=f)
    out.append(f"{rule} worst cell: {worst['table']} {worst['design']} {worst['clock']} {f(worst):.2f}% (random {worst['rand']:.2f}%); "
               f"cells at 0.00%: {sum(f(c) < 0.005 for c in rows)} of {len(rows)} ({sum(c['rand'] < 0.005 for c in rows)} for random)")
    return out


def main(dst):
    guard = _sibling(EXP / "pilot_clip" / "guard.py", "verified_dse_pilot_clip_guard")
    score = guard.score
    held, dear, pool, m115, m116 = guard.tables()
    m112 = [c for c in dear if c["table"] == "fresh_dear"]
    m113 = [c for c in dear if c["table"] == "fresh_designs"]
    pol = policies(guard)
    out = ["# Milestone 117: the switch's out-of-sample evidence pooled by test status (no flow run; every cell as published in "
           "milestones 112 to 116)", "",
           f"theta = {score.THETA}, alpha = {guard.ALPHA}; {score.rule.DRAWS} draws per cell; design bootstrap {BOOT} resamples, "
           f"seed {SEED}.", ""]
    out += block("SW's test set (milestones 112, 113, 115, 116; theta fixed in 111)", m112 + m113 + m115 + m116, "SW", pol,
                 ["random", "ladder"])
    out += [""] + block("SW on designs no table had run when theta was fixed (milestones 113, 115, 116)", m113 + m115 + m116, "SW",
                        pol, ["random", "ladder"])
    out += [""] + block("SWC's test set (milestones 115, 116; alpha fixed in 115 before either blind run)", m115 + m116, "SWC", pol,
                        ["random", "SW", "clipped ladder"])
    blind = m115 + m116
    out += ["", "## SWC's test set by family (descriptive)", "",
            "family | cells | ladder branch | SW % | SWC % | random % | SWC better / worse than random"]
    for fam in sorted({score.family(c["design"]) for c in blind}):
        rs = [c for c in blind if score.family(c["design"]) == fam]
        b, w, _ = compare(rs, pol["SWC"], pol["random"])
        out.append(f"{fam} | {len(rs)} | {sum(c['ratio'] > score.THETA for c in rs)} | {statistics.mean(map(pol['SW'], rs)):.2f} | "
                   f"{statistics.mean(map(pol['SWC'], rs)):.2f} | {statistics.mean(c['rand'] for c in rs):.2f} | {b} / {w}")
    nb = [c for c in blind if score.family(c["design"]) != "barrel"]
    b, w, _ = compare(nb, pol["SWC"], pol["random"])
    lo, hi = boot_ci(nb, lambda c: pol["SWC"](c) - c["rand"])
    out += ["", f"without the barrel family ({len(nb)} cells): SWC {statistics.mean(map(pol['SWC'], nb)):.2f}%, random "
            f"{statistics.mean(c['rand'] for c in nb):.2f}%; better {b}, worse {w}, sign p = {sign_p(b, w):.3f}; design bootstrap "
            f"95% interval of the difference {lo:+.2f} to {hi:+.2f} points (post hoc: the family split is chosen after milestone 116)"]
    allrows = held + dear + pool + m115 + m116
    out += ["", "## Every cell of milestones 110 to 116 (seen and unseen; not a test)", "",
            "mean regret %: " + ", ".join(f"{k} {statistics.mean(v(c) for c in allrows):.2f}" for k, v in pol.items()),
            f"cells: {len(allrows)}; on the ladder branch (routed/r2 > {score.THETA}): {sum(c['ratio'] > score.THETA for c in allrows)}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
