"""Write experiments/sand/sand.svg: SPMe's simulated minimum salt ratio against the closed-form predictions.

    python experiments/sand/figure.py

Left: the 1280 committed designs (19 conditions); right: the fresh sweep. Grey: linear steady state r_ss
(constant D_e at c0); orange: r_kt (D_e(c) through the Kirchhoff variable). Designs where SPMe returned nothing
are drawn at SPMe r_min = 0. Reads committed.jsonl and fresh.jsonl. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
LO, HI = -0.6, 1.0


def _load(name):
    p = HERE / name
    return [json.loads(l) for l in p.read_text().splitlines()] if p.exists() else []


def panel(o, rows, x0, y0, w, h, title):
    sx = lambda v: x0 + (min(max(v, LO), HI) - LO) / (HI - LO) * w
    sy = lambda v: y0 + h - (min(max(v, LO), HI) - LO) / (HI - LO) * h
    o.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="none" stroke="#999"/>')
    o.append(f'<text x="{x0}" y="{y0 - 8}" style="font-weight:600">{title}</text>')
    for t in (-0.5, 0, 0.5, 1.0):
        o.append(f'<line x1="{sx(t):.1f}" y1="{y0 + h}" x2="{sx(t):.1f}" y2="{y0 + h + 4}" stroke="#999"/>'
                 f'<text class="s" x="{sx(t) - 8:.1f}" y="{y0 + h + 16}">{t:g}</text>')
        o.append(f'<line x1="{x0 - 4}" y1="{sy(t):.1f}" x2="{x0}" y2="{sy(t):.1f}" stroke="#999"/>'
                 f'<text class="s" x="{x0 - 30}" y="{sy(t) + 4:.1f}">{t:g}</text>')
    o.append(f'<line x1="{sx(LO):.1f}" y1="{sy(LO):.1f}" x2="{sx(HI):.1f}" y2="{sy(HI):.1f}" stroke="#bbb" stroke-dasharray="4 3"/>')
    o.append(f'<line x1="{x0}" y1="{sy(0.1):.1f}" x2="{x0 + w}" y2="{sy(0.1):.1f}" stroke="#c44" stroke-width="0.6" stroke-dasharray="2 2"/>')
    for key, col in (("r_ss", "#9a9a9a"), ("r_kt", "#d1883a")):
        for r in rows:
            y = r["spme_r"] if r["spme_r"] is not None else 0.0
            o.append(f'<circle cx="{sx(r[key]):.1f}" cy="{sy(y):.1f}" r="1.6" fill="{col}" fill-opacity="0.55"/>')
    o.append(f'<text class="s" x="{x0 + w / 2 - 70}" y="{y0 + h + 32}">closed-form prediction (no simulation)</text>')
    o.append(f'<text class="s" transform="translate({x0 - 40},{y0 + h / 2 + 50}) rotate(-90)">SPMe minimum c_e / c_e0</text>')


def main():
    C, F = _load("committed.jsonl"), _load("fresh.jsonl")
    w, h = 330, 300
    W = 2 * (w + 90) + 20
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {h + 130}" font-family="sans-serif" font-size="11">',
         '<style>text{fill:#333}.s{font-size:10px}@media (prefers-color-scheme:dark){text{fill:#ddd}}</style>',
         '<text x="12" y="20" style="font-weight:600;font-size:13px">SPMe\'s salt-depletion flag from a formula: simulated minimum salt ratio against the closed-form steady state</text>',
         '<circle cx="18" cy="38" r="3" fill="#9a9a9a"/><text x="26" y="42">linear, D_e at c0 (r_ss)</text>',
         '<circle cx="190" cy="38" r="3" fill="#d1883a"/><text x="198" y="42">with D_e(c), Kirchhoff (r_kt)</text>',
         '<line x1="380" y1="38" x2="400" y2="38" stroke="#c44" stroke-dasharray="2 2"/><text x="404" y="42">flag 0.10</text>']
    panel(o, C, 70, 70, w, h, f"Committed: {len(C)} designs, 19 conditions")
    if F:
        panel(o, F, 70 + w + 90, 70, w, h, f"Fresh sweep: {len(F)} designs x currents, 4 cells")
    o.append("</svg>")
    (HERE / "sand.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "sand.svg")


if __name__ == "__main__":
    main()
