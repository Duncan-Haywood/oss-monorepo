"""Milestone 8f: does 7d's tail redesign survive NeuralFoil's too-steep tail lift slope?

    /usr/bin/python3.13 experiments/tail_slope_cut/run.py > experiments/tail_slope_cut/results.txt

Predictions, fixed before the first run (7d's result: 6 of 17 power-matched wings have a tail within 5%
on phugoid, short period and damping; 78 of 4,474 tails pass; the k = 1.0 AR 12 wings pass 23 each):
 P1  With every tail lift-curve slope cut by 20% (8c to 8e measured NeuralFoil 1.2 to 1.3 times the
     UIUC slope at Re 1e5 to 2e5), the number of tails within 5% falls, but at least 4 of the 17
     wings keep one (prior 65%).
 P2  The count of passing tails is monotone non-increasing from cut 0 to 25% (prior 70%; the grid can
     re-select area and arm, so it need not be).
 P3  The k = 1.0, AR 12 wings (NACA 4412 and 5406) keep a passing tail at every cut up to 25%
     (prior 75%).
Refuted: P1 fewer than 4 wings at cut 20%; P2 any increase; P3 either k = 1.0 wing loses all tails.
Cut 0 must reproduce tail_search/results.txt (6 wings, 78 tails).
"""
import sys

src = open("experiments/tail_search/run.py").read().rsplit("\nmain()", 1)[0]
src = src.replace("tail = (nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05))",
                  "tail = (CUT_F * nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05))")
assert "CUT_F *" in src
ts = type(sys)("ts")
ts.__dict__["__name__"] = "ts"
ts.__dict__["CUT_F"] = 1.0
exec(compile(src, "ts", "exec"), ts.__dict__)

CUTS = (0.0, 0.10, 0.15, 0.20, 0.25)
for cut in CUTS:
    ts.CUT_F = 1.0 - cut
    print(f"=== tail lift-curve slope cut by {100*cut:.0f}% ===")
    ts.main()
    print()
