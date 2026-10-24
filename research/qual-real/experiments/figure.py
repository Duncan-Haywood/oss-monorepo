"""Write experiments/gap_estimates.svg: mean estimate and mean 95% interval of the short-minus-long gap
(true value from the human labels) for each coder and estimator at 200 hand-coded items, from results.txt.

    python3 experiments/figure.py
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows, cur = [], None
for line in (HERE / "results.txt").read_text().splitlines():
    if line.startswith("E2."):
        head = line.split(",")
        cur = head[0][4:] if "200 hand-coded" in line else None
    elif cur and line.startswith("gap(short-long)"):
        p = line.split()
        rows.append((cur, p[1], float(p[2]), float(p[3]), float(p[6])))
truth = rows[0][2]
W, H, L, R, T = 640, 60 + 52 * len(rows), 190, 30, 40
lo, hi = -0.45, 0.25
x = lambda v: L + (v - lo) / (hi - lo) * (W - L - R)
col = {"naive": "#c0392b", "human": "#1f6fb2", "ppi": "#2e8b57"}
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{W/2}" y="20" text-anchor="middle" font-size="14">Short-minus-long gap in negative-emotion share, 200 hand-coded items</text>',
     f'<line x1="{x(truth)}" y1="{T}" x2="{x(truth)}" y2="{H-25}" stroke="#555" stroke-dasharray="4"/>',
     f'<text x="{x(truth)}" y="{H-8}" text-anchor="middle">truth {truth:+.3f}</text>']
for i, (c, m, t, mean, w) in enumerate(rows):
    y = T + 20 + 52 * i * 1.0 / 1 * (1 if False else 1) * 0.88
    s.append(f'<text x="{L-10}" y="{y+4}" text-anchor="end">{c} / {m}</text>')
    s.append(f'<line x1="{x(mean-w/2)}" y1="{y}" x2="{x(mean+w/2)}" y2="{y}" stroke="{col[m]}" stroke-width="3"/>')
    s.append(f'<circle cx="{x(mean)}" cy="{y}" r="5" fill="{col[m]}"/>')
s.append("</svg>")
(HERE / "gap_estimates.svg").write_text("\n".join(s))
