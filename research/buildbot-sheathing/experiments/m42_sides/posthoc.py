"""Post hoc (not registered), milestone 42: two conventions for the no-hose stack, and the like-for-like re-lean cost.

Milestone 40's section D took each pose's torques from the spec's plan (leg preload 0.1 N m, squeeze), while
milestone 41's section C and this milestone take milestone 38's 'hold-min' torques (no preload, no squeeze).
Milestone 41 printed its re-leaned stacks against milestone 40's column, so its per-pose differences mixed the two.
This reads the two results.json files and prints (1) where the conventions differ on milestone 32's leans and
(2) the per-pose re-lean cost in one convention ('hold-min' torques: milestone 32 lean + milestone 38 sides against
zero-press lean + milestone 41 sides). Writes posthoc.txt."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src"))
from buildbot_sheathing.factorial import split2x2  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
M40 = json.load(open(os.path.join(HERE, "..", "m40_liftoff", "results.json")))
M41 = json.load(open(os.path.join(HERE, "..", "m41_stance0", "results.json")))
S = {(r["lean"], r["sides"], r["robot"], tuple(r["pose"])): r for r in R["cells"]}
PLAN = {(r["robot"], tuple(r["pose"])): r["uniform"] for r in M40["D"] if r["case"] == "braked"}
RELEAN = {(x["robot"], x["z"], x["dy"]) for x in M41["A"] if x["relean"] and x.get("covers")}
L = ["(1) milestone 32's leans, milestone 38's sides: robot | pose | spec-plan torques (milestone 40 D) | "
     "'hold-min' torques (milestone 41 C, here) | difference (points)"]
nd, big = 0, 0.0
for (n, p), v in sorted(PLAN.items()):
    h = S[("m32", "m38", n, p)]["stack"]
    if h is not None and abs(h - v) > 1e-9:
        nd += 1
        big = max(big, abs(100 * (v - h)))
        L.append(f"  {n} {list(p)} | {v:.4f} | {h:.4f} | {100 * (v - h):+.2f}")
L.append(f"  {nd} of {len(PLAN)} poses differ, by up to {big:.2f} points; each robot's worst pose is the same in both")
for n in ("g1", "h1"):
    a = min((v, p) for (rn, p), v in PLAN.items() if rn == n)
    b = min((r["stack"], k[3]) for k, r in S.items() if k[:3] == ("m32", "m38", n) and r["stack"] is not None)
    L.append(f"  {n}: worst {a[0]:.4f} at {list(a[1])} (plan) vs {b[0]:.4f} at {list(b[1])} ('hold-min')")
L.append("")
L.append("(2) re-lean cost per re-leaned pose, one convention ('hold-min' torques): robot | pose | before | after | "
         "change (points) | milestone 41's printed change (mixed conventions)")
for n in ("g1", "h1"):
    ch = []
    for k in sorted(k for k in RELEAN if k[0] == n):
        p = k[1:]
        a, b = S[("m32", "m38", n, p)]["stack"], S[("zero", "m41", n, p)]["stack"]
        if a is None or b is None:
            L.append(f"  {n} {list(p)} | " + ("-" if a is None else f"{a:.4f}") + " | "
                     + ("-" if b is None else f"{b:.4f}") + " | no 'hold-min' solution")
            continue
        old = PLAN.get((n, p))
        ch.append(100 * (b - a))
        L.append(f"  {n} {list(p)} | {a:.4f} | {b:.4f} | {100 * (b - a):+.2f} | "
                 + ("-" if old is None else f"{100 * (b - old):+.2f}"))
    lo = [c for c in ch if c < 0]
    hi = [c for c in ch if c > 0]
    L.append(f"  {n}: {len(lo)} lose " + (f"{-max(lo):.2f}-{-min(lo):.2f}" if lo else "-") + f" points, {len(hi)} gain "
             + (f"{min(hi):.2f}-{max(hi):.2f}" if hi else "-"))
L.append("")
L.append("(3) the split, every re-leaned pose with all four cells: robot | pose | lean | sides | interaction (points)")
for k in sorted(RELEAN):
    c = [S[(l, sd) + k[:1] + (k[1:],)]["stack"] for l, sd in (("m32", "m38"), ("zero", "m38"), ("m32", "m41"),
                                                              ("zero", "m41"))]
    if None in c:
        continue
    x = split2x2(*c)
    L.append(f"  {k[0]} {list(k[1:])} | {100 * x['a']:+.2f} | {100 * x['b']:+.2f} | {100 * x['interaction']:+.2f}")
L.append("")
L.append("(4) held joints (all actuated) per pose, both sides choices ('hold-min', milestone 32 leans): poses where the "
         "count differs")
nh = 0
for k, r in sorted(S.items()):
    if k[:2] == ("m32", "m38") and r["stack"] is not None:
        o = S[("m32", "m41") + k[2:]]
        if o["stack"] is not None and o["n_held"] != r["n_held"]:
            nh += 1
            L.append(f"  {k[2]} {list(k[3])}: {r['n_held']} vs {o['n_held']}")
L.append(f"  {nh} poses where the held-joint count changes with the sides")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
