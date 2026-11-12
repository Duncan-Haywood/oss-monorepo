"""Write experiments/calibrate/calibrate.svg: DFN calls and recall of each cut-off strategy, per parameter set.

    python experiments/calibrate/figure.py

Numbers come from the committed summary.json (re-run run.py report first if it changes). Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
S = json.loads((HERE / "summary.json").read_text())

BARS = [("oracle (DFN only the untrusted)", "#8a8a8a"),
        ("F: fixed cut-off r &lt;= 0.07", "#d1883a"),
        ("C_8: cut-off from 8 random DFN runs (median)", "#5b8fd1"),
        ("B_3: bottom-up, stop after 3 trusted", "#3aa37a"),
        ("B_3 + flag SPMe runs that stop early (post hoc)", "#1f5f46")]


def rows():
    out = []
    for name, e in S["sets"].items():
        n = e["n"]
        g = S["post_hoc_incomplete_flag"][name]
        out.append((name, n, e["untrusted"], [
            (e["untrusted"] / n, 1.0),
            (e["F"]["calls"] / n, e["F"]["recall"]),
            (e["C"]["8"]["calls_median"] / n, e["C"]["8"]["recall_median"]),
            (e["B"]["3"]["calls"] / n, e["B"]["3"]["recall"]),
            (g["B3"]["calls"] / n, g["B3"]["recall"])]))
    return out


def main():
    R = rows()
    W, left, top, bar, gap, right = 760, 170, 96, 13, 18, 150
    H = top + len(R) * (len(BARS) * bar + gap) + 40
    plot = W - left - right
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-label="Grouped bar chart: share of designs sent to DFN and recall of mis-scored designs for five '
         f'cut-off strategies on five PyBaMM parameter sets">',
         '<style>text{font:12px system-ui,sans-serif;fill:#222}.s{font-size:11px;fill:#555}'
         '@media (prefers-color-scheme:dark){text{fill:#ddd}.s{fill:#aaa}rect.bg{fill:#111}line{stroke:#555}}</style>',
         f'<rect class="bg" width="{W}" height="{H}" fill="#fff"/>',
         '<text x="12" y="22" style="font-weight:600">Finding the designs SPMe mis-scores: DFN calls (bar) and recall (label)</text>']
    for i, (lab, col) in enumerate(BARS):
        x = 12 + (i % 2) * 370
        y = 38 + (i // 2) * 16
        o.append(f'<rect x="{x}" y="{y - 9}" width="10" height="10" fill="{col}"/><text class="s" x="{x + 14}" y="{y}">{lab}</text>')
    y = top
    for name, n, nb, vals in R:
        o.append(f'<text x="12" y="{y + 2.5 * bar}">{name}</text>'
                 f'<text class="s" x="12" y="{y + 2.5 * bar + 14}">{nb} of {n} mis-scored</text>')
        for (share, rec), (_, col) in zip(vals, BARS):
            w = max(1.0, share * plot)
            o.append(f'<rect x="{left}" y="{y}" width="{w:.1f}" height="{bar - 2}" fill="{col}"/>'
                     f'<text class="s" x="{left + w + 4:.1f}" y="{y + bar - 3}">{share:.0%} of designs, recall {rec:.2f}</text>')
            y += bar
        y += gap
    for t in (0, 0.25, 0.5, 0.75, 1.0):
        x = left + t * plot
        o.append(f'<line x1="{x:.1f}" y1="{top - 4}" x2="{x:.1f}" y2="{y - gap + 2}" stroke="#ccc" stroke-dasharray="2,3"/>'
                 f'<text class="s" x="{x - 10:.1f}" y="{y + 8}">{t:.0%}</text>')
    o.append(f'<text class="s" x="{left}" y="{y + 24}">share of the pool sent to 100-cycle DFN</text></svg>')
    (HERE / "calibrate.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "calibrate.svg")


if __name__ == "__main__":
    main()
