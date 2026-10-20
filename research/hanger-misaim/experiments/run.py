"""All experiments for hanger-misaim; writes results.txt (deterministic, seeded).

python3 experiments/run.py      stdlib only
"""
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from hanger_misaim.misaim import Params, breakeven_error, breakeven_look  # noqa: E402

REPS = 300
N = 18
BASE = Params()
out = []


def say(s=""):
    print(s)
    out.append(s)


def row(label, ci):
    return "%-8s %7.2f  [%6.2f, %6.2f]" % ((label,) + ci)


say("== A. Break-even look time T* (s per pick) against detector error e, mean and 95%% bootstrap interval over %d paired piles (n = %d)" % (REPS, N))
say("e           T*      95% interval")
for e in (0.0, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0):
    say(row("%.2f" % e, breakeven_look(N, BASE, e, REPS)))

say()
say("== B. Largest detector error e* at which aiming still ties blind pinching, against look time t_see (n = %d)" % N)
say("t_see    e*   (none = loses even at e = 0)")
for t in (0.0, 1.0, 3.0, 5.0, 7.0, 9.0, 11.0):
    e = breakeven_error(N, replace(BASE, t_see=t), REPS)
    say("%-6.1f   %s" % (t, "none" if e is None else "%.3f" % e))

say()
say("== C. e* at t_see = 1 s against q_find (chance a regrasp finds the opening)")
say("q_find   e*")
for q in (0.15, 0.35, 0.6, 0.9):
    e = breakeven_error(N, replace(BASE, q_find=q), REPS)
    say("%-6.2f   %s" % (q, "none" if e is None else "%.3f" % e))

say()
say("== D. e* at t_see = 1 s against p_hidden (share of garments with the opening hidden)")
say("p_hidden e*")
for ph in (0.0, 0.2, 0.4, 0.6, 0.8):
    e = breakeven_error(N, replace(BASE, p_hidden=ph), REPS)
    say("%-6.2f   %s" % (ph, "none" if e is None else "%.3f" % e))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
