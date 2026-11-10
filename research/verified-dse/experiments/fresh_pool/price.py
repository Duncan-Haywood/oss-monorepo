"""Milestone 109: what do milestone 108's two keep schedules cost on the fresh pool, and do they beat random routing at equal wall-clock?

Usage: python3 price.py [results.jsonl] [out.txt]   (no flow run; reads the milestone 108 table)

Milestone 108 compared "skip r1, keep 8" (score every point at r2, keep 8 for r3, route 8) with the 105-style schedule (keep 0.7N at r1, 16 at r2,
8 routed) at equal *routed count* (8) and against random routing of 8 points. That is not a fair price: skip-r1 scores about 103 points at r2
where the 105-style one scores 72 and pays for r1 instead. Cost model as milestone 104 (`theory/pilot_cert_cost.py`), per-cell mean measured
stage times: r1 = t1; r2 = t2_yosys + t_pnr_to_synth_netlist; r3 = t_pnr_to_detail_place - t_pnr_to_synth_netlist;
r4 = t_pnr_total - t_pnr_to_detail_place. A routed point costs r2 + r3 + r4 (r1 is not needed to route).
Equal-cost random routing: route k = floor(schedule cost / routed point cost) points drawn uniformly (k capped at the pool size).

Predictions, written in this file before the script was run:
 (1) skip-r1 costs more wall-clock than the 105-style schedule in at least 15 of 20 cells (31 extra r2 scores at about 0.8 s outweigh
     about 103 r1 scores at about 0.1 s);
 (2) neither schedule costs under half of routing the whole pool in more than 5 of 20 cells (r2 is most of a routed point's cost);
 (3) at equal wall-clock, random routing has lower mean regret over the 20 cells than skip-r1 (the budget routes about two thirds of the pool);
 (4) at equal wall-clock, random routing has lower mean regret than the 105-style schedule too.
If (3) holds, the multi-fidelity ladder does not pay on these small designs whatever its keeps, which is the milestone-1 cost-ratio caveat
(routed only about 1.5x a mapped score here) made concrete on fresh data.
"""
import json
import math
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
sys.path.insert(0, str(HERE))
from verified_dse import flow  # noqa: E402
from analyse import CLOCKS, regret, rand_regret  # noqa: E402

DRAWS = 200


def stage_times(rs):
    m = lambda f: statistics.mean(f(r) for r in rs)
    s = m(lambda r: r["t_pnr_to_synth_netlist"])
    return {"r1": m(lambda r: r["t1"]),
            "r2": m(lambda r: r["t2_yosys"]) + s,
            "r3": m(lambda r: r["t_pnr_to_detail_place"]) - s,
            "r4": m(lambda r: r["t_pnr_total"] - r["t_pnr_to_detail_place"])}


def costs(t, n):
    """Wall-clock of skip-r1 (n, 8, 8), the 105-style (round(0.7n), 16, 8) schedule, and one routed point."""
    f = round(0.7 * n)
    skip = n * t["r2"] + 8 * t["r3"] + 8 * t["r4"]
    m105 = n * t["r1"] + f * t["r2"] + 16 * t["r3"] + 8 * t["r4"]
    return skip, m105, t["r2"] + t["r3"] + t["r4"]


def equal_k(cost, per_point, n):
    return max(1, min(n, math.floor(cost / per_point)))


def sign_p(w, l):
    """Two-sided exact sign test over cells that are not tied."""
    n, k = w + l, max(w, l)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k, n + 1)) / 2 ** n) if n else 1.0


def load(path):
    raw, by = defaultdict(list), defaultdict(list)
    for line in Path(path).read_text().splitlines():
        r = json.loads(line)
        if r["status"] == "ok":
            raw[(r["tag"], r["design"])].append(r)
            by[(r["tag"], r["design"])].append(flow.scores(r))
    return raw, by


def main(src, dst):
    raw, by = load(src)
    out = ["# Milestone 109: wall-clock price of milestone 108's schedules, and random routing at equal wall-clock (fresh pool, no flow run)", "",
           "clock | design | n | cost skip-r1 s | cost 105-style s | cost all-routed s | k(skip) | k(105) | "
           "regret skip-r1 % | regret 105 % | random k(skip) % | random k(105) %"]
    dearer = half = 0
    ratios, fr_skip, fr_105 = [], [], []
    R = {k: [] for k in ("skip", "m105", "rs", "r105")}
    for tg in CLOCKS:
        for d in flow.DESIGNS:
            sc, rs = by[(tg, d)], raw[(tg, d)]
            n = len(sc)
            t = stage_times(rs)
            cs, c5, pp = costs(t, n)
            ca = n * pp
            ks, k5 = equal_k(cs, pp, n), equal_k(c5, pp, n)
            rng = random.Random(f"price{tg}{d}")
            v = {"skip": regret(sc, (n, 8, 8), rng, DRAWS), "m105": regret(sc, (round(0.7 * n), 16, 8), rng, DRAWS),
                 "rs": rand_regret(sc, ks, rng, DRAWS), "r105": rand_regret(sc, k5, rng, DRAWS)}
            for k in R:
                R[k].append(v[k])
            dearer += cs > c5
            half += cs < ca / 2 or c5 < ca / 2
            ratios.append(cs / c5)
            fr_skip.append(cs / ca)
            fr_105.append(c5 / ca)
            out.append(f"{tg} | {d} | {n} | {cs:.1f} | {c5:.1f} | {ca:.1f} | {ks} | {k5} | "
                       f"{v['skip']:.2f} | {v['m105']:.2f} | {v['rs']:.2f} | {v['r105']:.2f}")
    M = {k: statistics.mean(x) for k, x in R.items()}
    w_s = sum(a < b for a, b in zip(R["skip"], R["rs"]))
    l_s = sum(a > b for a, b in zip(R["skip"], R["rs"]))
    w_5 = sum(a < b for a, b in zip(R["m105"], R["r105"]))
    l_5 = sum(a > b for a, b in zip(R["m105"], R["r105"]))
    out += ["",
            f"cells where skip-r1 costs more than 105-style: {dearer} of 20; median cost ratio skip-r1 / 105-style {statistics.median(ratios):.2f}",
            f"median share of the all-routed cost: skip-r1 {statistics.median(fr_skip):.2f}, 105-style {statistics.median(fr_105):.2f}; "
            f"cells where either costs under half: {half} of 20",
            f"mean regret over 20 cells: skip-r1 {M['skip']:.2f}%, random at its cost {M['rs']:.2f}%; "
            f"105-style {M['m105']:.2f}%, random at its cost {M['r105']:.2f}%",
            f"skip-r1 vs equal-cost random: better in {w_s}, worse in {l_s}, tied in {20 - w_s - l_s} (sign test p = {sign_p(w_s, l_s):.3f})",
            f"105-style vs equal-cost random: better in {w_5}, worse in {l_5}, tied in {20 - w_5 - l_5} (sign test p = {sign_p(w_5, l_5):.3f})",
            "",
            f"(1) skip-r1 dearer in at least 15 of 20: {dearer >= 15}",
            f"(2) under half of all-routed in at most 5 of 20: {half <= 5}",
            f"(3) equal-cost random beats skip-r1 in mean regret: {M['rs'] < M['skip']}",
            f"(4) equal-cost random beats 105-style in mean regret: {M['r105'] < M['m105']}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.jsonl", sys.argv[2] if len(sys.argv) > 2 else HERE / "price_results.txt")
