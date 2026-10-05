"""Figures for the README and white paper from experiments/runs/*.

    PYTHONPATH=src python experiments/figures.py    # -> paper/figures/*.png

Colours: categorical slots 1-2 of a validated palette (blue = trained on the nominal twin,
orange = trained with domain randomisation); text stays in neutral ink.
"""
from __future__ import annotations

import csv
import os
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = Path(__file__).resolve().parent
RUNS = Path(os.environ.get("RUNS_DIR", HERE / "runs"))
OUT = HERE.parent / "paper" / "figures"
BLUE, ORANGE = "#2a78d6", "#eb6834"
INK, INK2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"
LABEL = {False: "nominal twin", True: "randomised twin"}
COLOR = {False: BLUE, True: ORANGE}


def style(ax):
    ax.set_facecolor(SURFACE)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=9)
    ax.grid(True, color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)


REPORTED_VARIANT = {"ArmPick": "ent"}  # the randomised regime reported for picking (entropy bonus)


def randomised(r, rs) -> bool | None:
    """True/False for the regime a run is plotted as, None to leave it out: for picking, the
    entropy-bonus runs are the reported randomised regime; the first attempt and the camera-model
    ablation are left out of the figures (they are in the tables)."""
    if not r["meta"]["dr"]:
        return False
    want = REPORTED_VARIANT.get(r["meta"]["env"], "")
    return True if r["meta"].get("variant", "") == want else None


def runs():
    out = []
    for p in sorted(RUNS.glob("*/eval.json")):
        d = json.loads(p.read_text())
        rows = list(csv.DictReader(open(p.parent / "progress.csv")))
        d["steps"] = np.array([int(r["time/total_timesteps"]) for r in rows])
        d["succ"] = np.array([float(r["rollout/success_rate"] or 0) for r in rows])
        out.append(d)
    return out


def smooth(y, k=5):
    if len(y) < k:
        return y
    c = np.convolve(y, np.ones(k) / k, mode="valid")
    return np.concatenate([y[: k - 1], c])


def learning(rs):
    envs = [e for e in ("ArmReach", "BimanualReach", "MobileReach", "ArmPick") if any(r["meta"]["env"] == e for r in rs)]
    cols = 2 if len(envs) == 4 else len(envs)
    rows_n = (len(envs) + cols - 1) // cols
    fig, axes = plt.subplots(rows_n, cols, figsize=(4.4 * cols, 3.1 * rows_n), sharey=True, facecolor=SURFACE)
    axes = np.atleast_1d(axes).ravel()
    for ax, env in zip(axes, envs):
        style(ax)
        regimes = []
        for dr in (False, True):
            g = [r for r in rs if r["meta"]["env"] == env and randomised(r, rs) is dr]
            if not g:
                continue
            regimes.append(dr)
            n = min(len(r["steps"]) for r in g)
            x = g[0]["steps"][:n] / 1e6
            ys = np.array([smooth(r["succ"][:n]) for r in g])
            if len(g) > 1:
                ax.fill_between(x, ys.min(0), ys.max(0), color=COLOR[dr], alpha=0.18, linewidth=0)
            ax.plot(x, ys.mean(0), color=COLOR[dr], linewidth=2,
                    label=f"{LABEL[dr]} ({len(g)} seed{'s' if len(g) > 1 else ''})")
        if len(regimes) > 1:
            ax.legend(loc="lower right", frameon=False, fontsize=8, labelcolor=INK2)
            ax.set_title(env, color=INK, fontsize=10, loc="left")
        else:
            g = [r for r in rs if r["meta"]["env"] == env]
            ax.set_title(f"{env} ({LABEL[regimes[0]]}, {len(g)} seed{'s' if len(g) > 1 else ''})", color=INK,
                         fontsize=10, loc="left")
        ax.set_xlabel("environment steps (millions)", color=INK2, fontsize=9)
        ax.set_ylim(0, 1.02)
    for k in range(0, len(axes), cols):
        axes[k].set_ylabel("training success rate\n(last 100 episodes)", color=INK2, fontsize=9)
    fig.tight_layout()
    fig.savefig(OUT / "learning_curves.png", dpi=160, facecolor=SURFACE)
    plt.close(fig)


def gaps(rs, env="ArmReach"):
    g_all = [r for r in rs if r["meta"]["env"] == env]
    if not g_all:
        return
    names = list(g_all[0]["eval"].keys())
    fig, ax = plt.subplots(figsize=(6.4, 0.42 * len(names) + 0.9), facecolor=SURFACE)
    style(ax)
    ax.grid(True, axis="x", color=GRID, linewidth=0.6)
    ax.grid(False, axis="y")
    y = np.arange(len(names))[::-1]
    for dr, off in ((False, 0.12), (True, -0.12)):
        g = [r for r in g_all if randomised(r, rs) is dr]
        if not g:
            continue
        s = np.array([[r["eval"][n]["success_rate"] for n in names] for r in g])
        ax.hlines(y + off, s.min(0), s.max(0), color=COLOR[dr], linewidth=2, alpha=0.6)
        ax.scatter(s.mean(0), y + off, s=46, color=COLOR[dr], edgecolor=SURFACE, linewidth=2, zorder=3,
                   label=f"trained on {LABEL[dr]} (mean, range over {len(g)} seed{'s' if len(g) > 1 else ''})")
    ax.set_yticks(y)
    ax.set_yticklabels([n.replace("_", " ") for n in names], color=INK, fontsize=9)
    ax.set_xlim(-0.03, 1.03)
    ax.set_xlabel(f"{env}: success rate on the perturbed twin (100 episodes each)", color=INK2, fontsize=9)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), frameon=False, fontsize=8, labelcolor=INK2, ncol=1)
    fig.tight_layout()
    fig.savefig(OUT / f"gaps_{env}.png", dpi=160, facecolor=SURFACE)
    plt.close(fig)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rs = runs()
    learning(rs)
    for env in ("ArmReach", "BimanualReach", "MobileReach", "ArmPick"):
        gaps(rs, env)


if __name__ == "__main__":
    main()
