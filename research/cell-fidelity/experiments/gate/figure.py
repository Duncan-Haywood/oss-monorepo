"""Write experiments/gate/gate.svg: per condition, the wall time of the rule and of all-DFN (as a share of all-DFN),
the gate's choice and the share of suspect designs. Pre-registered conditions first, then the seven 1x cells post hoc.

    python experiments/gate/figure.py

Numbers come from the committed summary.json. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
S = json.loads((HERE / "summary.json").read_text())
COL = {"rule": "#5b8fd1", "sus": "#d1883a"}


def main():
    W, left, right, bar = 760, 170, 250, 13
    plot = W - left - right
    o, y = [], 66
    top = max([1.0] + [c["t_rule"] / c["t_all"] for g in (S["conditions"], S["committed"]) for c in g.values()])
    scale = plot / (1.1 * top)
    for title, cells in (("New currents, pre-registered (fresh designs)", S["conditions"]),
                         ("Post hoc, 1x (the gate was read off these)", {f"{k}@1x": v for k, v in S["committed"].items()})):
        o.append(f'<text x="12" y="{y}" style="font-weight:600">{title}</text>')
        y += 12
        y0 = y
        for name, c in cells.items():
            o.append(f'<text x="12" y="{y + bar + 2}">{name}</text>')
            for key, val, lab in (("rule", c["t_rule"] / c["t_all"], "rule wall time / all-DFN"),
                                  ("sus", c["suspect_share"], "suspect share")):
                w = max(1.0, val * scale)
                o.append(f'<rect x="{left}" y="{y}" width="{w:.1f}" height="{bar - 2}" fill="{COL[key]}"/>'
                         f'<text class="s" x="{left + w + 4:.1f}" y="{y + bar - 3}">{val:.2f}</text>')
                y += bar
            dec = "skip SPMe" if c["skip"] else "run rule"
            right_txt = {True: "right", False: "WRONG", None: "tie"}[c["gate_right"]]
            o.append(f'<text class="s" x="{W - right + 60}" y="{y - bar + 2}">gate: {dec} ({c["gate_suspects"]}/8, {right_txt}); gap {c["gated_pick_gap"]:.1%}</text>')
            y += 10
        x1 = left + 1.0 * scale
        o.append(f'<line x1="{x1:.1f}" y1="{y0 - 4}" x2="{x1:.1f}" y2="{y}" stroke="#888" stroke-dasharray="3,3"/>')
        y += 16
    o.append(f'<text class="s" x="{left}" y="{y}">dashed line: all-DFN wall time (1.0); right of it, running SPMe first costs more</text>')
    H = y + 14
    head = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
            'aria-label="Bar chart per battery cell and current: wall time of the SPMe trust rule relative to running DFN on every design, and the share of designs SPMe flags as suspect">',
            '<style>text{font:12px system-ui,sans-serif;fill:#222}.s{font-size:11px;fill:#555}'
            '@media (prefers-color-scheme:dark){text{fill:#ddd}.s{fill:#aaa}rect.bg{fill:#111}}</style>',
            f'<rect class="bg" width="{W}" height="{H}" fill="#fff"/>',
            '<text x="12" y="22" style="font-weight:600">When to skip SPMe: rule cost against all-DFN, and what the first 8 SPMe runs show</text>']
    for i, (k, lab) in enumerate((("rule", "rule wall time / all-DFN wall time"), ("sus", "share of designs suspect (SPMe fails or r_min &lt;= 0.1)"))):
        x = 12 + i * 300
        head.append(f'<rect x="{x}" y="33" width="10" height="10" fill="{COL[k]}"/><text class="s" x="{x + 14}" y="42">{lab}</text>')
    (HERE / "gate.svg").write_text("\n".join(head + o + ["</svg>"]) + "\n")
    print("wrote", HERE / "gate.svg")


if __name__ == "__main__":
    main()
