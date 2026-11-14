"""Write regret.svg: each seeding rule's regret (share of adopters lost against the best rule)
under the three fitted models, from regret.json (written by run.py; never retyped). Stdlib only.

python3 experiments/m4_seeding/figure.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS = (("I", "information", "#2a6fdb"), ("T", "threshold", "#d9822b"),
          ("R", "reinforcement", "#3a9d5d"))


def main():
    d = json.loads((HERE / "regret.json").read_text())
    rules = d["rules"]
    worst = [max(d["regret"][m][k] for m, _, _ in MODELS) for k in range(len(rules))]
    order = sorted(range(len(rules)), key=lambda k: worst[k])
    left, right, top, bh = 120, 40, 60, 7
    rh = bh * len(MODELS) + 10
    W, H = 720, top + rh * len(rules) + 50
    xmax = max(0.02, max(worst) * 1.1)
    x = lambda v: left + v / xmax * (W - left - right)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         'font-family="system-ui, sans-serif" font-size="12" role="img" aria-labelledby="t d">',
         '<title id="t">Regret of ten seeding rules under three fitted contagion models</title>',
         '<desc id="d">For each seeding rule, the share of expected adopters lost against the best '
         'rule, under the information, threshold and reinforcement models fitted to the 43 '
         'Karnataka villages. Rules sorted by their worst case.</desc>',
         '<style>text{fill:#222}.ax{stroke:#888}@media (prefers-color-scheme:dark){text{fill:#ddd}}</style>',
         f'<text x="{left}" y="22" font-size="14" font-weight="600">Adopters lost against the best '
         'rule, by model (43 villages, same seed budget)</text>']
    for i, (m, name, col) in enumerate(MODELS):
        lx = left + i * 170
        o.append(f'<rect x="{lx}" y="34" width="12" height="10" fill="{col}"/>'
                 f'<text x="{lx + 16}" y="43">{name} ({m})</text>')
    for t in range(6):
        v = xmax * t / 5
        o.append(f'<line class="ax" x1="{x(v):.1f}" y1="{top - 4}" x2="{x(v):.1f}" '
                 f'y2="{top + rh * len(rules)}" stroke-opacity="0.3"/>'
                 f'<text x="{x(v):.1f}" y="{top + rh * len(rules) + 16}" text-anchor="middle">'
                 f'{100 * v:.1f}%</text>')
    for r, k in enumerate(order):
        y0 = top + r * rh
        o.append(f'<text x="{left - 8}" y="{y0 + rh / 2 + 2:.1f}" text-anchor="end">{rules[k]}</text>')
        for i, (m, _, col) in enumerate(MODELS):
            v = d["regret"][m][k]
            o.append(f'<rect x="{left}" y="{y0 + 3 + i * bh}" width="{max(x(v) - left, 0.5):.1f}" '
                     f'height="{bh - 1}" fill="{col}"><title>{rules[k]} under {m}: '
                     f'{100 * v:.2f}%</title></rect>')
    o.append(f'<text x="{left}" y="{H - 10}" font-size="11">regret = 1 &#8722; adopters / best '
             'rule&#8217;s adopters under that model; 200 runs per village</text>')
    o.append("</svg>")
    (HERE / "regret.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "regret.svg")


if __name__ == "__main__":
    main()
