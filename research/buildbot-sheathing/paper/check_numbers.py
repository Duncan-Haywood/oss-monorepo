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
M14 = E + "m14_escaped/results.txt"
M15 = E + "m15_frame_joints/results.txt"
M16 = E + "m16_soft_nails/results.txt"
M17 = E + "m17_weiss_wall/results.txt"
M18 = E + "m18_holddown_shear/results.txt"
M19 = E + "m19_wall_pushover/results.txt"
M20 = E + "m20_cyclic/results.txt"
M21 = E + "m21_degrading/results.txt"
M27 = E + "m27_slide_mech/results.txt"
M28 = E + "m28_shim_mech/results.txt"
M29 = E + "m29_tool_lean/results.txt"
M30 = E + "m30_backlash/results.txt"
M31 = E + "m31_pose_range/results.txt"
M32 = E + "m32_grf_qp/results.txt"
M33 = E + "m33_compensate/results.txt"
M34 = E + "m34_windup/results.txt"
M35 = E + "m35_hose/results.txt"
M36 = E + "m36_wrist_ft/results.txt"
M37 = E + "m37_preload/results.txt"
M38 = E + "m38_squeeze/results.txt"
M39 = E + "m39_waist/results.txt"
M40 = E + "m40_liftoff/results.txt"
M40P = E + "m40_liftoff/posthoc.txt"
M41 = E + "m41_stance0/results.txt"
M41P = E + "m41_stance0/posthoc.txt"
M42 = E + "m42_sides/results.txt"
M42P = E + "m42_sides/posthoc.txt"
M43 = E + "m43_specstack/results.txt"
M43P = E + "m43_specstack/posthoc.txt"
M44 = E + "m44_legpreload/results.txt"
M44P = E + "m44_legpreload/posthoc.txt"
M45 = E + "m45_tiered/results.txt"
M45P = E + "m45_tiered/posthoc.txt"
M46 = E + "m46_holdside/results.txt"
M47 = E + "m47_poseside/results.txt"
M48 = E + "m48_loadside/results.txt"
M48P = E + "m48_loadside/posthoc.txt"
M49 = E + "m49_backload/results.txt"
M49P = E + "m49_backload/posthoc.txt"
M50 = E + "m50_relean/results.txt"
M50P = E + "m50_relean/posthoc.txt"
M51 = E + "m51_envelope/results.txt"
M51P = E + "m51_envelope/posthoc.txt"
M52 = E + "m52_slackcal/results.txt"
M53 = E + "m53_loadside/results.txt"
M54 = E + "m54_lhs/results.txt"
M54P = E + "m54_lhs/posthoc.txt"
M55 = E + "m55_robust/results.txt"
M56 = E + "m56_weighted/results.txt"
M57 = E + "m57_beta/results.txt"
M58 = E + "m58_tworow/results.txt"
M59 = E + "m59_depth/results.txt"
M60 = E + "m60_jointpreload/results.txt"

