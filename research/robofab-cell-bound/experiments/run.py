"""Sweeps for robofab-cell-bound. Writes experiments/results.txt and results.json. Deterministic (fixed seeds)."""
import json, pathlib, sys
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here.parent / "src"))
from dataclasses import replace
from robofab_cell_bound import CellConfig, JobType, bound, replicate

A = JobType("A", 20, inspect_min=3, fail_prob=0.10)
B = JobType("B", 60, inspect_min=3, fail_prob=0.20)
SEEDS = range(20)
out, lines = {}, []
def say(s=""):
    lines.append(s); print(s)
def fmt(m): return f"{m[0]:6.2f} +/- {m[1]:.2f}"

say("Types: A print 20 min fail 0.10; B print 60 min fail 0.20; load/unload 2 min each; inspect 3 min; equal mix.")
say("Horizon 24 h, warm-up 4 h, 20 seeds, wip = printers + 2, mean +/- s.e.")

say("\n1. Printer count, deterministic times (cv 0) and noisy (cv 0.3), arm FIFO")
say("P  bound/h (limit)        sim cv0                sim cv0.3             util(arm,print,insp) cv0.3")
out["sweep"] = []
for P in [1, 2, 4, 6, 8, 10, 12, 14, 16, 20]:
    c = CellConfig((A, B), printers=P, wip=P + 2)
    b, who, _ = bound(c)
    r0 = replicate(c, SEEDS); r3 = replicate(replace(c, cv=0.3), SEEDS)
    u = r3["util"]
    say(f"{P:2d} {60*b:6.2f} ({who:10s}) {fmt(r0['good_per_hour'])}  {fmt(r3['good_per_hour'])}  {u['arm']:.2f} {u['printers']:.2f} {u['inspection']:.2f}")
    out["sweep"].append(dict(printers=P, bound_per_h=60 * b, limit=who, cv0=r0, cv03=r3))

say("\n2. Arm dispatch rule, cv 0.3, wip = printers + 2")
out["rules"] = []
for P in [8, 10, 12]:
    for rule in ["fifo", "unload_first", "spt"]:
        c = CellConfig((A, B), printers=P, wip=P + 2, cv=0.3, arm_rule=rule)
        r = replicate(c, SEEDS)
        say(f"P={P:2d} {rule:13s} {fmt(r['good_per_hour'])}  flow {r['mean_flow_min'][0]:6.1f} min  print util {r['util']['printers']:.2f}")
        out["rules"].append(dict(printers=P, rule=rule, **r))

say("\n3. Which upgrade moves the bottleneck? P=12, cv 0.3, FIFO")
base = CellConfig((A, B), printers=12, wip=14, cv=0.3)
def faster_arm(f):
    return tuple(replace(t, load_min=t.load_min * f, unload_min=t.unload_min * f) for t in base.types)
variants = {
    "baseline": base,
    "arm 25% faster": replace(base, types=faster_arm(0.75)),
    "2 inspectors": replace(base, inspectors=2),
    "arm 25% faster + 2 inspectors": replace(base, types=faster_arm(0.75), inspectors=2),
    "2 printers more": replace(base, printers=14, wip=16),
}
out["upgrades"] = {}
for k, c in variants.items():
    r = replicate(c, SEEDS); b, who, _ = bound(c)
    say(f"{k:32s} sim {fmt(r['good_per_hour'])}  bound {60*b:5.2f} ({who})")
    out["upgrades"][k] = dict(sim=r, bound_per_h=60 * b, limit=who)

say("\n4. WIP cap at P=8, cv 0.3, FIFO")
out["wip"] = []
for w in [8, 9, 10, 12, 16, 24]:
    r = replicate(CellConfig((A, B), printers=8, wip=w, cv=0.3), SEEDS)
    say(f"wip={w:2d} {fmt(r['good_per_hour'])}  flow {r['mean_flow_min'][0]:7.1f} min")
    out["wip"].append(dict(wip=w, **r))

(here / "results.txt").write_text("\n".join(lines) + "\n")
(here / "results.json").write_text(json.dumps(out, indent=1))
