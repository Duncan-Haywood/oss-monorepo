"""Write experiments/prevalence.svg: mean estimate and mean 95% interval of the negative-emotion share for each
coder and estimator at 60 hand-coded items of 300 (truth from the human labels), parsed from results.txt.

    python3 experiments/figure.py
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows, cur = [], None
for line in (HERE / "results.txt").read_text().splitlines():
    if line.startswith("E4."):
        cur = line.split(",")[0][4:] if ", 60 hand-coded" in line else None
    elif cur and line.startswith("prevalence "):
        p = line.split()
        rows.append((cur, p[1], float(p[2]), float(p[3]), float(p[6])))
truth = rows[0][2]
W, H, L, R, T = 640, 70 + 26 * len(rows), 190, 30, 44
lo, hi = 0.0, 0.6
x = lambda v: L + (v - lo) / (hi - lo) * (W - L - R)
col = {"naive": "#c0392b", "human": "#1f6fb2", "ppi": "#2e8b57"}
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{W/2}" y="20" text-anchor="middle" font-size="14">Negative-emotion share, 60 hand-coded of 300 comments</text>',
     f'<line x1="{x(truth)}" y1="{T-8}" x2="{x(truth)}" y2="{H-28}" stroke="#555" stroke-dasharray="4"/>',
     f'<text x="{x(truth)}" y="{H-10}" text-anchor="middle">human truth {truth:.3f}</text>']
for i, (c, m, t, mean, w) in enumerate(rows):
    y = T + 26 * i
    s.append(f'<text x="{L-10}" y="{y+4}" text-anchor="end">{c} / {m}</text>')
    s.append(f'<line x1="{x(mean-w/2)}" y1="{y}" x2="{x(mean+w/2)}" y2="{y}" stroke="{col[m]}" stroke-width="3"/>')
    s.append(f'<circle cx="{x(mean)}" cy="{y}" r="5" fill="{col[m]}"/>')
s.append("</svg>")
(HERE / "prevalence.svg").write_text("\n".join(s))
