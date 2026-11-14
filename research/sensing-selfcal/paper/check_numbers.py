"""Check each number quoted in draft.md against the stored result it came from.

    python3 paper/check_numbers.py      # stdlib only; exit 1 on any miss

Two kinds of check. ("json", file, path, value, places, claim): the value at `path` in the
experiment's summary file, rounded to `places`, must equal `value` (a rate is scaled to % first
when `value` is given as a percentage, see `pct`). ("log", text, claim): numbers that were computed by
an analysis script but stored only in its printed output (the LOG entry written from that output)
must appear verbatim in LOG.md. Every check also requires `claim` to appear in draft.md, so a number
edited in the draft without updating this table fails.
"""
import json, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
DRAFT = (HERE / "draft.md").read_text()
LOG = (ROOT / "LOG.md").read_text()
EXP = ROOT / "experiments"


def J(rel, path):
    o = json.loads((EXP / rel).read_text())
    parts = path.split("/")
    while parts:
        k = parts.pop(0)
        while isinstance(o, dict) and k not in o and parts:   # keys that contain "/" ("sb/left")
            k += "/" + parts.pop(0)
        o = o[int(k)] if isinstance(o, list) else o[k]
    return o


def pct(x):
    return 100 * x


CHECKS = [
    # Section 3
    ("json", "m1_real/summary.json", "cams/left/rel_gap_pct", -0.15, 2, None, "−0.15%"),
    ("json", "m1_real/summary.json", "cams/right/rel_gap_pct", -0.24, 2, None, "−0.24%"),
    ("json", "m1_real/summary.json", "cams/left/selfcal_f", 534.82, 2, None, "534.82 px"),
    ("json", "m1_real/summary.json", "cams/right/selfcal_f", 538.43, 2, None, "538.43"),
    ("json", "m1_real/summary.json", "cams/left/zhang_f", 535.62, 2, None, "535.62"),
    ("json", "m1_real/summary.json", "cams/right/zhang_f", 539.71, 2, None, "539.71"),
    ("json", "m1_real/summary.json", "cams/left/sigma_ratio", 1.12, 2, None, "1.12× Zhang's"),
    ("log", "0.0077 square widths rms", "0.77% of a square rms"),
    ("log", "correlate at 0.903", "(correlation 0.90)"),
    # Section 4
    ("json", "m2_spread/summary.json", "hypotheses/H2_rerun/m1_rms_z_same_subsets", 1.94, 2, None, "rms 1.94"),
    ("log", "rms z 1.94, 95% bootstrap 1.75–2.12", "rms 1.94 (95% bootstrap 1.75–2.12)"),
    ("json", "m2_spread/summary.json", "hypotheses/H2_rerun/zhang_rms_z", 2.16, 2, None, "gives 2.16"),
    ("json", "m3_robust/summary.json", "hypotheses/H8_nested/sf/rms_z", 2.28, 2, None, "rms z is still 2.28"),
    ("json", "m2_spread/summary.json", "hypotheses/H6/left/rho_spread_err", -0.46, 2, None, "−0.46 left"),
    ("json", "m2_spread/summary.json", "hypotheses/H6/right/rho_spread_err", -0.58, 2, None, "−0.58 right"),
    ("json", "m2_spread/summary.json", "hypotheses/H7/rms_z", 2.41, 2, None, "rises to 2.41"),
    ("json", "m2_spread/summary.json", "hypotheses/H7/zhang_rms_z", 5.83, 2, None, "rms z 5.83"),
    ("json", "m3_robust/summary.json", "hypotheses/H9/sf_cr_view/left/rms_z", 1.76, 2, None, "1.76 / 1.59"),
    ("json", "m3_robust/summary.json", "hypotheses/H9/sf_cr_view/right/rms_z", 1.59, 2, None, "1.76 / 1.59"),
    ("json", "m3_robust/summary.json", "hypotheses/H9/sf_jack/left/rms_z", 0.70, 2, None, "0.70 / 0.65"),
    ("json", "m3_robust/summary.json", "hypotheses/H9/sf_jack/right/rms_z", 0.65, 2, None, "0.70 / 0.65"),
    ("json", "m3_robust/summary.json", "hypotheses/H9/sf_jack/left/cover_2sigma", 97, 0, pct, "97% / 99%"),
    ("json", "m3_robust/summary.json", "hypotheses/H9/sf_jack/right/cover_2sigma", 99, 0, pct, "97% / 99%"),
    ("json", "m3_robust/summary.json", "hypotheses/H9/sf_jack/near_4to6/rms_z", 1.01, 2, None, "and 1.01 on near-critical"),
    ("json", "m3_robust/summary.json", "hypotheses/H9/sf/near_4to6/rms_z", 2.34, 2, None, "reported σ gives 2.34"),
    ("json", "m3_robust/summary.json", "hypotheses/H10/auc/sf_jack", 0.75, 2, None, "0.75 against 0.91"),
    ("json", "m3_robust/summary.json", "hypotheses/H10/auc/sf", 0.91, 2, None, "0.75 against 0.91"),
    ("json", "m3_robust/summary.json", "hypotheses/H10/n_bad", 22, 0, None, "only 22 bad"),
    ("json", "m5_lens/summary.json", "hypotheses/H12/k2/rms_z", 3.01, 2, None, "is 3.01"),
    ("json", "m5_lens/summary.json", "hypotheses/H12/k2/rms_z_without_top5", 2.00, 2, None, "(2.00 without five"),
    ("log", "k2 = 0.143 ± 0.018 (left)", "0.143 ± 0.018 left"),
    ("log", "along the board's columns 0.44–0.56", "(0.44–0.56 between neighbours"),
    # Section 5
    ("json", "m4_accept/summary.json", "hypotheses/H18/pooled/rate", 72.5, 1, pct, "fires on 72.5%"),
    ("json", "m4_accept/summary.json", "hypotheses/H19/pooled/rate", 6.5, 1, pct, "to 6.5% (10.8% left"),
    ("json", "m4_accept/summary.json", "hypotheses/H19/left/rate", 10.8, 1, pct, "10.8% left"),
    ("json", "m4_accept/summary.json", "hypotheses/H19/right/rate", 2.1, 1, pct, "2.1% right"),
    ("json", "m4_accept/summary.json", "hypotheses/H21/0.99/rate", 11.7, 1, pct, "only 10–12%"),
    ("json", "m4_accept/summary.json", "hypotheses/H21/1.01/rate", 10.0, 1, pct, "only 10–12%"),
    ("log", "2.33 / 4.56 / 2.51 (right)", "4.6× for the right"),
    ("json", "m4b_viewcov/summary.json", "hypotheses/H24/subpix11/rate", 37.8, 1, pct, "36–38%"),
    ("json", "m4b_viewcov/summary.json", "hypotheses/H24/sb/rate", 36.1, 1, pct, "36–38%"),
    ("json", "m4b_viewcov/summary.json", "hypotheses/H23/subpix11/rate", 74.2, 1, pct, "36–74% false alarms"),
    ("json", "m4b_viewcov/summary.json", "hypotheses/H25/subpix11/pooled/rate", 2.5, 1, pct, "fires on 2.5% (11×11"),
    ("json", "m4b_viewcov/summary.json", "hypotheses/H25/sb/pooled/rate", 1.7, 1, pct, "and 1.7% (SB"),
    ("json", "m4b_viewcov/summary.json", "hypotheses/H26/subpix11/J/rate", 30, 0, pct, "caught in\n30% of splits"),
    ("json", "m4c_reference/summary.json", "thresholds/subpix11/right/zf2_99", 1.7, 1, None, "1.7–4.2"),
    ("json", "m4c_reference/summary.json", "thresholds/sb/left/zf2_99", 4.2, 1, None, "1.7–4.2"),
    ("json", "m4c_reference/summary.json", "hypotheses/H28/subpix11/rate", 0, 0, pct, "0 false alarms in 360"),
    ("json", "m4c_reference/summary.json", "hypotheses/H29/subpix11/kept", 19, 0, pct, "only 19–22%"),
    ("json", "m4c_reference/summary.json", "hypotheses/H29/sb/kept", 22, 0, pct, "only 19–22%"),
    ("json", "m4c_reference/summary.json", "hypotheses/H31/subpix11/rate", 5, 0, pct, "only\n5–10% of splits"),
    ("json", "m4c_reference/summary.json", "hypotheses/H31/sb/rate", 10, 0, pct, "only\n5–10% of splits"),
    ("log", "detects ±2% at k = 6 in 41% / 28% (11×11, −2% / +2%) and 40% / 31% (SB), and ±4% in 78–85%",
     "detects ±2% in 28–41% and ±4%\nin 78–85%"),
    # Section 6
    ("log", "moves flat-board Zhang's f by 4.8 px (left) and 7.2 px (right), 0.9–1.3%", "4.8 px (left) and 7.2 px (right), 0.9–1.3%"),
    ("json", "m6b_render/summary.json", "real/left/gap11_sb_ring_over1", 22, 0, None, "on 22 (left)"),
    ("json", "m6b_render/summary.json", "real/right/gap11_sb_ring_over1", 30, 0, None, "and 30 (right)"),
    ("json", "m6b_render/summary.json", "calib/left/check_edge", 0.949, 3, None, "0.949 / 0.960 px"),
    ("json", "m6b_render/summary.json", "calib/right/check_edge", 0.960, 3, None, "0.949 / 0.960 px"),
    ("log", "max 0.19 / 0.36 px", "0.19 / 0.36 px"),
    ("log", "0.49–0.53 of the corner spacing", "0.49–0.53 of the\ncorner spacing"),
    ("log", "+0.43% to +1.47%", "+0.43% to +1.47%"),
    ("log", "−0.32% to −0.43%", "−0.32% to −0.43%"),
    ("log", "+0.64% / +0.91%", "+0.64% / +0.91%"),
    ("log", "−0.12% / −0.39%", "−0.12% / −0.39%"),
    ("log", "max 3.5–9.6 px", "(up to 9.6 px)"),
    ("json", "m6b_render/summary.json", "real/left/zhang_f/subpix5", 532.9, 1, None, "532.9 px (left)"),
    ("json", "m6b_render/summary.json", "real/right/zhang_f/subpix5", 536.2, 1, None, "536.2 px (right)"),
    # Section 7
    ("json", "m4d_window/summary.json", "hypotheses/H39/subpix11", 1.02, 2, pct, "| 1.02% |"),
    ("json", "m4d_window/summary.json", "hypotheses/H39/sb", 0.86, 2, pct, "| 0.86% |"),
    ("json", "m4d_window/summary.json", "hypotheses/H39/subpix5", 0.59, 2, pct, "| 0.59% |"),
    ("json", "m4d_window/summary.json", "hypotheses/H40/subpix11/rate", 34.2, 1, pct, "| 34.2% |"),
    ("json", "m4d_window/summary.json", "hypotheses/H40/sb/rate", 35.4, 1, pct, "| 35.4% |"),
    ("json", "m4d_window/summary.json", "hypotheses/H40/subpix5/rate", 61.3, 1, pct, "| 61.3% |"),
    ("json", "m4d_window/summary.json", "hypotheses/H42/subpix11/rate", 30.3, 1, pct, "| 30.3% |"),
    ("json", "m4d_window/summary.json", "hypotheses/H42/sb/rate", 74.7, 1, pct, "| 74.7% |"),
    ("json", "m4d_window/summary.json", "hypotheses/H42/subpix5/rate", 79.4, 1, pct, "| 79.4% |"),
    ("json", "m4d_window/summary.json", "hypotheses/H38/pooled/rate", 1.7, 1, pct, "(1.7% false alarms pooled)"),
    ("json", "m4d_window/summary.json", "hypotheses/H41/left/rate", 11.1, 1, pct, "11.1% on the left camera"),
    ("json", "m4d_window/summary.json", "hypotheses/H41/right/rate", 0.0, 1, pct, "0.0% on the right"),
    ("log", "±1% in 28% / 18%", "1% focal change in 18–28%"),
    ("log", "±4% in 98% / 97%", "4% in 97–98%"),
    ("log", "own 99th percentile of z<sub>f</sub>² is 3.56, the right's 1.03", "3.56 and 1.03"),
    # Section 7, milestone 4e (per-unit split-half scale)
    ("json", "m4e_selfscale/summary.json", "hypotheses/H43/left/rate", 0.6, 1, pct, "(0.6% / 0.0% false alarms)"),
    ("json", "m4e_selfscale/summary.json", "hypotheses/H44/pooled/rate", 0.8, 1, pct, "in 0.8% of splits"),
    ("json", "m4e_selfscale/summary.json", "hypotheses/H45/left/pred_sd_pct", 1.94, 2, None, "predicted sd 1.94% / 2.62%"),
    ("json", "m4e_selfscale/summary.json", "hypotheses/H45/right/pred_sd_pct", 2.62, 2, None, "predicted sd 1.94% / 2.62%"),
    ("json", "m4e_selfscale/summary.json", "hypotheses/H45/left/real_sd_pct", 0.67, 2, None, "real 0.67% / 0.50%"),
    ("json", "m4e_selfscale/summary.json", "hypotheses/H45/right/real_sd_pct", 0.50, 2, None, "real 0.67% / 0.50%"),
    ("json", "m4e_selfscale/summary.json", "spread_by_n_post_hoc/subpix5/left/3/per_view_pct", 3.29, 2, None, "3.29% / 5.21% at 3 views"),
    ("json", "m4e_selfscale/summary.json", "spread_by_n_post_hoc/subpix5/right/3/per_view_pct", 5.21, 2, None, "3.29% / 5.21% at 3 views"),
    ("json", "m4e_selfscale/summary.json", "spread_by_n_post_hoc/subpix5/left/7/per_view_pct", 1.55, 2, None, "1.55% / 0.95% at 7"),
    ("json", "m4e_selfscale/summary.json", "spread_by_n_post_hoc/subpix5/right/7/per_view_pct", 0.95, 2, None, "1.55% / 0.95% at 7"),
    # Section 4, milestone 4f (set size)
    ("json", "m4f_setsize/summary.json", "hypotheses/H48/left/J_dp_4", 7.8, 1, None, "7.8× (left) and 8.2× (right)"),
    ("json", "m4f_setsize/summary.json", "hypotheses/H48/right/J_dp_4", 8.2, 1, None, "7.8× (left) and 8.2× (right)"),
    ("json", "m4f_setsize/summary.json", "ratios/left/4/J_a13", 6.7, 1, None, "(left 6.7 to 1.1, right 6.7 to 1.4)"),
    ("json", "m4f_setsize/summary.json", "ratios/left/10/J_a13", 1.1, 1, None, "(left 6.7 to 1.1, right 6.7 to 1.4)"),
    ("json", "m4f_setsize/summary.json", "ratios/right/4/J_a13", 6.7, 1, None, "(left 6.7 to 1.1, right 6.7 to 1.4)"),
    ("json", "m4f_setsize/summary.json", "ratios/right/10/J_a13", 1.4, 1, None, "(left 6.7 to 1.1, right 6.7 to 1.4)"),
    ("json", "m4f_setsize/summary.json", "ratios/left/4/J_a13_robust", 2.4, 1, None, "only 2.4× and 4.1× at 4 views"),
    ("json", "m4f_setsize/summary.json", "ratios/right/4/J_a13_robust", 4.1, 1, None, "only 2.4× and 4.1× at 4 views"),
    ("log", "0.17–0.24 (left)", "4–6× too\nsmall on the left camera"),
    ("log", "1.22, 1.40, 1.66 (right, outside at 5 and 6)", "(1.22–1.66 at 4–6 views)"),
    ("log", "7–8× at 4 views to 1.1–1.4× at 10", "(7–8× at 4 views, 1.1–1.4× at 10)"),
    # Section 7 and abstract, milestone 4g (every split, robust jackknife)
    ("json", "m4g_allsplits/summary.json", "posthoc/m4d_threshold/m4b_60_splits/pm2_k6", 61.25, 2, pct, "(61.25%)"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H52/J_E1_pm2_k6", 43.3, 1, pct, "43.3% (left 56–61%, right 26–30%)"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H52/J_E1_pm2_k6", 43, 0, pct, "reaches 43% on every split"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H52/E1_S0_left", 4.4, 1, pct, "with 4.4% false alarms on the left camera"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H52/J_chi2_pm2_k6", 17.7, 1, pct, "| 17.7% |"),
    ("json", "m4g_allsplits/summary.json", "E1_thresholds/left", 4.62, 2, None, "4.62 and 2.02"),
    ("json", "m4g_allsplits/summary.json", "E1_thresholds/right", 2.02, 2, None, "4.62 and 2.02"),
    ("json", "m4g_allsplits/summary.json", "posthoc/m4d_threshold/all_splits/pm2_k6", 57.8, 1, pct, "57.8% and 10.4%"),
    ("json", "m4g_allsplits/summary.json", "posthoc/m4d_threshold/all_splits/S0_left", 10.4, 1, pct, "57.8% and 10.4%"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H53/left", 0.88, 2, None, "0.88× (left) and 0.48×"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H53/right", 0.48, 2, None, "0.88× (left) and 0.48×"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H53/left_J", 0.57, 2, None, "0.57× and 0.31×"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H53/right_J", 0.31, 2, None, "0.57× and 0.31×"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H55/R_chi2_pm2_k6", 53.8, 1, pct, "| 53.8% |"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H55/R_chi2_pm2_k6", 54, 0, pct, "in 54% of splits at 2.3%"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H54/left", 3.4, 1, pct, "| 3.4% / 1.2% |"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H54/right", 1.2, 1, pct, "| 3.4% / 1.2% |"),
    ("log", "R catches ±2% in 32.0% pooled (E<sub>1</sub> 27.7%, J 8.9%)", "| 8.9% | 27.7% | 32.0% |"),
    ("log", "it is 2.3%, the same as the borrowed threshold's 2.4% and well above J's 0.3%", "| 0.3% | 2.4% | 2.3% |"),
    ("log", "R against χ²<sub>1</sub>, ±2% at k = 6 pooled: 53.8% (left 50.0–50.1%, right 54.3–61.0%)", "(±2%: 50% left, 54–61% right)"),
    ("log", "±4% in 92.7–94.1%", "92.7–94.1%"),
    ("log", "every variant is weak (13% at most)", "13% of splits at most"),
    # Section 7, abstract and recommendations, milestone 4h (model reference for the robust jackknife)
    ("json", "m4h_modelref/summary.json", "references/normal/7+6/R", 18.45, 2, None, "18.45 at 7 + 6 views"),
    ("json", "m4h_modelref/summary.json", "references/normal/7+6/R", 18.45, 2, None, "reference (18.45 at 7 + 6 views)"),
    ("json", "m4h_modelref/summary.json", "references/normal/7+4/R", 25.84, 2, None, "(25.84 at 7 + 4)"),
    ("json", "m4h_modelref/summary.json", "references/normal/7+6/pR_chi2", 6.1, 1, pct, "fires on 6.1% of unchanged updates"),
    ("json", "m4h_modelref/summary.json", "references/normal/7+6/pR_chi2", 6.1, 1, pct, "would give that test 6.1% false alarms"),
    ("json", "m4h_modelref/summary.json", "references/normal/7+4/pR_chi2", 8.5, 1, pct, "(8.5% at 7 + 4)"),
    ("json", "m4h_modelref/summary.json", "real_false_alarms_R_chi2/7+6/left", 3.1, 1, pct, "(3.1% / 0.2% at k = 6)"),
    ("json", "m4h_modelref/summary.json", "real_false_alarms_R_chi2/7+6/right", 0.2, 1, pct, "(3.1% / 0.2% at k = 6)"),
    ("json", "m4h_modelref/summary.json", "large_sets/10/pR_chi2", 3.8, 1, pct, "3.8% false alarms at 10 + 10 views"),
    ("json", "m4h_modelref/summary.json", "large_sets/20/pR_chi2", 2.2, 1, pct, "2.2% at 20 + 20"),
    ("json", "m4h_modelref/summary.json", "hypotheses/H57/R_normal_pm2_k6", 18.6, 1, pct, "| 53.8% | 18.6% | 8.6% |"),
    ("json", "m4h_modelref/summary.json", "hypotheses/H57/R_normal_pm2_k6", 19, 0, pct, "catches the 2% change in 19% of splits"),
    ("json", "m4h_modelref/summary.json", "hypotheses/H56/left", 0.45, 2, pct, "| 0.45% / 0.20% |"),
    ("json", "m4h_modelref/summary.json", "hypotheses/H56/right", 0.20, 2, pct, "| 0.45% / 0.20% |"),
    ("log", "the plain jackknife against its own model reference catches ±2% at k = 6 in only 8.6% pooled", "| 53.8% | 18.6% | 8.6% |"),
    ("log", "catches ±4% in 66.4–75.1% of splits (χ²<sub>1</sub>: 92.2–94.3%)", "| 92.2–94.3% | 66.4–75.1% |"),
    ("log", "0.45% (left) and 0.20% (right) false alarms", "the test stays at 0.2–0.5% false alarms"),
    # Section 7, abstract and recommendations, milestone 4i (a reference from the unit's linearised twin)
    ("json", "m4i_geomref/summary.json", "hypotheses/H61/R_geom_pm2_k6", 33.1, 1, pct, "| 18.6% | 33.1% | 34.7% | 30.8% |"),
    ("json", "m4i_geomref/summary.json", "hypotheses/H61/R_geom_pm2_k6", 33, 0, pct, "catches a 2% change from 6 views in 33% of splits"),
    ("json", "m4i_geomref/summary.json", "hypotheses/H61/R_geom_pm2_k6", 33, 0, pct, "lifts detection to 33% at 0.4–1.4% false alarms"),
    ("json", "m4i_geomref/summary.json", "hypotheses/H60/left", 1.44, 2, pct, "| 1.44% / 0.37% |"),
    ("json", "m4i_geomref/summary.json", "hypotheses/H60/right", 0.37, 2, pct, "| 1.44% / 0.37% |"),
    ("json", "m4i_geomref/summary.json", "hypotheses/H62/left", 1.67, 2, None, "vary 1.65–1.67×"),
    ("json", "m4i_geomref/summary.json", "hypotheses/H62/right", 1.65, 2, None, "vary 1.65–1.67×"),
    ("json", "m4i_geomref/summary.json", "spearman_q_vs_real_z2_k6/left", 0.24, 2, None, "(Spearman 0.24 / 0.10)"),
    ("json", "m4i_geomref/summary.json", "spearman_q_vs_real_z2_k6/right", 0.10, 2, None, "(Spearman 0.24 / 0.10)"),
    ("json", "m4i_geomref/summary.json", "posthoc_twin_scale_ratio/7+6/left/R", 0.75, 2, None, "0.75 / 0.76 at 7 + 6"),
    ("json", "m4i_geomref/summary.json", "posthoc_twin_scale_ratio/7+6/right/R", 0.76, 2, None, "0.75 / 0.76 at 7 + 6"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H53/left", 0.88, 2, None, "against 0.88 / 0.48 measured"),
    ("json", "m4g_allsplits/summary.json", "hypotheses/H53/right", 0.48, 2, None, "against 0.88 / 0.48 measured"),
    ("json", "m4i_geomref/summary.json", "references/resid/7+6/left/own/qR_quantiles/2", 10.93, 2, None, "10.93 / 12.49 at 7 + 6"),
    ("json", "m4i_geomref/summary.json", "references/resid/7+6/right/own/qR_quantiles/2", 12.49, 2, None, "10.93 / 12.49 at 7 + 6"),
    ("json", "m4i_geomref/check.json", "H59/holds", True, 0, None, "matches the solver's to within 0.2% for 4 to 7 views"),
    ("log", "R 30.8% at 1.60% / 0.66%", "| 1.60% / 0.66% |"),
    ("log", "±2% at k = 6 in 34.7%, false alarms 1.59% / 0.35%", "| 1.59% / 0.35% |"),
    ("log", "±4% at k = 6: 81.2–84.7%", "| 81.2–84.7% |"),
    ("log", "9,600 cold-start nonlinear solves", "On 9,600 cold-start nonlinear solves"),
]


def main():
    bad = 0
    for c in CHECKS:
        claim = c[-1]
        if claim not in DRAFT:
            print("MISSING IN DRAFT", repr(claim)); bad += 1; continue
        if c[0] == "log":
            if c[1] not in LOG:
                print("NOT IN LOG", repr(c[1])); bad += 1
            continue
        _, rel, path, value, places, scale, _ = c
        got = J(rel, path)
        got = scale(got) if scale else got
        if round(got, places) != round(value, places):
            print(f"MISMATCH {rel}:{path} = {got!r}, draft says {value} ({claim!r})"); bad += 1
    print(f"{len(CHECKS) - bad} of {len(CHECKS)} checks pass")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
