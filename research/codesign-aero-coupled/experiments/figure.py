"""Left: held-out combined RMS attitude error per airframe, PID(576) vs PID 96 + residual(480) vs PID 96 + gyroscopic compensation. Right: the Iz/Ix x reference-scale sweep, PID minus compensated PID. Reads results.json; writes coupled.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, (a, b) = plt.subplots(1, 2, figsize=(10, 3.8))
x = np.arange(len(R["L"]))
for k, (name, c, lab) in enumerate((("pid576", "#c0504d", "PID, 576 evaluations"), ("skip576", "#e0a030", "PID 96 + residual 480"), ("gc96", "#2f6fb0", "PID 96 + gyro compensation"))):
    v = np.array(R["main"][name])
    a.bar(x + (k - 1) * 0.27, v.mean(1), 0.27, yerr=[v.mean(1) - v.min(1), v.max(1) - v.mean(1)], capsize=2, color=c, label=lab)
a.set_xticks(x); a.set_xticklabels([f"L {l:.2f}\nD {d:.2f}" for l, d in zip(R["L"], R["D"])], fontsize=7)
a.set_ylabel("held-out RMS attitude error (deg)"); a.set_title("Main condition, mean and min-max over 5 seeds", fontsize=9); a.legend(fontsize=7)
lab = [f"Iz/Ix {s['cond']['iz_ratio']:g}\nref x{s['cond']['ref_scale']:g}\nyaw x{s['cond']['kappa_scale']:g}" for s in R["sweep"]]
w = 0.4; xs = np.arange(len(R["sweep"]))
b.bar(xs - w / 2, [s["mean"]["pid576"] - s["mean"]["skip576"] for s in R["sweep"]], w, color="#e0a030", label="PID576 minus residual576")
b.bar(xs + w / 2, [s["mean"]["pid96"] - s["mean"]["gc96"] for s in R["sweep"]], w, color="#2f6fb0", label="PID96 minus gyro-compensated")
b.axhline(0, color="k", lw=0.6); b.set_xticks(xs); b.set_xticklabels(lab, fontsize=5.5)
b.set_ylabel("error reduction (deg), positive = helps"); b.set_title("Sweep (12 conditions)", fontsize=9); b.legend(fontsize=7)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "coupled.png"), dpi=130)
