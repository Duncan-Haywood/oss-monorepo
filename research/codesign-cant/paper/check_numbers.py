"""Check that every figure sections I and III-IX and the abstract of DRAFT.md quote is still in the results file it is taken from.

Each check is (text quoted in DRAFT.md, results file under ../experiments/, a regular expression that must match that file).
The script fails if the draft no longer contains the quoted text (the claim was edited without updating this list) or the results
file no longer matches (an experiment was re-run and the number moved). Run from the project directory:
    python3 paper/check_numbers.py
Stdlib only.
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")

CHECKS = [
    # abstract, section IV
    ("4.18° (INDI)", "m4_controllers/results.txt", r"indi: RMS -4\.18 deg .*better in 10 of 10"),
    ("4.88° (geometric)", "m4_controllers/results.txt", r"geo : RMS -4\.88 deg .*better in 10 of 10"),
    ("5.27° (PID)", "m4_controllers/results.txt", r"pid : RMS -5\.27 deg .*better in 10 of 10"),
    # sections III-V (milestones 1, 2, 4, 5)
    # sections III-IV at ten seeds (m12_ten_seeds, 2026-11-21)
    ("by 4.85° of held-out RMS (95% interval\n4.79–4.92°)", "m12_ten_seeds/results.txt", r"hover TWR 2 cant<=35 +-4\.85  \[ -4\.92,  -4\.79\]  sd 0\.11  p 0\.0020  better in 10 of 10"),
    ("against 4.50° with the earlier formulas (10 of 10 seeds each, p = 0.002", "m12_ten_seeds/results.txt", r"prior TWR 2 cant<=35 +-4\.50 [^\n]*p 0\.0020  better in 10 of 10"),
    ("(16.96° to\n15.47°)", "m12_ten_seeds/results.txt", r"m1 prior  TWR 2     cant<= 0: RMS  16\.96 [\s\S]*m1 hover  TWR 2     cant<= 0: RMS  15\.47 "),
    ("picks TWR 2.0–2.1", "m12_ten_seeds/results.txt", r"hover  TWR free6 cant<=35: [^\n]*range 1\.99-2\.01\)[\s\S]*hover  TWR free6 cant<=80: [^\n]*range 2\.00-2\.14\)"),
    ("picks 2.1–3.7 (mean 2.5)", "m12_ten_seeds/results.txt", r"hover  TWR free6 cant<= 0: [^\n]*TWR 2\.50 \(range 2\.05-3\.66\)"),
    ("in 7 of 10 seeds", "m12_ten_seeds/results.txt", r"m2 prio      lam 0\.0 cant<= 0: [^\n]*\(seeds over 0\.5: 7\)"),
    ("costs\n2.42° without cant and 2.31° with it (10 of 10 seeds each, p = 0.002)", "m12_ten_seeds/results.txt", r"prio-box lam 0\.0 cant<=0 +\+2\.42 [^\n]*p 0\.0020  worse in 10 of 10\n  prio-box lam 0\.0 cant<=80 +\+2\.31 [^\n]*p 0\.0020  worse in 10 of 10"),
    ("4.98° (95% interval 3.64–5.91°, 9 of 10 seeds, p = 0.004) against 4.86° under `box` (10 of 10)", "m12_ten_seeds/results.txt", r"box lam 0\.0 RMS +-4\.86 [^\n]*better in 10 of 10[\s\S]*prio lam 0\.0 RMS +-4\.98  \[ -5\.91,  -3\.64\][^\n]*p 0\.0039  better in  9 of 10"),
    ("recovers 1.14° for the\nuncanted vehicle and 0.88° for the canted one (p = 0.002 and 0.010)", "m12_ten_seeds/results.txt", r"free-prio lam 0\.0 cant<=0 +-1\.14 [^\n]*p 0\.0020[^\n]*\n  free-prio lam 0\.0 cant<=80 +-0\.88 [^\n]*p 0\.0098"),
    ("1350 W to 225 W", "m12_ten_seeds/results.txt", r"m2 box       lam 0\.0 cant<=80: [^\n]*P  1350 W[\s\S]*m2 box       lam 0\.3 cant<=80: [^\n]*P   225 W"),
    ("28–37° in 19 of 20", "m12_ten_seeds/results.txt", r"lam 0\.3 chosen cant deg: 34, 37, 36, 32, 34, 34, 33, 35, 36, 31[\s\S]*lam 1\.0 chosen cant deg: 32, 32, 31, 28, 4, 28, 30, 31, 34, 33"),
    ("(3.84°, 95% interval 2.47–4.86°, p = 0.004)", "m12_ten_seeds/results.txt", r"lam 1\.0 RMS +-3\.84  \[ -4\.86,  -2\.47\][^\n]*p 0\.0039  better in  9 of 10"),
    ("five of ten at λ = 1 and one even at λ = 0", "m12_ten_seeds/results.txt", r"lam 0\.3: [^\n]*under 15 deg: 2 of 10[^\n]*\n  lam 1\.0: [^\n]*under 15 deg: 5 of 10"),
    ("−6.10 to −4.57° (PID), −4.33 to −4.03° (INDI) and −5.01 to −4.77° (geometric)", "m12_ten_seeds/results.txt", r"pid cant minus no cant, rms +-5\.27  \[ -6\.10,  -4\.57\][\s\S]*indi cant minus no cant, rms +-4\.18  \[ -4\.33,  -4\.03\][\s\S]*geo cant minus no cant, rms +-4\.88  \[ -5\.01,  -4\.77\]"),
    ("cant stays at 29–39° under `box`", "m12_ten_seeds/results.txt", r"m2 box       lam 0\.0 cant<=80: [^\n]*cant 30-37[\s\S]*lam 0\.1 cant<=80: [^\n]*cant 33-39[\s\S]*lam 0\.3 cant<=80: [^\n]*cant 30-37[\s\S]*lam 1\.0 cant<=80: [^\n]*cant 29-31"),
    ("18.51° and 21.43° held out", "m2_polytope/results.txt", r"prio        0\.3   80    15\.78 \(13\.03, 18\.51, 21\.43, 12\.91, 13\.02\)[^\n]*35, 0, 13, 31, 34"),
    ("| PID | 18.35 | 13.08 | −5.27 (SD 1.32) | 10 of 10 | 34.2° |", "m4_controllers/results.txt", r"pid     0    18\.35 [\s\S]*pid    80    13\.08 [^\n]*34\.2 \([\s\S]*pid : RMS -5\.27 deg \(sd 1\.32, better in 10 of 10\)"),
    ("| INDI | 17.10 | 12.92 | −4.18 (SD 0.25) | 10 of 10 | 33.9° |", "m4_controllers/results.txt", r"indi    0    17\.10 [\s\S]*indi   80    12\.92 [^\n]*33\.9 \([\s\S]*indi: RMS -4\.18 deg \(sd 0\.25, better in 10 of 10\)"),
    ("| geometric | 17.61 | 12.73 | −4.88 (SD 0.20) | 10 of 10 | 35.3° |", "m4_controllers/results.txt", r"geo     0    17\.61 [\s\S]*geo    80    12\.73 [^\n]*35\.3 \([\s\S]*geo : RMS -4\.88 deg \(sd 0\.20, better in 10 of 10\)"),
    ("by 1.09° (9 of 10 seeds) and geometric control by 0.38° (5 of 10)", "m4_controllers/results.txt", r"indi: \+1\.09 deg \(sd 1\.23, narrower in 9 of 10\)\n  geo : \+0\.38 deg \(sd 1\.28, narrower in 5 of 10\)"),
    ("4.02° worse than PID with cant", "m4_controllers/results.txt", r"indi no cant - pid cant: RMS \+4\.02 deg \(sd 0\.31, law-without-cant better in 0 of 10\)"),
    ("4.53° worse", "m4_controllers/results.txt", r"geo  no cant - pid cant: RMS \+4\.53 deg"),
    ("(−9.82° PID, −4.51° INDI, −5.78° geometric)", "m4_controllers/results.txt", r"gust8 RMS -9\.82 \(better in 10 of 10\)[\s\S]*gust8 RMS -4\.51 \(better in 10 of 10\)[\s\S]*gust8 RMS -5\.78 \(better in 10 of 10\)"),
    ("1.000 under `aero` and `aero_cop2` and 0.943", "m5_rotorpy/noise_ceiling.txt", r"torque [^\n]*rho 0\.943\naero [^\n]*rho 1\.000\naero_cop [^\n]*rho 0\.943\naero_cop2 [^\n]*rho 1\.000"),
    ("ρ is 0.799 (`torque`) and 0.880–0.908", "m5_rotorpy/results.txt", r"torque        0\.799 [\s\S]*aero          0\.906 [\s\S]*aero_cop      0\.880 [\s\S]*aero_cop2     0\.908 "),
    ("ρ 0.950–0.965", "m5_rotorpy/noise_ceiling.txt", r"9001         0\.965 [\s\S]*9004         0\.950 "),
    ("ρ 0.258 on average (range −0.224 to 0.467)", "m5_rotorpy/noise_ceiling.txt", r"mean top-ten rho of the stylised simulator against itself: 0\.258 \(range -0\.224 to 0\.467\)"),
    ("J spans 0.064", "m5_rotorpy/noise_ceiling.txt", r"\(spread 0\.064\)"),
    ("PID −4.76 to −5.77°, geometric −4.70 to −5.08° and INDI −3.12 to −3.53°, against stylised −5.56, −4.86 and −4.15°", "m5_rotorpy/results.txt",
     r"pid : stylised -5\.56 \(10/10\); torque [^;]*; aero -4\.76 \(10/10\); aero_cop -5\.77 \(10/10\); aero_cop2 -4\.91 \(10/10\)\n  indi: stylised -4\.15 \(10/10\); torque [^;]*; aero -3\.12 \(10/10\); aero_cop -3\.34 \(10/10\); aero_cop2 -3\.53 \(10/10\)\n  geo : stylised -4\.86 \(10/10\); torque [^;]*; aero -4\.89 \(10/10\); aero_cop -5\.08 \(10/10\); aero_cop2 -4\.70 \(10/10\)"),
    ("(+3.10 to +3.97°)", "m5_rotorpy/results.txt", r"stylised \+3\.97 \(0/10\); torque \+3\.10 \(0/10\); aero \+3\.21 \(0/10\); aero_cop \+3\.89 \(0/10\); aero_cop2 \+3\.59 \(0/10\)"),
    ("1.25–1.47° of RMS on average", "m5_rotorpy/results.txt", r"aero          [^\n]*1\.29 [\s\S]*aero_cop      [^\n]*1\.47 [\s\S]*aero_cop2     [^\n]*1\.25 "),
    ("the added error is 3.41° and 54 episodes diverge", "m5_rotorpy/results.txt", r"torque        [^\n]*3\.41                  54"),
    # section VI: the certificate and its accuracy
    ("0 of 2,688", "m7c_stab/results.txt", r"7b design-conditions \(48 x 64\), lever 0: unstable&dead 84, unstable&alive 300, stable&dead 0, stable&alive 2688; accuracy 0\.902, sensitivity 1\.000"),
    ("1.04, 1.00, 1.01, 1.05, 1.11 and 0.88", "m7c_stab/results.txt", r"\[above, integ retrained\] ff 1 \(integ\)\n  ki/kp [^\n]*; ceil 1\.04, 1\.00, 1\.01, 1\.05, 1\.11, 0\.88"),
    ("0.29–0.44", "m7c_stab/results.txt", r"\[above, 6b\+integ\] ff 1 \(integ\)\n  ki/kp [^\n]*; ceil 0\.37, 0\.37, 0\.44, 0\.32, 0\.36, 0\.29"),
    ("3.91–7.41 per second", "m7c_stab/results.txt", r"growth rate at worst held-out plant \(1/s\) 4\.20, 4\.66, 3\.91, 5\.88, 5\.01, 7\.41"),
    ("367 of 384", "m7c_stab/results.txt", r"new rescaled designs \(24 x 64\), lever 0: unstable&dead 0, unstable&alive 367"),
    ("growth 0.50–0.66 per s", "m7c_stab/results.txt", r"growth rate at worst held-out plant \(1/s\) 0\.50, 0\.55, 0\.62, 0\.58, 0\.59, 0\.66"),
    # section VI: the tilt-command limit
    ("84 of 384", "m7d_clip/results.txt", r"base   6 s lever 0: dead \[7, 8, 10, 20, 11, 28\] \(total 84"),
    ("166 of 384", "m7d_clip/diag.txt", r"\[1\.25x\](?:\n[^\n]*)*?clip   45 deg,  6 s: dead \[[^\]]*\] \(total 166\)"),
    ("318 of 384", "m7d_clip/diag.txt", r"\[1\.25x\](?:\n[^\n]*)*?clip   45 deg, 18 s: dead \[[^\]]*\] \(total 318\)"),
    ("(median RMS 0.110 m)", "m7d_clip/diag.txt", r"\[1\.25x\]\n  clip   20 deg,  6 s: dead \[0, 0, 0, 0, 0, 0\] \(total 0\); pos 0\.110; att 8\.73"),
    ("against 3.63°", "m7d_clip/diag.txt", r"\[0\.8x\]\n  clip   20 deg,  6 s: dead \[0, 0, 0, 0, 0, 0\] \(total 0\); pos 0\.103; att 3\.63"),
    ("from 0.105 m to\n0.257 m", "m7e_margin/tilt.txt", r"tilt cap   45 deg, lever 0, above unconstrained: diverged  13 of 384 \[[^\]]*\]; pos 0\.257 m"),
    ("ceiling multiples 1.26–1.30", "m7e_margin/results.txt", r"ceil 1\.27, 1\.28, 1\.30, 1\.28, 1\.26, 1\.30"),
    # section VI: table VI-1 (milestone 7f), one check per arm
    ("| 13 | 9 | 3 | 0 | 0 | 0 |", "m7f_sweep/results.txt", r"\[unconstrained\][^\n]*(?:\n[^\n]*)*?cap 45, lever 0: [^\n]*dead 13 "),
    ("| 45 | 32 | 22 | 12 | 13 | 12 |", "m7f_sweep/results.txt", r"\[unconstrained\][^\n]*(?:\n[^\n]*)*?cap 45, lever 2: [^\n]*dead 45 "),
    # section VII: the lag law and the sourced lag (milestones 7s, 7t)
    ("at most 1 of 72", "m7s_lag/verdicts.txt", r"aware src_li \[src_li\]: [^\n]*30 ms, b 0 0, 30 ms, b 1\.5 0, 30 ms, b 3 1\n"),
    ("374 and 376 of 384", "m7t_lag_src/verdicts.txt", r"T2 held: [^\n]*aware above 63 vs 374; aware below 82 vs 376"),
    ("8 and\n15 flights against the native tunes' 54 and 64", "m7t_lag_src/results.txt", r"\[above, aware lag36\][^\n]*(?:\n[^\n]*){4}\n   inherited 15 ms D\^1\.5 [^\n]*45_2_cap   8;[^\n]*(?:\n[^\n]*)*?\[below, aware lag36\][^\n]*(?:\n[^\n]*){4}\n   inherited 15 ms D\^1\.5 [^\n]*45_2_cap  15;"),
    # section VII: intervals and tests (paper/table7_stats.py)
    ("from 486 to 348", "../paper/table7_stats.txt", r"33 vs 39\.1 ms floor, ceiling 78\.2 ms:   lagrand vs     lag39: sums 486 vs 348; U = [\d.]+ of 144, p = 0\.010"),
    ("62 (p = 0.83)", "../paper/table7_stats.txt", r"lag39c150 vs     lag75: sums 65 vs 62; U = [\d.]+ of 144, p = 0\.(?:82[5-9]|83)"),
    ("p ≤ 0.0001, the permutation floor", "../paper/table7_stats.txt", r"identified total, above: J = [\d.]+ of 360, p = 0\.00005\nidentified total, below: J = [\d.]+ of 360, p = 0\.00005"),
    ("78.2→100 ms (p = 0.018)", "../paper/table7_stats.txt", r"identified total:     lag39 vs lag39c100: [^\n]*p = 0\.0177"),
    ("100→125 ms (p = 0.025)", "../paper/table7_stats.txt", r"identified total: lag39c100 vs lag39c125: [^\n]*p = 0\.025"),
    ("125→150 ms (p = 0.10)", "../paper/table7_stats.txt", r"identified total: lag39c125 vs lag39c150: [^\n]*p = 0\.10"),
    ("150→200 ms\n(p = 0.16)", "../paper/table7_stats.txt", r"identified total: lag39c150 vs lag39c200: [^\n]*p = 0\.15[5-9]"),
    ("101 [79, 125] at 125 ms against 65 [49, 82]", "../paper/table7_stats.txt", r"lag39c125\): [^\n]*total 101 of 2304, 95% \[79, 125\]\n[^\n]*total 65 of 2304, 95% \[49, 82\]"),
    ("(p ≤ 0.0002), down to 121 crashes of 768", "../paper/table7_stats.txt", r"75 ms law: lag39c150 vs lag39c200: sums 269 vs 121;"),
    # section VII: why some tunes never settle (milestone 7ad)
    ("r = 0.9995 on 96 designs", "m7ad_settle/verdicts.txt", r"calls agree on 96 of 96; r\(model, simulator last-second distance\) 0\.9995"),
    ("(15 unsettled)", "m7ad_settle/verdicts.txt", r"unsettled: simulator 15, model 15"),
    ("same at 33, 36 and 39.1 ms for all 96", "m7ad_settle/verdicts.txt", r"identical at 33, 36 and 39\.1 ms for 96 of 96"),
    ("0 of 72 section-VII designs unsettled (18 before)", "m7ad_settle/verdicts.txt", r"b = None: unsettled 18 of 72[^\n]*\n  b = 0\.25: unsettled 0 of 72 \(0, 0, 0, 0, 0, 0 by set\)"),
    ("from 5.1 to 2.0 cm", "m7ad_settle/verdicts.txt", r"b = 0\.25 step over      median 0\.0204 against 0\.0512"),
    ("819 against 820", "m7ad_settle/verdicts.txt", r"b = 0\.25 identified L2-45 per design: total 819 against 820, p = 0\.89"),
    ("median 1.91 against 1.74 s", "m7ad_settle/verdicts.txt", r"b = 0\.25 step rise      median 1\.9110 against 1\.7380"),
    ("b = 0.1 m, gives the same picture (814)", "m7ad_settle/verdicts.txt", r"b = 0\.1: unsettled 0 of 72[\s\S]*b = 0\.1 identified L2-45 per design: total 814"),
    ("median 1.41 against 1.83 s", "m7af_step_obj/verdicts.txt", r"step rise      [^\n]*pooled 1\.4070 against 1\.8320, p = 3\.66e-05"),
    ("(97 against 107 of 2,304, p = 0.84)", "m7af_step_obj/verdicts.txt", r"identified L2-45 per design [^\n]*pooled 97 against 107, p = 0\.838"),
    ("median 4.65 against 6.52", "m7af_step_obj/verdicts.txt", r"gain kd pooled median 4\.65 against 6\.52"),
    ("Spearman ρ = 0.999", "m7af_step_obj/verdicts.txt", r"Spearman rho 0\.999\b"),
    ("4.7–5.3 cm against 1.1–1.8 cm", "m7af_step_obj/verdicts.txt", r"step   b = 0\.25 [^\n]*overshoot 0\.0474, 0\.0529 m[\s\S]*cint25 b = 0\.25 [^\n]*overshoot 0\.0113, 0\.0176 m"),
    # section VII: rise time without flying (milestone 7ag)
    ("for 35–36 of 36 at A_P ≤ 5", "m7ag_cruise/verdicts.txt", r"AG1: held \(point mass within 0\.10 s at A_P 2\.0, 2\.5, 5\.0: \[36, 36, 35\]\)"),
    ("median error 0.002–0.040 s", "m7ag_cruise/verdicts.txt", r"2\.0  1\.0 \|[^\n]*\|  0\.002 [\s\S]*5\.0  1\.0 \|[^\n]*\|  0\.040 "),
    ("at S = 0.5 m (31 of 36)", "m7ag_cruise/verdicts.txt", r"AG2: REFUTED \(point mass within 0\.10 s at S 0\.5, 2\.0: \[31, 36\]\)"),
    ("A_P = 8 (23 of 36)", "m7ag_cruise/verdicts.txt", r"AG3: REFUTED \(point mass within 0\.10 s at A_P 8: 23\)"),
    ("(135 ms, post hoc)", "m7ag_cruise/posthoc.txt", r"tau fitted on \(3\.5, 1\) only: 135 ms"),
    ("those to 36 and 33 of 36", "m7ag_cruise/posthoc.txt", r"8\.0  1\.0 \|    23/36     33/36[\s\S]*3\.5  0\.5 \|    31/36     36/36"),
    # section VII: the lag identified from an acceleration step (milestone 7ah)
    ("in a median 182 ms (area estimate 171 ms)", "m7ah_att_step/verdicts.txt", r"AH3 [^\n]*; 170\.7 ms; 63% time median 182\.0 ms"),
    ("36 of 36 designs in all seven conditions", "m7ah_att_step/verdicts.txt", r"(?:\n[^\n]*\|\s+\d+/\d+/36/\d+/\d+ \|[^\n]*){7}"),
    ("0.017 s at A_P = 8, 0.011 s at S = 0.5 m", "m7ah_att_step/verdicts.txt", r"8\.0  1\.0 \|[^\n]*\|  0\.085  0\.020  0\.017[\s\S]*3\.5  0\.5 \|[^\n]*\|  0\.062  0\.012  0\.011"),
    # section VII: the lag computed with no flight (milestone 7ai)
    ("within 10 ms of the flown one for 36 of 36", "m7ai_lag_model/verdicts.txt", r"AI2 [^\n]*; 36/36; median \|diff\| 0\.5 ms"),
    ("63% time within 15 ms for 34 of 36", "m7ai_lag_model/verdicts.txt", r"AI1 [^\n]*; 34/36;"),
    ("never more than 0.0010 s worse", "m7ai_lag_model/verdicts.txt", r"AI4 [^\n]*fewest 36/36; worst excess \+0\.0010 s"),
    ("within 15 ms for only 18 of 36", "m7ai_lag_model/verdicts.txt", r"AI3 [^\n]*; 18/36;"),
    ("from a median 0.220 to 0.101", "m7ai_lag_model/verdicts.txt", r"AI5 [^\n]*median 0\.101; base median 0\.220"),
    ("more than 15 ms for 28 of 36", "m7ai_lag_model/verdicts.txt", r"AI8 [^\n]*; 28/36;"),
    ("1.015 at 1 m/s² and 1.017 at 3.5, against 1.062", "m7ai_lag_model/verdicts.txt", r"AI6 [^\n]*exact 1\.015 \(A=1\), 1\.017 \(A=3\.5\); base 1\.019, 1\.062"),
    ("within 0.01 for 36 of 36 designs", "m7ai_lag_model/verdicts.txt", r"AI7 [^\n]*; 36/36;"),
    # sections I, V (figure IV-V paragraph) and the abstract's rise-time sentence (2026-11-21)
    ("cant beats no cant by 4.18–5.27°", "m4_controllers/results.txt", r"pid : RMS -5\.27 deg [^\n]*\n  indi: RMS -4\.18 deg [^\n]*\n  geo : RMS -4\.88 deg"),
    ("chosen angle of 33.9–35.3°", "m4_controllers/results.txt", r"indi   80 [^\n]*33\.9 \([\s\S]*geo    80 [^\n]*35\.3 \("),
    ("2 of 10 INDI seeds lose their advantage", "m5_rotorpy/results.txt", r"indi: stylised -4\.15 \(10/10\); torque -1\.92 \(8/10\)"),
    ("puts 36 of 36 designs within 0.10 s of their flown rise in all seven conditions", "m7ai_lag_model/verdicts.txt", r"AI4 [^\n]*held; fewest 36/36"),
]
ARMS = [("M=1.00", -0.001, 9, 32), ("M=1.11", -0.012, 3, 22), ("M=1.25", -0.011, 0, 12), ("M=1.43", -0.010, 0, 13), ("M=1.67", -0.012, 0, 12)]


# section VII: table VII-1 is generated from the results files by table7() and must appear in DRAFT.md verbatim.
# Each row: (training plant lag shown, milestone, results file with the stress counts, set label, file with the step response or None).
TABLE7 = [
    ("33–78.2", "7v", "m7v_lag_rand/results.txt", "lagrand", None),
    ("36–72", "7t", "m7v_lag_rand/results.txt", "lag36", None),
    ("39.1–78.2", "7u", "m7ac_ceil125/results.txt", "lag39", "m7y_response/results.txt"),
    ("45–90", "7w", "m7z_floor75/results.txt", "lag45", "m7y_response/results.txt"),
    ("52–104", "7x", "m7z_floor75/results.txt", "lag52", "m7y_response/results.txt"),
    ("60–120", "7x", "m7z_floor75/results.txt", "lag60", "m7y_response/results.txt"),
    ("75–150", "7z", "m7ac_ceil125/results.txt", "lag75", "m7ac_ceil125/results.txt"),
    ("39.1–100", "7ab", "m7ac_ceil125/results.txt", "lag39c100", "m7ac_ceil125/results.txt"),
    ("39.1–125", "7ac", "m7ac_ceil125/results.txt", "lag39c125", "m7ac_ceil125/results.txt"),
    ("39.1–150", "7aa", "m7ac_ceil125/results.txt", "lag39c150", "m7ac_ceil125/results.txt"),
    ("39.1–200", "7ab", "m7ac_ceil125/results.txt", "lag39c200", "m7ac_ceil125/results.txt"),
]


def _stress(path, geom, label):
    text = open(os.path.join(EXP, path)).read().split("== step ==")[0]
    m = re.search(rf"\[{geom}, aware {label}\] [^\n]*mass ([\d.]+) kg[^\n]*\n((?:   [^\n]*\n?)+)", text)
    counts = {k: int(v) for k, v in re.findall(r"(\S+) ms D\^\S+ \([^)]*\): [^|]*45_2_cap +(\d+)", m[2])}
    return float(m[1]), counts


def _rise(path, geom, label):
    m = re.search(rf"mid 36 ms D\^0 {geom} aware {label}: settle [^;]*; rise90 ([\d.]+) s", open(os.path.join(EXP, path)).read())
    return float(m[1])


def table7():
    """Rows of table VII-1: identified total (L2-45 at 33 + 36 + 39.1 ms, of 1152), L2-45 at 75 ms (of 384), rise to 90% of a 1 m step at 36 ms, mass; above / below."""
    rows = []
    for lag, ms, path, label, resp in TABLE7:
        cells = {k: [] for k in ("id", "75", "rise", "mass")}
        for geom in ("above", "below"):
            mass, c = _stress(path, geom, label)
            cells["id"].append(str(c["33"] + c["36"] + c["39.1"]))
            cells["75"].append(str(c["75"]) if "75" in c else "—")
            cells["rise"].append(f"{_rise(resp, geom, label):.2f}" if resp else "—")
            cells["mass"].append(f"{mass:.2f}")
        f = lambda k: "—" if cells[k] == ["—", "—"] else ", ".join(cells[k])
        rows.append(f"| {lag} | {ms} | {f('id')} | {f('75')} | {f('rise')} | {f('mass')} |")
    return rows


def main():
    draft = open(os.path.join(HERE, "DRAFT.md")).read()
    bad = []
    for quote, path, rx in CHECKS:
        if quote not in draft:
            bad.append(f"DRAFT.md no longer quotes {quote!r}")
        if not re.search(rx, open(os.path.join(EXP, path)).read()):
            bad.append(f"{path} no longer matches {rx!r} (quoted as {quote!r})")
    sweep = open(os.path.join(EXP, "m7f_sweep", "results.txt")).read()
    for lab, dj, d45, d45l2 in ARMS:
        block = sweep.split(f"[{lab}]")[1].split("\n\n")[0]
        for rx in (rf"cap 20, lever 0: J [^;]*; minus unconstrained {dj:+.3f} ", rf"cap 45, lever 0: [^\n]*dead {d45} ", rf"cap 45, lever 2: [^\n]*dead {d45l2} "):
            if not re.search(rx, block):
                bad.append(f"m7f_sweep/results.txt [{lab}] no longer matches {rx!r}")
    m7g = open(os.path.join(EXP, "m7g_lever2", "results.txt")).read()
    base45, ideal45, room45, peaks = 0, 0, 0, []
    for lab in ("M=1.25", "M=1.43", "M=1.67"):
        line = re.search(rf"\[above, {re.escape(lab)}\](?:\n[^\n]*)*?\n  cap 45: dead base (\d+); dead85 \d+; ideal mixer (\d+); ideal mixer, 2x torque (\d+)[^\n]*\n[^\n]*peak D ([\d.]+) S 0\.50", m7g)
        if not line:
            bad.append(f"m7g_lever2/results.txt: no cap-45 rows for [above, {lab}]"); continue
        base45 += int(line[1]); ideal45 += int(line[2]); room45 += int(line[3]); peaks.append(line[4])
    if (base45, ideal45, room45) != (37, 8, 0) or not all(p in ("0.87", "0.88") for p in peaks):
        bad.append(f"m7g_lever2 pooled cap-45 counts {base45}/{ideal45}/{room45}, peaks {peaks}; draft quotes 37/8/0 and 0.87-0.88")
    for q in ("from 37 to\n8", "0.87–0.88", "against 0.50 in the survivors"):
        if q not in draft:
            bad.append(f"DRAFT.md no longer quotes {q!r}")
    row = "| held-out J − unconstrained, 20°, trained lever | 0 | " + " | ".join(f"{a[1]:.3f}".replace("-", "−") for a in ARMS) + " |"
    if row not in draft:
        bad.append(f"DRAFT.md table row differs from results: expected {row!r}")
    for r in table7():
        if r not in draft:
            bad.append(f"DRAFT.md table VII-1 row differs from results: expected {r!r}")
    for b in bad:
        print("FAIL", b)
    n = len(CHECKS) + 3 * len(ARMS) + 2 + len(TABLE7)
    print(f"{n - len(bad)} of {n} checks ok")
    return 1 if bad else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--table7"]:
        print("\n".join(table7()))
        sys.exit(0)
    sys.exit(main())
