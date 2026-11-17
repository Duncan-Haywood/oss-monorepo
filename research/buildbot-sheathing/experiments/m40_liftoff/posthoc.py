"""Milestone 40, post hoc (not registered): which loose joints does a rising press set as it enters the window?

Reads results.json (section A's census rows, the spec's window torques at H 0 with an exact sensor) and sorts each
loose nose-moving joint into: below tau_f over the window (the registered 'set' test; none set), entering the
window above tau_f with one sign (``liftoff.entry_set``: pushed to that side as the press rises and held there),
rising through tau_f inside the window, or changing sign inside it. Run: python experiments/m40_liftoff/posthoc.py
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import liftoff as LO  # noqa: E402

R = json.load(open(os.path.join(HERE, "results.json")))
TF = R["tau_f"]
print("# Milestone 40, post hoc: the loose nose-moving joints by how the press reaches them (F_r 0, H 0, exact sensor)")
print("robot | kind | loose | below tau_f | enter above, one sign | rise through tau_f | change sign")
tot = {}
for x in [a for a in R["A"] if a["fr"] == 0.0]:
    by = {}
    for r in x["rows"]:
        lo, hi = r["tau_window"]
        c = by.setdefault(r["kind"], [0, 0, 0, 0, 0])
        c[0] += 1
        if r["below"]:
            c[1] += 1
        elif LO.entry_set(np.array([lo]), np.array([hi]), TF)[0] != 0:
            c[2] += 1
        elif np.sign(lo) == np.sign(hi):
            c[3] += 1
        else:
            c[4] += 1
    for k, c in sorted(by.items()):
        print(f"  {x['n']} | {k:5s} | {c[0]:3d} | {c[1]:3d} | {c[2]:3d} | {c[3]:3d} | {c[4]:3d}")
    tot[x["n"]] = [sum(c[i] for c in by.values()) for i in range(5)]
    print(f"  {x['n']} | all   | " + " | ".join(f"{v:3d}" for v in tot[x["n"]]))
a = [sum(t[i] for t in tot.values()) for i in range(5)]
print(f"both robots: {a[0]} loose; {a[1]} below tau_f, {a[2]} set on entering the window, {a[3]} rise through it, "
      f"{a[4]} change sign ({100 * a[2] / a[0]:.0f}% deterministic under a rising press, post hoc)")
