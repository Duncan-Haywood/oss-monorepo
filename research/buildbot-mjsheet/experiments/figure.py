"""results.json -> figure.png: pass rate of each buildbot-skills policy on plant B in numpy and in MuJoCo, and per-policy tilt agreement."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    res = json.loads((HERE / "results.json").read_text())["policies"]
    fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.3), constrained_layout=True)
    x = np.array([r["pass_numpy"] for r in res])
    y = np.array([r["pass_mujoco"] for r in res])
    a.plot([0, 1], [0, 1], "k--", lw=1)
    a.scatter(x, y, c="tab:blue", s=36)
    a.set_xlabel("pass rate, hand-written plant B (numpy)")
    a.set_ylabel("pass rate, same worlds in MuJoCo")
    a.set_title("13 policies, %d shared worlds each" % json.loads((HERE / "results.json").read_text())["n"], fontsize=9)
    a.grid(alpha=0.3)
    a.set_xlim(-0.02, 1)
    a.set_ylim(-0.02, 1)
    d = [r["median_abs_tilt_diff_deg"] for r in res if r["median_abs_tilt_diff_deg"] is not None]
    b.bar(range(len(d)), d, color="tab:green")
    b.set_yscale("log")
    b.set_xticks([])
    b.set_xlabel("policies with episodes stable in both engines")
    b.set_ylabel("median |peak tilt difference| (deg)")
    b.set_title("Peak-tilt disagreement between engines", fontsize=9)
    b.grid(alpha=0.3, axis="y")
    fig.savefig(HERE / "figure.png", dpi=120)


if __name__ == "__main__":
    main()
