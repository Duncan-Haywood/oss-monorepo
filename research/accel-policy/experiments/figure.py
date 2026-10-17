"""Modelled inference latency against network size for each platform, with control periods as horizontal lines (from results.json)."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
macs = [r["macs"] for r in R["nets"]]
fig, ax = plt.subplots(figsize=(6.4, 3.8))
for n in R["nets"][0]["platform"]:
    ax.plot(macs, [r["platform"][n]["latency_us"] for r in R["nets"]], "o-" if "Cortex" in n else "s--", ms=3, label=n)
for ts in (50, 100, 250, 1000):
    ax.axhline(ts, color="grey", lw=0.6, ls=":"); ax.text(macs[0], ts * 1.05, f"Ts = {ts} us", fontsize=7, color="grey")
ax.set_xscale("log"); ax.set_yscale("log"); ax.set_xlabel("network size (MACs per inference)"); ax.set_ylabel("modelled latency (us)")
ax.legend(fontsize=6); ax.set_title("accel-policy: latency vs deadline (assumed constants, stylised)", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "latency.png"), dpi=110)
