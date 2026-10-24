"""Write experiments/gap_by_coder.svg: the true gap in negative share between two languages and the naive
gap each coder reports, for the six language pairs, from the E2 block of results.txt.

    python3 experiments/figure.py
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
lines = (HERE / "results.txt").read_text().splitlines()
i = next(k for k, l in enumerate(lines) if l.startswith("E2."))
coders = lines[i + 2].split()[2:]
rows = []
for l in lines[i + 3:]:
    if not l.strip():
        break
    p = l.split()
    rows.append((p[0], float(p[1]), [float(v) for v in p[2:]]))
W, L, R, T, ROW = 700, 90, 30, 60, 54
H = T + ROW * len(rows) + 30
lo, hi = -1.0, 1.0
x = lambda v: L + (v - lo) / (hi - lo) * (W - L - R)
col = ["#c0392b", "#d68910", "#8e44ad"]
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{W/2}" y="20" text-anchor="middle" font-size="14">Gap in negative share between languages: human truth (black) and each coder\'s naive gap</text>']
for k, c in enumerate(coders):
    s.append(f'<circle cx="{L + 150 * k + 6}" cy="38" r="5" fill="{col[k]}"/><text x="{L + 150 * k + 16}" y="42">{c}</text>')
s.append(f'<line x1="{x(0)}" y1="{T - 8}" x2="{x(0)}" y2="{H - 24}" stroke="#999"/>')
for j, (pair, truth, naive) in enumerate(rows):
    y = T + ROW * j + 14
    s.append(f'<text x="{L - 10}" y="{y + 4}" text-anchor="end">{pair}</text>')
    s.append(f'<rect x="{x(min(0, truth))}" y="{y - 6}" width="{abs(x(truth) - x(0))}" height="12" fill="#222"/>')
    for k, v in enumerate(naive):
        s.append(f'<circle cx="{x(v)}" cy="{y + 12 + 5 * k - 5}" r="4" fill="{col[k]}"/>')
for v in (-1, -0.5, 0, 0.5, 1):
    s.append(f'<text x="{x(v)}" y="{H - 8}" text-anchor="middle">{v:+.1f}</text>')
s.append("</svg>")
(HERE / "gap_by_coder.svg").write_text("\n".join(s))
