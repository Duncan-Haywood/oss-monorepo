"""Experiments for infra-sorting. Deterministic; writes experiments/results.txt."""
import os, sys
from dataclasses import replace
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from infra_sorting import Config, load_items, run_many, summarise
from infra_sorting.model import TARGET, recall

items = load_items()
out = []
P = lambda *a: out.append(" ".join(str(x) for x in a))


def row(label, c, runs=40):
    rs = run_many(c, items, runs)
    pu, pc = summarise(rs, "purity"); rc, rcc = summarise(rs, "recovery"); pm, _ = summarise(rs, "picks_min")
    P("%-28s purity %.3f +-%.3f  recovery %.3f +-%.3f  picks/min %5.1f" % (label, pu, pc, rc, rcc, pm))
    return pu, rc, pm


base = Config()
tg = [(k, r) for k, r in items if k in TARGET]
P("# items", len(items), "target share %.3f" % (len(tg) / len(items)),
  "mean detector recall on targets %.3f" % (sum(recall(r * base.scene_width, base) for _, r in tg) / len(tg)))
P("# A. belt speed (density 3/m, pick 1.0 s, fifo)")
for v in (0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0):
    row("speed %.2f m/s" % v, replace(base, speed=v))
P("# B. pick cycle time at 0.5 m/s")
for t in (0.5, 0.75, 1.0, 1.5, 2.0):
    row("pick %.2f s" % t, replace(base, pick_time=t))
P("# C. dispatch policy at 0.75 m/s")
for pol in ("fifo", "lifo", "largest"):
    row(pol, replace(base, speed=0.75, policy=pol))
P("# D. detector size threshold s50 (m) at 0.3 m/s")
for s in (0.02, 0.04, 0.06, 0.08):
    row("s50 %.2f" % s, replace(base, speed=0.3, s50=s))
P("# E. photo width assumption (m) at 0.3 m/s")
for w in (0.4, 0.6, 1.0):
    row("scene %.1f m" % w, replace(base, speed=0.3, scene_width=w))
P("# F. false-call rate at 0.5 m/s")
for f in (0.0, 0.03, 0.1, 0.2):
    row("false call %.2f" % f, replace(base, false_call=f))
P("# G. largest belt speed with recovery >= 80% of the slow-belt (0.1 m/s) recovery, by pick time")
ref = {}
for t in (0.5, 1.0, 2.0):
    r0 = row("ref pick %.1f @0.1" % t, replace(base, speed=0.1, pick_time=t))[1]
    best = None
    for v in [x / 20 for x in range(2, 61)]:
        rc = summarise(run_many(replace(base, speed=v, pick_time=t), items, 20), "recovery")[0]
        if rc >= 0.8 * r0:
            best = v
    P("  pick %.1f s -> max speed %s m/s" % (t, best))
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
