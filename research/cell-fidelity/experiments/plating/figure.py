"""Write experiments/plating/plating.svg: per condition, Spearman rank correlation with the DFN@100 score of SPMe's
cycle-2 energy (w2) and of the plating-limited prediction, with the (U) thermodynamic energy for reference.

    python experiments/plating/figure.py

Numbers come from the committed dev.json. Stdlib only.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARKS = (("w2", "SPMe cycle-2 energy (w2)", "#3d72b8"), ("limited", "w2 with self-limited plating loss", "#d0702a"),
         ("u", "thermodynamic energy U (5k)", "#999"))


def main():
    S = json.loads((HERE / "dev.json").read_text())
    C = S["conditions"]
    conds = list(C)
    left, top, rowh, pw = 170, 80, 14, 480
    W, H = left + pw + 30, top + len(conds) * rowh + 50
    X = lambda v: left + (v + 1) / 2 * pw
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="sans-serif" font-size="11">',
         '<style>text{fill:#222} .s{fill:#555} .ax{stroke:#888} @media (prefers-color-scheme: dark){text{fill:#ddd} .s{fill:#aaa}}</style>',
         '<text x="12" y="22" font-size="13" style="font-weight:600">Two SPMe cycles that see plating do not rank the 100-cycle DFN designs</text>',
         '<text class="s" x="12" y="40">Spearman with each pool\'s DFN@100 Wh/kg, 36 committed conditions (PyBaMM 26.10.1.1); * = read before the plan</text>']
    lx = 12
    for k, name, col in MARKS:
        o.append(f'<circle cx="{lx + 5}" cy="57" r="4" fill="{col}"/><text class="s" x="{lx + 14}" y="61">{name}</text>')
        lx += 24 + 5.6 * len(name)
    for t in (-1, -0.5, 0, 0.5, 1):
        o.append(f'<line class="ax" x1="{X(t):.1f}" x2="{X(t):.1f}" y1="{top - 6}" y2="{H - 40}" stroke-opacity="{0.9 if t == 0 else 0.25}"/>')
        o.append(f'<text class="s" x="{X(t):.1f}" y="{H - 26}" text-anchor="middle">{t:+.1f}</text>')
    seen = set(S["seen"])
    for n, c in enumerate(conds):
        y = top + n * rowh + rowh / 2
        o.append(f'<text x="{left - 8}" y="{y + 4:.1f}" text-anchor="end">{c}{" *" if c in seen else ""}</text>')
        for k, _, col in MARKS:
            v = C[c]["rho"].get(k)
            if v is not None:
                o.append(f'<circle cx="{X(v):.1f}" cy="{y:.1f}" r="3.5" fill="{col}" fill-opacity="0.85"/>')
    o.append(f'<text class="s" x="{left}" y="{H - 8}">Spearman rank correlation with the DFN@100 score (1 = same order)</text>')
    o.append("</svg>")
    (HERE / "plating.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
