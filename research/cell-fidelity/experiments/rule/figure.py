"""Write experiments/rule/rule.svg: per cell, the share of the pool SPMe mis-scores against the share the two-part
rule sends to DFN, with the pick's gap to the pool's DFN best. Pre-registered cells first, then the post hoc replay.

    python experiments/rule/figure.py

Numbers come from the committed summary.json. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
S = json.loads((HERE / "summary.json").read_text())
COL = {"bad": "#d1883a", "calls": "#5b8fd1"}


def main():
    W, left, right, bar = 760, 200, 230, 13
    plot = W - left - right
    o, y = [], 66
    groups = (("New cells, pre-registered (fresh designs)", S["cells"]), ("Post hoc replay (the rule was built on these)", S["replay"]))
    for title, cells in groups:
        o.append(f'<text x="12" y="{y}" style="font-weight:600">{title}</text>')
        y += 12
        for name, c in cells.items():
            o.append(f'<text x="12" y="{y + bar + 2}">{name}</text><text class="s" x="12" y="{y + bar + 16}">{c["n"]} designs</text>')
            for key, val, lab in (("bad", c["n_bad"], "mis-scored"), ("calls", c["calls"], "DFN calls")):
                w = max(1.0, val / c["n"] * plot)
                o.append(f'<rect x="{left}" y="{y}" width="{w:.1f}" height="{bar - 2}" fill="{COL[key]}"/>'
                         f'<text class="s" x="{left + w + 4:.1f}" y="{y + bar - 3}">{val} {lab}</text>')
                y += bar
            rec = "n/a" if c["recall"] is None else f'{c["recall"]:.0%}'
            o.append(f'<text class="s" x="{W - right + 70}" y="{y - bar + 2}">recall {rec}, pick gap {c["pick_gap"]:.1%}</text>')
            y += 12
        y += 14
    for t in (0, 0.5, 1.0):
        x = left + t * plot
        o.append(f'<line x1="{x:.1f}" y1="72" x2="{x:.1f}" y2="{y - 20}" stroke="#ccc" stroke-dasharray="2,3"/>'
                 f'<text class="s" x="{x - 10:.1f}" y="{y - 6}">{t:.0%}</text>')
    o.append(f'<text class="s" x="{left}" y="{y + 10}">share of the pool</text>')
    H = y + 24
    head = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
            'aria-label="Bar chart per battery cell: share of designs SPMe mis-scores and share the rule sends to the full DFN model">',
            '<style>text{font:12px system-ui,sans-serif;fill:#222}.s{font-size:11px;fill:#555}'
            '@media (prefers-color-scheme:dark){text{fill:#ddd}.s{fill:#aaa}rect.bg{fill:#111}line{stroke:#555}}</style>',
            f'<rect class="bg" width="{W}" height="{H}" fill="#fff"/>',
            '<text x="12" y="22" style="font-weight:600">The two-part SPMe trust rule: DFN calls spent against designs SPMe gets wrong</text>']
    for i, (k, lab) in enumerate((("bad", "SPMe mis-scored (0, or more than 25% below DFN)"), ("calls", "DFN runs the rule spends"))):
        x = 12 + i * 330
        head.append(f'<rect x="{x}" y="33" width="10" height="10" fill="{COL[k]}"/><text class="s" x="{x + 14}" y="42">{lab}</text>')
    (HERE / "rule.svg").write_text("\n".join(head + o + ["</svg>"]) + "\n")
    print("wrote", HERE / "rule.svg")


if __name__ == "__main__":
    main()
