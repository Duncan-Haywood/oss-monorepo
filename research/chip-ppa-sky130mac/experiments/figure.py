"""Write experiments/rank_corr.svg: Spearman correlation between generic-gate and SKY130 PPA, per script.

    python experiments/figure.py

Parsed from the committed results.txt, never retyped. Bars are the correlation of generic cells*depth with
SKY130 area*delay within each ABC script, plus the pooled value over all 64 pairs.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
POOLED = re.compile(r"^Spearman rank correlation over all \d+ .*?(-?\d\.\d+)\s*$")
WITHIN = re.compile(r"^\s+within script (\w+): .*?(-?\d\.\d+)\s*$")


def parse():
    out = []
    for line in (HERE / "results.txt").read_text().splitlines():
        if (m := POOLED.match(line)):
            out.insert(0, ("pooled (64 pairs)", float(m[1])))
        elif (m := WITHIN.match(line)):
            out.append((m[1], float(m[2])))
    return out


def main():
    d = parse()
    W, H, L, R, T, B = 520, 320, 60, 16, 40, 50
    py = lambda v: T + (1 - (v + 0.5) / 1.5) * (H - T - B)
    gw = (W - L - R) / len(d)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Bars: Spearman correlation of generic cells times depth with SKY130 area times delay">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Spearman: generic cells&#215;depth vs SKY130 area&#215;delay</text>']
    for v in (-0.5, 0, 0.5, 1.0):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="{"#222" if v == 0 else "#ddd"}"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:.1f}</text>')
    for i, (name, v) in enumerate(d):
        x = L + i * gw + gw * 0.15
        y0, y1 = sorted((py(0), py(v)))
        col = "#555" if i == 0 else "#1f6fb2"
        o.append(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{gw*0.7:.1f}" height="{y1-y0:.1f}" fill="{col}"/>'
                 f'<text x="{x+gw*0.35:.1f}" y="{(y0-4) if v >= 0 else (y1+12):.1f}" text-anchor="middle" font-family="sans-serif" font-size="11">{v:.2f}</text>'
                 f'<text x="{x+gw*0.35:.1f}" y="{H-B+30}" text-anchor="middle" font-family="sans-serif" font-size="10">{name}</text>')
    o.append("</svg>")
    (HERE / "rank_corr.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