CHECKS = [
    # 5.11 the slide as a mechanism (milestone 27)
    (M27, "g1 1.0 ok    |       63", "spring of\n63 N/m"),
    (M27, " 0.4   0.8     20 0.1 |      0.262", "leaves 0.262 mm rms at a 20 ms reaction"),
    (M27, "  0.8     20 |         0.262 | 0.7912", "then gives 0.7912"),
    (M27, " 0.4   0.8     50 0.1 |      1.035", "at 50 ms it leaves\n1.035 mm"),
    (M27, "  0.8     50 |         1.035 | 0.6948", "1.035 mm and 0.6948"),
    (M27, " 0.4   0.8    100 0.1 |      3.855", "at 100 ms 3.855 mm"),
    (M27, "  0.8    100 |         3.855 | 0.3167", "3.855 mm and 0.3167"),
    # 5.11 the shim as a mechanism (milestone 28)
    (M28, "Drake rock (m6b)    | 1.058  0.946  2.091  3.018", "median of 0.946 mm and a 99th percentile of 3.018 mm"),
    (M28, "1/16 in (horseshoe) |    0.458", "0.458 mm rms"),
    (M28, "stack 1/16 in (horseshoe)               | 0.7964", "gives 0.7964"),
    (M28, "shim 0.5 mm (assumed)                   | 0.7912", "against 0.7912 with a"),
    (M28, "0.4  0.5 |     141.7       118.5", "push of 118.5 N"),
    (M28, "g1    0.50 |            65.6", "gives 65.6 N into the wall"),
    (M28, "0.857 | 0.252", "μ 0.252 or less"),
    (M28, "h1    0.50 |           132.0", "H1 gives 132.0 N"),
    (M28, "g1     0.4   0.8     20 |               12.70", "(12.70 mm at 20 ms)"),
    (M28, "0.397 |               0.132", "leaves 0.132 mm rms"),
    (M29, "0.60 mm 0.9595, 1.00 mm 0.6887, 1.30 mm 0.3152", "gives 0.9595 at 0.6 mm"),
    (M29, "0.60 mm 0.9595, 1.00 mm 0.6887, 1.30 mm 0.3152", "and 0.3152 at 1.3 mm"),
    (M29, "lean a joint error gives at the nose: y g1 0.095 deg", "(0.095° about the vertical, 1σ)"),
    (M29, "member bound checked 44.4 mm", "44.4 mm below the"),
    (M29, "g1    | 0.101 0.118 0.095            |  0.30 |      1.312  1.375", "is 1.312 mm at the surface and 1.375 mm at depth"),
    (M29, "g1       1  0.30 | 0.2637", "0.2637; the H1"),
    (M29, "h1       1  0.30 | 0.5706", "the H1 gives 0.5706"),
    (M29, "  12 | 0.656 / 0.688        | 0.9344", "gives 0.9344"),
    (M29, "lean the single-2x stack tolerates for a 2-point loss: 0.434 deg", "of 0.434° (1σ)"),
    (M29, "      2.00 |                             1.550 | 0.0430          -22.06 | 1.0000", "stay at 1.0000"),
    # 5.11 backlash at the tool point (milestone 30)
    (M30, "  g1    50 0.20 | 19 / 22", "16–19 of the G1's 22 joints"),
    (M30, "  g1    25 0.20 | 16 / 22", "16–19 of the G1's 22 joints"),
    (M30, "     5 | 0.1434 | 0.7646", "from 0.9344 to 0.7646"),
    (M30, "     5 | 0.2351 | 0.9134", "to 0.9134"),
    (M30, "     5 | 0.2130 | 0.8870", "to 0.8870"),
    (M30, "    25 | 0.2636 | 0.9344", "keeps 0.9344 up to 25 arcmin"),
    (M30, "  unpreloaded            | 12 | 2.67", "below 2.67 arcmin"),
    (M30, "  preloaded              | 12 | 6.24", "6.24 arcmin if gravity"),
    (M30, "  0.29 | 0.2792", "(11-bit stack\n0.2792 to 0.2354)"),
    (M30, "  0.32 | 0.2354", "0.2792 to 0.2354"),
    (M30, "  g1  up   0.15 | 1.401 1.456 | 0.1835 (-8.02)", "costs the 11-bit G1 8.02 points"),
    (M30, "  g1  down 0.15 | 1.274 1.456 | 0.3044 (+4.08)", "gains 4.08"),
    # 5.11 backlash across the poses (milestone 31)
    (M31, "  g1 0.6 +0.15 | 22 | 20 |", "13–20 of the 22 joints"),
    (M31, "  g1 0.6 -0.15 | 22 | 13 |", "13–20 of the 22 joints"),
    (M31, "  g1 0.4 +0.15 | 0.9500 | 0.9466 (-0.33)", "between 0.33 and 9.93 points"),
    (M31, "  g1 1.2 +0.00 | 0.9131 | 0.8138 (-9.93)", "0.9131 to 0.8138"),
    (M31, "waist_roll (-27.83 to +19.97 N m)", "−27.83 to +19.97 N m"),
    (M31, "| 0.0000 (-95.00) | +3.394,", "up to 3.394 mm"),
    (M31, "12 bits, per-pose calibration: 2.49 arcmin", "tolerate 2.49 arcmin"),
    (M31, "12 bits, one      calibration: 0.44 arcmin", "0.44 arcmin with one calibration"),
    (M31, "13 bits, per-pose calibration: 4.13 arcmin", "(13 bits: 4.13 and 0.79)"),
    (M31, "13 bits, one      calibration: 0.79 arcmin", "(13 bits: 4.13 and 0.79)"),
    # 5.11 the ground reaction through real soles (milestone 32)
    (M32, "  g1 0.4 +0.00 |   79.6 |", "most 79.6 N at a 0.4 m hand height"),
    (M32, "  g1 0.8 +0.00 |   39.0 |", "39.0 N at 0.8 m"),
    (M32, "  g1 1.0 +0.00 |   31.1 |", "31.1 N at 1.0 m"),
    (M32, "  g1 1.2 +0.00 |   25.9 |", "25.9 N at 1.2 m"),
    (M32, "  h1 1.6 +0.00 |   25.2 |", "100.9 to 25.2 N"),
    (M32, "poses balancing the whole 25-50 N range when leaned: 36 of 36", "at all 36 poses"),
    (M32, "largest change of a waist or arm torque between models: 0.00e+00 N m", "0.00e+00 N m"),
    (M32, "g1 free: 2 held everywhere; flipping: right_wrist_pitch (-6.04 to +3.00)", "−6.04 to +3.00 N m"),
    (M32, "worst LP margin -45.50 N m", "worst margin −45.5 N m"),
    (M32, "worst LP margin 3.31 N m", "margin 3.31 N m"),
    (M32, "  g1 free   (15 poses) | 8.63 at", "from 8.63 points"),
    (M32, "  g1 hold-min (15 poses) | 3.74 at", "to 3.74"),
    (M32, "| -1.401 at 1.2 -0.15", "still leaves 1.401 mm"),
    (M32, "| -2.632 at 1.2 -0.15", "torque-minimising 2.632"),
    (M32, "  hold-min | 1.401 | 1.2 +0.00: 1.094 |", "1.094 mm at"),
    # 5.11 model-based compensation (milestone 33)
    (M33, "check: matched model leaves +0.00e+00 mm", "leaves 0.00e+00 mm"),
    (M33, "C=free     +0.0 kg g=0.2 | -1.156 at 0.4 +0.15 | 17/2/47", "leaves 1.156 mm (17 joint-pose"),
    (M33, "g1 R=hold-min C=force    +0.0 kg g=0.2 | -1.450", "1.450 and 1.237 mm"),
    (M33, "g1 R=hold-min C=torque   +0.0 kg g=0.2 | +1.237", "1.450 and 1.237 mm"),
    (M33, "g1 R=hold-min C=none     +0.0 kg g=0.2 | -1.401", "against 1.401 mm with no compensation"),
    (M33, "8d common 2-1/2 x 0.131 in | 4.61 | 0.295", "0.295 kg (8d common)"),
    (M33, "16d 3-1/2 x 0.131 in | 6.41 | 0.410", "0.410 kg (16d)"),
    (M33, "g1 R=hold-min C=hold-min +0.4 kg g=0.2 | +0.017", "+0.4 kg leaves 0.017 mm"),
    (M33, "g1 R=hold-min C=hold-min +1.0 kg g=0.2 | -0.057", "+1.0 kg\n0.057 mm"),
    # 5.11 windup under the press (milestone 34)
    (M34, "g1    10000 | 3.193 / 3.417 at 1.2 +0.15", "3.193 mm at the worst G1 pose"),
    (M34, "g1     3000 | 10.642", "(10.642 mm at 3e3"),
    (M34, "g1   100000 | 0.319", "0.319 mm at 1e5)"),
    (M34, "g1    10000 |   5.47 at 1.2 -0.15 |   0.00", "loses\n5.47 points"),
    (M34, "g1 free : ", "k_t ≥ 1.78e+04 N m/rad"),
    (M34, "-> k_t >= 1.78e+04", "k_t ≥ 1.78e+04 N m/rad"),
    (M34, "| 7.9e-16 / 0.018 at 1.2 +0.15", "0.018 mm at the nail's tip"),
    (M34, "g1: 0.073 | 0.383 | 0.789", "0.073 to 0.789"),
    (M34, "mu 0.2/0.3/0.4/0.6/0.8: 4/6/10/12/15 of 15", "at mu 0.4 it sticks at 10 of 15 poses"),
    (M35, "rubber (0.274 kg/m)", "0.274 kg/m"),
    (M35, "0.3 2.0 m: 1.6", "1.6 to 21.5 N"),
    (M35, "0.8 10.0 m: 21.5", "1.6 to 21.5 N"),
    (M35, "g1 rubber   5.0 | 4.168 / 1.251", "by 1.251 mm"),
    (M35, "270:0.921", "at most 0.921 mm"),
    (M35, "g1 rubber   5.0 | y +1.001", "1.001 mm along the wall"),
    (M35, "g1 rubber   0.0 | y +0.474", "leaves 0.474 mm"),
    (M35, "g1 rubber   5.0 (phi 90) | 2.17", "loses 2.17\npoints"),
    (M35, "g1 rubber  10.0 (phi 315) | 20.66", "20.66 points"),
    (M36, "g1  20.0 | y +2.344 | +0.000 / -0.290 / -0.293", "from 2.344 mm to 0.293 mm"),
    (M36, "g1  20.0 | ft300            |   1.64", "loses 1.64 points instead of 91.55"),
    (M36, "g1   5.0 | y +0.060 z +0.170 | y -0.100", "0.060 and 0.100 mm at 5 N"),
    (M37, "g1   5.0  0.2 | 1.378 (0.606)", "leaves the G1 1.378 mm at a 5 N drag"),
    (M37, "g1  20.0 | m 0, g 0 |  56.48", "loses 56.48 points over 0 to 20 N"),
    (M37, "total | hold 161 / leg 3 / waist 6 / arm 5", "161 of the 175 mispredicted"),
    (M37, "/ 0.830 (0.549) / 0.830 (0.282)", "(0.830 mm at 5 N, 1.64 points"),
    (M37, "g1  20.0 | m 0.1, g 0 |   1.64", "1.64 points\nover 0 to 20 N)"),
    (M37, "g1  0.10 | 14 (lost ['[1.0, 0.15]']) | 49.11 | 1.66", "for 1.66% more leg torque and one of 15 G1 poses"),
    (M38, "largest leg or waist torque 1.1e-16 N m", "(at most 1.1e-16 N m per newton elsewhere)"),
    (M38, "total S  10.0 | hold 0 / leg 2 / waist 9 / arm 0", "removes all 14 mispredicted arm joints"),
    (M38, "total S   0.0 | hold 0 / leg 1 / waist 7 / arm 14", "removes all 14 mispredicted arm joints"),
    (M38, "g1   5.0  0.2 | 0.830 (0.549) / 0.485 (0.099)", "falls from 0.830 to 0.485 mm"),
    (M38, "g1  20.0 | S 10 |   0.05", "0.05 points instead of 1.64"),
    (M38, "g1  20.0 | S 0 |   1.64", "0.05 points instead of 1.64"),
    (M38, "h1  20.0 | S 10 |   0.02", "(the H1 0.02 instead of 2.19)"),
    (M38, "h1  20.0 | S 0 |   2.19", "(the H1 0.02 instead of 2.19)"),
    (M39, "g1   5.0  0.2 | 0.485 (0.099) / 0.485 (0.099) / 0.106 (0.020) / 0.012 (0.027)", "from 0.485 to 0.012 mm"),
    (M39, "g1  10.0 | stock     |   5.80", "10 N stack loss from 5.80 to 0.04 points"),
    (M39, "g1  10.0 | braked    |   0.04", "10 N stack loss from 5.80 to 0.04 points"),
    (M39, "g1  10.0 | precision |   0.11", "gives 0.106 mm\nand 0.11 points"),
    (M39, "g1   5.0  2.4 | 1.350 (0.922) / 1.350 (0.922) / 0.968 (0.679) / 0.873 (0.477)", "still leaves 0.873 mm"),
    (M40, "0.129-0.160 N s (Buchalter et al. 2002)", "carries 0.129 to 0.160 N s, a floor"),
    (M40, "force-plate unloading 8.70 N s per transfer phase", "gives at most about 8.70 N s a nail"),
    (M40, "H151 (F_r 0 sets at least half the loose nose-moving joints): 0 of 56", "rise sets none of the 56 nose-moving joints"),
    (M40P, "56 loose; 11 below tau_f, 2 set on entering the window, 7 rise through it, 36 change sign",
     "loose: 36 change sign inside the 25"),
    (M40, "in the window 0.159 N m", "peak at 0.159 N m"),
    (M40, "  g1 braked   5.0 | 0.012 / 0.012 / 0.012", "keeps 0.012 mm at a 5 N drag"),
    (M40, "  g1 braked  20.0 | 0.012 / 0.203 / 0.012", "which costs 0.203 mm"),
    (M40, "h1: lowest balancing press > 0 at z 1.4 m 3.7 N", "balances only above 3.7 to"),
    (M40, "z 1.2 m 11.8 N", "11.8 N of press"),
    (M41, "lean moved back 9.9-39.1 mm", "back 9.9 to 39.1 mm"),
    (M41P, "ceiling for 0-50 N: grip height 1.225 m", "below a grip height of 1.225 m on the G1"),
    (M41P, "ceiling for 0-50 N: grip height 1.883 m", "1.883 m on the\nH1"),
    (M41, "  g1 1.2 +0.00 |  123.3 [ 11.6,   63.4] |   84.8 [ 0.0,   51.6] | yes |   51.7 vs   51.7", "keeps 1.6 N above"),
    (M41, "  g1   5.0 | 0.011 (0.012)", "leaves the G1 0.011 mm"),
    (M41, "  h1   5.0 | 0.019 (0.019)", "the H1 0.019 mm at a 5 N drag"),
    (M41, "g1: worst pose over all 0.9030 (milestone 40 0.9160)", "from 0.9160 to 0.9030"),
    (M42, "g1 at [1.2, 0.0]: loss both +1.30 = lean +1.30 + sides +0.00 + interaction +0.00",
     "the lean costs 1.30 points, the sides 0.00 and the\ninteraction 0.00"),
    (M42, "lost at [[1.2, 0.15]] -> refuted", "the re-leaned G1 at (1.2 m, +0.15 m) has no solution"),
    (M42P, "h1: 5 lose 0.09-0.29 points, 0 gain -", "costs the H1 0.09 to 0.29 points per pose"),
    (M42P, "g1: 4 lose 0.31-1.30 points, 2 gain 0.60-0.79", "G1 0.31 to 1.30 points at four poses while gaining 0.60 to 0.79 at two"),
    (M43, "  g1 braked zero | 0.9257 | [1.2, -0.15] | 15", "rises from 0.9160 to 0.9257 with the braked waist"),
    (M43, "  g1 stock  m32  | 0.9081 | [1.2, 0.0] | 14", "from 0.9081 to 0.9257\nwith the stock one"),
    (M43, "0.9300, 2.70 points -> refuted", "the\ntwo conventions now differ by 2.70 points"),
    (M43P, "  h1 [1.4, -0.15] | zero | 50 | ok | 0.0333", "the stance allows 0.033 and 0.095 N m"),
    (M43P, "  h1 [1.6, 0.0] | zero | 50 | ok | 0.0946", "the stance allows 0.033 and 0.095 N m"),
    (M43, "  h1 [1.6, 0.15] | 0.9677 | 0.9655 | -0.22 | -0.22 | +7.80 | yes", "those lose 0.09 to 0.22 points"),
    (M44, "  h1 [1.4, -0.15] | 0.0333 | 0.0300", "(0.030 and 0.085 N m)"),
    (M44, "  h1 [1.6, 0.0] | 0.0946 | 0.0851", "(0.030 and 0.085 N m)"),
    (M44, "  h1 [1.6, 0.0] | braked | 0.00 | 0.0000 | 0.9668", "do not move between no preload and 0.085 N m"),
    (M44, "    5.0 | 0.172 | 0.019 (0.019) | 0.172 at [1.4, -0.15]", "worst becomes 0.172 mm, against 0.019 mm"),
    (M44P, "  0.90 |  0.0 | [1.4, -0.15] | 0.0300 | 0.172 (phi 0) | 6 of 6 | 1/0/0/0", "a joint in the controller's hold set flips"),
    (M44P, "  0.90 |  0.0 | [1.6, 0.0] | 0.0851 | 0.003 (phi 0)", "the residual is 0.003 mm"),
    (M45, "  h1 [1.4, -0.15] | 0.0333 | 0.0339 | right_hip_roll (50 N) | 0.0305 | 0.1904", "raises that margin only to 0.0339 N m"),
    (M45, "  h1 [1.4, -0.15] | 0.0333 | 0.0339 | right_hip_roll (50 N) | 0.0305 | 0.1904", "the other legs had 0.19 N m to spare"),
    (M45, "H177 ((1.4, -0.15) at most 0.03 / 0.03 / 0.05 mm at 0 / 5 / 20 N): 0.172, 0.172, 0.172", "the residual stays 0.172 mm at every hose drag"),
    (M45P, "  [0, 0, -1] | -0.1629 | -0.1629", "moves 0.163 N m per newton of sensor error along z"),
    (M45P, "  0.90 | 0.15 |  5.0 | 0.004", "0.004 mm at 0.15 N"),
    (M46, "  flipped   | -3.6204, -3.7883 | 6.1546, 2.2900", "puts it at −3.79 N m"),
    (M46, "  flipped   | -3.6204, -3.7883 | 6.1546, 2.2900", "of 2.29 N m at a 50 N press"),
    (M46, "H182 ((1.4, -0.15) at most 0.03 / 0.03 / 0.05 mm at 0 / 5 / 20 N): 0.005, 0.005, 0.005", "the wall is 0.005 mm at every hose drag"),
    (M46, "  other poses with a hold-set joint on the wrong side at both ends: 4", "at four other H1 poses"),
    (M47, "H187 (every pose's S* margin at least 0.1111): smallest 0.8858", "(smallest 0.886 N m)"),
    (M47, "  h1 |  20.0 | 0.010 ([1.6, 0.15], phi 90) | 0.032", "at 20 N of hose drag from 0.032 to 0.010 mm"),
    (M47, "  g1 |  20.0 | 0.037 ([0.6, -0.15], phi 225) | 0.011", "residual at 20 N rises from 0.011 to 0.037 mm"),
    (M48, "H193 (G1 worst at most 0.03 mm at every drag): 0.016, 0.011, 0.011", "to 0.016 / 0.011 / 0.011 mm at 0 / 5 / 20 N of drag"),
    (M48, "H195 (H1 worst at most milestone 47's + 0.005 mm): 0.010 (<= 0.015), 0.014 (<= 0.019), 0.010", "keeps the H1's 0.010 / 0.014 / 0.010 mm"),
    (M48, "  g1: poses on S_H 9 of 15", "At 8 of 34 poses no side has a plan"),
    (M48, "  h1: poses on S_H 17 of 19", "At 8 of 34 poses no side has a plan"),
    (M48P, "  g1: 258 of 1530 pose-cases dropped", "the G1 has none in 258 of 1530 swept pose-cases"),
    (M48P, "  h1: 41 of 1938 pose-cases dropped", "the H1 in 41 of 1938"),
    (M49, "50 N end: 0 of 24 cells balance; best cone slack -23.77 to -0.10 N", "(best cone slack −23.77 to −0.10 N)"),
    (M49, "25 N end: 24 of 24 cells balance", "while the 25 N end balances at every cell"),
    (M49P, "largest |F_h|/F_z 0.189 (mu 0.5)", "at most 0.189 of the\nvertical"),
    (M49P, "  g1 [1.2, -0.15] | 20 | 180 | -20.0, +0.0, -11.7 | False | > 5 | 36.4 | 51.6", "falls from 51.6 to 36.4 N"),
    (M49P, "  h1 [1.6, 0.0] | 20 | 180 | -20.0, +0.0, -13.8 | True | > 5 | 42.8 | 58.7", "58.7 to 42.8 N"),
    (M50, "  g1 [1.0, 0.0] | 90.7 | -0.69 |", "peaks at −0.69 N for the\nG1 at 1.0 m grips"),
    (M50, "  g1 [1.2, 0.0] | 110.3 | -10.12 |", "−10.12 N at 1.2 m"),
    (M50, "  H206 g1 [1.2, 0.0]: tolerated at phi 180 4.1 N, linear prediction 3.8 N, off 9%", "to within 9% at all 8 poses"),
    (M50, "  g1 [1.2, -0.15] | yes | 21.9 | 30.2 | 51.2 | 6.3 | 4.0 |", "tolerates 4.0 N at its current lean"),
    (M50, "  g1 [1.2, -0.15] | 110.3 | -10.12 | 14.6 | 20.1 | 51.5 | 15.5 | 11.4 |", "11.4 N in every direction at its best"),
    (M50P, "  g1 [1.2, -0.15] | current | 4.0 | 9.0 | 5.4 | 3.4 | 5.0 | 3.0 |", "with about 3 m on the\nfloor"),
    (M51P, "  g1 | 1530 | 1272 (83.1%) | 1368 | 1272 (93.0%) | 162", "the G1 plans 1272 of 1368\ncases (93.0%)"),
    (M51P, "  h1 | 1938 | 1897 (97.9%) | 1902 | 1897 (99.7%) | 36", "the H1 1897 of 1902"),
    (M51P, "  g1 | 20 | 90 | calibration pose [1.0, 0.0] | calibration, plan limit | 45 | 57.0 (35% of it)", "45 under 20 N\npulling sideways, at 35% of the drag"),
    (M51, "H208 (every dropped pose-case lies outside the envelope): 101 inside -> refuted", "Of the\n101 cases inside with no plan"),
    (M52, "inside milestone 51's envelope 1342 of 1368 (98.1%; loaded 93.0%)", "the G1 plans 1342 of the\n1368 cases inside the limits (98.1%, from 93.0%)"),
    (M52, "H213 (the slack calibration plans at every sensor-error axis on both robots): 0 cases", "plans at every sensor-error axis"),
    (M52, "  g1 | 20.0 | 519 | -0.0000 | +0.0000 | +0.0000 | 0.0107, 0.0107", "changes no residual"),
    (M53, "H214 (hold QP is the failing stage at more than 13 of the 26 plan-limit cases): 6 of 26", "at 6 the hold QP itself fails"),
    (M53, "  g1 | 1342 | 26 | 1368 | 1368 | 100.0%", "G1 1368 of 1368"),
    (M53, "  h1 | 1897 | 5 | 1902 | 1902 | 100.0%", "H1 1902 of 1902"),
    (M53, "H215 (per-load rule plans every one of the 33 drops): 31 recovered", "recovers 31 of the 33 drops"),
    (M53, "largest 0.0106 -> held", "largest recovered residual is 0.0106 mm"),
    (M54, "H217 (every LHS pose-case inside milestone 51's envelope has a plan): g1 4002 of 4002, h1 5436 of 5436", "G1 4002 of 4002, H1 5436 of 5436"),
    (M54, "worst g1 0.2841, h1 0.0423 -> refuted", "the worst 0.284 mm on the G1"),
    (M54, "phi 202.6, limit 26.44 N, smaller neighbour 28.61 N, shortfall 2.17 N", "up to\n2.17 N optimistic"),
    (M54P, "over 0.03 mm at offsets -1.75 to +3.00 deg (20 points)", "spans 2.75 to 4.75 degrees wide"),
    (M55, "worst g1 0.0107, h1 0.0099 -> held", "(worst 0.0107 mm on the G1)"),
    (M55, "g1 96.35%, h1 96.63% -> refuted", "96.4% (G1) and 96.6% (H1)"),
    (M55, "coverage g1 95.87%, h1 96.76% -> refuted", "95.9% and 96.8% on 48 fresh loads"),
    (M55, "largest misfit 2.13e-13 N m", "linear in the load error"),
    (M56, "A h1 0.0178, B g1 0.0110", "(worst 0.0178 mm)"),
    (M56, "A h1 99.56%", "99.6% to 99.9% on\nthe H1"),
    (M56, "B h1 99.89%", "99.6% to 99.9% on\nthe H1"),
    (M56, "-> held", "flip shift never\nbeats Y"),
    (M57, "worst g1 0.0105 h1 0.0178 mm; coverage g1 99.93% h1 99.54%", "(worst 0.0178 mm) and plans\n99.93%"),
    (M57, "worst g1 0.0278 h1 0.0315 mm, over spec g1 0 h1 1 -> refuted", "one H1 case leaves 0.0315 mm"),
    (M57, "loss g1 0.00 h1 0.00 points -> held", "coverage\ndoes not move between 0 and 0.5"),
    (M57, "| 0 | 0.0256 | 15 |", "worst residual across the wall is 0.026 mm"),
    (M58, "worst z g1 0.2713 h1 0.2865 mm -> held", "presses 0.2713 mm (G1) and 0.2865 mm (H1)"),
    (M58, "worst z g1 0.0220 h1 0.0176 mm; over z g1 0 h1 0", "(worst 0.0220 mm across)"),
    (M58, "| 5412 | 5392 | 99.63% | 129 |", "99.63% on the H1"),
    (M59, "z_d g1 0.0220 h1 0.0177 mm; over at depth g1 0 h1 0 -> refuted", "0.0220 mm (G1) and 0.0177 mm (H1)"),
    (M59, "| 0.034 |", "tilts at most 0.034 mrad"),
    (M59, "| 5424 | 5405 | 99.65% | 191 |", "99.65% on the H1"),
    (M60, "| 5424 | 5406 | 18 | 17 | 17 | 99.67% -> 99.98% |", "from 99.67% to 99.98%"),
    (M60, "| 0.0089, 0.0167, 0.0095, 0.0181 | 0 | 1.001 [1.001, 1.135]", "(worst 0.0181 mm at the depth point)"),
    (M60, "targeted 17, uniform 17 -> refuted", "alone plans the same 17"),
    (M36, "|e|  0.200 N | y +0.824", "leaves 0.824 mm"),
    (M36, "|e|  0.010 N | y -0.267", "already leaves 0.267 mm"),
    (M36, "| 0.0299-0.0547", "0.0014 to 0.05 N m"),
    (M36, "H133 (|e| 2.4 N, k_t known, 5 N drag: > 0.3 mm): +1.326", "leaves 1.326 mm"),
    (M34, "h1: 0.026 | 0.511 | 1.166", "(the H1 0.026 to\n1.166)"),
    (M34, "|   1.05 at 1.2 -0.15", "loses 1.05 points at 1e4"),
    (M34, "-> k_t >= 1.00e+04", "k_t ≥ 1.00e+04"),
    (M34, "g1    10000 | y +1.755 at 1.2 +0.15 | z -12.436", "12.436 mm vertically"),
    (M34, "g1: 51.30 mm at 0.4 -0.15", "51.30 mm at the worst pose"),
    (M34, "least 32.12 mm", "(32.12 mm at the least"),
    (M34, "h1: 22.42 mm", "H1 22.42 mm)"),
    (M33, "g1 R=torque   C=torque   +0.2 kg g=0.2 | +0.412", "+0.2 kg already leaves 0.412 mm"),
    (M33, "g1 R=torque   C=torque   +1.0 kg g=0.2 | +0.836", "+1.0 kg 0.836 mm"),
    (M33, "g1 R=hold-min C=free     +0.0 kg g=1.0 | -1.374", "guard band leaves 1.374 mm"),
    # 5.14 the capacity model against Weiss's decayed walls (milestones 17 to 21)
    (M17, "control 6-12 4688, decay 6-12 2649, control 3-12 8775, decay 3-12 2974", "| Weiss (2017), tested | 56.5% \\| 33.9% |"),
    (M17, "share kept: 6-12 0.565, 3-12 0.339", "| Weiss (2017), tested | 56.5% \\| 33.9% |"),
    (M17, "4,168 lb against 4,688 lb tested (0.89)", "0.89 and 0.92\nof the tested peaks"),
    (M17, "8,049 lb against 8,775 lb tested (0.92)", "0.89 and 0.92\nof the tested peaks"),
    (M17, "3-12 over 6-12: model 1.931, tested 1.872", "ratio of 1.931 against\n1.872 tested"),
    (M17, "decay 6-12: 15.173 F, keeps 79.5%", "| Limit analysis, her wall (17) | 79.5% \\| 63.4% |"),
    (M17, "decay 3-12: 23.348 F, keeps 63.4%", "| Limit analysis, her wall (17) | 79.5% \\| 63.4% |"),
    (M17, "0.47 x NDS: keeps 58.2% (tested 56.5%) and 30.2% (tested 33.9%)", "| 58.2% \\| 30.2% | 0.47 × NDS |"),
    (M17, "frame sliding capacity: 18 end nails", "carried by its 18 end nails alone"),
    (M17, "registered (NDS joints)                 : mean loss 2.73%, 99th-percentile loss 10.41%", "cost a mean 2.73% and 10.41% at the 99th percentile"),
    (M17, "joints at 0.47 x NDS (section F fit)    : mean loss 2.67%, 99th-percentile loss 10.19%", "2.67%\nand 10.19% at the fitted"),
    (M18, "intact 3-12 36.83 F, decay 27.06 F: keeps 73.5%", "| + rods' shear path, rigid (18) | 79.5% \\| 73.5% |"),
    (M18, "best fit 0.17 x NDS: keeps 68.9% (tested 56.5%) and 63.6% (tested 33.9%); rms 22.8%", "| 68.9% \\| 63.6% | 0.17 × NDS |"),
    (M18, "rms 22.8%", "no joint strength fits both walls (rms 22.8%)"),
    (M18, "slide stops (end studs below half the top plate's slide) at s = 1.75 F = 423 lb a rod; NDS design value of the rod path 2.55 F (617 lb)", "1.75 F = 423 lb\nagainst 617 lb"),
    (M18, "Z = 617 lb (mode II, steel 0.125 in), 729 lb (mode II, steel 0.25 in), 1137 lb", "(617–1,137 lb)"),
    (M19, "H89: m 1, lambda 1, cap 2.55, no gap: pushover keeps 79.5% and 72.8%", "| Springs, rod slack, pushover (19) | 79.5% \\| 72.8% |"),
    (M19, "best overall: m 0.25, lambda 0.25, gap 0.0625 in, cap 2.55, dp 12 mm: keeps 57.8%|32.5%", "| 57.8% \\| 32.5% | 0.25 × NDS |"),
    (M19, "gap 0 keeps 74.7%|44.4%, 1/16 in 74.6%|44.4%; largest drop 0.1 points", "0.1 point at a 1/16 in gap"),
    (M19, "H91: m 1, lambda 0.25, cap 2.55, no gap: decayed 3-12 keeps 71.3%", "leave the 3 in wall at 71.3%"),
    (M19, "grid points within 5 points rms: 30", "all 30 such points of the 960 pushovers"),
    (M19, "H92: grid points with m >= 0.75 and both shares within 10 points: 0", "0.75 of NDS or stronger comes within 10 points"),
    (M20, "decayed 6-12 keeps 78.3% monotonic, 77.8% cyclic; decayed 3-12 keeps 70.5% monotonic, 70.6% cyclic", "| CUREE history, SAWS nails (20) | 77.8% \\| 70.6% |"),
    (M20, "decayed 3-12 keeps 70.5% monotonic, 70.6% cyclic", "(70.5%\nmonotonic, 70.6% cyclic)"),
    (M20, "6-12 intact: cyclic 18.756 FU (+18.766/-18.747), monotonic 18.780 FU (-0.1%)", "(−0.1% and −0.0%)"),
    (M20, "3-12 intact: cyclic 36.461 FU (+36.466/-36.456), monotonic 36.478 FU (-0.0%)", "(−0.1% and −0.0%)"),
    (M20, "best overall: m 0.25, lambda 1.0, gap 0.0000 in: cyclic keeps 57.6%|31.4%", "| 57.6% \\| 31.4% | 0.25 × NDS |"),
    (M20, "lo [-27.94, -5.07]", "crush to 27.94 mm on one side"),
    (M20, "H97 (no point with m >= 0.75 within 10 points of both): 0 such points", "0.75 of NDS or stronger comes within 10 points"),
    (M20, "largest 6.4e-13 FU", "under 1e-12 of the nail's peak"),
    (M21, "m 1.0  gamma  10.0: 79.3%|73.2%", "| + energy damage, γ 10 (21) | 79.3% \\| 73.2% |"),
    (M21, "m 0.25 gamma  10.0: 65.5%|34.8%", "| 65.5% \\| 34.8% | 0.25 × NDS |"),
    (M21, "m 1.0  gamma 100.0: 78.1%|70.9%; intact 96.8%", "fall to 96.8%, 93.9%, 85.7%,\n75.1% and 63.2%"),
    (M21, "m 1.0  gamma  50.0: 78.4%|71.1%; intact 93.9%", "fall to 96.8%, 93.9%, 85.7%"),
    (M21, "m 1.0  gamma  20.0: 79.3%|72.4%; intact 85.7%", "fall to 96.8%, 93.9%, 85.7%"),
    (M21, "m 1.0  gamma  10.0: 79.3%|73.2%; intact 75.1%", "75.1% and 63.2% of their monotonic peaks"),
    (M21, "m 1.0  gamma   5.0: 79.3%|73.5%; intact 63.2%", "75.1% and 63.2% of their monotonic peaks"),
    (M21, "inf: 70.6%, 100.0: 70.9%, 50.0: 71.1%, 20.0: 72.4%, 10.0: 73.2%", "keeps 70.6, 70.9, 71.1, 72.4, 73.2 and 73.5%"),
    (M21, "10.0: +1.5|+2.6, 5.0: +1.5|+2.9", "rise\nby up to 2.9 points"),
    (M21, "H102 (no m >= 0.75 point within 10 points of both): 0 such points", "0.75 of NDS or stronger comes within 10 points"),
    # 5.13 an escaped miss costs about 2% of its sheet (milestones 14 to 16)
    (M14, "      4      86         1.442         1.536           0.939", "4, 3 and 2 in edges give 0.939, 0.959 and\n1.062"),
    (M14, "      3     110         1.884         1.964           0.959", "0.939, 0.959 and\n1.062"),
    (M14, "      2     158         2.769         2.607           1.062", "0.939, 0.959 and\n1.062"),
    (M14, "left joint edge  : mean 2.08%, min 2.00%, max 2.21%", "costs a mean 2.08% of the sheet\n(2.00–2.21% by height)"),
    (M14, "field stud 1     : mean 0.85%", "a field nail 0.85%"),
    (M14, "bottom plate     : mean 1.42%", "a plate nail 1.42%"),
    (M14, "mean loss 2.34%, p99 loss 11.49%, wall p1 0.9340: refuted", "sheets lose a mean 2.34% and 11.49% at the 99th percentile"),
    (M14, "mean loss 2.34%, p99 loss 11.49%, wall p1 0.9340: refuted", "keeps 0.9340 of its capacity"),
    (M14, "H64 (>= the intact 6 in sheet in 99% of sheets): P = 0.9998: held", "beats an intact 6 in\nsheet in 0.9998 of draws"),
    (M14, "4 in joint edges, three reads, misses left  : median $6.98", "a median $6.98 a sheet"),
    (M14, "6 in, three reads, every miss re-driven     : median $7.10", "against $7.10 for 6 in edges"),
    (M14, "(median saving $5.21)", "$5.21 less than doubled joints"),
    (M14, "(16 extra nails", "(16 more nails a sheet)"),
    (M14, "z < 12 in  : 11 of 62 nails omitted (18%), capacity 0.796, loss 20.4%", "(20.4% plastic"),
    (M15, "rho = 2.549", "(2.549 sheathing-nail capacities a joint in DF-L)"),
    (M15, "single 2x, three reads : mean loss 2.73% (m14 2.34%), p99 loss 16.66%", "raise the mean loss to 2.73% (99th\npercentile 16.66%)"),
    (M15, "H69 (>= the intact 6 in sheet in 99% of sheets): P = 0.9989", "in 0.9989 of draws"),
    (M16, "range 20.1% to 20.4%: refuted", "20.1% to 20.4% across the softening backbones"),
    (M16, "mean loss 2.39% (milestone 14: 2.34%), 99th-percentile loss 11.80%", "softening nails give 2.39% and 11.80%"),
    (M16, "Fp 0.972 kN, K at 0.4 Fp 0.496 kN/mm", "peak 0.972 kN, 0.496 kN/mm at 0.4 of peak"),
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
    (M5, "two 2x, single read (ledger, s_x 1 mm, low warp) = 0.9994", "first-pass clean rate is 0.9994 [0.999, 1.000]"),
    (M5, "two 2x, single read (ledger, s_x 1 mm, low warp) = 0.9994", "Doubled joint studs give 99.94% clean sheets with one read a stud"),
    (M5, "two 2x, single read (ledger, s_x 1 mm, low warp) = 0.9994", "lift a one-read robot to 99.94%"),
    (M5, "two 2x, single read (ledger, s_x 1 mm, low warp) = 0.9994", "the robot gets its 99.94% for free"),
    (M5, "two 2x, single read (ledger, s_x 1 mm, low warp) = 0.9994", "reads each stud once reach 99.94%"),
    (M5, "2x2x  high: best single  109.5 s, clean 0.9404", "(94% at high warp)"),
    (M5, "two 2x, single read: 76 to 216 s a sheet (median 146); best single 2x: 94 to 282 s (median 184)", "takes 76 to 216 s (median 146)"),
    (M5, "best single 2x: 94 to 282 s (median 184)", "takes 94 to 282 s (median 184)"),
    (M5, "2x2x: {'single': 108, 'three': 0, 'dense': 0}", "fastest policy in all 108 time cells"),
    (M5, "0.5814 [0.574,0.588] 0.71", "no policy passes 0.5814 (dense reads; 0.71 nails missed a sheet)"),
    (M5, "all 108 cells: min 17.9 s, median 35.8 s, max 65.5 s", "two 2x win by 17.9 to 65.5 s a sheet"),
    (M5, "= 7.39 points", "costs up to 7.39 points on single 2x"),
    (M5, "lift-tack 0.25 deg / 5 mm low none 0.9775 [0.975,0.979] 0.03 0.9960", "(0.9775 with one read, 0.9960 with three)"),
    (M5, "H27: nailing the largest stage in 90 of 108 cells -> refuted", "largest stage in 90 of 108 cells"),
    # 5.6 Drake (milestone 6)
    (M6, "drake +0.00002 0.00142 0.00325 0.00466", "seated residual of 0.00142° (1σ; 0.00466° at most)"),
    (M6, "mujoco +0.00000 0.00001", "MuJoCo's 0.00001°"),
    (M6, "worst |Drake - MuJoCo| = 0.05 points over 24 pipelines -> held (bar 10)", "**0.05 points** (bar 10)"),
    (M6, "H34 held wrist: 70% of cells within max(0.005 deg, 10%) -> refuted", "70% of cells within tolerance"),
    (M6, "bow, theta0 +1.00 deg (predicted +/-0.1492) +0.1070 [+0.1386]", "0.107–0.123° in Drake and 0.139–0.145° in\nMuJoCo"),
    (M6, "bow, theta0 +0.25 deg (predicted +/-0.1492) +0.1233 [+0.1452]", "0.107–0.123° in Drake"),
    (M6, " 0.6 100 | 1.016 1.014 1.023 1.007", "within 0.7% in Drake"),
    (M6, "corners 0.2 394.1 379.5 408.4 0.965", "Drake's press thresholds are 0.965–0.998"),
    (M6, "corners 0.7 116.5 115.2 116.7 0.998", "Drake's press thresholds are 0.965–0.998"),
    # 5.7 cost (milestone 7)
    (M7, "hand crew $/sheet: median 5.21 [5-95%: 1.93, 14.46]", "| hand crew | 5.21 [1.93, 14.46] |"),
    (M7, "base 54.43 [ 33.04, 93.51]", "| G1 on a lift base | 54.43 [33.04, 93.51] | 7.03 [4.52, 11.04] | 2.20 [1.17, 3.50] |"),
    (M7, "7.03 [ 4.52, 11.04]", "| G1 on a lift base | 54.43 [33.04, 93.51] | 7.03 [4.52, 11.04] |"),
    (M7, "h1 151.73 [ 98.03, 245.83]", "| walking H1 | 151.73 [98.03, 245.83] | 17.23 [11.48, 26.77] | 4.02 [2.34, 6.45] |"),
    (M7, "gantry 99.24 [ 27.59, 337.09]", "| gantry (plant) | 99.24 [27.59, 337.09] | 10.51 [3.33, 34.17] | 1.78 [0.63, 4.57] |"),
    (M7, "worst over volume and forced policy = 1.0000", "costs less than the walking H1 in every draw"),
    (M7, "10: +43.67, 30: +13.78, 100: +3.36, 300: +0.51", "(+$43.67 a sheet)"),
    (M7, "with the median below zero: 501", "from about 501 houses a year"),
    (M7, "0.622 of draws cross inside 10-1000; of those 5/50/95% at 10 / 54 / 794 houses", "62% of draws cross\ninside 10–1,000 houses, at a median of 54"),
    (M7, "base 0.00/0.01/0.37/0.74/0.94", "37% of draws at 100 houses a year, 74% at\n300 and 94% at 1,000"),
    (M7, "site_life_y -0.58", "its life (Spearman −0.58)"),
    (M7, "extra joint stud (lumber + framer time) $/sheet: median 5.42", "The extra stud costs $5.42 a sheet"),
    (M7, "misses 0.79 nails a sheet", "the 0.79 missed nails"),
    (M7, "$6.47 more than its re-drive [5-95%: 5.17, 7.83]", "$6.47 [5.17, 7.83] more than its\nre-drive"),
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
