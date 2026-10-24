"""Draw the test-RMSE gap distribution per window length from results.json."""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
H = os.path.dirname(__file__)
r = json.load(open(os.path.join(H, "results.json")))
fig, ax = plt.subplots(figsize=(6, 3.6))
ks = list(r["by_window"])
ax.boxplot([[x["gap"] for x in r["by_window"][k]["rows"]] for k in ks], whis=(2.5, 97.5)); ax.set_xticklabels(ks)
ax.axhline(0, color="k", lw=0.8)
ax.axhline(r["full_fit"]["arx"] - r["full_fit"]["twin"], color="C1", ls="--", label="full-trace fit")
ax.set_xlabel("training window length (samples of 1024)"); ax.set_ylabel("ARX 4/4 minus twin test RMSE (V)")
ax.legend(); fig.tight_layout(); fig.savefig(os.path.join(H, "gap_by_window.png"), dpi=130)
