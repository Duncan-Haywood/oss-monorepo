"""Check that each number quoted in draft.md appears in the results file it came from.

Run: python3 paper/check_numbers.py   (stdlib only; exit 1 on any miss)
Each entry is (results file, text that must appear in it, text that must appear in draft.md).
"""
import pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent.parent
DRAFT = (HERE / "paper" / "draft.md").read_text()
SB = "experiments/m6_shift_bound/results/summary.md"
CA = "experiments/m6_calibration/results/summary.md"
AL = "experiments/m6_allocation/results/summary.md"
IN = "experiments/m6_intervals/results/summary.md"
PR = "experiments/m6_prior/results/summary.md"
KS = "experiments/m6_kindsel/results/summary.md"
FR = "experiments/m6_fresh_items/results/summary.md"
DV = "experiments/m6_design_variance/results/summary.md"
DS = "experiments/m6_design_shrinkage/results/summary.md"
LL = "experiments/m5_local_llm/results/summary.md"
LS = "experiments/m5_local_llm/results/scale_summary.md"
CHECKS = [
    (LL, "| LLM15 | 0.569 (", "median AUC of 0.569"),
    (LL, "| GBM_full | 0.780 (", "0.780 for the transferred model"),
    (LL, "| LLM15 | 0.569 (0.537&ndash;0.589) | 32.84 (", "32.84 points zero-shot"),
    (LL, "| 0.990 (0.984", "variance ratio 0.990"),
    (LL, "Spearman(predicted gap, true gap) = 0.345", "Spearman 0.345"),
    (LL, "slope of predicted on true gap 0.09", "slope of 0.09"),
    (LL, "| LLM15_shift | &mdash; | 9.35 (", "misses by 9.35 points"),
    (LL, "| GBM_full | 0.780 (0.755&ndash;0.790) | 5.11 (", "against 5.11 for the transferred model"),
    (LL, "74 cells (pair x item)", "Over 74 cells"),
    (LS, "| LLM3 | 3.09 | 0.556 (", "Spearman 0.556"),
    (LS, "| LLM3 | 3.09 | 0.556 (2.7e-07) | 0.02 (", "slope of 0.02"),
    (LS, "| LLM3_shift | &mdash; | 12.27 (", "misses by 12.27 points"),
    (LS, "| LLM3 | 0.560 (0.545&ndash;0.577) | 61.43 (", "61.43 points zero-shot"),
    (LS, "(87.2% of its", "87% of its scores"),
    (LS, "slope 1.30 (", "a slope of 1.30 overall"),
    (SB, "241 cells", "241 source-to-target cells"),
    (SB, "| E0 transfer as is | 5.59 |", "5.59 points on average"),
    (SB, "median |A-hat| (covariate shift, label-free) 0.83 points; |A-hat| < |B-hat| in 77% of cells", "|Â| < |B̂| in 77% of cells"),
    (SB, "median |B-hat| (concept shift) 3.45 points", "concept-shift part 3.45"),
    (SB, "median |b| 4.08", "median |b| is 4.08"),
    (SB, "-0.35 [-0.74, +0.01]", "−0.74 to +0.01"),
    (SB, "-0.33 [-0.69, +0.04]", "IW 0.33 (−0.69 to +0.04)"),
    (SB, "| E1 source share | 10.90 |", "E1 (10.90)"),
    (SB, "| E2 median offset of asked items | 5.18 |", "E2 (5.18)"),
    (SB, "| E3 signed, similarity-weighted offset | 5.24 |", "E3 (5.24)"),
    (SB, "Spearman(|E3 - E0|, |b|) = 0.11", "Spearman 0.11"),
    (SB, "71% of cells", "sign is right in 71% of cells"),
    (SB, "effective sample fraction 0.33", "effective sample fraction is 0.33"),
    (CA, "0.830 (pair-cluster bootstrap 95% 0.798 to 0.852", "0.830 (pair-cluster bootstrap 0.798 to 0.852"),
    (CA, "quartiles 0.732, 0.899", "quartiles 0.732 and 0.899"),
    (CA, "cells with ratio < 1: 98%", "below 1 in 98% of cells"),
    (CA, "median 91, quartiles 27 to 317", "n* is 91 (quartiles 27 to 317"),
    (CA, "| tradition | 144 | 0.818 | 18% | 58 |", "tradition pairs 58"),
    (CA, "| ethnicity | 13 | 0.853 | 15% | 204 |", "Hispanic 204"),
    (CA, "137; analytic n* within a factor 2 of it in 99% (median analytic/simulated 0.71)", "137 cells"),
    (CA, "| samesex_marr_no | 19 | 33% | 38 | 1333 | 811 |", "same-sex marriage 33%"),
    (CA, "| ever_divorced | 20 | 4% |", "ever divorced 4%"),
    (CA, "| premarsx_wrong | 20 | 22% | 56 | 889 | 676 |", "676 (premarital sex)"),
    (CA, "| pope_infallible | 5 | 6% | 314 | 1538 | 1431 |", "1,431 (papal infallibility)"),
    (CA, "| afterlife | 20 | 6% | 121 | 812 |", "812 to 1,538"),
    (CA, "| 25 | 241 | 10.99 | 9.65 | 9.69 | 9.56 | 4.08 | 1.002 | 0.997 | 96% | 88.4% | 90.0% |", "90.0% at n = 25"),
    (CA, "| 93.3% |", "93.3, 94.1 and 94.5%"),
    (AL, "73 families", "73 families of 2 to 4"),
    (AL, "| M_eq: plain mean, equal split | 1.226", "| 1.226 |"),
    (AL, "| D_ney: difference, Neyman split | 0.993", "| 0.993 |"),
    (AL, "| C_or: oracle composite, water-filled | 0.259", "| 0.259 | 0.559 |"),
    (AL, "| FH_fam: shrinkage, tau2 from the family | 0.657", "| 0.657 | 1.044 |"),
    (AL, "| FH_prior: shrinkage, tau2 from other items | 0.501 (0.443&ndash;0.546)", "0.501 (0.443–0.546)"),
    (AL, "| FH2: shrinkage, pilot then water-filled | 0.518", "| 0.518 | 0.909 |"),
    (AL, "| D_eq | 6.75 |", "D's 6.75"),
    (AL, "| FH_prior | 4.66 |", "4.66 points"),
    (AL, "| FH_prior | 0.747 |", "0.747 at 50"),
    (IN, "| FH_naive: shrinkage, naive interval | 93.8% | 93.7% | 93.7% | 94.9% |", "| naive posterior | 93.8% | 93.7% | 93.7% | 94.9% |"),
    (IN, "| FH_robust: shrinkage, robust EB interval | 96.8% | 95.1% | 94.1% | 95.0% |", "| robust EB | 96.8% | 95.1% | 94.1% | 95.0% |"),
    (IN, "| FH_cmse: shrinkage, conditional-MSE interval | 89.1% | 92.1% | 93.9% | 94.5% |", "| 89.1% | 92.1% | 93.9% | 94.5% |"),
    (IN, "| FH_robust | 0.832 |", "| 0.832 |"),
    (IN, "| D | 13.57 |", "13.57 points"),
    (IN, "| FH_robust | 11.39 |", "11.39 against"),
    (IN, "| 4 to inf | 12 | 44.7% | 63.8% |", "63.8% of the time (naive 44.7%)"),
    (IN, "87.2% of rows within 10%", "87.2% of group-budget rows"),
    (IN, "94.7% within 10%", "94.7% once"),
    (PR, "| COL | 0.766 (0.52&ndash;1.03)", "| COL | 0.766 (0.52–1.03) | 1.533 | 0.259 | 1.048 |"),
    (PR, "| ADD | 0.725 (0.46&ndash;1.05)", "| ADD | 0.725 (0.46–1.05) | 1.631 | 0.299 | 0.911 |"),
    (PR, "| LR | 0.818 (0.74&ndash;0.89)", "| LR | 0.818 (0.74–0.89) | 1.019 | 0.433 | 1.108 |"),
    (PR, "| period | 45 | 1.116 | 0.259 | 0.299 | 0.433 | 0.259 | 0.272 |", "0.259 against 0.272"),
    (PR, "| generation | 38 | 0.942 | 1.533 | 1.631 | 1.019 |", "| GRP | 1.050 | 0.942 | 1.116 | 1.014 |"),
    (PR, "| oracle | 0.529 (0.39&ndash;0.69)", "| known-bias oracle | 0.529 | 0.715 | 0.272 | 0.712 |"),
    (PR, "| period | 11.7 | 11.7 | 4.7 |", "4.7 points RMS"),
    (PR, "| ADD | 93.3% |", "93.3% of the time"),
    (KS, "| COL | 0.977 |", "COL 0.977"),
    (KS, "| ADD | 0.944 |", "ADD 0.944"),
    (KS, "| KSEL | 0.826 (0.74&ndash;0.95)", "0.826 of P0's at n̄ = 50 (0.74–0.95)"),
    (KS, "| RULE / P0 | 0.648 | 0.709 | 0.792 | 0.993 |", "| in-sample (13 old items) | 0.648 | 0.709 | 0.792 | 0.993 |"),
    (KS, "| tradition | samesex_marr_no | 12 | LR | 4.62 |", "4.62 and 3.07"),
    (KS, "| generation | ever_divorced | 3 | LR | 3.07 |", "4.62 and 3.07"),
    (FR, "reproduces 228 of 228 cells", "all 228 earlier cells"),
    (FR, "| RULE | 0.846 (0.76&ndash;0.92) | 0.874 (0.80&ndash;0.94) | 0.901 (0.86&ndash;0.95) | 0.988", "| 0.846 (0.76–0.92) | 0.874 | 0.901 | 0.988 | 98.5% |"),
    (FR, "| RULE | 0.868 (0.81&ndash;0.93) | 0.900 (0.85&ndash;0.95) | 0.934 (0.90&ndash;0.97) | 0.998", "| 0.868 (0.81–0.93) | 0.900 | 0.934 | 0.998 | 98.9% |"),
    (FR, "| RULE | 98.5% (2%)", "98.5% |"),
    (FR, "| RULE | 98.9% (0%)", "98.9% |"),
    (FR, "| period | 28 | 0.383", "COL 0.383"),
    (FR, "| period | 24 | 0.487", "0.487 on the secondary"),
    (FR, "LR | RULE | oracle |\n|---|---:|---:|---:|---:|---:|---:|\n| generation | 21 | 1.453 (1.34&ndash;1.71) | 1.289 (1.14&ndash;1.65) | 0.787", "generation 0.787"),
    (FR, "| tradition | 84 | 1.092 (1.09&ndash;1.10) | 1.059 (0.95&ndash;1.18) | 0.768", "tradition 0.768"),
    (FR, "| primary, RULE_LR / P0 | 0.655 |", "scores 0.655"),
    (FR, "| 13 old items (in-sample), RULE_LR / P0 | 0.745 |", "0.745 on the old ones"),
    (DV, "median deff of y: 1.058 (1.047 to 1.071)", "median 1.058 (pair-cluster bootstrap 1.047 to 1.071)"),
    (DV, "median deff of the residual y - f: 1.024", "and 1.024 for the residual"),
    (DV, "median target rows per PSU: 2.26", "2.26 respondents per PSU"),
    (DV, "below 1 in 78% of cells", "smaller for the residual in 78% of cells"),
    (DV, "design 0.811 (0.781 to 0.834)", "0.811 (0.781 to 0.834)"),
    (DV, "| 50 | 241 | 0.015 | 0.833 | 0.834 (0.806 to 0.855) | 1.036 | 0.935 | 0.932 |", "0.834 at n = 50"),
    (DV, "| 50 | 241 | 0.015 | 0.833 | 0.834 (0.806 to 0.855) | 1.036 | 0.935 | 0.932 |", "1.036 at n = 50"),
    (DV, "| 400 | 217 | 0.110 | 0.830 | 0.863 (0.836 to 0.882) | 1.085 | 0.989 | 0.849 |", "0.863 at n = 400 (0.836 to 0.882)"),
    (DV, "| 400 | 217 | 0.110 | 0.830 | 0.863 (0.836 to 0.882) | 1.085 | 0.989 | 0.849 |", "Kish variance falls to 0.849"),
    (DV, "| 400 | period | 34 | 0.238 | 0.865 | 1.185 |", "1.17 to 1.19"),
    (DV, "| 400 | generation | 34 | 0.227 | 0.901 | 1.165 |", "1.17 to 1.19"),
    (DS, "228 of 228 cells matched", "all 228 cells of Section 6 refitted and matched"),
    (DS, "median V_f / V_y: 0.209", "median V_f/V_y 0.209"),
    (DS, "median correlation of eps_f and eps_y: 0.453", "correlation of the two errors 0.453"),
    (DS, "| share of D's population MSE that is V_y | 0.039 |", "against 4% of D's"),
    (DS, "| share of P0's population MSE that is phase 1 | 0.030 |", "phase 1 is 3% of the shrunk"),
    (DS, "| sample share | 0.472 |", "0.471 against 0.472"),
    (DS, "| population share | 0.471 |", "0.471 against 0.472"),
    (DS, "| population share, Kish gamma | 0.635 |", "0.635 against 0.641"),
    (DS, "| RULE | population | 0.649 |", "0.649 against 0.648"),
    (DS, "| COL | population | 0.767 | 0.792 | 0.839 | 1.015 | 0.265 |", "period COL 0.265"),
    (DS, "| robust EB, Kish v, scored on the population share | 96.6% | 94.5% | 93.0% | 93.6% |", "averages 93.0% at n̄ = 200 and 93.6% at 400"),
    (DS, "| 10th percentile, Kish v, population | 95.3% | 91.5% | 89.6% | 90.6% |", "lowest decile of 89.6 to 90.6%"),
    (DS, "| generation | 33 | 92.6% | 94.9% | 0.197 |", "92.6% and 92.5%"),
    (DS, "| period | 8 | 92.5% | 95.6% | 0.215 |", "92.6% and 92.5%"),
    (DS, "| robust EB, design-aware (v + V_y) | 96.8% | 95.1% | 94.1% | 95.0% |", "restores 96.8%, 95.1%, 94.1% and 95.0%"),
    (DS, "| median half-width design-aware / Kish | 1.009 | 1.015 | 1.028 | 1.034 |", "0.9 to 3.4% more width"),
    (DS, "| median half-width design-aware / D's | 0.839 | 0.877 | 0.935 | 0.984 |", "0.839 of D's width at 50 and 0.984 at 400"),
    (DS, "| D, Kish interval | 94.6% | 94.2% | 93.6% | 93.5% |", "covers 93.5% at 400"),
]


def main():
    misses = 0
    cache = {}
    for path, src_text, draft_text in CHECKS:
        if path not in cache:
            cache[path] = (HERE / path).read_text()
        if src_text not in cache[path]:
            print(f"MISS in {path}: {src_text!r}")
            misses += 1
        if draft_text not in DRAFT:
            print(f"MISS in draft.md: {draft_text!r}")
            misses += 1
    print(f"{len(CHECKS)} checks, {misses} misses")
    return 1 if misses else 0


if __name__ == "__main__":
    sys.exit(main())
