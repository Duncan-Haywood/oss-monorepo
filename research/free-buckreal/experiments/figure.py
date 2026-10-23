"""Draw the validation trace and the three free-run predictions from valid_sims.npz."""
import os
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
H = os.path.dirname(__file__)
d = np.load(os.path.join(H, "valid_sims.npz"))
t = 10 + np.arange(len(d["y"])) * 0.01  # ms
fig, ax = plt.subplots(figsize=(7, 3.6))
ax.plot(t, d["y"], "k", lw=1, label="measured")
ax.plot(t, d["hammerstein"], label="Hammerstein twin")
ax.plot(t, d["arx22"], label="ARX 2/2")
ax.set_xlabel("time (ms)"); ax.set_ylabel("converter voltage (V)"); ax.legend()
fig.tight_layout(); fig.savefig(os.path.join(H, "valid_trace.png"), dpi=130)
