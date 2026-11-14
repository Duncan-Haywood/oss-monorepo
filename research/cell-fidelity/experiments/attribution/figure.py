"""Write experiments/attribution/attribution.svg: per condition, the median energy fade from cycle 2 to cycle 20 under
PyBaMM's two degradation options together, plating alone, SEI alone and neither.

    python experiments/attribution/figure.py

Numbers come from the committed summary.json. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
BARS = (("both", "SEI + plating (every milestone's setting)", "#444"), ("plating", "plating alone", "#d0702a"),
        ("sei", "SEI alone", "#3d72b8"), ("none", "neither", "#aaa"))


def main():
    S = json.loads((HERE / "summary.json").read_text())
    conds = list(S["conditions"])
    vals = [S["conditions"][c]["fade"][v] * 100 for c in conds for v, _, _ in BARS]
    lo, hi = min(0.0, min(vals)) - 1, max(vals) + 2
    left, top, bw, gap, pw = 150, 78, 7, 12, 520
    rowh = len(BARS) * bw + gap
    W, H = left + pw + 30, top + len(conds) * rowh + 50
    X = lambda v: left + (v - lo) / (hi - lo) * pw
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="sans-serif" font-size="12">',
         '<style>text{fill:#222} .s{font-size:11px;fill:#555} .ax{stroke:#888} @media (prefers-color-scheme: dark){text{fill:#ddd} .s{fill:#aaa}}</style>',
         '<text x="12" y="22" style="font-weight:600">What makes the DFN designs fade? Lithium plating, not SEI (PyBaMM 26.10.1.1)</text>',
         '<text class="s" x="12" y="40">Median energy fade, cycle 2 to cycle 20, 3 to 4 committed designs per condition, DFN under each option set</text>']
    lx = 12
    for v, name, col in BARS:
        o.append(f'<rect x="{lx}" y="52" width="10" height="10" fill="{col}"/><text class="s" x="{lx + 14}" y="61">{name}</text>')
        lx += 24 + 6.2 * len(name)
    for t in range(int(lo) // 5 * 5, int(hi) + 1, 5):
        if lo <= t <= hi:
            o.append(f'<line class="ax" x1="{X(t):.1f}" x2="{X(t):.1f}" y1="{top - 4}" y2="{H - 40}" stroke-opacity="{0.9 if t == 0 else 0.25}"/>')
            o.append(f'<text class="s" x="{X(t):.1f}" y="{H - 26}" text-anchor="middle">{t}%</text>')
    for n, c in enumerate(conds):
        y0 = top + n * rowh
        o.append(f'<text x="{left - 8}" y="{y0 + len(BARS) * bw / 2 + 4:.1f}" text-anchor="end">{c}</text>')
        for k, (v, _, col) in enumerate(BARS):
            f = S["conditions"][c]["fade"][v] * 100
            xa, xb = sorted((X(0), X(f)))
            o.append(f'<rect x="{xa:.1f}" y="{y0 + k * bw}" width="{max(xb - xa, 0.8):.1f}" height="{bw - 1}" fill="{col}"/>')
    o.append(f'<text class="s" x="{left}" y="{H - 8}">energy fade (1 &#8722; Wh at cycle 20 / Wh at cycle 2); negative = energy rose</text>')
    o.append("</svg>")
    (HERE / "attribution.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
