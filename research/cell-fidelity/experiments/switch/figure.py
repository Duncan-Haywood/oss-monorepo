"""Write experiments/switch/switch.svg: per cell, wall time as a share of running DFN on every design, for the fixed
rule branch and the pilot-switched procedure (median over draws, whisker to the worst draw). Fresh cells first, then
the development replay.

    python experiments/switch/figure.py

Numbers come from the committed summary.json and dev.json. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
COL = {"rule": "#9aa5b1", "switch": "#5b8fd1"}


def main():
    fresh = json.loads((HERE / "summary.json").read_text())["cells"]
    dev = json.loads((HERE / "dev.json").read_text())
    W, left, right, bar = 760, 120, 200, 12
    plot = W - left - right
    xmax = 1.4
    o, y = [], 66
    for title, cells in (("Fresh designs, pre-registered (Sobol seed 5)", fresh), ("Development replay (constants chosen here; post hoc)", dev)):
        o.append(f'<text x="12" y="{y}" style="font-weight:600">{title}</text>')
        y += 12
        for name, c in cells.items():
            o.append(f'<text x="12" y="{y + bar + 2}">{name}</text>')
            best = min(c["t_rule"], c["t_all"])
            vals = (("rule", c["t_rule"] / c["t_all"], None), ("switch", c["t_ratio"] * best / c["t_all"], c["t_ratio_max"] * best / c["t_all"]))
            for key, v, worst in vals:
                w = min(v, xmax) / xmax * plot
                o.append(f'<rect x="{left}" y="{y}" width="{w:.1f}" height="{bar - 2}" fill="{COL[key]}"/>')
                if worst is not None:
                    xw = left + min(worst, xmax) / xmax * plot
                    o.append(f'<line x1="{left + w:.1f}" y1="{y + bar / 2 - 1}" x2="{xw:.1f}" y2="{y + bar / 2 - 1}" stroke="#333"/>')
                y += bar
            o.append(f'<text class="s" x="{W - right + 10}" y="{y - bar + 2}">switched {c["switched"]:.0%}, worst gap {c["gap_max"]:.1%}</text>')
            y += 10
        y += 14
    x1 = left + 1 / xmax * plot
    o.append(f'<line x1="{x1:.1f}" y1="72" x2="{x1:.1f}" y2="{y - 20}" stroke="#d1883a" stroke-width="1.5"/>')
    o.append(f'<text class="s" x="{x1 + 4:.1f}" y="{y - 6}">all-DFN</text>')
    for t in (0, 0.5):
        x = left + t / xmax * plot
        o.append(f'<line x1="{x:.1f}" y1="72" x2="{x:.1f}" y2="{y - 20}" stroke="#ccc" stroke-dasharray="2,3"/>'
                 f'<text class="s" x="{x - 10:.1f}" y="{y - 6}">{t:.0%}</text>')
    o.append(f'<text class="s" x="{left}" y="{y + 10}">wall time, share of running DFN on every design</text>')
    H = y + 24
    head = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
            'aria-label="Bar chart per battery cell: wall time of the SPMe trust rule and of the pilot-switched procedure as a share of running DFN on every design">',
            '<style>text{font:12px system-ui,sans-serif;fill:#222}.s{font-size:11px;fill:#555}'
            '@media (prefers-color-scheme:dark){text{fill:#ddd}.s{fill:#aaa}rect.bg{fill:#111}}</style>',
            f'<rect class="bg" width="{W}" height="{H}" fill="#fff"/>',
            '<text x="12" y="22" style="font-weight:600">Wall time of the SPMe trust rule, with and without an 8-run pilot that can switch to DFN on everything</text>']
    for i, (k, lab) in enumerate((("rule", "rule on every design (no pilot)"), ("switch", "pilot switch, median of 30 draws (line: worst)"))):
        x = 12 + i * 260
        head.append(f'<rect x="{x}" y="33" width="10" height="10" fill="{COL[k]}"/><text class="s" x="{x + 14}" y="42">{lab}</text>')
    (HERE / "switch.svg").write_text("\n".join(head + o + ["</svg>"]) + "\n")
    print("wrote", HERE / "switch.svg")


if __name__ == "__main__":
    main()
