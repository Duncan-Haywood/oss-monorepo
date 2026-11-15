"""Figure for milestone 4a: held-out assigned-exit runs, simulated against observed share on own right.

Social force at exits a quarter width in (milestone 3's assumption) and at the walls, and the
anticipation velocity model. Reads experiments/m4_avm_exits_runs.csv (written by
m4_avm_exits.py). Stdlib only. Run: python3 experiments/m4_figure.py
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SERIES = [(("sf", "0.25"), "#c0392b", "social force, exits 1/4 width in"),
          (("sf", "0.1"), "#e67e22", "social force, exits at the walls"),
          (("avm", "0.25"), "#6c3483", "anticipation velocity model")]


def main():
    rows = list(csv.DictReader(open(os.path.join(HERE, "m4_avm_exits_runs.csv"))))
    W, H, l, r, t, b = 680, 470, 64, 240, 40, 56
    lo, hi = 0.4, 1.0
    X = lambda v: l + (v - lo) / (hi - lo) * (W - l - r)
    Y = lambda v: H - b - (v - lo) / (hi - lo) * (H - t - b)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{l}" y="22" font-size="13">Held-out assigned-exit runs: two crowd models against the real corridors</text>']
    for v in (0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0):
        o.append(f'<line x1="{l}" x2="{W - r}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="#eee"/>')
        o.append(f'<line x1="{X(v):.1f}" x2="{X(v):.1f}" y1="{t}" y2="{H - b}" stroke="#eee"/>')
        o.append(f'<text x="{l - 8}" y="{Y(v) + 4:.1f}" text-anchor="end">{v:.1f}</text>')
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 18}" text-anchor="middle">{v:.1f}</text>')
    o.append(f'<line x1="{X(lo):.1f}" y1="{Y(lo):.1f}" x2="{X(hi):.1f}" y2="{Y(hi):.1f}" stroke="#555" stroke-dasharray="4 3"/>')
    o.append(f'<text x="{(l + W - r) / 2}" y="{H - 14}" text-anchor="middle">observed share on own right</text>')
    o.append(f'<text transform="translate(18 {(t + H - b) / 2}) rotate(-90)" text-anchor="middle">simulated share (mean of 20 seeds)</text>')
    for (model, ex), col, _ in SERIES:
        for row in rows:
            if row["model"] != model or row["condition"] != "assigned" or row["exit_frac"] != ex:
                continue
            ox, sy = float(row["obs_share"]), float(row["sim_share"])
            if row["experiment"] == "HERMES":
                o.append(f'<circle cx="{X(ox):.1f}" cy="{Y(sy):.1f}" r="4.5" fill="{col}"/>')
            else:
                o.append(f'<rect x="{X(ox) - 4:.1f}" y="{Y(sy) - 4:.1f}" width="8" height="8" fill="{col}"/>')
    for i, (_, col, s) in enumerate(SERIES):
        yy = t + 20 + i * 20
        o.append(f'<circle cx="{W - r + 16}" cy="{yy}" r="4.5" fill="{col}"/><text x="{W - r + 26}" y="{yy + 4}" font-size="11">{s}</text>')
    o.append(f'<circle cx="{W - r + 16}" cy="{t + 90}" r="4.5" fill="#777"/><text x="{W - r + 26}" y="{t + 94}" font-size="11">HERMES 2009</text>')
    o.append(f'<rect x="{W - r + 12}" y="{t + 106}" width="8" height="8" fill="#777"/><text x="{W - r + 26}" y="{t + 114}" font-size="11">BaSiGo 2013</text>')
    o.append(f'<text x="{W - r + 12}" y="{t + 144}" font-size="11">dashed: perfect twin; a point</text>')
    o.append(f'<text x="{W - r + 12}" y="{t + 158}" font-size="11">above it keeps right more than</text>')
    o.append(f'<text x="{W - r + 12}" y="{t + 172}" font-size="11">the people did</text>')
    o.append("</svg>")
    with open(os.path.join(HERE, "m4_avm_exits.svg"), "w") as f:
        f.write("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
