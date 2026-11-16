"""Write survey.svg (milestone 9): worst-case regret over the three fitted models against the
survey share, for each survey design (colour) and ranking (solid: top estimated degree, dashed:
degree discount on the seen ties), with census top degree and census degree discount as
reference lines. Numbers from regret.json (written by run.py; never retyped). Stdlib only.

python3 experiments/m9_survey/figure.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DESIGNS = (("uniform", "#1f6fb2"), ("adaptive", "#c0392b"), ("walk", "#2e8b57"))
KINDS = (("deg", "top estimated degree", ""), ("dd", "degree discount on seen ties", "6 4"))
SHARES = (0.1, 0.25, 0.5)


def main():
    d = json.loads((HERE / "regret.json").read_text())
    w = dict(zip(d["rules"], d["worst"]))
    refs = (("census top degree", w["degree"]), ("census degree discount", w["degree-discount"]))
    vals = [w[f"{a}-{k}-{f}"] for a, _ in DESIGNS for k, _, _ in KINDS for f in SHARES] + [v for _, v in refs]
    W, H, L, R, T, B = 680, 420, 64, 180, 50, 56
    ymax = max(vals) * 1.08
    px = lambda i: L + i / (len(SHARES) - 1) * (W - L - R)
    py = lambda y: T + (1 - y / ymax) * (H - T - B)
    f = 'font-family="system-ui, sans-serif"'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         'aria-labelledby="t d">',
         '<title id="t">Worst-case adopters lost by survey share, design and ranking</title>',
         '<desc id="d">For seeding rules that see only a sampled share of households\' ties, the '
         'largest share of expected adopters lost against the best rule under the information, '
         'threshold and reinforcement models fitted to 43 Karnataka villages.</desc>',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{L}" y="24" {f} font-size="14" font-weight="600">Adopters lost under the worst fitted '
         'model, by survey share (43 villages)</text>']
    step = 0.01 if ymax < 0.08 else 0.02
    k = 0
    while k * step <= ymax:
        y = k * step
        o.append(f'<line x1="{L}" x2="{W - R}" y1="{py(y):.1f}" y2="{py(y):.1f}" stroke="#ddd"/>'
                 f'<text x="{L - 6}" y="{py(y) + 4:.1f}" text-anchor="end" {f} font-size="11">{100 * y:.0f}%</text>')
        k += 1
    for i, s in enumerate(SHARES):
        o.append(f'<text x="{px(i):.1f}" y="{H - B + 16}" text-anchor="middle" {f} font-size="11">{100 * s:.0f}%</text>')
    o.append(f'<text x="{(L + W - R) / 2}" y="{H - 14}" text-anchor="middle" {f} font-size="12">share of households '
             'surveyed</text>')
    for name, v in refs:
        o.append(f'<line x1="{L}" x2="{W - R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#555" stroke-dasharray="2 3"/>'
                 f'<text x="{W - R + 6}" y="{py(v) + 4:.1f}" {f} font-size="11">{name} {100 * v:.1f}%</text>')
    ly = T + 10
    for a, col in DESIGNS:
        for kk, kname, dash in KINDS:
            ys = [w[f"{a}-{kk}-{s}"] for s in SHARES]
            pts = " ".join(f"{px(i):.1f},{py(y):.1f}" for i, y in enumerate(ys))
            o.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2" stroke-dasharray="{dash}"/>')
            o += [f'<circle cx="{px(i):.1f}" cy="{py(y):.1f}" r="3" fill="{col}"><title>{a}, {kname}, '
                  f'{100 * s:.0f}%: {100 * y:.2f}%</title></circle>' for i, (s, y) in enumerate(zip(SHARES, ys))]
    for a, col in DESIGNS:
        o.append(f'<rect x="{W - R + 6}" y="{ly}" width="14" height="4" fill="{col}"/>'
                 f'<text x="{W - R + 26}" y="{ly + 5}" {f} font-size="11">{a}</text>')
        ly += 16
    for kk, kname, dash in KINDS:
        o.append(f'<line x1="{W - R + 6}" x2="{W - R + 20}" y1="{ly + 2}" y2="{ly + 2}" stroke="#333" '
                 f'stroke-width="2" stroke-dasharray="{dash}"/>'
                 f'<text x="{W - R + 26}" y="{ly + 5}" {f} font-size="10">{kname}</text>')
        ly += 16
    o.append("</svg>")
    (HERE / "survey.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "survey.svg")


if __name__ == "__main__":
    main()
