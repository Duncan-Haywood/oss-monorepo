"""Milestone 7i: cell prevalences and the closed-form ceiling on the coder-cell gain.
For a binary truth with prevalence p and a coder with sensitivity s, specificity c, the audit's variance with
a pooled (uniform) design is p(1-p)/n and with coder cells and Neyman allocation (sum_h w_h sd_h)^2/n (no
finite-population correction). The ratio of half-widths is sqrt(Neyman/pooled). Writes h7i_cell_contrast.txt.

    python3 experiments/h7i_cell_contrast.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import h3_llm_width as H3  # noqa: E402


def ratio(p, s, c):
    """half-width ratio, Neyman coder cells over pooled, from prevalence and coder sens/spec."""
    wpos = p * s + (1 - p) * (1 - c)
    ppos = p * s / wpos if wpos else 0.0
    wneg = 1 - wpos
    pneg = p * (1 - s) / wneg if wneg else 0.0
    neyman = (wpos * math.sqrt(ppos * (1 - ppos)) + wneg * math.sqrt(pneg * (1 - pneg))) ** 2
    return math.sqrt(neyman / (p * (1 - p))), ppos, pneg, wpos


def main():
    train, test, idx = H3.corpus()
    codes, _ = H3.coder("nb-in-language", train, test)
    f = [int(codes[i]) for i in idx]
    y = [test[i][2] for i in idx]
    n = len(y)
    tp = sum(1 for a, b in zip(f, y) if a and b); fp = sum(1 for a, b in zip(f, y) if a and not b)
    fn = sum(1 for a, b in zip(f, y) if not a and b); tn = n - tp - fp - fn
    p = (tp + fn) / n
    out = [f"NaijaSenti negative share, nb-in-language, {n} tweets: prevalence {p:.4f}",
           f"cell prevalence P(y=1 | coder+) = {tp / (tp + fp):.4f} (cell share {(tp + fp) / n:.3f}); "
           f"P(y=1 | coder-) = {fn / (fn + tn):.4f} (cell share {(fn + tn) / n:.3f})"]
    r, *_ = ratio(p, tp / (tp + fn), tn / (tn + fp))
    out.append(f"closed-form half-width ratio, Neyman cells / pooled: {r:.4f} (observed 7h at n=1000: {2.423 / 2.437:.4f} screened/pooled)")
    out.append("")
    out.append("ceiling sweep: half-width ratio (cells / pooled) by prevalence and informedness J, sens = spec = (1+J)/2")
    out.append("prev \\ J | " + " | ".join(f"{j:.1f}" for j in (0.2, 0.4, 0.6, 0.8)))
    for pv in (0.005, 0.02, 0.05, 0.1, 0.2, 0.33, 0.5):
        out.append(f"{pv:.3f} | " + " | ".join(f"{ratio(pv, (1 + j) / 2, (1 + j) / 2)[0]:.3f}" for j in (0.2, 0.4, 0.6, 0.8)))
    out += ["", "asymmetric coders (the rare-category case): half-width ratio by prevalence", "sens/spec | " + " | ".join(f"{pv}" for pv in (0.005, 0.02, 0.1, 0.33))]
    for sn, sp in ((0.8, 0.9), (0.8, 0.97), (0.5, 0.97), (0.9, 0.8)):
        out.append(f"{sn}/{sp} (J {sn + sp - 1:.2f}) | " + " | ".join(f"{ratio(pv, sn, sp)[0]:.3f}" for pv in (0.005, 0.02, 0.1, 0.33)))
    (HERE / "h7i_cell_contrast.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
