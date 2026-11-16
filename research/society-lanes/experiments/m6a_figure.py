"""Figure for milestone 6a: robot-person close-pass rate (clearance under 0.5 m) by robot policy at
20% robots, in the three families that passed the held-out test, at their fitted side bias and at
half of it, with the 95% bootstrap interval over fresh seeds (pooled over the two HERMES runs).

Reads experiments/m6a_h5_results.txt. Stdlib only. Run: python3 experiments/m6a_figure.py
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
FAMS = [("sf", "social force"), ("cfsm", "collision-free speed"), ("orca", "ORCA")]
LEVELS = [("fitted", "fitted bias"), ("weak", "half bias")]
POLS = [("crowd", "#1f78b4", "crowd's side"), ("adapt", "#a6cee3", "adapt to majority"),
        ("goal", "#33a02c", "lateral goal"), ("opposite", "#e31a1c", "opposite side")]
SHARE = "0.20"
LINE = re.compile(r"^\s+(\w+)\s+(\w+)\s+([\d.]+)\s+(\w+)\s+close ([\d.na]+) \[([\d.na]+), ([\d.na]+)\]")


def read():
    d = {}
    with open(os.path.join(HERE, "m6a_h5_results.txt")) as f:
        for line in f:
            m = LINE.match(line)
            if m and m.group(3) == SHARE:
                d[(m.group(1), m.group(2), m.group(4))] = tuple(float(m.group(i)) for i in (5, 6, 7))
    return d


def main():
    d = read()
    W, H, l, r, t, b = 780, 560, 230, 40, 46, 76
    hi = 1.0
    X = lambda v: l + v / hi * (W - l - r)  # noqa: E731
    rows = [(lev, fam, f"{fn}, {ln}") for fam, fn in FAMS for lev, ln in LEVELS]
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         '<text x="16" y="22" font-size="13">Share of robot-person passes closer than 0.5 m, 20% robots, fresh seeds (95% interval)</text>']
    for v in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0):
        o.append(f'<line x1="{X(v):.1f}" x2="{X(v):.1f}" y1="{t}" y2="{H - b}" stroke="#eee"/>')
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 16}" text-anchor="middle">{v:.1f}</text>')
    band = (H - t - b) / len(rows)
    bh = band / (len(POLS) + 1)
    for i, (lev, fam, name) in enumerate(rows):
        y0 = t + i * band + bh * 0.5
        o.append(f'<text x="{l - 8}" y="{y0 + 2.2 * bh:.1f}" text-anchor="end">{name}</text>')
        for j, (pol, col, _) in enumerate(POLS):
            v = d.get((lev, fam, pol))
            if v is None:
                continue
            y = y0 + j * bh
            o.append(f'<rect x="{X(0):.1f}" y="{y:.1f}" width="{X(v[0]) - X(0):.1f}" height="{bh - 2:.1f}" fill="{col}"/>')
            ym = y + (bh - 2) / 2
            o.append(f'<line x1="{X(v[1]):.1f}" x2="{X(v[2]):.1f}" y1="{ym:.1f}" y2="{ym:.1f}" stroke="#333"/>')
            o.append(f'<text x="{X(v[2]) + 4:.1f}" y="{y + bh - 4:.1f}" font-size="10">{v[0]:.2f}</text>')
    for j, (_, col, s) in enumerate(POLS):
        xx = 16 + j * 180
        o.append(f'<rect x="{xx}" y="{H - 44}" width="10" height="10" fill="{col}"/><text x="{xx + 14}" y="{H - 35}" font-size="11">{s}</text>')
    o.append(f'<text x="16" y="{H - 14}" font-size="11">Pooled over HERMES bo-360-090-090 and bo-360-160-160; 20 seeds per cell; bootstrap over seeds (B = 1000)</text>')
    o.append("</svg>")
    with open(os.path.join(HERE, "m6a_h5_closepass.svg"), "w") as f:
        f.write("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
