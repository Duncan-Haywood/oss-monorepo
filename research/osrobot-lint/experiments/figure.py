"""Grouped bar chart (twin, this linter, real simulator: share of mutants flagged per fault), parsed from per_fault.tsv. Stdlib only.

    python3 experiments/figure.py      # writes experiments/detection.svg
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = [l.split("\t") for l in (HERE / "per_fault.tsv").read_text().splitlines()[1:]]
W, ROW, LEFT, BAR = 760, 44, 250, 400
H = 70 + ROW * len(rows)
SER = (("twin (osrobot-lab)", "#1f6fb2"), ("this linter", "#2a9d5c"), ("real simulator 8.0.0", "#d9822b"))
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<title>Share of 522 seeded protocol faults flagged by the twin, the static linter and the real Opentrons simulator</title>',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     '<text x="12" y="20" font-size="14" font-weight="bold">Share of seeded faults flagged, by fault kind</text>']
for k, (name, c) in enumerate(SER):
    x = LEFT + 160 * k - 30
    o.append(f'<rect x="{x}" y="32" width="12" height="10" fill="{c}"/><text x="{x + 16}" y="41">{name}</text>')
for i, (name, n, tw, li, rl) in enumerate(rows):
    n = int(n)
    y = 56 + ROW * i
    o.append(f'<text x="{LEFT - 8}" y="{y + 20}" text-anchor="end">{name} ({n})</text>')
    for j, v in enumerate((int(tw), int(li), int(rl))):
        w = BAR * v / n
        o.append(f'<rect x="{LEFT}" y="{y + 2 + 12 * j}" width="{w:.1f}" height="10" fill="{SER[j][1]}"/>'
                 f'<text x="{LEFT + w + 4:.1f}" y="{y + 11 + 12 * j}" font-size="10">{100 * v / n:.0f}%</text>')
o.append(f'<line x1="{LEFT}" y1="50" x2="{LEFT}" y2="{H - 8}" stroke="#888"/>')
o.append("</svg>")
(HERE / "detection.svg").write_text("\n".join(o) + "\n")
