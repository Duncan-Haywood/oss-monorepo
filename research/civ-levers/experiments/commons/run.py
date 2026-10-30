"""Contribution decay and punishment: does the model reproduce the shape of Fehr and Gaechter (2000)?"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
import numpy as np
from civ_levers.commons import play

R = 10
SEEDS = 30


def cell(group, **kw):
    c, p = [], []
    for s in range(SEEDS):
        a, b = play(240, group, R, np.random.default_rng(s), **kw)
        c.append(a)
        p.append(b)
    c, p = np.array(c), np.array(p)
    ci = 1.96 * c.std(0, ddof=1) / np.sqrt(SEEDS)
    return c.mean(0), ci, p.mean(0)


out = []
def row(name, kw):
    c, ci, p = cell(**kw)
    out.append(f"{name:34s} r1 {c[0]:5.2f}  r5 {c[4]:5.2f}  r10 {c[-1]:5.2f} (+-{ci[-1]:.2f})  payoff r10 {p[-1]:5.2f}")

row("n4 partner, no punishment", dict(group=4))
for rc in (0.0, 0.5, 1.0, 2.0):
    row(f"n4 partner, punishment react {rc}", dict(group=4, punish=True, react=rc))
row("n4 stranger, no punishment", dict(group=4, stranger=True))
row("n4 stranger, punishment react 1", dict(group=4, stranger=True, punish=True, react=1.0))
for n in (8, 16, 40):
    row(f"n{n} stranger, no punishment", dict(group=n, stranger=True))
    row(f"n{n} stranger, punishment react 1", dict(group=n, stranger=True, punish=True, react=1.0))
for pr in (0.1, 0.3, 0.8):
    row(f"n4 partner, react 1, punisher share {pr}", dict(group=4, punish=True, react=1.0, punisher=pr))
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
