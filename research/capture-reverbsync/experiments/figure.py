"""Draw failure share vs direct-to-reverberant ratio (RT60 0.6 s, SNR +5 dB) from results.txt."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

d = os.path.dirname(__file__)
rows = [l.split(" | ") for l in open(os.path.join(d, "results.txt")) if l[0].isdigit()]
hdr = ["rt60", "drr", "snr", "PHAT (g=1)", "g=0.75", "g=0.5", "g=0.25", "g=0 (plain)", "adaptive (PSR)", "oracle (any g)"]
sel = sorted([r for r in rows if r[0] == "0.6" and r[2] == "5"], key=lambda r: float(r[1]))
x = [float(r[1]) for r in sel]
fig, ax = plt.subplots(figsize=(6, 3.8))
for i in (3, 5, 7, 8, 9):
    ax.plot(x, [float(r[i]) for r in sel], marker="o", label=hdr[i], ls="--" if i == 9 else "-")
ax.set_xlabel("direct-to-reverberant ratio (dB)")
ax.set_ylabel("share of 2 s windows > 1 frame off")
ax.set_title("RT60 0.6 s, SNR +5 dB, 10 real clips")
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(d, "failure_vs_drr.png"), dpi=120)
