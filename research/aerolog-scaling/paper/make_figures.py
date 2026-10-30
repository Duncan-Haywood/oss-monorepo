"""Figures for the paper, drawn only from the committed results files (no new simulation).

Run: /usr/bin/python3.13 paper/make_figures.py   (needs matplotlib)
Writes paper/figures/fig1_power_ratio.png, fig2_mode_errors.png, fig3_cg_margin.png.
"""
import pathlib, re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = pathlib.Path(__file__).resolve().parent.parent
OUT = HERE / "paper" / "figures"
OUT.mkdir(exist_ok=True)
NUM = r"[-+]?\d+\.?\d*(?:e[-+]?\d+)?"


def fig1():
    """Power ratio against Froude prediction vs scale n, three boundary-layer assumptions."""
    blocks = re.split(r"\n\n(?=\S)", (HERE / "experiments/airfoil_polars/results.txt").read_text())
    fig, ax = plt.subplots(figsize=(5.2, 3.6))
    for b in blocks[1:]:
        title = b.splitlines()[0]
        rows = [re.findall(NUM, l) for l in b.splitlines() if re.match(r"\s+\d\.\d\d\s", l)]
        if not rows:
            continue
        n = [float(r[0]) for r in rows]
        p = [float(r[4]) for r in rows]
        ax.plot(n, p, "o-", label=title)
    ax.set_xscale("log"); ax.set_yscale("log"); ax.invert_xaxis()
    ax.axhline(1.0, color="k", lw=0.6)
    ax.set_xlabel("scale n (1 = full size)"); ax.set_ylabel("power / Froude-scaled power")
    ax.set_title("NACA 4412 wing at CL 0.8", fontsize=9); ax.legend(fontsize=7)
    fig.tight_layout(); fig.savefig(OUT / "fig1_power_ratio.png", dpi=200); plt.close(fig)


def fig2():
    """Worst longitudinal-mode error of the best tail for each power-matched wing (7d)."""
    rows = []
    for l in (HERE / "experiments/tail_search/results.txt").read_text().splitlines():
        m = re.match(r"\s*(naca\d{4})\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+naca\d{4}.*?(" + NUM + r")\s*$", l)
        if m:
            rows.append((m[1], float(m[2]), float(m[8])))
    fig, ax = plt.subplots(figsize=(5.2, 3.6))
    for af, mk in (("naca4412", "o"), ("naca5406", "s")):
        pts = sorted((k, w) for a, k, w in rows if a == af)
        ax.plot([p[0] for p in pts], [p[1] for p in pts], mk + "-", label=af.upper().replace("NACA", "NACA "))
    ax.axhline(5, color="r", ls="--", lw=0.8, label="5% bar (H1 refuted above)")
    ax.axhline(3, color="g", ls=":", lw=0.8, label="3% bar")
    ax.set_yscale("log")
    ax.set_xlabel("wing area factor k (1 = Froude-similar area)")
    ax.set_ylabel("worst of phugoid, short-period, damping error (%)")
    ax.set_title("Best of 270 tails per power-matched wing", fontsize=9); ax.legend(fontsize=7)
    fig.tight_layout(); fig.savefig(OUT / "fig2_mode_errors.png", dpi=200); plt.close(fig)


def fig3():
    """Tails still matching within 5% as the model CG moves (7f), tail re-chosen each time."""
    fig, ax = plt.subplots(figsize=(5.2, 3.6))
    data = {}
    for l in (HERE / "experiments/cg_margin/results.txt").read_text().splitlines():
        m = re.match(r"\s*(naca\d{4})\s+(" + NUM + r")\s+(\d+)\s+(\d+)\s", l)
        if m:
            data.setdefault(m[1], []).append((float(m[2]), int(m[3])))
    for af, pts in data.items():
        pts.sort()
        ax.plot([p[0] for p in pts], [p[1] for p in pts], "o-", label=af.upper().replace("NACA", "NACA "))
    ax.set_xlabel("model CG ahead of wing AC, h (wing chords)")
    ax.set_ylabel("tails within 5% on all modes (of 270)")
    ax.set_title("k = 1.0, AR 12 wings; tail re-searched at each h", fontsize=9); ax.legend(fontsize=7)
    fig.tight_layout(); fig.savefig(OUT / "fig3_cg_margin.png", dpi=200); plt.close(fig)


if __name__ == "__main__":
    fig1(); fig2(); fig3()
    for p in sorted(OUT.glob("*.png")):
        print("wrote", p.relative_to(HERE))
