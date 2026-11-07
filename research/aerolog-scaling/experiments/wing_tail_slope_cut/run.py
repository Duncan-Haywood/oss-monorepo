"""Milestone 8g: does 7d's tail redesign survive a NeuralFoil slope error on the WING as well as the tail?

    /usr/bin/python3.13 experiments/wing_tail_slope_cut/run.py > experiments/wing_tail_slope_cut/results.txt

8f cut only the tail slope. Here the wing slope is cut by the same fraction (cut = 0, 10, 20, 25%),
tail cut 20% throughout from cut>0 (8c to 8e: NeuralFoil 1.2 to 1.3 x UIUC slope at Re 1e5 to 2e5).
Predictions, fixed before the first run:
 P1  With wing and tail slopes both cut 20%, at least 4 of the 17 wings keep a tail within 5% (prior 60%).
 P2  The k = 1.0, AR 12 wings keep a passing tail at wing cut 20% (prior 65%).
 P3  The set of wings with a passing tail is unchanged from 7d's 6 at wing cut 20% (prior 50%).
Refuted: P1 fewer than 4; P2 either k = 1.0 wing loses all tails; P3 the set differs.
Cut 0 must reproduce tail_search/results.txt (6 wings, 78 tails).
"""
import sys

src = open("experiments/tail_search/run.py").read().rsplit("\nmain()", 1)[0]
a = "tail = (nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05))"
b = "wing = (nm.cd_at(af, re_w, cl), nm.slope_at(af, ar, re_w, cl))"
assert a in src and b in src
src = src.replace(a, "tail = (TAIL_F * nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05))")
src = src.replace(b, "wing = (nm.cd_at(af, re_w, cl), WING_F * nm.slope_at(af, ar, re_w, cl))")
ts = type(sys)("ts")
ts.__dict__.update(__name__="ts", TAIL_F=1.0, WING_F=1.0)
exec(compile(src, "ts", "exec"), ts.__dict__)

for wc, tc in ((0.0, 0.0), (0.10, 0.20), (0.20, 0.20), (0.25, 0.20), (0.25, 0.25)):
    ts.WING_F, ts.TAIL_F = 1.0 - wc, 1.0 - tc
    print(f"=== wing slope cut {100*wc:.0f}%, tail slope cut {100*tc:.0f}% ===")
    ts.main()
    print()
