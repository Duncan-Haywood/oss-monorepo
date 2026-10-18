"""Write experiments/accuracy.svg: baseline, refit held-out and refit in-sample agreement with the hand labels, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
t = (HERE / "results.txt").read_text()
base = int(re.search(r"baseline.*?correct ([\d.]+) of 60", t).group(1).split(".")[0])
held = float(re.search(r"held-out: correct mean ([\d.]+) of 60", t).group(1))
ins = int(re.search(r"accuracy (\d+)/60", t).group(1))
bars = [("swe-errors rules as shipped", base / 60 * 100, "#6b7280"),
        ("refit on 30, scored on the other 30", held / 60 * 100, "#2563eb"),
        ("refit on all 60, scored on the same 60", ins / 60 * 100, "#d97706")]
W, RH, L, T = 640, 36, 250, 44
H = T + RH * len(bars) + 10
sc = (W - L - 60) / 100
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Agreement of keyword rules with 60 hand labels: as shipped, refit held-out, refit in-sample">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     '<text x="16" y="24" font-family="sans-serif" font-size="14">Agreement with 60 hand labels (%)</text>']
for i, (name, v, col) in enumerate(bars):
    y = T + i * RH
    o.append(f'<text x="{L-8}" y="{y+16}" text-anchor="end" font-family="sans-serif" font-size="13">{name}</text>')
    o.append(f'<rect x="{L}" y="{y}" width="{v*sc:.1f}" height="22" fill="{col}"/>')
    o.append(f'<text x="{L+v*sc+6:.1f}" y="{y+16}" font-family="sans-serif" font-size="13">{v:.1f}%</text>')
o.append("</svg>")
(HERE / "accuracy.svg").write_text("\n".join(o))
print("ok")
