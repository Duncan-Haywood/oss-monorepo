"""Figure for milestone 4b: held-out share on own right, simulated against observed, per family,
with the side bias always on (hollow) and yielding to a lateral goal (filled).

Reads experiments/m4b_yield_cfsm_runs.csv (written by m4b_yield_cfsm.py). Stdlib only.
Run: python3 experiments/m4b_figure.py
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FAMS = [("sf", "#c0392b", "social force"), ("avm", "#6c3483", "anticipation velocity"),
        ("cfsm", "#1f78b4", "collision-free speed")]


def main():
    rows = list(csv.DictReader(open(os.path.join(HERE, "m4b_yield_cfsm_runs.csv"))))
    W, H, l, r, t, b = 700, 470, 64, 250, 40, 56
    lo, hi = 0.4, 1.0
    X = lambda v: l + (v - lo) / (hi - lo) * (W - l - r)
    Y = lambda v: H - b - (v - lo) / (hi - lo) * (H - t - b)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{l}" y="22" font-size="13">Held-out assigned-exit runs: a keep-right bias that yields to the exit goal</text>']
    for v in (0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0):
        o.append(f'<line x1="{l}" x2="{W - r}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="#eee"/>')
        o.append(f'<line x1="{X(v):.1f}" x2="{X(v):.1f}" y1="{t}" y2="{H - b}" stroke="#eee"/>')
        o.append(f'<text x="{l - 8}" y="{Y(v) + 4:.1f}" text-anchor="end">{v:.1f}</text>')
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 18}" text-anchor="middle">{v:.1f}</text>')
    o.append(f'<line x1="{X(lo):.1f}" y1="{Y(lo):.1f}" x2="{X(hi):.1f}" y2="{Y(hi):.1f}" stroke="#555" stroke-dasharray="4 3"/>')
    o.append(f'<text x="{(l + W - r) / 2}" y="{H - 14}" text-anchor="middle">observed share on own right (people)</text>')
    o.append(f'<text transform="translate(18 {(t + H - b) / 2}) rotate(-90)" text-anchor="middle">simulated share (mean of 20 seeds)</text>')
    for fam, col, _ in FAMS:
        for row in rows:
            if row["model"] != fam or row["rule"] not in ("always", "yield"):
                continue
            ox, sy = float(row["obs_share"]), max(lo, float(row["sim_share"]))
            fill = col if row["rule"] == "yield" else "none"
            if row["experiment"] == "HERMES":
                o.append(f'<circle cx="{X(ox):.1f}" cy="{Y(sy):.1f}" r="4.5" fill="{fill}" stroke="{col}" stroke-width="1.5"/>')
            else:
                o.append(f'<rect x="{X(ox) - 4:.1f}" y="{Y(sy) - 4:.1f}" width="8" height="8" fill="{fill}" stroke="{col}" stroke-width="1.5"/>')
    for i, (_, col, s) in enumerate(FAMS):
        yy = t + 20 + i * 20
        o.append(f'<circle cx="{W - r + 16}" cy="{yy}" r="4.5" fill="{col}"/><text x="{W - r + 26}" y="{yy + 4}" font-size="11">{s}</text>')
    y0 = t + 90
    o.append(f'<circle cx="{W - r + 16}" cy="{y0}" r="4.5" fill="#777"/><text x="{W - r + 26}" y="{y0 + 4}" font-size="11">filled: bias yields to the goal</text>')
    o.append(f'<circle cx="{W - r + 16}" cy="{y0 + 20}" r="4.5" fill="none" stroke="#777" stroke-width="1.5"/><text x="{W - r + 26}" y="{y0 + 24}" font-size="11">hollow: bias always on</text>')
    o.append(f'<circle cx="{W - r + 16}" cy="{y0 + 40}" r="4.5" fill="#777"/><text x="{W - r + 26}" y="{y0 + 44}" font-size="11">HERMES 2009</text>')
    o.append(f'<rect x="{W - r + 12}" y="{y0 + 56}" width="8" height="8" fill="#777"/><text x="{W - r + 26}" y="{y0 + 64}" font-size="11">BaSiGo 2013</text>')
    o.append(f'<text x="{W - r + 12}" y="{y0 + 94}" font-size="11">dashed: perfect twin; above it,</text>')
    o.append(f'<text x="{W - r + 12}" y="{y0 + 108}" font-size="11">the model keeps right more</text>')
    o.append(f'<text x="{W - r + 12}" y="{y0 + 122}" font-size="11">than the people did</text>')
    o.append("</svg>")
    with open(os.path.join(HERE, "m4b_yield_cfsm.svg"), "w") as f:
        f.write("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
