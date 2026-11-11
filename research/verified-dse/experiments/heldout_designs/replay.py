"""Milestone 110: do milestone 106's "skip r1, keep 8" schedule and milestone 109's equal-cost comparison hold on designs that never
informed the schedule choice? (no flow run; replays cached tables)

Usage: python3 replay.py [out.txt]

Milestones 105 to 109 chose and priced the keep schedules on the ten small designs only (rung_bias, then fresh_pool). Six cached
tables in this project hold 26 other designs, each at two clocks with a 50-point pool, run under the same four-rung protocol
(tt corner, 40% utilisation) for other questions: hostile, large, nonarith, unseen, fanout_rich and unfaithful (two files). None of
them was used to pick or price a keep schedule, so they are a held-out design set for that question (not unseen data in general:
earlier milestones measured rung bias on them). Tool versions differ by table (LOG.md entries of milestones 9, 15, 26, 28, 31, 62
and 68); each comparison here is within one table's cell, so the version is held fixed inside it.

Schedules, regret and the cost model are milestones 108 and 109's, unchanged (fresh_pool/analyse.py, fresh_pool/price.py):
skip-r1 (N, 8, 8); 105-style (round(0.7N), 16, 8); random routing of 8; random routing at each schedule's wall-clock.

Predictions, written in this file before the script was first run:
 (1) mean regret over the 52 cells: skip-r1 at most the 105-style schedule plus 0.3 points;
 (2) both schedules beat random routing of 8 points in mean regret;
 (3) at equal wall-clock, random routing has lower mean regret than skip-r1 (milestone 109's direction on the small designs was
     the opposite, 1.04% against 1.26%, but not significant; held-out designs include the hostile and unfaithful families where the
     rungs mislead, so I expect the ladder to lose here);
 (4) skip-r1's cost as a share of routing the whole pool is lower in cells where a routed point costs more than 3x an r2 score
     than in cells where it costs less (median share, both groups non-empty);
 (5) in the cells where a routed point costs more than 3x an r2 score, skip-r1 beats equal-cost random routing in more cells than
     it loses.
A design-level bootstrap (both clocks of a design resampled together, 2,000 resamples) gives a 95% interval for the mean regret
difference skip-r1 minus equal-cost random.
"""
import json
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
sys.path.insert(0, str(EXP / "fresh_pool"))
from verified_dse import flow  # noqa: E402
from analyse import CLOCKS, regret, rand_regret  # noqa: E402
from price import costs, equal_k, sign_p, stage_times  # noqa: E402

TABLES = ["hostile/results.jsonl", "large/results.jsonl", "nonarith/results.jsonl", "unseen/results.jsonl",
          "fanout_rich/results.jsonl", "unfaithful/results.jsonl", "unfaithful/results_w36_40.jsonl"]
DRAWS, BOOT, RATIO = 200, 2000, 3.0


def load():
    raw = defaultdict(list)
    for t in TABLES:
        for line in (EXP / t).read_text().splitlines():
            r = json.loads(line)
            if r["status"] == "ok":
                raw[(r["tag"], r["design"], t.split("/")[0])].append(r)
    return raw


def cell(rs, seed):
    sc = [flow.scores(r) for r in rs]
    n = len(sc)
    t = stage_times(rs)
    cs, c5, pp = costs(t, n)
    ks, k5 = equal_k(cs, pp, n), equal_k(c5, pp, n)
    rng = random.Random(seed)
    return {"n": n, "ratio": pp / t["r2"], "share": cs / (n * pp), "share105": c5 / (n * pp), "ks": ks, "k5": k5,
            "skip": regret(sc, (n, 8, 8), rng, DRAWS), "m105": regret(sc, (round(0.7 * n), 16, 8), rng, DRAWS),
            "r8": rand_regret(sc, 8, rng, DRAWS), "rs": rand_regret(sc, ks, rng, DRAWS), "r105": rand_regret(sc, k5, rng, DRAWS)}


def boot(rows, rng):
    by = defaultdict(list)
    for r in rows:
        by[r["design"]].append(r["skip"] - r["rs"])
    ds = sorted(by)
    means = []
    for _ in range(BOOT):
        v = [x for d in (rng.choice(ds) for _ in ds) for x in by[d]]
        means.append(statistics.mean(v))
    means.sort()
    return means[int(0.025 * BOOT)], means[int(0.975 * BOOT) - 1]


def wl(rows, a, b):
    return sum(r[a] < r[b] for r in rows), sum(r[a] > r[b] for r in rows)


