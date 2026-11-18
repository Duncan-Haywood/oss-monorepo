"""Figure for milestone 5b: robot-person close-pass rate (clearance under 0.5 m) by robot policy in
all five crowd families at 20% robots (pooled over the two HERMES runs, pass-weighted).

Reads experiments/m5_robots_runs.csv (milestone 5a) and experiments/m5b_robots_runs.csv. Stdlib only.
Run: python3 experiments/m5b_figure.py
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FAMS = [("cfsm", "collision-free speed *"), ("sf", "social force *"), ("orca", "ORCA *"),
        ("avm", "anticipation velocity"), ("pl", "power law")]
POLS = [("crowd", "#1f78b4", "crowd's side"), ("adapt", "#a6cee3", "adapt to majority"),
        ("goal", "#33a02c", "lateral goal"), ("opposite", "#e31a1c", "opposite side")]
SHARE, SPEED = 0.20, 1.2


def read():
    acc = {}
    for name in ("m5_robots_runs.csv", "m5b_robots_runs.csv"):
        with open(os.path.join(HERE, name)) as f:
            for r in csv.DictReader(f):
                if float(r["share"]) != SHARE or float(r["robot_speed"]) != SPEED:
                    continue
                w, c = float(r["rp_passes"]), float(r["rp_close"])
                if c == c:
                    a = acc.setdefault((r["family"], r["policy"]), [0.0, 0.0])
                    a[0] += c * w
                    a[1] += w
    return {k: v[0] / v[1] for k, v in acc.items() if v[1]}


def main():
    d = read()
    W, H, l, r, t, b = 760, 470, 200, 40, 46, 70
    hi = 0.9
    X = lambda v: l + v / hi * (W - l - r)  # noqa: E731
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         '<text x="16" y="22" font-size="13">Share of robot-person passes closer than 0.5 m, 20% robots at 1.2 m/s, five crowd models</text>']
    for v in (0.0, 0.2, 0.4, 0.6, 0.8):
        o.append(f'<line x1="{X(v):.1f}" x2="{X(v):.1f}" y1="{t}" y2="{H - b}" stroke="#eee"/>')
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 16}" text-anchor="middle">{v:.1f}</text>')
    band = (H - t - b) / len(FAMS)
    bh = band / (len(POLS) + 1)
    for i, (fam, name) in enumerate(FAMS):
        y0 = t + i * band + bh * 0.5
        o.append(f'<text x="{l - 8}" y="{y0 + 2.2 * bh:.1f}" text-anchor="end">{name}</text>')
        for j, (pol, col, _) in enumerate(POLS):
            v = d.get((fam, pol))
            if v is None:
                continue
            y = y0 + j * bh
            o.append(f'<rect x="{X(0):.1f}" y="{y:.1f}" width="{X(v) - X(0):.1f}" height="{bh - 2:.1f}" fill="{col}"/>')
            o.append(f'<text x="{X(v) + 4:.1f}" y="{y + bh - 4:.1f}" font-size="10">{v:.2f}</text>')
    for j, (_, col, s) in enumerate(POLS):
        xx = 16 + j * 180
        o.append(f'<rect x="{xx}" y="{H - 40}" width="10" height="10" fill="{col}"/><text x="{xx + 14}" y="{H - 31}" font-size="11">{s}</text>')
    o.append(f'<text x="16" y="{H - 12}" font-size="11">* passed the held-out share test with the yielding bias; these three rank the policies identically at every share</text>')
    o.append("</svg>")
    with open(os.path.join(HERE, "m5b_robots.svg"), "w") as f:
        f.write("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
