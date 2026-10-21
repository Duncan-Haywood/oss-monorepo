"""Draw the test-set free-run traces from test_pred.npy (written by run.py)."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

H = os.path.dirname(__file__)
P = np.load(os.path.join(H, "test_pred.npy"))
names = list(json.load(open(os.path.join(H, "results.json")))["models"])
W = 50
fig, ax = plt.subplots(figsize=(8, 3.6))
ax.plot(P[0][W:], "k", lw=1.6, label="measured (real rig)")
for n, c in (("twin (overflow)", "#1f6fb2"), ("linear ARX 4/4", "#c0392b")):
    ax.plot(P[1 + names.index(n)][W:], c, lw=1.1, label=n)
ax.axhline(10, color="grey", ls=":", lw=0.8)
ax.set_xlabel("test sample (4 s each)"); ax.set_ylabel("lower-tank level sensor (V)")
ax.set_title("Cascaded tanks, test set: free-run simulation"); ax.legend(frameon=False, fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(H, "traces.png"), dpi=110)
