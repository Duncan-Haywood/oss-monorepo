"""Heatmaps of the payload envelopes in results.json -> figure.png."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = Path(__file__).resolve().parent
TITLES = {"g1-palm": "Unitree G1, load in the palms", "g1-cradle": "Unitree G1, load on the forearms",
          "h1-palm": "Unitree H1, load at the forearm ends"}


def main():
    res = json.loads((HERE / "results.json").read_text())
    env = res["envelope"]
    fig, axes = plt.subplots(1, len(env), figsize=(4.2 * len(env), 4.6), constrained_layout=True)
    vmax = max(r["kg"] for rows in env.values() for r in rows if r["kg"] is not None)
    for ax, (key, rows) in zip(axes, env.items()):
        xs = sorted({r["x"] for r in rows})
        zs = sorted({r["z"] for r in rows})
        grid = np.full((len(zs), len(xs)), np.nan)
        for r in rows:
            if r["kg"] is not None:
                grid[zs.index(r["z"]), xs.index(r["x"])] = r["kg"]
        im = ax.imshow(grid, origin="lower", cmap="viridis", vmin=0, vmax=vmax, aspect="auto",
                       extent=(xs[0] - 0.05, xs[-1] + 0.05, zs[0] - 0.1, zs[-1] + 0.1))
        for i, z in enumerate(zs):
            for j, x in enumerate(xs):
                v = grid[i, j]
                ax.text(x, z, "out of\nreach" if np.isnan(v) else f"{v:.1f}", ha="center", va="center",
                        fontsize=7, color="0.4" if np.isnan(v) else ("black" if v > 0.6 * vmax else "white"))
        ax.set_title(TITLES.get(key, key), fontsize=10)
        ax.set_xlabel("hands forward of the feet (m)")
        ax.set_ylabel("hand height above the floor (m)")
    fig.colorbar(im, ax=axes, label="heaviest two-handed load inside joint torque limits (kg)", shrink=0.9)
    fig.suptitle("Static payload envelope of stock humanoids (MuJoCo Menagerie models, peak torque limits)", fontsize=11)
    fig.savefig(HERE / "figure.png", dpi=130)


if __name__ == "__main__":
    main()
