"""Write experiments/fade/fade.svg: one panel per fresh condition, every design's Wh/kg at cycle 10 of its own DFN@10 run
against its DFN@100 score, the screen's top 3 ringed and the pool's DFN best starred.

    python experiments/fade/figure.py

Numbers come from the committed summary.json (its per-design rows). Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    S = json.loads((HERE / "summary.json").read_text())
    conds = [c for c in S["kept"] if c in S["extra"]]
    pw, ph, gap, top, left = 250, 220, 50, 60, 60
    W = left + len(conds) * (pw + gap) + 10
    H = top + ph + 60
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="sans-serif" font-size="12">',
         '<style>text{fill:#222} .s{font-size:11px;fill:#555} @media (prefers-color-scheme: dark){text{fill:#ddd} .s{fill:#aaa}}</style>',
         '<text x="12" y="22" style="font-weight:600">Does a 10-cycle DFN run rank the 100-cycle score? (fresh conditions, Sobol seed 10)</text>',
         '<text class="s" x="12" y="40">x: Wh/kg at cycle 10 (separate DFN@10 run); y: Wh/kg at cycle 100 (DFN@100); ring = screen\'s top 3; star = pool best</text>']
    for n, c in enumerate(conds):
        rows = S["extra"][c]["rows"]
        x0 = left + n * (pw + gap)
        xs = [r["short"] for r in rows]
        ys = [r["score"] for r in rows]
        xlo, xhi = min(xs) * 0.97, max(xs) * 1.03
        ylo, yhi = min(ys) * 0.97, max(ys) * 1.03
        X = lambda v: x0 + (v - xlo) / (xhi - xlo) * pw
        Y = lambda v: top + ph - (v - ylo) / (yhi - ylo) * ph
        o.append(f'<rect x="{x0}" y="{top}" width="{pw}" height="{ph}" fill="none" stroke="#888"/>')
        picked = sorted(range(len(rows)), key=lambda i: -xs[i])[:3]
        b = max(range(len(rows)), key=lambda i: ys[i])
        for i in range(len(rows)):
            ring = ' stroke="#2f7d4f" stroke-width="2"' if i in picked else ""
            o.append(f'<circle cx="{X(xs[i]):.1f}" cy="{Y(ys[i]):.1f}" r="4" fill="#5b7fb8" fill-opacity="0.75"{ring}/>')
        o.append(f'<text x="{X(xs[b]) - 6:.1f}" y="{Y(ys[b]) - 7:.1f}" style="fill:#d08a00;font-size:16px">&#9733;</text>')
        cc = S["conditions"][c]
        o.append(f'<text x="{x0}" y="{top - 6}" style="font-weight:600">{c}: Spearman {cc["rho_short"]:.2f}, gap {100 * cc["gap"]:.1f}%</text>')
        o.append(f'<text class="s" x="{x0}" y="{top + ph + 16}">{xlo:.0f}</text><text class="s" x="{x0 + pw - 24}" y="{top + ph + 16}">{xhi:.0f}</text>')
        o.append(f'<text class="s" x="{x0 + pw / 2 - 40}" y="{top + ph + 32}">cycle-10 Wh/kg</text>')
        o.append(f'<text class="s" x="{x0 - 4}" y="{top + 10}" text-anchor="end">{yhi:.0f}</text><text class="s" x="{x0 - 4}" y="{top + ph}" text-anchor="end">{ylo:.0f}</text>')
    o.append(f'<text class="s" x="12" y="{top + ph / 2 + 40}" transform="rotate(-90 12 {top + ph / 2 + 40})">cycle-100 Wh/kg</text>')
    o.append('</svg>')
    (HERE / "fade.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "fade.svg")


if __name__ == "__main__":
    main()
