"""All experiments for hanger-pickbreak; writes results.txt (deterministic, seeded).

python3 experiments/run.py      about a minute, stdlib only
"""
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from hanger_pickbreak.breakeven import Params, breakeven_look, per_pile, sweep_minus_see  # noqa: E402

REPS = 300
N = 18
BASE = Params()
out = []


def say(s=""):
    print(s)
    out.append(s)


def row(label, ci):
    return "%-8s %7.2f  [%6.2f, %6.2f]" % ((label,) + ci)


say("== A. Linearity check: see at t_see = 2 and 5 s against t_see = 0 on the same piles (n = %d)" % N)
base = per_pile(N, "see", replace(BASE, t_see=0.0), REPS)
say("t_see   max |gap - t_see| over %d piles" % REPS)
for t in (2.0, 5.0):
    cur = per_pile(N, "see", replace(BASE, t_see=t), REPS)
    say("%-6.1f  %.2e" % (t, max(abs((c - b) - t) for c, b in zip(cur, base))))

say()
say("== B. Defaults: break-even look time T* (s per pick; blind pinch pays no look), mean and 95%% bootstrap interval over %d paired piles" % REPS)
say("        T*      95% interval")
say(row("default", breakeven_look(N, BASE, REPS)[0]))

say()
say("== C. T* against q_find, the chance one regrasp finds the opening (n = %d)" % N)
say("q_find      T*      95% interval")
for q in (0.15, 0.25, 0.35, 0.5, 0.7, 0.9):
    say(row("%.2f" % q, breakeven_look(N, replace(BASE, q_find=q), REPS)[0]))

say()
say("== D. T* against p_hidden, the share of garments with the opening hidden by the garment (n = %d)" % N)
say("p_hidden    T*      95% interval")
for ph in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0):
    say(row("%.2f" % ph, breakeven_look(N, replace(BASE, p_hidden=ph), REPS)[0]))

say()
say("== E. T* against t_regrasp, seconds per regrasp (n = %d)" % N)
say("t_regrasp   T*      95% interval")
for tr in (2.0, 4.0, 6.0, 9.0, 12.0):
    say(row("%.1f" % tr, breakeven_look(N, replace(BASE, t_regrasp=tr), REPS)[0]))

say()
say("== F. T* against pile size n (defaults)")
say("n           T*      95% interval")
for n in (4, 8, 18, 35):
    say(row("%d" % n, breakeven_look(n, BASE, REPS)[0]))

say()
say("== G. Can sweeping ever beat aiming? see minus sweep, seconds per garment, positive = sweeping wins (n = %d)" % N)
say("t_sweep   see-sweep  95% interval")
for ts in (0.0, 0.5, 1.5, 3.0):
    say(row("%.1f" % ts, sweep_minus_see(N, replace(BASE, t_sweep=ts), REPS)))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
