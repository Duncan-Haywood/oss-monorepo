"""Figure for milestone 6b: close-pass rate of each robot policy at 10% robots in each crowd family,
the four hand policies and the three policies learned (CEM) in each family, with 95% bootstrap
intervals over fresh seeds (pooled over the two HERMES runs).

Reads experiments/m6b_learned_eval.csv. Stdlib only. Run: python3 experiments/m6b_figure.py
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FAMS = [("sf", "social force"), ("cfsm", "collision-free speed"), ("orca", "ORCA")]
POLS = [("crowd", "#1f78b4", "crowd's side"), ("adapt", "#a6cee3", "adapt"),
        ("goal", "#33a02c", "lateral goal"), ("opposite", "#e31a1c", "opposite"),
        ("learned-sf", "#6a3d9a", "learned in SF"), ("learned-cfsm", "#cab2d6", "learned in CFS"),
        ("learned-orca", "#ff7f00", "learned in ORCA")]


def main(metric="close", label="Share of robot-person passes closer than 0.5 m"):
    d = {}
    with open(os.path.join(HERE, "m6b_learned_eval.csv")) as f:
        for r in csv.DictReader(f):
            d[(r["family"], r["policy"])] = tuple(float(r[k]) for k in (metric, f"{metric}_lo", f"{metric}_hi"))
    W, H, l, r_, t, b = 800, 600, 170, 50, 46, 80
    hi = max(1e-9, max(v[2] for v in d.values())) * 1.08
    X = lambda v: l + v / hi * (W - l - r_)  # noqa: E731
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="16" y="22" font-size="13">{label}, 10% robots, fresh seeds (95% interval)</text>']
    step = 0.1 if hi > 0.4 else 0.05
    v = 0.0
    while v <= hi:
        o.append(f'<line x1="{X(v):.1f}" x2="{X(v):.1f}" y1="{t}" y2="{H - b}" stroke="#eee"/>')
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 16}" text-anchor="middle">{v:.2f}</text>')
        v += step
    band = (H - t - b) / len(FAMS)
    bh = band / (len(POLS) + 1)
    for i, (fam, name) in enumerate(FAMS):
        y0 = t + i * band + bh * 0.5
        o.append(f'<text x="{l - 8}" y="{y0 + 3.6 * bh:.1f}" text-anchor="end">{name}</text>')
        for j, (pol, col, _) in enumerate(POLS):
            val = d.get((fam, pol))
            if val is None:
                continue
            y = y0 + j * bh
            o.append(f'<rect x="{X(0):.1f}" y="{y:.1f}" width="{max(0, X(val[0]) - X(0)):.1f}" height="{bh - 2:.1f}" fill="{col}"/>')
            ym = y + (bh - 2) / 2
            o.append(f'<line x1="{X(val[1]):.1f}" x2="{X(val[2]):.1f}" y1="{ym:.1f}" y2="{ym:.1f}" stroke="#333"/>')
            o.append(f'<text x="{X(val[2]) + 4:.1f}" y="{y + bh - 4:.1f}" font-size="10">{val[0]:.3f}</text>')
    for j, (_, col, s) in enumerate(POLS):
        xx = 16 + (j % 4) * 190
        yy = H - 52 + (j // 4) * 16
        o.append(f'<rect x="{xx}" y="{yy}" width="10" height="10" fill="{col}"/><text x="{xx + 14}" y="{yy + 9}" font-size="11">{s}</text>')
    o.append(f'<text x="16" y="{H - 8}" font-size="11">Pooled over HERMES bo-360-090-090 and bo-360-160-160; 20 seeds per cell; bootstrap over seeds (B = 1000)</text>')
    o.append("</svg>")
    with open(os.path.join(HERE, "m6b_learned.svg"), "w") as f:
        f.write("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
