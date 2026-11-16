"""Figures for milestone 5a, by robot policy, share and family (N = 60, robots at 0.9 m/s), with
95% bootstrap intervals: human delay per robot pass (m5a_robots.svg) and the change in the humans'
lane order against the no-robot crowd (m5a_robots_lanes.svg).

Reads experiments/m5a_robots_cells.csv (written by m5a_robots.py). Stdlib only.
Run: python3 experiments/m5a_figure.py
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FAMS = [("cfsm", "collision-free speed"), ("sf", "social force")]
POLS = [("crowd", "#1f78b4", "crowd's side"), ("adapt", "#a6cee3", "adapt to majority"),
        ("goal", "#33a02c", "lateral goal"), ("opposite", "#e31a1c", "opposite side")]
N = "60"
SPEED = "0.9"


METRICS = [("delay_s", "delay_lo", "delay_hi", "m5a_robots.svg",
            "Extra human seconds per robot pass (8 m section, 60 agents, robots 0.9 m/s; 95% bootstrap)"),
           ("d_lane", "d_lane_lo", "d_lane_hi", "m5a_robots_lanes.svg",
            "Change in the humans' lane order against no robots (60 agents, robots 0.9 m/s; 95% bootstrap)")]


def read(m, lo_, hi_):
    out = {}
    with open(os.path.join(HERE, "m5a_robots_cells.csv")) as f:
        for r in csv.DictReader(f):
            if r["N"] == N and r["robot_speed"] == SPEED:
                out[(r["family"], r["share"], r["policy"])] = (float(r[m]), float(r[lo_]), float(r[hi_]))
    return out


def main():
    for m, lo_, hi_, name, title in METRICS:
        draw(read(m, lo_, hi_), name, title)


def draw(d, name, title):
    shares = sorted({k[1] for k in d}, key=float)
    rows = [(f, s) for f, _ in FAMS for s in shares]
    vals = [v for v in d.values()]
    lo = min(0.0, min(v[1] for v in vals))
    hi = max(0.0, max(v[2] for v in vals)) * 1.08 + 0.02 * (max(v[2] for v in vals) - lo)
    W, H, l, r, t, b = 760, 120 + 64 * len(rows), 230, 40, 46, 64
    X = lambda v: l + (v - lo) / (hi - lo) * (W - l - r)  # noqa: E731
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="16" y="22" font-size="13">{title}</text>']
    step = (hi - lo) / 6
    k = 0
    while lo + k * step <= hi:
        v = lo + k * step
        o.append(f'<line x1="{X(v):.1f}" x2="{X(v):.1f}" y1="{t}" y2="{H - b}" stroke="#eee"/>')
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 16}" text-anchor="middle">{v:.2f}</text>' if hi - lo < 1 else f'<text x="{X(v):.1f}" y="{H - b + 16}" text-anchor="middle">{v:.1f}</text>')
        k += 1
    o.append(f'<line x1="{X(0):.1f}" x2="{X(0):.1f}" y1="{t}" y2="{H - b}" stroke="#888"/>')
    band = (H - t - b) / len(rows)
    bh = band / (len(POLS) + 1)
    for i, (fam, sh) in enumerate(rows):
        y0 = t + i * band + bh * 0.5
        fname = dict(FAMS)[fam]
        o.append(f'<text x="{l - 8}" y="{y0 + 2.2 * bh:.1f}" text-anchor="end">{fname}, {round(float(sh) * 100)}% robots</text>')
        for j, (pol, col, _) in enumerate(POLS):
            v = d.get((fam, sh, pol))
            if v is None:
                continue
            y = y0 + j * bh
            x0, x1 = sorted((X(0), X(v[0])))
            o.append(f'<rect x="{x0:.1f}" y="{y:.1f}" width="{x1 - x0:.1f}" height="{bh - 2:.1f}" fill="{col}"/>')
            o.append(f'<line x1="{X(v[1]):.1f}" x2="{X(v[2]):.1f}" y1="{y + bh / 2 - 1:.1f}" y2="{y + bh / 2 - 1:.1f}" stroke="#333"/>')
    for j, (_, col, s) in enumerate(POLS):
        xx = 16 + j * 180
        o.append(f'<rect x="{xx}" y="{H - 24}" width="10" height="10" fill="{col}"/><text x="{xx + 14}" y="{H - 15}" font-size="11">{s}</text>')
    o.append("</svg>")
    with open(os.path.join(HERE, name), "w") as f:
        f.write("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
