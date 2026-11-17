"""Write regret.svg (milestone 6): each rule's worst-case regret over the three fitted models, its
median and 5-95% range over the joint bootstrap (fits refitted per draw) against the same draws
under fixed point fits. Reads regret.json (written by run.py; never retyped). Stdlib only.

python3 experiments/m6_uncertainty/figure.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERIES = (("worst_joint_q", "fits refitted in each draw", "#d9822b"),
          ("worst_fixed_q", "point fits, same village weights", "#2a6fdb"))


def main():
    d = json.loads((HERE / "regret.json").read_text())
    rules = d["rules"]
    order = sorted(range(len(rules)), key=lambda k: d["worst_joint_q"][1][k])
    left, right, top, rh = 160, 40, 64, 22
    W, H = 760, top + rh * len(rules) + 50
    xmax = max(max(d[s][2][k] for s, _, _ in SERIES for k in range(len(rules))) * 1.05, 0.02)
    x = lambda v: left + v / xmax * (W - left - right)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         'font-family="system-ui, sans-serif" font-size="12" role="img" aria-labelledby="t d">',
         '<title id="t">Worst-case seeding regret when the contagion model parameters are uncertain</title>',
         '<desc id="d">For each seeding rule on the 43 Karnataka villages, the worst share of adopters '
         'lost against the best rule over the information, threshold and reinforcement models: median '
         'and 5 to 95 percent range over a village bootstrap that refits the models in each draw, '
         'against the same draws under fixed point fits.</desc>',
         '<style>text{fill:#222}.ax{stroke:#888}@media (prefers-color-scheme:dark){text{fill:#ddd}}</style>',
         f'<text x="{left}" y="22" font-size="14" font-weight="600">Worst-case adopters lost, '
         'with parameter uncertainty (43 villages)</text>']
    for i, (_, name, col) in enumerate(SERIES):
        lx = left + i * 250
        o.append(f'<rect x="{lx}" y="34" width="12" height="10" fill="{col}"/>'
                 f'<text x="{lx + 16}" y="43">{name}</text>')
    step = 0.02 if xmax > 0.06 else 0.01
    for t in range(int(xmax / step) + 1):
        v = step * t
        o.append(f'<line class="ax" x1="{x(v):.1f}" y1="{top - 4}" x2="{x(v):.1f}" '
                 f'y2="{top + rh * len(rules)}" stroke-opacity="0.3"/>'
                 f'<text x="{x(v):.1f}" y="{top + rh * len(rules) + 16}" text-anchor="middle">'
                 f'{100 * v:.0f}%</text>')
    for r, k in enumerate(order):
        y0 = top + r * rh
        o.append(f'<text x="{left - 8}" y="{y0 + rh / 2 + 4:.1f}" text-anchor="end">{rules[k]}</text>')
        for i, (s, name, col) in enumerate(SERIES):
            lo, med, hi = (d[s][j][k] for j in range(3))
            y = y0 + 7 + i * 8
            o.append(f'<line x1="{x(lo):.1f}" y1="{y}" x2="{x(hi):.1f}" y2="{y}" stroke="{col}" '
                     f'stroke-width="2"/><circle cx="{x(med):.1f}" cy="{y}" r="3.5" fill="{col}">'
                     f'<title>{rules[k]}, {name}: median {100 * med:.1f}%, '
                     f'5-95% {100 * lo:.1f}-{100 * hi:.1f}%</title></circle>')
    o.append(f'<text x="{left}" y="{H - 10}" font-size="11">worst-case regret = max over I, T, R of '
             '1 &#8722; adopters / best rule&#8217;s; dd-p = degree discount with rate p; 500 draws</text>')
    o.append("</svg>")
    (HERE / "regret.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "regret.svg")


if __name__ == "__main__":
    main()
