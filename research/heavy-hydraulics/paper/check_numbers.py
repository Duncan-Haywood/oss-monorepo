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
    ("0.92 bar of margin", "ranking_map_results.txt", "0.92 bar per bar"),
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
