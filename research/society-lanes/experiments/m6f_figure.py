"""Figure for milestone 6f.

m6f_factorial.svg: people's 8 m transit change (s) with 20% robots, by cause, in four crowd settings: seed
(crowd-side robots minus a density-matched control), robot (the same robots minus labelled people in their
place), and the factorial main effects of the robots' steering (crowd-side line vs people's rule) and of
their speed cap (1.2 m/s vs people's free-speed draw); 95% bootstrap intervals as whiskers.

Reads experiments/m6f_factorial_results.txt. Stdlib only. Run: python3 experiments/m6f_figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
LINE = re.compile(r"^\s+(\w+)\s+x([\d.]+)\s+transit\s+(.*)$")
EFF = re.compile(r"(\w+) ([-+][\d.]+) \[([-+][\d.]+), ([-+][\d.]+)\]")
SETTINGS = [("sf", "0.75", "social force"), ("cfsm", "0.5", "collision-free speed"),
            ("orca", "0.02", "ORCA, street-like"), ("orca", "1.0", "ORCA, fitted")]
KINDS = [("seed", "robots vs density control", "#2a6fdb"), ("robot", "robots vs people in their place", "#d9822b"),
         ("steer", "steering: line vs people's rule", "#1b9e77"), ("cap", "speed: 1.2 m/s cap vs people's", "#9a4dc4")]


def read():
    d = {}
    for line in (HERE / "m6f_factorial_results.txt").read_text().splitlines():
        m = LINE.match(line)
        if m:
            for kind, v, lo, hi in EFF.findall(m.group(3)):
                d[(m.group(1), m.group(2), kind)] = (float(v), float(lo), float(hi))
    return d


def svg(d):
    W, H, L, R, T, B = 680, 400, 64, 16, 64, 92
    vals = [x for k in d.values() for x in k]
    lo, hi = min(0.0, min(vals)), max(0.0, max(vals))
    pad = 0.08 * (hi - lo)
    lo, hi = lo - pad, hi + pad
    y = lambda v: T + (hi - v) / (hi - lo) * (H - T - B)  # noqa: E731
    gw = (W - L - R) / len(SETTINGS)
    bw = gw * 0.8 / len(KINDS)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="Change in people\'s transit time with 20% robots by cause in four crowd settings" '
         f'font-family="sans-serif" font-size="12">',
         '<style>text{fill:#222}@media (prefers-color-scheme: dark){text{fill:#ddd}}</style>',
         f'<text x="{W / 2}" y="22" text-anchor="middle" font-size="15">A crowd-side robot costs people less than a person does</text>',
         f'<text x="{W / 2}" y="40" text-anchor="middle">change in people\'s 8 m transit (s), 20% robots, 95% intervals</text>']
    step = 0.5 if hi - lo < 4 else 1.0
    t = step * int(lo / step)
    while t <= hi:
        if t >= lo:
            o.append(f'<line x1="{L}" x2="{W - R}" y1="{y(t):.1f}" y2="{y(t):.1f}" stroke="#888" stroke-opacity="0.25"/>'
                     f'<text x="{L - 6}" y="{y(t) + 4:.1f}" text-anchor="end">{t:+.1f}</text>')
        t += step
    o.append(f'<line x1="{L}" x2="{W - R}" y1="{y(0):.1f}" y2="{y(0):.1f}" stroke="#888"/>')
    for i, (fam, m, name) in enumerate(SETTINGS):
        x0 = L + i * gw + gw * 0.1
        for j, (kind, _, col) in enumerate(KINDS):
            v, a, b = d[(fam, m, kind)]
            x = x0 + j * bw
            top, bot = sorted((y(v), y(0)))
            o.append(f'<rect x="{x:.1f}" y="{top:.1f}" width="{bw * 0.9:.1f}" height="{bot - top:.1f}" fill="{col}"/>')
            cx = x + bw * 0.45
            o.append(f'<line x1="{cx:.1f}" x2="{cx:.1f}" y1="{y(a):.1f}" y2="{y(b):.1f}" stroke="#555"/>')
        o.append(f'<text x="{L + i * gw + gw / 2:.1f}" y="{H - B + 18}" text-anchor="middle">{name}</text>')
    for j, (_, label, col) in enumerate(KINDS):
        lx, ly = L + (j % 2) * 300, H - B + 44 + (j // 2) * 18
        o.append(f'<rect x="{lx}" y="{ly - 10}" width="12" height="12" fill="{col}"/>'
                 f'<text x="{lx + 18}" y="{ly}">{label}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def main():
    (HERE / "m6f_factorial.svg").write_text(svg(read()))


if __name__ == "__main__":
    main()
