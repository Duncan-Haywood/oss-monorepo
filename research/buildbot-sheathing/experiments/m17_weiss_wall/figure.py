"""Figure for milestone 17: python experiments/m17_weiss_wall/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
A, D, F = R["A"], R["D"], R["F"]

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.8))
fs = sorted(float(f) for f in F["grid"])
for e, col in (("6.0", "C0"), ("3.0", "C3")):
    kept = [F["grid"][str(f) if str(f) in F["grid"] else repr(f)][e][1] / F["grid"][str(f)][e][0] * 100 for f in fs]
    lab = f"{int(float(e))}-12"
    a.plot(fs, kept, color=col, lw=2, marker="o", ms=3, label=f"model, decay {lab}")
    t = A["kept"][str(int(float(e)))] * 100
    a.axhline(t, color=col, ls="--", lw=1)
    a.text(0.99, t + 1.2, f"Weiss tested {lab}: {t:.0f}%", color=col, fontsize=8, ha="right")
a.axvline(1.0, color="grey", lw=0.8, ls=":")
a.text(0.98, 8, "NDS design ratio\n(registered)", fontsize=7, ha="right", color="grey")
a.axvline(F["fit"], color="k", lw=0.8, ls=":")
a.text(F["fit"] + 0.01, 8, f"fit {F['fit']:.2f}", fontsize=7)
a.set_xlabel("stud-to-plate end-nail strength, multiple of the NDS ratio (1.30 sheathing nails)")
a.set_ylabel("decayed wall's capacity kept (% of intact)")
a.set_ylim(0, 90)
a.set_title("Weiss's 8x8 ft wall, every nail below 12 in omitted", fontsize=10)
a.legend(fontsize=8, loc="upper left")
a.grid(alpha=0.3)

labels = ["tested\n(Weiss 2017)", "MCASHEW2\n(Weiss 2017)", "this model,\nNDS joints", f"this model,\njoints {F['fit']:.2f} x NDS",
          "lone sheet, own\nhold-downs (m15)"]
v6 = [A["kept"]["6"], A["mcashew"]["6"], D["kept"]["6"], F["fit_kept"]["6.0"], D["lone_sheet_kept"]]
v3 = [A["kept"]["3"], A["mcashew"]["3"], D["kept"]["3"], F["fit_kept"]["3.0"], np.nan]
x = np.arange(len(labels))
b.bar(x - 0.2, np.array(v6) * 100, 0.4, color="C0", label="6-12 (6 in edges)")
b.bar(x + 0.2, np.array(v3) * 100, 0.4, color="C3", label="3-12 (3 in edges)")
for i in range(len(labels)):
    b.text(x[i] - 0.2, v6[i] * 100 + 1, f"{v6[i] * 100:.0f}", ha="center", fontsize=7)
    if not np.isnan(v3[i]):
        b.text(x[i] + 0.2, v3[i] * 100 + 1, f"{v3[i] * 100:.0f}", ha="center", fontsize=7)
b.set_xticks(x)
b.set_xticklabels(labels, fontsize=7)
b.set_ylabel("capacity kept with the bottom 12 in unnailed (%)")
b.set_ylim(0, 95)
b.set_title("Code-strength joints keep too much; half-strength joints fit", fontsize=10)
b.legend(fontsize=8)
b.grid(alpha=0.3, axis="y")

fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")
