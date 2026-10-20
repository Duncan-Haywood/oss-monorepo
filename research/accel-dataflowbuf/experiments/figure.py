"""Energy per inference vs activation-buffer size K for each dataflow (7 segments, 64 hidden, 4-bit), from results.json."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
M = json.load(open(os.path.join(HERE, "..", "..", "accel-kws", "experiments", "results.json")))["rows"]
k = [i for i, m in enumerate(M) if m["segments"] == 7 and m["hidden"] == 64 and m["wbits"] == 4][0]
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4), sharey=True)
for a, P in zip(ax, (16, 32)):
    for df, st in zip(("OS", "IS", "RT"), ("o-", "^-", "x:")):
        pts = sorted((r["K"], r["energy_nj"]) for r in R if r["model"] == k and r["B"] == 4 and r["P"] == P and r["rb"] == 0.1 and r["df"] == df)
        a.plot([max(K, 2) for K, _ in pts], [e for _, e in pts], st, label=df)
    a.set_xscale("log", base=2); a.set_xlabel("activation buffer K (8-bit words; K=2 plotted for 0)"); a.set_title(f"batch 4, P={P} lanes")
ax[0].set_ylabel("energy per inference (nJ, assumed constants)"); ax[0].legend()
fig.suptitle("accel-dataflowbuf: dataflow energy vs input-buffer size, 7-seg/64-hidden/4-bit KWS MLP (stylised)", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "buffer.png"), dpi=110)
