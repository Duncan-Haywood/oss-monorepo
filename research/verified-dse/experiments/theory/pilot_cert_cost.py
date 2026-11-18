"""Wall-clock cost of the certifiable schedules (milestone 104). Runs no flow.
Writes pilot_cert_cost_results.txt. Usage: python3 pilot_cert_cost.py

Milestone 103 found the three-rung ladder certifies 18 of 20 cells at first keep F = 35 with (M, K) = (16, 8); milestone 100 found the two-rung
ladder (r2, r3) certifies 18 of 20 at its eta = 3 keeps (16, 5). Which is cheaper? Cost model (as milestones 2 and 3): per cell, mean measured
stage times over its usable points: r1 = t1; r2 = t2_yosys + t_pnr_to_synth_netlist; r3 = t_pnr_to_detail_place - t_pnr_to_synth_netlist;
r4 = t_pnr_total - t_pnr_to_detail_place. Schedule cost = sum over rungs of (points reaching it) x stage time, plus 0 pilot cost.
Predictions written first: (1) the F = 35 three-rung schedule costs more than the two-rung ladder in at least 15 of 20 cells;
(2) both cost under half of routing the whole pool (exhaustive r4 cost, all four stages); (3) the same cells are certified by the two schedules
(set equality of cells with c >= 1)."""
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402
from pilot_rho import ratio  # noqa: E402


def stage_times(rs):
    m = lambda f: statistics.mean(f(r) for r in rs)
    s = m(lambda r: r["t_pnr_to_synth_netlist"])
    return {"r1": m(lambda r: r["t1"]),
            "r2": m(lambda r: r["t2_yosys"]) + s,
            "r3": m(lambda r: r["t_pnr_to_detail_place"]) - s,
            "r4": m(lambda r: r["t_pnr_total"] - r["t_pnr_to_detail_place"])}


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    raw, by = defaultdict(list), defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            raw[(r["tag"], r["design"])].append(r)
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["cell | n | c(2-rung 16,5) | c(3-rung F=35 16,8) | cost 2-rung s | cost 3-rung s | cost all-routed s"]
    A = B = n_cells = both = 0
    cA, cB, ratios = set(), set(), []
    for tag in ("tight", "relaxed"):
        for d in flow.DESIGNS:
            sc, rs = by[(tag, d)], raw[(tag, d)]
            n = len(sc)
            t = stage_times(rs)
            s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
            a = sum(ratio(s, ("r2", "r3"), [16, 5], i, n) < 1 for i in range(n))
            b = sum(ratio(s, ("r1", "r2", "r3"), [35, 16, 8], i, n) < 1 for i in range(n))
            c2 = n * t["r2"] + min(16, n) * t["r3"] + 5 * t["r4"]
            c3 = n * t["r1"] + 35 * t["r2"] + 16 * t["r3"] + 8 * t["r4"]
            ca = n * (t["r2"] + t["r3"] + t["r4"])
            out.append(f"{tag} {d} | {n} | {a} | {b} | {c2:.1f} | {c3:.1f} | {ca:.1f}")
            n_cells += 1
            A += c3 > c2
            both += c2 < ca / 2 and c3 < ca / 2
            ratios.append(c3 / c2)
            if a: cA.add((tag, d))
            if b: cB.add((tag, d))
    out += [f"cells where 3-rung costs more than 2-rung: {A} of {n_cells}",
            f"cells where both cost under half of all-routed: {both} of {n_cells}",
            f"median cost ratio 3-rung / 2-rung: {statistics.median(ratios):.2f}",
            f"certified cells 2-rung {len(cA)}, 3-rung {len(cB)}, same set: {cA == cB}"]
    (HERE / "pilot_cert_cost_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
