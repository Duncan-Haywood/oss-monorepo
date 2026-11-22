"""Figure for milestone 69: python experiments/m69_tworef/figure.py (reads results.json).

Left: each pose's bias rating, 0.03 mm / max_k ||J_k|| from the J measured afresh in this run, against its grip
height, with the one reference pose (hollow) and with two (filled); the references are marked. Right: gate coverage
of the balance-envelope cases against the bias bound B, per robot and arm, under each arm's direct-aimed bias."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC, BS, S = D["spec_mm"], D["bs"], D["S"]

fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 4.4))
for n, col, dx in (("g1", "C0", -0.012), ("h1", "C3", 0.012)):
    for arm, mk in (("one", "o"), ("two", "s")):
        pts = {}
        for x in D["runs"]:
            if x["robot"] != n:
                continue
            for rec in x["rows"]:
                jj = rec["J"][arm]
                if jj is not None:
                    pts[tuple(rec["pose"])] = max(jj["gn"])
        xs = [p[0] + dx for p in pts]
        ys = [min(SPEC / g, 2.0) if g > 1e-12 else 2.0 for g in pts.values()]
        a1.scatter(xs, ys, marker=mk, s=28, edgecolors=col, facecolors=col if arm == "two" else "none",
                   label=f"{n.upper()}, {'one reference' if arm == 'one' else 'two references'}")
    for r in D["plan"][n]["refs"]:
        a1.axvline(r[0] + dx, color=col, lw=0.6, ls=":")
a1.set_xlabel("grip height of the pose, m (dotted: the two reference poses)")
a1.set_ylabel("bias rating 0.03 mm / max ||J||, N (capped at 2)")
a1.set_title("Each pose's rating, from the J measured in this run")
a1.legend(fontsize=7, loc="upper left")
for n, col in (("g1", "C0"), ("h1", "C3")):
    for arm, ls in (("one", ":"), ("two", "-")):
        a2.plot(BS, [S[f"{n} {b:g} {arm}"]["gcov"] for b in BS], ls, color=col, marker="o",
                label=f"{n.upper()}, {'one reference' if arm == 'one' else 'two references'}")
a2.set_xlabel("sensor bias bound B, N")
a2.set_ylabel("gate coverage of balance-envelope cases, %")
a2.set_ylim(0, 105)
a2.set_title("Gate coverage (no gate-passed press over 0.03 mm)")
a2.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")
