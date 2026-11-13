"""Write experiments/step10-crossfit/pooled_chance.svg: pooled detections against chance, two rules.

    python experiments/step10-crossfit/figure.py   # from research/water-leaks; reads results.txt

Numbers are parsed from the committed results.txt (the pooled-count tables).
"""
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
ROW = re.compile(r"^\s+(\S+)\s+\|.*\|.*\|\s+(\d+)/(\d+)\s+\|\s+(\d+) \((\d+) to (\d+)\)\s+\|\s+([\d.]+)\s+([\d.]+)")


def tables():
    out, cur = {}, None
    for ln in (HERE / "results.txt").read_text().splitlines():
        if ln.startswith("## phi = "):
            cur = ln.split()[3]
            out[cur] = []
        elif ln.startswith("## paired"):
            cur = None
        elif cur and (m := ROW.match(ln)):
            out[cur].append(m.groups())
    return out


def main():
    t = tables()
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.8), sharey=True)
    for ax, (phi, title) in zip(axes, (("1", "flow gate 1 m3/h (primary)"), ("0", "ungated (steps 1-7)"))):
        rows = t[phi]
        for i, (k, tp, n, med, lo, hi, p, ph) in enumerate(rows):
            ax.plot([i, i], [int(lo), int(hi)], color="0.6", lw=6, solid_capstyle="butt")
            ax.plot(i, int(med), "_", color="0.3", ms=14)
            ax.plot(i, int(tp), "o", color="#c0392b" if float(ph) < 0.05 else "#1f4e79", ms=7)
            ax.annotate(f"Holm {float(ph):.2f}", (i, int(tp)), textcoords="offset points", xytext=(0, 9),
                        ha="center", fontsize=7)
        ax.set_xticks(range(len(rows)), [r[0] for r in rows], rotation=30, fontsize=8)
        ax.set_title(title, fontsize=9)
        ax.grid(axis="y", alpha=0.3)
    axes[0].set_ylabel(f"detections of {t['1'][0][2]} pooled test leaks")
    fig.suptitle("BattLeDIM, cross-fitted (2019 leaks tuned on 2018, 2018 leaks tuned on 2019): "
                 "dot = detector, bar = chance 95%", fontsize=9)
    fig.tight_layout()
    fig.savefig(HERE / "pooled_chance.svg", metadata={"Date": None}, facecolor="white")


if __name__ == "__main__":
    main()
