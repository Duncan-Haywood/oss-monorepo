"""Write experiments/edge/edge.svg: one panel per fresh condition, every design at (r_kt, U), shaded by its DFN@100 score
(darker is higher), the 0.10 salt flag, the first (U, r_kt) Pareto layer ringed and the pool's DFN best starred.

    python experiments/edge/figure.py

Numbers come from the committed summary.json (its per-design rows). Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _front(pts):
    return {i for i, p in enumerate(pts) if not any(q[0] >= p[0] and q[1] >= p[1] and q != p for q in pts)}


def main():
    S = json.loads((HERE / "summary.json").read_text())
    conds = [c for c in S["kept"] if c in S["extra"]]
    pw, ph, gap, top, left = 250, 220, 40, 60, 60
    W = left + len(conds) * (pw + gap) + 10
    H = top + ph + 70
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="sans-serif" font-size="12">',
         '<style>text{fill:#222} .s{font-size:11px;fill:#555} @media (prefers-color-scheme: dark){text{fill:#ddd} .s{fill:#aaa}}</style>',
         f'<text x="12" y="22" style="font-weight:600">Where the DFN@100 best sits: thermodynamic energy U against the salt number r_kt (fresh, Sobol seed 9)</text>',
         '<text class="s" x="12" y="40">darker = higher DFN Wh/kg at cycle 100; ring = first (U, r_kt) Pareto layer; star = pool best; dashed = r_kt 0.10 flag</text>']
    for n, c in enumerate(conds):
        rows = S["extra"][c]["rows"]
        x0 = left + n * (pw + gap)
        xs = [r["rkt"] for r in rows]
        us = [r["u"] for r in rows]
        sc = [r["score"] for r in rows]
        xlo, xhi = min(min(xs), 0.0) - 0.05, max(xs) + 0.05
        ulo, uhi = min(us) * 0.97, max(us) * 1.03
        slo, shi = min(sc), max(sc)
        X = lambda v: x0 + (v - xlo) / (xhi - xlo) * pw
        Y = lambda v: top + ph - (v - ulo) / (uhi - ulo) * ph
        o.append(f'<rect x="{x0}" y="{top}" width="{pw}" height="{ph}" fill="none" stroke="#888"/>')
        o.append(f'<line x1="{X(0.10):.1f}" y1="{top}" x2="{X(0.10):.1f}" y2="{top + ph}" stroke="#c4473a" stroke-dasharray="4 3"/>')
        fr = _front([(r["u"], r["rkt"]) for r in rows])
        b = max(range(len(rows)), key=lambda i: sc[i])
        for i, r in enumerate(rows):
            t = (sc[i] - slo) / (shi - slo) if shi > slo else 1
            g = int(220 - 190 * t)
            o.append(f'<circle cx="{X(xs[i]):.1f}" cy="{Y(us[i]):.1f}" r="4" fill="rgb({g},{g},{min(255, g + 30)})"'
                     f'{" stroke=\"#2f7d4f\" stroke-width=\"2\"" if i in fr else ""}/>')
        bx, by = X(xs[b]), Y(us[b])
        o.append(f'<text x="{bx - 6:.1f}" y="{by - 7:.1f}" style="fill:#d08a00;font-size:16px">&#9733;</text>')
        o.append(f'<text x="{x0}" y="{top - 6}" style="font-weight:600">{c}</text>')
        o.append(f'<text class="s" x="{x0}" y="{top + ph + 16}">{xlo:.2f}</text><text class="s" x="{x0 + pw - 28}" y="{top + ph + 16}">{xhi:.2f}</text>')
        o.append(f'<text class="s" x="{x0 + pw / 2 - 12}" y="{top + ph + 32}">r_kt</text>')
        o.append(f'<text class="s" x="{x0 - 4}" y="{top + 10}" text-anchor="end">{uhi:.0f}</text><text class="s" x="{x0 - 4}" y="{top + ph}" text-anchor="end">{ulo:.0f}</text>')
    o.append(f'<text class="s" x="12" y="{top + ph / 2}" transform="rotate(-90 12 {top + ph / 2})">U, Wh/kg (stack)</text>')
    o.append('</svg>')
    (HERE / "edge.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "edge.svg")


if __name__ == "__main__":
    main()