def main(dst):
    raw = load()
    rows = []
    for (tg, d, src) in sorted(raw, key=lambda k: (k[2], k[1], CLOCKS.index(k[0]))):
        c = cell(raw[(tg, d, src)], f"heldout{tg}{d}")
        c.update(clock=tg, design=d, table=src)
        rows.append(c)
    out = ["# Milestone 110: keep schedules on 26 held-out designs (cached tables, no flow run)", "",
           "table | clock | design | n | routed/r2 cost | skip share | skip-r1 % | 105-style % | random 8 % | k(skip) | random k(skip) %"]
    for r in rows:
        out.append(f"{r['table']} | {r['clock']} | {r['design']} | {r['n']} | {r['ratio']:.2f} | {r['share']:.2f} | {r['skip']:.2f} | "
                   f"{r['m105']:.2f} | {r['r8']:.2f} | {r['ks']} | {r['rs']:.2f}")
    N = len(rows)
    M = {k: statistics.mean(r[k] for r in rows) for k in ("skip", "m105", "r8", "rs", "r105")}
    hi = [r for r in rows if r["ratio"] > RATIO]
    lo = [r for r in rows if r["ratio"] <= RATIO]
    w, l = wl(rows, "skip", "rs")
    w5, l5 = wl(rows, "m105", "r105")
    wh, lh = wl(hi, "skip", "rs")
    wb, lb = wl(rows, "skip", "m105")
    ci = boot(rows, random.Random(110))
    med = lambda v: statistics.median(v) if v else float("nan")
    sh_hi, sh_lo = med([r["share"] for r in hi]), med([r["share"] for r in lo])
    out += ["", f"cells: {N} ({len({r['design'] for r in rows})} designs, {len(TABLES)} tables)",
            f"mean regret: skip-r1 {M['skip']:.2f}%, 105-style {M['m105']:.2f}%, random 8 {M['r8']:.2f}%",
            f"skip-r1 vs 105-style: better in {wb}, worse in {lb}, tied in {N - wb - lb} (sign test p = {sign_p(wb, lb):.3f})",
            f"equal cost: skip-r1 {M['skip']:.2f}% vs random {M['rs']:.2f}%: better in {w}, worse in {l}, tied in {N - w - l} "
            f"(sign test p = {sign_p(w, l):.3f}); design bootstrap 95% CI of the mean difference {ci[0]:.2f} to {ci[1]:.2f} points",
            f"equal cost: 105-style {M['m105']:.2f}% vs random {M['r105']:.2f}%: better in {w5}, worse in {l5}, tied in {N - w5 - l5} "
            f"(sign test p = {sign_p(w5, l5):.3f})",
            f"median skip-r1 share of all-routed cost: {med([r['share'] for r in rows]):.2f} overall; "
            f"{sh_hi:.2f} in {len(hi)} cells with routed/r2 > {RATIO:g}, {sh_lo:.2f} in {len(lo)} cells at or below",
            f"cells with routed/r2 > {RATIO:g}: skip-r1 better than equal-cost random in {wh}, worse in {lh}, tied in {len(hi) - wh - lh}",
            f"post hoc (added after the first run): mean regret in cells with routed/r2 > {RATIO:g}: skip-r1 "
            f"{statistics.mean(r['skip'] for r in hi):.2f}%, equal-cost random {statistics.mean(r['rs'] for r in hi):.2f}%; at or below: "
            f"{statistics.mean(r['skip'] for r in lo):.2f}% and {statistics.mean(r['rs'] for r in lo):.2f}%",
            f"post hoc: cells with regret above 5%: skip-r1 {sum(r['skip'] > 5 for r in rows)}, equal-cost random "
            f"{sum(r['rs'] > 5 for r in rows)}; worst cell skip-r1 {max(r['skip'] for r in rows):.2f}%, random {max(r['rs'] for r in rows):.2f}%",
            f"post hoc: without bcastmix192 (two outcome classes, milestone 28): skip-r1 "
            f"{statistics.mean(r['skip'] for r in rows if r['design'] != 'bcastmix192'):.2f}%, equal-cost random "
            f"{statistics.mean(r['rs'] for r in rows if r['design'] != 'bcastmix192'):.2f}%",
            "",
            f"(1) skip-r1 <= 105-style + 0.3: {M['skip'] <= M['m105'] + 0.3}",
            f"(2) both beat random 8: {M['skip'] < M['r8'] and M['m105'] < M['r8']}",
            f"(3) equal-cost random beats skip-r1 in mean regret: {M['rs'] < M['skip']}",
            f"(4) skip-r1 share lower where routed/r2 > {RATIO:g}: {bool(hi and lo) and sh_hi < sh_lo}",
            f"(5) skip-r1 beats equal-cost random in more high-ratio cells than it loses: {wh > lh}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
