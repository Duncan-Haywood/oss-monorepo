"""Write experiments/band/band.svg: per condition, the answer gap and wall time of 5g's iterate step and of the band stop.
New conditions (pre-registered, fresh designs) first, then the 13 development conditions the stop was chosen on.

    python experiments/band/figure.py

Numbers come from the committed summary.json and dev.json. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
COL = {"iter": "#d1883a", "band": "#5b8fd1"}


def main():
    S = json.loads((HERE / "summary.json").read_text())["conditions"]
    D = json.loads((HERE / "dev.json").read_text())
    W, left, right, bar = 780, 150, 250, 12
    plot = W - left - right
    top = max(c[k] / c["t_all"] for g in (S, D) for c in g.values() for k in ("t_iter", "t_band"))
    scale = plot / (1.1 * max(1.0, top))
    o, y = [], 66
    for title, cells in (("New conditions, pre-registered (fresh Sobol seed-6 designs)", S),
                         ("Development: the 13 committed conditions the stop was chosen on", D)):
        o.append(f'<text x="12" y="{y}" style="font-weight:600">{title}</text>')
        y += 12
        y0 = y
        for name, c in cells.items():
            o.append(f'<text x="12" y="{y + bar + 1}">{name}</text>')
            for key, lab in (("iter", "iterate"), ("band", "band")):
                val = c[f"t_{key}"] / c["t_all"]
                gap = c[f"{key}_gap"]
                w = max(1.0, val * scale)
                o.append(f'<rect x="{left}" y="{y}" width="{w:.1f}" height="{bar - 2}" fill="{COL[key]}"/>'
                         f'<text class="s" x="{left + w + 4:.1f}" y="{y + bar - 3}">{val:.2f}</text>'
                         f'<text class="s" x="{W - right + 70}" y="{y + bar - 3}">{lab}: {c[key + "_calls"]} DFN runs, misses best by {gap:.1%}</text>')
                y += bar
            y += 8
        x1 = left + scale
        o.append(f'<line x1="{x1:.1f}" y1="{y0 - 4}" x2="{x1:.1f}" y2="{y}" stroke="#888" stroke-dasharray="3,3"/>')
        y += 16
    o.append(f'<text class="s" x="{left}" y="{y}">dashed line: running DFN on every design (1.0)</text>')
    H = y + 14
    head = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
            'aria-label="Bar chart per battery cell and current: wall time and answer gap of two ways to stop verifying SPMe screen scores with DFN">',
            '<style>text{font:12px system-ui,sans-serif;fill:#222}.s{font-size:11px;fill:#555}'
            '@media (prefers-color-scheme:dark){text{fill:#ddd}.s{fill:#aaa}rect.bg{fill:#111}}</style>',
            f'<rect class="bg" width="{W}" height="{H}" fill="#fff"/>',
            '<text x="12" y="22" style="font-weight:600">When to stop verifying: wall time over all-DFN, and how far the answer misses the DFN best</text>']
    for i, (k, lab) in enumerate((("iter", "5g iterate answer step"), ("band", "band stop (this milestone)"))):
        x = 12 + i * 260
        head.append(f'<rect x="{x}" y="33" width="10" height="10" fill="{COL[k]}"/><text class="s" x="{x + 14}" y="42">{lab}</text>')
    (HERE / "band.svg").write_text("\n".join(head + o + ["</svg>"]) + "\n")
    print("wrote", HERE / "band.svg")


if __name__ == "__main__":
    main()
