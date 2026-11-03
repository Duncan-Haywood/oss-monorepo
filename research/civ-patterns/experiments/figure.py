"""Figures from the committed results.txt files (numbers are parsed, never retyped).

    python3 experiments/figure.py   # writes experiments/hazard_by_age.svg
"""
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
COL = {"democracy": "#1f6fb2", "anocracy": "#c0392b", "autocracy": "#7f6a00",
       "all polities": "#2e8b57", "peak area >= 1M km2": "#8e44ad"}


def regime_rates():
    txt = (HERE / "regimes" / "results.txt").read_text().splitlines()
    i = next(j for j, l in enumerate(txt) if l.startswith("piecewise+type yearly hazard"))
    out = {}
    for l in txt[i + 1:i + 4]:
        name, *vals = l.split()
        out[name] = [float(v) for v in vals]
    return out


def empire_rates():
    txt = (HERE / "empires" / "results.txt").read_text().splitlines()
    out, cur = {}, None
    for l in txt:
        if l.startswith("Empirical hazard by age, all"):
            cur = "all polities"; out[cur] = []
        elif l.startswith("Empirical hazard by age, peak"):
            cur = "peak area >= 1M km2"; out[cur] = []
        elif cur and l.strip().startswith("age"):
            m = re.match(r"\s*age\s+(\d+)-(\d+)\s*:.*=\s*([\d.]+) per 1000", l)
            if m:
                out[cur].append((int(m[1]), int(m[2]), float(m[3])))
        elif cur and not l.strip().startswith("age"):
            cur = None
    return out


def steps(ax, bands, rates, **kw):
    xs, ys = [], []
    for (lo, hi), r in zip(bands, rates):
        xs += [lo, hi]; ys += [r, r]
    ax.plot(xs, ys, lw=2, **kw)


def main():
    fig, (a, b) = plt.subplots(1, 2, figsize=(10, 4))
    edges = [0, 2, 5, 10, 20, 40, 80, 160]
    bands = list(zip(edges[:-1], edges[1:]))
    for name, r in regime_rates().items():
        steps(a, bands, [100 * x for x in r], color=COL[name], label=name)
    a.set_xscale("symlog", linthresh=2); a.set_xlim(0, 160)
    a.set_xticks([0, 2, 5, 10, 20, 40, 80, 160]); a.set_xticklabels(["0", "2", "5", "10", "20", "40", "80", "160"])
    a.set_xlabel("age of the regime (years)"); a.set_ylabel("chance of ending, % per year")
    a.set_title("Political regimes, Polity5 1800-2018", fontsize=10)
    a.legend(frameon=False, fontsize=9)
    for name, rows in empire_rates().items():
        steps(b, [(lo, min(hi, 1600)) for lo, hi, _ in rows], [r / 10 for *_, r in rows], color=COL[name], label=name)
    b.set_xscale("symlog", linthresh=25); b.set_xlim(0, 1600)
    b.set_xticks([0, 25, 50, 100, 200, 400, 800, 1600]); b.set_xticklabels(["0", "25", "50", "100", "200", "400", "800", "1600"])
    b.set_xlabel("age of the polity (years)"); b.set_ylabel("chance of ending, % per year")
    b.set_title("States and empires, Cliopatria 3400 BCE-2024", fontsize=10)
    b.legend(frameon=False, fontsize=9)
    for ax in (a, b):
        ax.spines[["top", "right"]].set_visible(False); ax.set_ylim(bottom=0)
    fig.tight_layout()
    fig.savefig(HERE / "hazard_by_age.svg")


if __name__ == "__main__":
    main()
