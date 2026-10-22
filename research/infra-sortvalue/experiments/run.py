"""Experiments for infra-sortvalue. Deterministic; writes experiments/results.txt.
Paired design: every policy sees the same arrival streams (same seeds)."""
import os, sys
from dataclasses import replace
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from infra_sortvalue import Config, load_items, run_many, summarise

items = load_items()
out = []
P = lambda *a: out.append(" ".join(str(x) for x in a))
POL = ("fifo", "value", "density")


def line(label, c, runs=40):
    base = run_many(replace(c, policy="fifo"), items, runs)
    bv = sum(r["per_min"] for r in base) / runs
    s = []
    for p in POL:
        rs = run_many(replace(c, policy=p), items, runs)
        m, ci = summarise(rs, "per_min")
        s.append("%s %.2f" % (p, m))
        if p != "fifo":
            gain = [(a["per_min"] and (b["per_min"] / a["per_min"] - 1)) for a, b in zip(base, rs)]
            g, gc = summarise([{"g": x} for x in gain], "g")
            s.append("(%+.1f%% +-%.1f)" % (100 * g, 100 * gc))
    P("%-26s value/min: %s" % (label, "  ".join(s)))


base = Config()
P("# value per minute (plastic-bottle units); gain is paired against FIFO, 40 runs, 95% interval")
P("# A. load: belt density at 0.5 m/s (can_value 4)")
for d in (1.0, 2.0, 3.0, 4.0, 6.0, 10.0):
    line("density %.0f/m" % d, replace(base, density=d))
P("# B. can value relative to a PET bottle (density 6/m)")
for v in (1.0, 2.0, 4.0, 8.0, 16.0):
    line("can value %.0f" % v, replace(base, can_value=v))
P("# C. arm speed (density 6/m): slow arms make travel matter")
for a in (0.2, 0.4, 0.6, 1.2, 5.0):
    line("arm %.1f m/s" % a, replace(base, arm_speed=a))
P("# D. false-call cost per contaminant (density 6/m)")
for f in (0.0, 0.5, 1.0, 2.0):
    line("false cost %.1f" % f, replace(base, false_cost=f))
P("# E. belt speed (density 6/m)")
for v in (0.25, 0.5, 0.75, 1.0):
    line("speed %.2f m/s" % v, replace(base, speed=v))
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
