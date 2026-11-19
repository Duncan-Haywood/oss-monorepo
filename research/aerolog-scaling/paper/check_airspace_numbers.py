"""Check that each number quoted in airspace_layers.md appears in the results file it came from.

Run: python3 paper/check_airspace_numbers.py   (stdlib only; exit 1 on any miss)
Each entry is (results file under experiments/hub_airspace, text that must appear in it, the claim in the
paper; the claim's own number must appear in airspace_layers.md). Mirrors check_numbers.py for draft.md.
"""
import pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent.parent
EXP = HERE / "experiments" / "hub_airspace"
PAPER = (HERE / "paper" / "airspace_layers.md").read_text()

# (file, text in the file, text in the paper)
CHECKS = [
    # 11ah band budget
    ("band_budget_results.txt", " 120   7.62   1.71     8    0.1738    1.0025", "0.1738"),
    ("band_budget_results.txt", " 120   7.62   1.71     8    0.1597    1.0211", "0.1597"),
    ("band_budget_results.txt", "1.0025", "1.0025 and 1.0211"),
    ("band_budget_results.txt", "(free count used: median)", "10 and 13.5 bands"),
    ("band_budget_results.txt", "median reduction in best F M=12 0.3062, M=16 0.3669", "31% and 37%"),
    ("band_budget_results.txt", "worst mean F_ins/F_re over k = 2..8 and both M 1.0176", "1.0176"),
    # 11ai level leak
    ("level_leak_results.txt", "cross pairs: median 1.566", "1.566"),
    ("level_leak_results.txt", "cross pairs: median 1.453", "1.453"),
    ("level_leak_results.txt", "main     norm    7.62  1.00    13.0     13..13      5.0   0.2389    0.001        0 / 24         5.175", "5.175"),
    ("level_leak_results.txt", "main     norm    7.62  1.00    13.0     13..13      5.0   0.2340    0.001        0 / 24         4.236", "4.236"),
    ("level_leak_results.txt", "main     norm    7.62  3.00    17.0     17..23      4.0   0.2772    0.081", "0.081"),
    ("level_leak_results.txt", "laplace  lapl    7.62  1.00    13.0", "same median 13 m"),
    ("level_leak_posthoc_results.txt", "main      7.62  0.50     6.0    6..6     10.91", "6 bands at 10.91 m"),
    ("level_leak_posthoc_results.txt", "main      7.62  1.00     5.0    5..6     13.33", "5 at 13.33 m"),
    ("level_leak_posthoc_results.txt", "main      7.62  2.00     4.0    4..5     17.14", "4 at 17.14 m"),
    ("level_leak_posthoc_results.txt", "main      4.57  1.00     7.0    6..8      9.23", "7 at 9.23 m"),
    ("level_leak_posthoc_results.txt", "main      4.57  0.50     9.0    8..9", "8 to 9 bands"),
    # 11aj mixed references
    ("ref_mix_results.txt", "7.62  1.00   0.50  3.0   13.33    5.0    0    0     0.0513    1.0263   1.0081    1.0749", "1.075"),
    ("ref_mix_results.txt", "7.62  1.00   0.50  3.0   13.33    5.0    0    0     0.0790    1.0345   1.0017    1.0881", "1.088"),
    ("ref_mix_posthoc_results.txt", "7.62  1.00   0.50  3.0     1.0320", "3.2% (12 operators)"),
    ("ref_mix_posthoc_results.txt", "7.62  1.00   0.50  3.0     1.0802", "8.0% (16)"),
    ("ref_mix_results.txt", "1.0263", "1.026 and 1.035"),
    # 11ak pressure
    ("pressure_ref_results.txt", "S1_JFK: sd 2.930 m", "2.93 m"),
    ("pressure_ref_results.txt", "S2_JFK_LGA: sd 4.168 m", "4.17 m"),
    ("pressure_stats_results.txt", "01  S1  3.95", "3.95 m in January"),
    ("pressure_stats_results.txt", "08  S1  1.87", "1.87 m in August"),
    ("pressure_stats_results.txt", "T 30 min  JFK  n 3153135  mean  -0.00  sd  1.59", "1.59 m (sd) over a 30-minute"),
    ("pressure_stats_results.txt", "T 60 min  JFK  n 3153042  mean  -0.00  sd  3.05", "3.05 m over 60"),
    ("pressure_ref_results.txt", "S2_JFK_LGA  0.50   13.33    5.0    0    0.0585    1.0385", "1.0385"),
    ("pressure_ref_results.txt", "S2_JFK_LGA  0.50   13.33    5.0    1    0.0934    1.0581", "1.0581"),
    ("pressure_ref_results.txt", "1.0045", "1.0045"),
    # 11al shared drift
    ("drift_share_stats_results.txt", "median mission time per operator: median 3.45 min", "3.45 min"),
    ("drift_share_stats_results.txt", "s0 per operator: median 0.207 m", "0.207 m"),
    ("drift_share_stats_results.txt", "pair pressure sd: median 0.543", "0.543 m"),
    ("drift_share_stats_results.txt", "pair pressure sd: median 0.554", "0.554 m"),
    ("drift_share_stats_results.txt", "space part sd (cross pairs): median 0.561 (max 1.806) m; hub separation median 3.8 km", "0.561 m at the median hub separation of 3.8 km"),
    ("drift_share_stats_results.txt", "pair / indep 0.548", "0.548 (30 min)"),
    ("drift_share_stats_results.txt", "pair / indep 0.523", "0.523 (60 min)"),
    ("drift_share_results.txt", "1.00     T60      2.986    2.169        13.33    5.0    13.33   24/24   1.0000   1.0272   17.14    1.1201", "12.0% (12 operators)"),
    ("drift_share_results.txt", "1.00     T60      2.981    2.177        13.33    5.0    13.33   24/24   1.0001   1.0089   17.14    1.1236", "12.4% (16)"),
    ("drift_share_space_check_results.txt", "a 2.189 m, b 0.0412 m/km", "2.189 m + 0.0412 m/km"),
    # 11am PX4 height keeping
    ("px4_height_stats_results.txt", "per-flight RMS (m): median 0.043 [95% CI 0.035, 0.050]", "0.043 m RMS per flight (95% CI 0.035 to 0.050)"),
    ("px4_height_stats_results.txt", "sigma_fleet = sqrt(mean RMS^2) = 0.044 m", "0.044 m"),
    ("px4_height_stats_results.txt", "1/e autocorrelation time (s): median 1.40", "1.40 s"),
    ("px4_height_stats_results.txt", "454 matching", "454 PX4"),
    ("px4_height_results.txt", "deliv      9.23   7.0     9.23    24/24   1.0000   1.0000   13.33   0/24   1.0515", "5.2% (12 operators)"),
    ("px4_height_results.txt", "deliv      9.23   7.0     9.23    24/24   1.0000   1.0000   13.33   0/24   1.0843", "8.4% (16)"),
    ("px4_height_posthoc_results.txt", "baro - GNSS detrended RMS              median 0.921", "0.921 m RMS"),
    ("px4_height_posthoc_results.txt", "sqrt(mean sq) 1.336", "1.336 m"),
    ("px4_height_bound_results.txt", "deliv     13.33   5.0", "returns to 5 bands at 13.33 m"),
    # 11an RTK
    ("rtk_baro_stats_results.txt", "downloaded 400, errors 0, with RTK fixed solutions 98", "98 had RTK-fixed"),
    ("rtk_baro_stats_results.txt", "usable flights: enroute 7", "7 had 30 s"),
    ("rtk_baro_stats_results.txt", "r_lin    median 0.826", "0.826 m RMS"),
    ("rtk_baro_stats_results.txt", "95% CI 0.602 to 1.377", "0.60 to 1.38"),
    ("rtk_baro_stats_results.txt", "r_lin    median 0.345", "0.345 m in hover"),
    ("rtk_baro_stats_results.txt", "fleet sqrt(mean r^2) 1.058 m", "1.058 m"),
    ("rtk_baro_stats_results.txt", "tau 0.23 s", "0.23 s"),
    ("rtk_baro_stats_results.txt", "median |c*100| >= 0.20 m: 1.440", "1.4 m at 10 m/s"),
    ("rtk_baro_posthoc_results.txt", "s5   median 0.420 (p25 0.354, p75 0.906, max 1.566); sqrt(mean sq) 0.814", "0.420 m"),
    ("rtk_baro_posthoc_results.txt", "sqrt(mean sq) 0.814", "0.814 m"),
    ("rtk_baro_results.txt", "deliv     13.33   5.0    13.33    24/24   1.0000   1.0000   13.33  24/24   1.0000", "costs a median 1.0000"),
    ("rtk_baro_s5_results.txt", "deliv     13.33   5.0    13.33    24/24", "48 of 48 layouts"),
    # 11ao airframe speed offsets
    ("speed_offset_results.txt", "sd of b_i - b_j 3.281", "3.281 m"),
    ("speed_offset_results.txt", "  1        13.33    5.0    15.24     1.0342    1.7254", "1.0342"),
    ("speed_offset_results.txt", "  1        13.33    5.0    13.33     1.0183", "1.0183"),
    ("speed_offset_results.txt", "1.7254", "1.7254"),
    ("speed_offset_results.txt", "1.0277", "1.0277 and 1.0219"),
    ("speed_offset_results.txt", "1     13.33: 80, 17.14: 16", "80 and 87 of 96"),
    ("speed_offset_results.txt", "  2        24.00    3.0    24.00     1.1631", "3 bands at 24.00 m"),
    ("speed_offset_results.txt", "  2        24.00    3.0    24.00     1.1296", "1.1631 and 1.1296"),
    # 11ap --all12 and the rule check
    ("speed_offset_all12_results.txt", "sd of b_i - b_j 5.655", "5.655 m"),
    ("speed_offset_all12_results.txt", "-7.44, -4.70", "-7.44 to +8.86 m"),
    ("speed_offset_all12_results.txt", "  1        17.14    4.0    17.14     1.1526    1.9966", "1.1526"),
    ("speed_offset_all12_results.txt", "1.9966", "1.9966"),
    ("speed_offset_all12_results.txt", "0.5   13.33: 92, 17.14: 4", "(92 of 96)"),
    ("speed_offset_all12_results.txt", "  0.5      13.33    5.0    13.33     1.0021", "1.0021"),
    ("speed_offset_all12_results.txt", "1.2759", "1.2759"),
    ("rule_check_results.txt", "sigma_pair = 1.061 m", "1.061 m"),
    ("rule_check_results.txt", "  1       3.281      3.448     17.96       3    24.00   13.33, 13.33", "5, 4, 3 and 2 bands"),
    ("rule_check_results.txt", "  2       6.561      6.647     27.56       2    40.00   24.00, 24.00", "5, 5, 5 and 3"),
    ("rule_check_results.txt", "  1       5.655      5.754     24.88       2    40.00   17.14, -", "5, 4, 2 and 1 against 5, 5, 4 and 3"),
    ("rule_check_results.txt", "0.0663/0.0488", "0.0663"),
    ("rule_check_results.txt", "0.0663/0.0488", "0.0488"),
]


def main():
    misses = 0
    cache = {}
    for fname, needle, claim in CHECKS:
        text = cache.setdefault(fname, (EXP / fname).read_text())
        ok_file = needle in text
        ok_paper = claim in PAPER
        if not (ok_file and ok_paper):
            misses += 1
            print(f"MISS {fname}: file has {needle!r}: {ok_file}; paper has {claim!r}: {ok_paper}")
    print(f"{len(CHECKS) - misses} of {len(CHECKS)} checks pass")
    return 1 if misses else 0


if __name__ == "__main__":
    sys.exit(main())
