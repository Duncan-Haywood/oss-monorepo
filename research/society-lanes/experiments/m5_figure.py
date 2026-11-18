"""Figure for milestone 5a: human costs of four robot passing policies at 20% robots, three families.

Left: the people's mean delay per transit of the 8 m section against the crowd with no robots (s).
Right: the share of robot-person passes with clearance under 0.5 m; the tick is the person-person
rate in the crowd with no robots. Reads the pooled block of experiments/m5_robots_results.txt
(written by m5_robots.py). Stdlib only. Run: python3 experiments/m5_figure.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FAMS = [("sf", "social force"), ("avm", "anticipation velocity"), ("cfsm", "collision-free speed")]
POLS = [("crowd", "#1f78b4", "hold the crowd's side"), ("adapt", "#33a02c", "follow local majority"),
        ("goal", "#ff7f00", "lateral exit goal"), ("opposite", "#e31a1c", "hold the other side")]


def read():
    lines = open(os.path.join(HERE, "m5_robots_results.txt")).read().splitlines()
    i = next(k for k, l in enumerate(lines) if l.startswith("== Pooled"))
    vals, pp = {}, {}
    for l in lines[i + 2:]:
        if not l.strip() or l.startswith("=="):
            break
        t = l.split()
        if t[1] == "none":
            pp[t[0]] = float(t[-1])
        elif float(t[2]) == 0.20:
            vals[(t[0], t[1])] = (float(t[3]), float(t[5]))
    return vals, pp


def panel(o, x0, w, t, h, lo, hi, ticks, title, get, ref=None):
    X = lambda v: x0 + (v - lo) / (hi - lo) * w
    o.append(f'<text x="{x0}" y="{t - 10}" font-size="12">{title}</text>')
    for v in ticks:
        o.append(f'<line x1="{X(v):.1f}" x2="{X(v):.1f}" y1="{t}" y2="{t + h}" stroke="#eee"/>')
        o.append(f'<text x="{X(v):.1f}" y="{t + h + 15}" text-anchor="middle" font-size="11">{v:g}</text>')
    o.append(f'<line x1="{X(max(lo, 0)):.1f}" x2="{X(max(lo, 0)):.1f}" y1="{t}" y2="{t + h}" stroke="#888"/>')
    band = h / len(FAMS)
    bh = band / (len(POLS) + 1.2)
    for i, (fam, _) in enumerate(FAMS):
        y0 = t + i * band + bh * 0.6
        for j, (pol, col, _) in enumerate(POLS):
            v = get(fam, pol)
            y = y0 + j * bh
            a, b = sorted((X(max(lo, 0)), X(v)))
            o.append(f'<rect x="{a:.1f}" y="{y:.1f}" width="{max(b - a, 0.8):.1f}" height="{bh - 2:.1f}" fill="{col}"/>')
            o.append(f'<text x="{max(a, b) + 3:.1f}" y="{y + bh - 4:.1f}" font-size="9">{v:.2f}</text>')
        if ref:
            r = ref(fam)
            o.append(f'<line x1="{X(r):.1f}" x2="{X(r):.1f}" y1="{y0 - 2:.1f}" y2="{y0 + len(POLS) * bh:.1f}" '
                     f'stroke="#000" stroke-width="2" stroke-dasharray="3 2"/>')


def main():
    vals, pp = read()
    W, H, l, t, h = 820, 400, 170, 58, 270
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         '<text x="16" y="22" font-size="13">Robots as 20% of the agents in three fitted crowd models (HERMES 3.6 m corridor, pooled over two runs)</text>']
    band = h / len(FAMS)
    for i, (_, name) in enumerate(FAMS):
        o.append(f'<text x="{l - 10}" y="{t + i * band + band / 2:.1f}" text-anchor="end">{name}</text>')
    panel(o, l, 280, t, h, -0.5, 4.0, [0, 1, 2, 3, 4], "people's delay per transit (s)",
          lambda f, p: vals[(f, p)][0])
    panel(o, l + 330, 280, t, h, 0.0, 0.8, [0, 0.2, 0.4, 0.6, 0.8], "close robot passes (clearance &lt; 0.5 m)",
          lambda f, p: vals[(f, p)][1], ref=lambda f: pp[f])
    for j, (_, col, s) in enumerate(POLS):
        xx = 16 + j * 195
        o.append(f'<rect x="{xx}" y="{H - 24}" width="10" height="10" fill="{col}"/>'
                 f'<text x="{xx + 14}" y="{H - 15}" font-size="11">{s}</text>')
    o.append(f'<text x="{l + 330}" y="{t + h + 32}" font-size="10">dashed: person-person rate, no robots</text>')
    o.append("</svg>")
    with open(os.path.join(HERE, "m5_robots.svg"), "w") as f:
        f.write("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
