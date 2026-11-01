"""Check that numbers quoted in paper/draft.md appear in the results files they cite.

    python3 paper/check_numbers.py

Each row is (draft snippet, results file, snippet in that file). Exit 1 on any miss.
"""
import sys
from pathlib import Path

P = Path(__file__).resolve().parent
EXP = P.parent / "experiments"
CHECKS = [
    ("1.043", "physics_cycle_sourced_results.txt", "median 1.043"),
    ("| 0.942 | 34.9% |", "idle_sensitivity_results.txt", "0.942 (0.721 to 1.194) |  34.9%"),
    ("| 0.820 | 12.5% |", "idle_sensitivity_results.txt", "0.820 (0.619 to 1.079) |  12.5%"),
    ("| 0.786 | 8.4% |", "idle_sensitivity_results.txt", "0.786 (0.593 to 1.042) |   8.4%"),
    ("| 0.981 | 43.9% |", "idle_models_results.txt", "8 bar, LS standby 0 L/min: 0.981"),
    ("| 1.035 | 61.1% |", "idle_models_results.txt", "8 bar, LS standby 6 L/min: 1.035"),
    ("6.4 to 10.8 bar", "idle_breakeven_results.txt", "q_sb 0 L/min: p_n* = 6.4"),
    ("6.4 to 10.8 bar", "idle_breakeven_results.txt", "q_sb 8 L/min: p_n* = 10.8"),
    ("$1,707.99", "payback_results.txt", "1707.99"),
    ("$342.99", "payback_results.txt", "342.99"),
    ("3.3% (open-centre) and 3.2% (LS)", "regen_bound_results.txt", "OC 3.33%, LS 3.21%"),
    ("10.0% to 11.8%", "regen_uncapped_results.txt", "11.83%"),
    ("10.0% to 11.8%", "regen_bound_results.txt", "10.01%   10.26%"),
    ("19.3 bar (neutral", "ranking_map_results.txt", "break-even dp_ls = 19.3 bar"),
    ("23.9 bar (6.44", "ranking_map_results.txt", "break-even dp_ls = 23.9 bar"),
    ("28.4 bar (11.44", "ranking_map_results.txt", "break-even dp_ls = 28.4 bar"),
    ("28.0 bar (27.5 to 28.4", "pvg_neutral_results.txt", "break-even dp_ls = 28.0 bar"),
    ("27.5 to 28.4", "pvg_neutral_results.txt", "break-even dp_ls = 27.5 bar"),
    ("0.759 at 14 bar and 0.949 at 25 bar", "pvg_neutral_results.txt", "dp_ls 14: LS/OC median 0.759"),
    ("0.759 at 14 bar and 0.949 at 25 bar", "pvg_neutral_results.txt", "dp_ls 25: LS/OC median 0.949"),
    ("0.8% and 33.6%", "pvg_neutral_results.txt", "LS worse in 33.6%"),
    ("0.92 bar of margin", "ranking_map_results.txt", "0.92 bar per bar"),
    ("5.8% at k = 1", "flow_share_shape_results.txt", "k 1.0: penalty % median 5.80, p95 21.62"),
    ("95th percentile of 21.6%", "flow_share_shape_results.txt", "k 1.5: penalty % median 0.00, p95 21.62"),
    ("0.07% at k = 5", "flow_share_shape_results.txt", "k 5.0: penalty % median 0.00, p95 0.07"),
    ("21.6% for every k up to 2", "flow_share_shape_results.txt", "p_n 1.44 k 2.0: penalty % median 21.62"),
    ("0.00% (`flow_share_ls", "flow_share_ls_results.txt", "LS own penalty median 0.00%"),
    ("35.8 bar at k = 1", "time_penalised_results.txt", "k 1.0: median time penalty 5.76%; break-even dp_ls 35.8"),
    ("31.1 at k = 1.5", "time_penalised_results.txt", "break-even dp_ls 31.1"),
    ("29.4 at k = 2", "time_penalised_results.txt", "break-even dp_ls 29.4"),
    ("28.3 at k = 3", "time_penalised_results.txt", "break-even dp_ls 28.3"),
    ("29.5 at k = 10", "time_penalised_results.txt", "k 10.0: median time penalty 0.00%; break-even dp_ls 29.5"),
    ("6.25% at 1.0 times rated", "time_penalised_rated_results.txt", "median time penalty 6.25%; break-even dp_ls 36.1"),
    ("2.64% at 1.2 times", "time_penalised_rated_results.txt", "median time penalty 2.64%; break-even dp_ls 34.0"),
    ("16.81% at 0.8 times", "time_penalised_rated_results.txt", "median time penalty 16.81%; break-even dp_ls 38.9"),
    ("36.1 bar (34.0 to 38.9", "time_penalised_rated_results.txt", "break-even dp_ls 36.1"),
    ("17.51% at 0.8 times", "pump_size_results.txt", "pump x0.8 (36.0 L/min): OC gross median 22.27%; LS own median 3.80%; NET OC over LS median 17.51%"),
    ("0.00% at 1.2 times", "pump_size_results.txt", "pump x1.2 (54.0 L/min): OC gross median 0.00%; LS own median 0.00%; NET OC over LS median 0.00% p95 21.62%"),
    ("10.68% at 1.5 times", "pump_size_results.txt", "p95 10.68%"),
    ("1.14 times the rated flow at 10 bar", "pvg_flow_rating_results.txt", "median Q10/rated 1.14"),
    ("about 7.3 bar (spools A to E)", "pvg_flow_rating_results.txt", "spools A to E only: 7.3"),
    ("exponent between the two margins is 0.53", "pvg_flow_rating_results.txt", "median exponent 0.53"),
    ("from 0.38 to 0.96", "pvg_flow_rating_results.txt", "range 0.38 to 0.96"),
    ("LS/OC is 0.663 against 0.757", "time_penalised_rated_results.txt", "LS/OC at 14 bar 0.663"),
]


def main():
    draft, bad = (P / "draft.md").read_text(), 0
    for dsnip, fname, fsnip in CHECKS:
        ok_d = dsnip in draft
        ok_f = fsnip in " ".join((EXP / fname).read_text().split()) or fsnip in (EXP / fname).read_text()
        if not (ok_d and ok_f):
            bad += 1
            print("MISS", dsnip, "| in draft:", ok_d, "|", fname, ":", fsnip, "| in file:", ok_f)
    print("checked", len(CHECKS), "claims;", bad, "missing")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
