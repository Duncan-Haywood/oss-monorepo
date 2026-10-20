"""Plots FE/closed-form ratio vs mesh from check.txt -> check.png."""
import os, re
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__))
rows = {}
for l in open(os.path.join(H, "check.txt")):
    m = re.match(r"(vertical|horizontal) \((\d+), (\d+), (\d+)\)\s+\S+\s+\S+\s+(\S+)", l)
    if m: rows.setdefault(m[1], []).append((f"{m[2]}x{m[3]}x{m[4]}", float(m[5])))
for arm, r in rows.items():
    plt.plot([a for a, _ in r], [b for _, b in r], "o-", label=arm)
plt.axhline(1, color="gray", lw=.8); plt.ylabel("FE / closed form"); plt.xlabel("mesh")
plt.title("1.5 mm bracket, w = 18.4 mm"); plt.legend(); plt.tight_layout()
plt.savefig(os.path.join(H, "check.png"), dpi=110)
