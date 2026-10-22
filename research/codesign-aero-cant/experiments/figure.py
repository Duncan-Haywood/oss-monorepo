"""Left: held-out combined RMS attitude error against rotor cant angle (6 airframes x 5 seeds, infeasible cells dropped; the x0.5 and x3 yaw-ratio curves use 3 airframes). Right: joint co-design with cant fixed at 0 or free. Reads results.json; writes cant.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, (a, b) = plt.subplots(1, 2, figsize=(10, 3.8))
al = R["alphas"]
a.plot(al, [s["rms"] for s in R["summary"]], "o-", color="#2f6fb0", label="assumed ratio x1 (6 airframes)")
for k, c in (("0.5", "#999999"), ("3.0", "#c0504d")):
    a.plot(al, R["kappa"][k], "s--", color=c, ms=4, label=f"reaction-torque ratio x{k} (3 airframes)")
a.set_xlabel("rotor cant angle (deg)"); a.set_ylabel("held-out RMS attitude error (deg)"); a.legend(fontsize=7); a.set_title("PID retuned per cant angle (192 evaluations)", fontsize=9)
for i, (name, c) in enumerate((("cant fixed at 0", "#c0504d"), ("cant free", "#2f6fb0"))):
    v = [j["rms"] for j in R["joint"][5 * i:5 * i + 5]]
    b.bar(i, np.mean(v), 0.6, color=c, yerr=[[np.mean(v) - min(v)], [max(v) - np.mean(v)]], capsize=3)
    b.text(i, np.mean(v) + 0.3, f"{np.mean(v):.2f}", ha="center", fontsize=8)
b.set_xticks([0, 1]); b.set_xticklabels(["cant fixed at 0", "cant free (0-35 deg)"]); b.set_ylabel("held-out RMS attitude error (deg)")
b.set_title("Joint co-design, 1920 evaluations, 5 seeds", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "cant.png"), dpi=130)
