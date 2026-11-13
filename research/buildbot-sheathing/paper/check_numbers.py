"""Check that each number the paper quotes is in the draft and in the results file it came from.

Run: python3 paper/check_numbers.py   (stdlib only; exit 1 on any miss)
Each entry is (results file, text that must appear in it, text that must appear in draft.md).
Whitespace runs are collapsed on both sides, so table alignment and line wrapping do not matter.
"""
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent.parent
E = "experiments/"
M1, M2, M3, M3B, M4, M5, M6, M7, M6B = (E + d + "/results.txt" for d in (
    "m1_gap_placement", "m2_asbuilt_studs", "m3_ledger", "m3b_humanoid",
    "m4_tack_measure", "m5_cycle", "m6_drake", "m7_cost", "m6b_bowed_edge"))
M9 = E + "m9_straighten/results.txt"
M10 = E + "m10_ceiling/results.txt"
M11 = E + "m11_measured/results.txt"
M12 = E + "m12_remedies/results.txt"
M13 = E + "m13_price/results.txt"

CHECKS = [
    # 5.12 what the remedies cost (milestone 13)
    (M13, "three point - ledger 0.4253 1.095 198 | 7.10", "cost a median $7.10 per clean sheet"),
    (M13, "local line push slide+shim 0.7707 0.301 248 | 7.42", "costs $7.42 at 0.7707"),
    (M13, "2x2x point - ledger 1.0000 0.000 145 | 12.17", "but cost $12.17"),
    (M13, "beats doubled joints in 1.0000 of draws (bar 0.90), median saving $5.13", "(median saving $5.13)"),
    (M13, "median $5.51 [5-95%: 3.91, 8.55] (8.8 loaded person-minutes", "median $5.51 more than its re-drive (8.8"),
    (M13, "above v = 0.2344 m/s", "about\n0.23 m/s"),
    # 5.11 the single-2x remedies on measured studs (milestone 12)
    (M12, "measured three no push ledger 0.4253", "from 0.4253 to 0.5303 clean sheets"),
    (M12, "measured local no push ledger 0.5303", "from 0.4253 to 0.5303 clean sheets"),
    (M12, "own parabola three no push ledger 0.5792", "against 0.5792 for their own"),
    (M12, "(bow costs 23.2, waviness 15.4)", "falls from 15.4 points to 4.7"),
    (M12, "(bow costs 23.6, waviness 4.7)", "falls from 15.4 points to 4.7"),
    (M12, "measured three mid push ledger 0.5516", "0.4253 to 0.5516"),
    (M12, "measured local mid push slide+shim 0.5 mm 0.7707", "reach 0.7707"),
    (M12, "measured, common removed local mid push slide+shim 0.5 mm 0.7960", "(0.7960 with the scan's"),
    (M12, "own parabola local mid push slide+shim 0.5 mm 0.8600", "against 0.8600 on their own"),
    (M12, "measured local mid push 0.606 mm", "held to 0.606 mm"),
    (M12, "straight three no push 0.839 mm", "against 0.839 mm on straight"),
    # 5.10 measured studs (milestone 11)
    (M11, "median |bow| at 8 ft 0.106 in, largest 0.283 in", "of 0.106 in and a largest of 0.283 in"),
    (M11, "RMS residual [0.9, 0.66, 0.59, 0.94] mm", "0.59–0.94 mm RMS remains"),
    (M11, "a perfect parabola still leaves 0.27 mm RMS", "against 0.27 mm that the"),
    (M11, "R^2 [0.21, 0.64, 0.74, 0.79]", "explains 64–79% of the shape"),
    (M11, "carries 48% of the residual variance, against 9%", "(48% of its variance, against 9%"),
    (M11, "[0.53, 0.42, 0.35, 0.32, 0.6, 0.31] mm", "leaves 0.31–0.60 mm"),
    (M11, "2x    three measured (110 mm mean)           clean 0.4253", "give 0.425 clean sheets"),
    (M11, "2x    three measured, common part removed    clean 0.4707", "(0.471 with the common"),
    (M11, "2x    three parabola at each stud's own bow  clean 0.5792", "against 0.579 for parabolas"),
    (M11, "2x2x  three measured (110 mm mean)           clean 1.0000", "Doubled joints give 1.000 on the measured studs"),
    # 5.9 the straight-stud ceiling (milestone 10)
    (M10, "three-foot: clean with all six 0.7370", "reach 0.7370 clean sheets"),
    (M10, "smooth (Drake): clean with all six 0.8107", "and 0.8107 (smooth rock)"),
    (M10, "tool 44.6%", "carries 44.6% and 46.9%"),
    (M10, "tool 46.9%", "carries 44.6% and 46.9%"),
    (M10, "pose (slide + ledger + panel) 43.5%", "43.5% and 38.6%"),
    (M10, "pose (slide + ledger + panel) 38.6%", "43.5% and 38.6%"),
    (M10, "closed form 0.9833; Monte Carlo 0.9838", "gives 0.9838 clean, matching the closed form 0.9833"),
    (M10, "interaction: pose alone 0.9952 clean, tool and reads alone 0.9573", "the pose alone gives 0.9952"),
    (M10, "three-foot straight slide+shim 0.5 mm 0.9180", "lift straight studs to 0.9180"),
    (M10, "three-foot low, mid push slide+shim 0.5 mm 0.8932", "low-warp studs (section 5.8) to 0.8932"),
    (M10, "three-foot straight slide+shim 0.5 mm 0.839", "held to 0.839 mm"),
    (M10, "three-foot low, mid push slide+shim 0.5 mm 0.794", "or\n0.794 mm"),
    # 5.8 straightening the joint stud (milestone 9)
    (M9, "pinned 48.000 48.0 0.07407 0.07407 0.1667", "c = 48.000 and 192.000"),
    (M9, "fixed 192.000 192.0 0.29630 0.29630 0.1667", "0.07407 b and 0.29630 b at u = 1/6"),
    (M9, "low mid pinned | 28 89 126", "median of 28 N and a 99th percentile of 126 N"),
    (M9, "high mid pinned | 53 168 232", "53 and 232 N at the"),
    (M9, "mid/pinned 376 N", "376 N for a grade-limit stud"),
    (M9, "high nails pinned | 53 780 1258", "needs up to 1,258 N"),
    (M9, "low nails pinned | 28 95 355", "against 355 N at the lower warp"),
    (M9, "three-foot low 2x, three, no push 0.5602", "rise from 0.5602 to 0.7095"),
    (M9, "three-foot low 2x, three, mid pinned 0.7095", "rise from 0.5602 to 0.7095"),
    (M9, "three-foot high 2x, three, no push 0.3071", "higher warp from 0.3071"),
    (M9, "three-foot high 2x, three, mid pinned 0.6773", "to 0.6773"),
    (M9, "(straight studs, the ceiling) 0.7370", "straight studs gives 0.7370"),
    (M9, "low warp: the median draw stops favouring the push over doubled joints at 925.0 s",
     "until about 925 s of pushing a sheet"),
    # 5.6 the bowed bottom edge as a curve (milestone 6b)
    (M6B, "R = 117.0 m at mid-width, h0 = 1.221 m, r_bar from mid-width = 1.562 m", "R = 117.0 m at mid-width"),
    (M6B, "H37 smooth bow within theta_s + 0.005 deg: 100% of 48 cells -> held", "in all 48 cells"),
    (M6B, "drake -0.00031 0.02223 0.05876", "0.05876° in Drake"),
    (M6B, "mujoco -0.00024 0.02186 0.06055", "0.06055° in MuJoCo"),
    (M6B, "2x 1 low three | 0.5602 0.6250 0.6244 0.6264", "from 0.5602 to 0.6250 clean sheets"),
    (M6B, "worst two-2x change 0.45, bar 0.5 -> held", "by at most 0.45 points"),
    (M6B, "drake: median |tilt| 0.0500", "median 0.0500° in Drake"),
    (M6B, "mujoco: median |tilt| 0.0607", "0.0607° in MuJoCo"),
    # 5.1 gap and pose (milestone 1)
    (M1, "0.0000 3.931 0.898", "from 3.931 to 3.137 mm"),
    (M1, "0.1250 3.137 0.413", "from 0.898 to 0.413 mm"),
    (M1, "clean sheets 0.952 without the gap, 0.748 with a 1/8 in gap", "from 0.952 to 0.748"),
    (M1, "0.562 (1.1 nails missed a sheet)", "to 0.562 when it does not"),
    (M1, "edge 0.5 mm translation sigma for 95%: 0.44 mm rotation sigma for 95%: 0.0312 deg", "0.44 mm of translation and 0.0312° of rotation"),
    (M1, "nominal translation sigma for 95%: 0.38 mm rotation sigma for 95%: 0.0276 deg", "allows 0.38 mm and 0.0276°"),
    (M1, "clean 0.98 0.22 0.00", "no third sheet clean"),
    (M1, "(last sheet feasible in >=50%: 4)", "keep a joint window for four sheets"),
    (M1, "clean 0.98 0.98 0.98 0.98 0.98 0.98 0.98 0.98 0.98 0.98", "keeps every sheet at 0.98 clean"),
    # 5.2 as-built studs (milestone 2)
    (M2, "12.548 mm (gap centred on the stud's range) = 0.531 in over 8 ft", "any bow over 0.531 in"),
    (M2, "low (0.11, 0.08 in) halfnormal single 0.5453", "one read a stud gives 0.5453"),
    (M2, "low (0.11, 0.08 in) halfnormal three 0.8032", "three reads and a fitted parabola 0.8032"),
    (M2, "three bow+twist, perfect reads+edge clean 0.8685", "perfect stud and edge reads 0.8685"),
    (M2, "single bow+twist, perfect reads+edge clean 0.5631", "| one 2x, perfect reads and edge | 0.5631 |"),
    (M2, "cut 0.0625 in culled 0.649", "rejecting 0.649 of studs"),
    (M2, "layout 1.6 mm single 0.4530 ends 0.5150 three 0.7228", "1.6 mm of plate-layout lean costs 8"),
    (M2, "low (0.11, 0.08 in) single 0.9996 ends 1.0000 three 1.0000 dense 1.0000", "0.9996 with a single read"),
    (M2, "low (0.11, 0.08 in) single 0.9909 ends 0.9983 three 1.0000 dense 1.0000", "| 3x (2.5 in) | 0.9909 | 0.9983 | 1.0000 | 1.0000 |"),
    (M2, "high (0.21, 0.16 in) single 0.9489 ends 0.9850 three 1.0000", "1.0000 with three reads at the higher warp"),
    # 5.3 tack and measure (milestone 4)
    (M4, "2x (1.5 in) straight edge 0.9584 0.372 0.0294", "about 0.03° and\n0.4 mm"),
    (M4, "threshold 2.0 mm, clean 0.8690, 2.10 hangs", "peaks at 0.8690 with 2.10 hangs a sheet"),
    (M4, "sway allowed 0.187 mm (2x straight), 4.127 mm (2 x 2x low warp)", "sway 0.187 mm"),
    (M4, "2 x 2x low warp allows 0.536 deg and 10.41 mm", "0.5365° and 10.414 mm"),
    (M4, "2 x 2x (3.0 in) low warp edge 1.0000 10.414 0.5365", "0.5365° and 10.414 mm"),
    # 5.4 ledger and humanoids (milestone 3)
    (M3, "H13 held: largest tilt left at F_n <= 50 N, mu 0.3-0.5: 0.00003 deg", "largest\nresidual is 0.00003°"),
    (M3, "corners 0.4 189.3 204.2 0.927", "189.3 N at μ 0.4"),
    (M3, "0.929, 0.927, 0.927, 0.872, 0.987", "0.872–0.987 of the closed form"),
    (M3, "H15 refuted: 29/30 cells within 0.005 deg or 10%; largest error 0.0367 deg", "29 of 30 cells (largest error\n0.0367°)"),
    (M3, "2 x 2x low warp 1.0000, 2x straight 0.8440", "single 2x on straight studs falls to 0.8440"),
    (M3, "95% needs panels within 0.244 of the limits", "within 0.244 of the PS 2 limits"),
    (M3, "corner angle 0.0834 deg", "a corner\nangle of 0.083°"),
    (M3, "rocks up to 0.1492 deg", "rocks the sheet up to 0.149°"),
    (M3, "laser rating 1/8 in at 30 ft = 0.0199 deg", "1/8 in at 30 ft (0.020°)"),
    (M3B, "0.3 1.2 | 8.7 [left_wrist_pitch_joint]", "a G1 carries at most 2.8–8.7 kg"),
    (M3B, "0.4 0.6 | 2.8 [waist_pitch_joint]", "a G1 carries at most 2.8–8.7 kg"),
    (M3B, "0.3 1.3 | (as mu 0.6) | 66 [waist_pitch_joint]", "a G1 66–110 N"),
    (M3B, "0.3 50 = h | 84.2 2.032 2.018 0.993", "h* = W / (2 μ_l) within 1.6% in 14 cases"),
    # 5.5 the cycle (milestone 5)
    (M5, "two 2x, single read (ledger, s_x 1 mm, low warp) = 0.9997", "first-pass clean rate is 0.9997 [0.999, 1.000]"),
    (M5, "two 2x, single read: 76 to 216 s a sheet (median 146); best single 2x: 94 to 281 s (median 183)", "takes 76 to 216 s (median 146)"),
    (M5, "best single 2x: 94 to 281 s (median 183)", "takes 94 to 281 s (median 183)"),
    (M5, "2x2x: {'single': 108, 'three': 0, 'dense': 0}", "fastest policy in all 108 time cells"),
    (M5, "0.5833 [0.576,0.590] 0.70", "no policy passes 0.5833 (dense reads; 0.70 nails missed a sheet)"),
    (M5, "all 108 cells: min 17.8 s, median 35.7 s, max 65.2 s", "two 2x win by 17.8 to 65.2 s a sheet"),
    (M5, "= 7.64 points", "costs up to 7.64 points on single 2x"),
    (M5, "lift-tack 0.25 deg / 5 mm low none 0.9775 [0.975,0.979] 0.03 0.9960", "(0.9775 with one read, 0.9960 with three)"),
    (M5, "H27: nailing the largest stage in 90 of 108 cells -> refuted", "largest stage in 90 of 108 cells"),
    # 5.6 Drake (milestone 6)
    (M6, "drake +0.00002 0.00142 0.00325 0.00466", "seated residual of 0.00142° (1σ; 0.00466° at most)"),
    (M6, "mujoco +0.00000 0.00001", "MuJoCo's 0.00001°"),
    (M6, "worst |Drake - MuJoCo| = 0.06 points over 24 pipelines -> held (bar 10)", "**0.06 points** (bar 10)"),
    (M6, "H34 held wrist: 70% of cells within max(0.005 deg, 10%) -> refuted", "70% of cells within tolerance"),
    (M6, "bow, theta0 +1.00 deg (predicted +/-0.1492) +0.1070 [+0.1386]", "0.107–0.123° in Drake and 0.139–0.145° in\nMuJoCo"),
    (M6, "bow, theta0 +0.25 deg (predicted +/-0.1492) +0.1233 [+0.1452]", "0.107–0.123° in Drake"),
    (M6, " 0.6 100 | 1.016 1.014 1.023 1.007", "within 0.7% in Drake"),
    (M6, "corners 0.2 394.1 379.5 408.4 0.965", "Drake's press thresholds are 0.965–0.998"),
    (M6, "corners 0.7 116.5 115.2 116.7 0.998", "Drake's press thresholds are 0.965–0.998"),
    # 5.7 cost (milestone 7)
    (M7, "hand crew $/sheet: median 5.21 [5-95%: 1.93, 14.46]", "| hand crew | 5.21 [1.93, 14.46] |"),
    (M7, "base 54.43 [ 33.04, 93.51]", "| G1 on a lift base | 54.43 [33.04, 93.51] | 7.03 [4.52, 11.03] | 2.20 [1.17, 3.50] |"),
    (M7, "7.03 [ 4.52, 11.03]", "| G1 on a lift base | 54.43 [33.04, 93.51] | 7.03 [4.52, 11.03] |"),
    (M7, "h1 151.73 [ 98.02, 245.83]", "| walking H1 | 151.73 [98.02, 245.83] | 17.23 [11.48, 26.77] | 4.02 [2.34, 6.45] |"),
    (M7, "gantry 99.24 [ 27.59, 337.09]", "| gantry (plant) | 99.24 [27.59, 337.09] | 10.51 [3.33, 34.17] | 1.78 [0.63, 4.57] |"),
    (M7, "worst over volume and forced policy = 1.0000", "beats a walking H1 in every draw"),
    (M7, "10: +43.67, 30: +13.78, 100: +3.36, 300: +0.51", "(+$43.67 a sheet)"),
    (M7, "with the median below zero: 501", "from about 501 houses a year"),
    (M7, "0.622 of draws cross inside 10-1000; of those 5/50/95% at 10 / 54 / 794 houses", "62% of draws cross\ninside 10–1,000 houses, at a median of 54"),
    (M7, "base 0.00/0.01/0.37/0.74/0.94", "37% of draws at 100 houses a year, 74% at\n300 and 94% at 1,000"),
    (M7, "site_life_y -0.58", "its life (Spearman −0.58)"),
    (M7, "extra joint stud (lumber + framer time) $/sheet: median 5.42", "The extra stud costs $5.42 a sheet"),
    (M7, "misses 0.79 nails a sheet", "the 0.79 missed nails"),
    (M7, "$6.51 more than its re-drive [5-95%: 5.21, 7.88]", "$6.51 [5.21, 7.88] more than its\nre-drive"),
    (M7, "base 2x/ledger, s_x 1 mm/three 1.000", "Every robot picks single 2x joints with three reads"),
]


def squash(s):
    return re.sub(r"\s+", " ", s)


def main():
    draft = squash((HERE / "paper" / "draft.md").read_text())
    cache, misses = {}, []
    for path, res_text, draft_text in CHECKS:
        if path not in cache:
            cache[path] = squash((HERE / path).read_text())
        if squash(res_text) not in cache[path]:
            misses.append(f"{path}: results lack {res_text!r}")
        if squash(draft_text) not in draft:
            misses.append(f"draft.md lacks {draft_text!r} (from {path})")
    for m in misses:
        print("MISS", m)
    print(f"{len(CHECKS) - len(misses)} of {len(CHECKS)} checks ok" if not misses else f"{len(misses)} misses")
    return 1 if misses else 0


if __name__ == "__main__":
    sys.exit(main())
