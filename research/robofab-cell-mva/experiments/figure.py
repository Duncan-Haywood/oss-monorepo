"""Redraw figure.png (MVA vs simulated throughput against printers, single type and mix) from the committed results.json only."""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); r = json.load(open(os.path.join(here, "results.json")))
fig, ax = plt.subplots(figsize=(6.4, 4))
for key, lab in (("pf_single", "single type A"), ("pf_mix", "mix A+B")):
    rows = r[key]; P = [x["P"] for x in rows]
    l, = ax.plot(P, [x["mva"] for x in rows], "-", label=f"MVA, {lab}")
    ax.errorbar(P, [x["sim"][0] for x in rows], yerr=[x["sim"][1] for x in rows], fmt="o", color=l.get_color(), capsize=3, label=f"simulation, {lab}")
ax.set_xlabel("printers P"); ax.set_ylabel("good parts per hour")
ax.set_title("Exact MVA vs discrete-event simulation (product-form case)", fontsize=9); ax.legend(fontsize=7); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(here, "mva_vs_sim.png"), dpi=130)
