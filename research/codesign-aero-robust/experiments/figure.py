"""Scatter of every airframe's held-out RMS error: nominal plant (x) against the wide randomised plant (y), for
nominal-tuned and wide-tuned gains. Reads results.json; writes ranking.png."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
x = R["rms"]["nominal|nominal"]
fig, ax = plt.subplots(figsize=(6, 4.5))
ax.scatter(x, R["rms"]["nominal|wide"], s=22, label="gains tuned on the nominal plant", color="#c0504d")
ax.scatter(x, R["rms"]["wide|wide"], s=22, label="gains tuned on the wide plant", color="#2f6fb0")
lo, hi = min(x) - 0.2, max(R["rms"]["nominal|wide"]) + 0.2
ax.plot([lo, hi], [lo, hi], "k:", lw=1, label="no degradation")
ax.set_xlabel("RMS roll error, nominal plant (deg)"); ax.set_ylabel("RMS roll error, wide randomised plant (deg)")
ax.set_title(f"50 airframes: Spearman nominal vs wide {R['spearman_nominal_vs_wide']:.2f} (nominal-tuned gains)", fontsize=9)
ax.legend(fontsize=8); fig.tight_layout(); fig.savefig(os.path.join(HERE, "ranking.png"), dpi=130)
