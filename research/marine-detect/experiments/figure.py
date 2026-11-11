"""Draw experiments/fig_degradation.png from experiments/runs/*.json: recall and false alarms against fog and glint.

    python3 experiments/figure.py
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
FOG = [1.0, 0.7, 0.5, 0.3, 0.15]
GLINT = [0.0, 0.3, 0.6, 0.9]
STYLE = {"pixel-clean": ("#8a8a8a", "pixel MLP (colour + row)"),
         "lraspp-clean": ("#1f6fb2", "LR-ASPP MobileNetV3, clean training"),
         "lraspp-aug": ("#c0392b", "LR-ASPP, fog + glint augmentation")}


def mean(xs):
    xs = [x for x in xs if x is not None and not math.isnan(x)]
    return sum(xs) / len(xs) if xs else float("nan")


def main():
    runs = defaultdict(list)
    for f in sorted((HERE / "runs").glob("*.json")):
        r = json.loads(f.read_text())
        runs[r["model"]].append(r)
    fig, ax = plt.subplots(1, 3, figsize=(12, 3.6))
    for m, (col, lab) in STYLE.items():
        if m not in runs:
            continue
        rs = runs[m]
        rec_f = [mean([r["conditions"][f"fog t={t}"]["recall"] for r in rs]) for t in FOG]
        rec_g = [mean([r["conditions"]["fog t=1.0" if g == 0 else f"glint g={g}"]["recall"] for r in rs]) for g in GLINT]
        fa_g = [mean([r["conditions"]["fog t=1.0" if g == 0 else f"glint g={g}"]["false_alarms_per_frame"] for r in rs])
                for g in GLINT]
        ax[0].plot(FOG, rec_f, "o-", color=col, label=lab)
        ax[1].plot(GLINT, rec_g, "o-", color=col, label=lab)
        ax[2].plot(GLINT, fa_g, "o-", color=col, label=lab)
    ax[0].set_xlabel("fog transmission t (1 = clear)")
    ax[0].invert_xaxis()
    ax[0].set_ylabel("floating-obstacle recall")
    ax[1].set_xlabel("sun-glint strength")
    ax[1].set_ylabel("floating-obstacle recall")
    ax[2].set_xlabel("sun-glint strength")
    ax[2].set_ylabel("false alarms per frame on water")
    for a in ax:
        a.grid(alpha=0.3)
    ax[0].legend(fontsize=7, loc="lower left")
    fig.suptitle("MaSTr1325 held-out blocks (300 frames), mean over seeds", fontsize=10)
    fig.tight_layout()
    fig.savefig(HERE / "fig_degradation.png", dpi=130)


if __name__ == "__main__":
    main()
