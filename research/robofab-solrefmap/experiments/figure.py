"""Draw held.png (share of jaw tests that hold, by acceleration and contact setting) from the committed results.json only.

    python experiments/figure.py
"""
import json, os
from collections import defaultdict
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); rows = json.load(open(os.path.join(here, "results.json")))["rows"]
g = defaultdict(lambda: defaultdict(list))
for r in rows:
    g[(r["solref"], r["dt"])][r["a_up"]].append(r["ratio"] is not None)
fig, ax = plt.subplots(figsize=(6.4, 4))
for (s, dt), d in sorted(g.items(), reverse=True):
    if len(d) < 3:
        continue
    a = sorted(d)
    ax.plot(a, [100 * sum(d[x]) / len(d[x]) for x in a], "o-", label=f"solref {s*1e3:g} ms, dt {dt*1e3:g} ms")
ax.set_xlabel("jaw acceleration (m/s$^2$)"); ax.set_ylabel("tests that hold (%)"); ax.set_ylim(-5, 105)
ax.set_title("robofab-solrefmap: where the contact setting fails", fontsize=9); ax.legend(fontsize=7); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(here, "held.png"), dpi=130)
print("wrote", os.path.join(here, "held.png"))
