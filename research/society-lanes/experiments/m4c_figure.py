"""Figure for milestone 4c: pooled HERMES held-out share on own right, four families x three
bias rules, against the people's share.

Reads the 'pooled bot-360' row of experiments/m4c_powerlaw_results.txt (written by
m4c_powerlaw.py). Stdlib only. Run: python3 experiments/m4c_figure.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FAMS = [("sf", "social force (JuPedSim)"), ("avm", "anticipation velocity (JuPedSim)"),
        ("cfsm", "collision-free speed (JuPedSim)"), ("pl", "power law (numpy, UMANS parameters)")]
RULES = [("always", "#bbbbbb", "bias always on"), ("yield", "#1f78b4", "bias yields to exit goal"),
         ("scaled", "#a6cee3", "bias scaled by goal side")]


def read():
    lines = open(os.path.join(HERE, "m4c_powerlaw_results.txt")).read().splitlines()
    head = next(l for l in lines if l.strip().startswith("run ") and "obs" in l).split()[2:]
    row = next(l for l in lines if l.strip().startswith("pooled bot-360")).split()[2:]
    obs = float(row[0])
    vals = dict(zip(head, (float(v) for v in row[1:])))
    return obs, vals


def main():
    obs, vals = read()
    W, H, l, r, t, b = 720, 360, 250, 30, 46, 50
    lo, hi = 0.4, 1.0
    X = lambda v: l + (v - lo) / (hi - lo) * (W - l - r)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="16" y="22" font-size="13">Held-out assigned-exit runs (HERMES, pooled): share of walkers on their own right</text>']
    for v in (0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0):
        o.append(f'<line x1="{X(v):.1f}" x2="{X(v):.1f}" y1="{t}" y2="{H - b}" stroke="#eee"/>')
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 16}" text-anchor="middle">{v:.1f}</text>')
    band = (H - t - b) / len(FAMS)
    bh = band / (len(RULES) + 1.2)
    for i, (fam, name) in enumerate(FAMS):
        y0 = t + i * band + bh * 0.6
        o.append(f'<text x="{l - 8}" y="{y0 + 1.6 * bh:.1f}" text-anchor="end">{name}</text>')
        for j, (ru, col, _) in enumerate(RULES):
            v = vals.get(f"{fam}:{ru[:3]}")
            if v is None:
                continue
            y = y0 + j * bh
            o.append(f'<rect x="{X(lo):.1f}" y="{y:.1f}" width="{X(v) - X(lo):.1f}" height="{bh - 2:.1f}" fill="{col}"/>')
            o.append(f'<text x="{X(v) + 4:.1f}" y="{y + bh - 4:.1f}" font-size="10">{v:.2f}</text>')
    o.append(f'<line x1="{X(obs):.1f}" x2="{X(obs):.1f}" y1="{t - 4}" y2="{H - b}" stroke="#c0392b" stroke-width="2" stroke-dasharray="5 3"/>')
    o.append(f'<text x="{X(obs) + 4:.1f}" y="{t - 6}" fill="#c0392b" font-size="11">people {obs:.3f}</text>')
    for j, (_, col, s) in enumerate(RULES):
        xx = 16 + j * 230
        o.append(f'<rect x="{xx}" y="{H - 22}" width="10" height="10" fill="{col}"/><text x="{xx + 14}" y="{H - 13}" font-size="11">{s}</text>')
    o.append("</svg>")
    with open(os.path.join(HERE, "m4c_powerlaw.svg"), "w") as f:
        f.write("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
