"""Experiments for infra-sortbound. Deterministic; writes experiments/results.txt.
Every policy and the clairvoyant bound see the same 40 arrival streams (paired)."""
import os, sys
from dataclasses import replace
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from infra_sortbound import Config, load_items, run_many, online, rolling, optimum, summarise

items = load_items()
out = []
P = lambda *a: out.append(" ".join(str(x) for x in a))
POL = ("fifo", "value", "density")
RUNS = 40


def line(label, c, eps=0.005):
    streams = run_many(c, items, RUNS)
    scale = c.grasp / (c.horizon / 60.0)        # attempted value -> value per minute (as infra-sortvalue)
    opt = [optimum(s, eps) for s in streams]
    lo = [(o[0] + o[1]) / 2 for o in opt]   # midpoint of the bracket
    parts = []
    for p in POL:
        v = [online(s, p) for s in streams]
        share = [a / b for a, b in zip(v, lo)]
        m, ci = summarise([x * scale for x in v])
        sm, sci = summarise(share)
        parts.append("%s %.2f (%.1f%% +-%.1f of opt)" % (p, m, 100 * sm, 100 * sci))
    m, ci = summarise([x * scale for x in lo])
    width = max(h - l for l, h in opt) * scale
    P("%-18s value/min: %s  opt %.2f +-%.2f (bracket width <= %.3f)" % (label, "  ".join(parts), m, ci, width))


base = Config()
P("# value per minute (plastic-bottle units, grasp 0.95 applied as in infra-sortvalue); 'of opt' is the share of the")
P("# clairvoyant optimum's value an online rule reaches, paired over %d streams, 95%% interval" % RUNS)
P("# A. load: belt density at 0.5 m/s (can_value 4)")
for d in (1.0, 2.0, 3.0, 4.0, 6.0, 10.0):
    line("density %.0f/m" % d, replace(base, density=d))
P("# B. can value relative to a PET bottle (density 6/m)")
for v in (1.0, 2.0, 4.0, 8.0, 16.0):
    line("can value %.0f" % v, replace(base, can_value=v))
P("# C. arm speed (density 6/m)")
for a in (0.2, 0.4, 0.6, 1.2, 5.0):
    line("arm %.1f m/s" % a, replace(base, arm_speed=a))
P("# D. belt speed (density 6/m)")
for v in (0.25, 0.5, 0.75, 1.0):
    line("speed %.2f m/s" % v, replace(base, speed=v))
P("# E. grid step of the exact bound (density 6/m, same 40 streams): lower and upper bound on attempted value")
streams = run_many(base, items, RUNS)
for eps in (0.2, 0.1, 0.05, 0.02, 0.01, 0.005):
    r = [optimum(s, eps) for s in streams]
    lo, _ = summarise([x[0] for x in r]); hi, _ = summarise([x[1] for x in r])
    P("eps %.3f s  lower %.2f  upper %.2f  width %.3f" % (eps, lo, hi, hi - lo))

LOOK = (0.0, 0.25, 0.5, 1.0, 2.0, 5.0)


def look_line(label, c, eps=0.005):
    streams = run_many(c, items, RUNS)
    lo = [sum(optimum(s, eps)) / 2 for s in streams]
    base = [online(s, "value") / b for s, b in zip(streams, lo)]
    parts = ["value-first %.1f%%" % (100 * summarise(base)[0])]
    for L in LOOK:
        sh = [rolling(s, L) / b for s, b in zip(streams, lo)]
        m, ci = summarise(sh)
        parts.append("L=%.2fs %.1f%% +-%.1f" % (L, 100 * m, 100 * ci))
    P("%-18s share of opt: %s" % (label, "  ".join(parts)))


P("# F. rolling horizon: re-solve the exact schedule at every free-arm moment over the queue plus items arriving")
P("# within L seconds (L=0: queue only). Share of the clairvoyant optimum, paired, 95% interval")
for d in (3.0, 6.0, 10.0):
    look_line("density %.0f/m" % d, replace(base, density=d))
look_line("speed 0.75 m/s", replace(base, speed=0.75))
look_line("arm 0.4 m/s", replace(base, arm_speed=0.4))
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
