"""Write experiments/balance/balance.svg: each design's DFN degradation-added energy fade (cycle 2 to 20) against the
electrode-balance map's prediction from the run's own lithium loss, and against the proportional baseline k x LLI.

    python experiments/balance/figure.py

Numbers come from the committed summary.json. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def panel(o, x0, y0, s, rows, key, title, k, col):
    lo, hi = -0.06, 0.6
    X = lambda v: x0 + (v - lo) / (hi - lo) * s
    Y = lambda v: y0 + s - (v - lo) / (hi - lo) * s
    o.append(f'<rect x="{x0}" y="{y0}" width="{s}" height="{s}" fill="none" class="ax"/>')
    o.append(f'<text x="{x0}" y="{y0 - 8}" style="font-weight:600">{title}</text>')
    o.append(f'<line x1="{X(lo):.1f}" y1="{Y(lo):.1f}" x2="{X(hi):.1f}" y2="{Y(hi):.1f}" class="ax" stroke-dasharray="4 3"/>')
    for t in (0, 0.2, 0.4, 0.6):
        o.append(f'<text class="s" x="{X(t):.1f}" y="{y0 + s + 14}" text-anchor="middle">{t:.1f}</text>')
        o.append(f'<text class="s" x="{x0 - 6}" y="{Y(t) + 4:.1f}" text-anchor="end">{t:.1f}</text>')
    for r in rows:
        p = r["map"] if key == "map" else k * r["lli"]
        if p is None:
            continue
        fill = col if r["fresh"] else "none"
        o.append(f'<circle cx="{X(max(lo, min(hi, p))):.1f}" cy="{Y(max(lo, min(hi, r["dfn"]))):.1f}" r="3.5" '
                 f'fill="{fill}" stroke="{col}" fill-opacity="0.8"/>')
    o.append(f'<text class="s" x="{x0 + s / 2}" y="{y0 + s + 30}" text-anchor="middle">predicted fade</text>')


def main():
    S = json.loads((HERE / "summary.json").read_text())
    rows = [dict(r, fresh=False) for r in S["dev_rows"]] + [dict(r, fresh=True) for r in S["fresh_rows"]]
    s, W, H = 260, 640, 380
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="sans-serif" font-size="11">',
         '<style>text{fill:#222} .s{fill:#555} .ax{stroke:#888} @media (prefers-color-scheme: dark){text{fill:#ddd} .s{fill:#aaa}}</style>',
         '<text x="12" y="20" font-size="13" style="font-weight:600">Lost lithium to lost energy: an electrode-balance map against a constant</text>',
         f'<text class="s" x="12" y="37">DFN energy fade added by SEI + plating, cycle 2 to 20 (y) against prediction (x); filled = fresh, open = dev (5p)</text>']
    panel(o, 60, 70, s, rows, "map", "electrode-balance map (no fitted constant)", S["k"], "#3d72b8")
    panel(o, 370, 70, s, rows, "k", f"proportional: {S['k']} x lithium share lost", S["k"], "#d0702a")
    o.append(f'<text class="s" x="18" y="{70 + s / 2}" transform="rotate(-90 18 {70 + s / 2})" text-anchor="middle">DFN added fade</text>')
    o.append("</svg>")
    (HERE / "balance.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
