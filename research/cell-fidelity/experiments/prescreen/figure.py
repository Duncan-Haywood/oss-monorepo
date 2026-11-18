"""Write experiments/prescreen/prescreen.svg: per condition, the spread of r_kt over the pool, where the DFN best sits on
it, the 0.10 flag, and the two prices: pre-screen wall time over the band procedure's, and the loss from discarding
flagged designs. Fresh conditions (pre-registered) first, then the 19 development conditions.

    python experiments/prescreen/figure.py

Numbers come from the committed summary.json and dev.json. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
LO, HI = -1.2, 1.0          # r_kt axis shown; pools reaching below LO are drawn to the edge with an arrow


def main():
    S = json.loads((HERE / "summary.json").read_text())["conditions"] if (HERE / "summary.json").exists() else {}
    D = json.loads((HERE / "dev.json").read_text())
    W, left, plot, row = 820, 150, 330, 16
    X = lambda v: left + (max(LO, min(HI, v)) - LO) / (HI - LO) * plot
    o, y = [], 70
    for title, cells in (("Fresh conditions, pre-registered (Sobol seed 8)", S),
                         ("Development: the 19 committed conditions", D)):
        if not cells:
            continue
        o.append(f'<text x="12" y="{y}" style="font-weight:600">{title}</text>')
        y += 8
        y0 = y
        for name, c in cells.items():
            yc = y + row / 2
            o.append(f'<text x="12" y="{yc + 4}">{name}</text>')
            o.append(f'<line x1="{X(c["rkt_min"]):.1f}" y1="{yc}" x2="{X(c["rkt_max"]):.1f}" y2="{yc}" stroke="#999" stroke-width="3"/>')
            if c["rkt_min"] < LO:
                o.append(f'<text class="s" x="{left - 12}" y="{yc + 4}">&#8592;</text>')
            fill = "#c4473a" if c["best_flagged"] else "#2f7d4f"
            o.append(f'<circle cx="{X(c["best_rkt"]):.1f}" cy="{yc}" r="5" fill="{fill}"/>')
            o.append(f'<text class="s" x="{left + plot + 14}" y="{yc + 4}">{c["t_ps"] / c["t_band"]:.2f}</text>'
                     f'<text class="s" x="{left + plot + 110}" y="{yc + 4}">{c["discard_gap"]:.1%}</text>')
            y += row
        xf = X(0.10)
        o.append(f'<line x1="{xf:.1f}" y1="{y0}" x2="{xf:.1f}" y2="{y}" stroke="#555" stroke-dasharray="3,3"/>')
        y += 22
    for v in (-1.0, -0.5, 0.0, 0.5, 1.0):
        o.append(f'<text class="s" x="{X(v) - 8:.1f}" y="{y}">{v:g}</text>')
    o.append(f'<text class="s" x="{left}" y="{y + 16}">r_kt (closed-form minimum salt ratio; dashed: the 0.10 flag)</text>')
    H = y + 30
    head = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
            'aria-label="Per battery cell and current: the range of the closed-form salt ratio over 64 designs, where the best DFN design sits, and what a salt pre-screen costs">',
            '<style>text{font:12px system-ui,sans-serif;fill:#222}.s{font-size:11px;fill:#555}'
            '@media (prefers-color-scheme:dark){text{fill:#ddd}.s{fill:#aaa}rect.bg{fill:#111}}</style>',
            f'<rect class="bg" width="{W}" height="{H}" fill="#fff"/>',
            '<text x="12" y="22" style="font-weight:600">The best design sits at the salt edge: grey = the pool\'s r_kt range, dot = the DFN best</text>',
            '<circle cx="18" cy="38" r="5" fill="#2f7d4f"/><text class="s" x="28" y="42">best not flagged</text>'
            '<circle cx="138" cy="38" r="5" fill="#c4473a"/><text class="s" x="148" y="42">best flagged (r_kt &lt;= 0.10)</text>',
            f'<text class="s" x="{left + plot + 14}" y="56">pre-screen / band time</text>'
            f'<text class="s" x="{left + plot + 150}" y="56">discard-flagged miss</text>']
    (HERE / "prescreen.svg").write_text("\n".join(head + o + ["</svg>"]) + "\n")
    print("wrote", HERE / "prescreen.svg")


if __name__ == "__main__":
    main()
