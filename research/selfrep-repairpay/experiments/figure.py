"""Write experiments/pay_rule.svg from experiments/results.txt (unbounded queue, by pay rule, B=40).

Numbers are parsed from the committed run output. Standard library only. Stylised model.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
text = (HERE / "results.txt").read_text().split("== unbounded queue", 1)[1].split("== queue-cap", 1)[0]
rows = {}
for m in re.finditer(r"K=(\d+) (join|service|replace-only)\s+work\s+([\d.]+)", text):
    rows.setdefault(int(m.group(1)), {})[m.group(2)] = float(m.group(3))
W, H, L, B = 560, 300, 60, 250
top = max(v for r in rows.values() for v in r.values()) * 1.1
cols = {"join": "#c0561b", "service": "#2a6fb0", "replace-only": "#888888"}
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     f'<line x1="{L}" y1="{B}" x2="{W-10}" y2="{B}" stroke="#444"/><line x1="{L}" y1="20" x2="{L}" y2="{B}" stroke="#444"/>',
     f'<text x="{W/2}" y="14" text-anchor="middle">Working fleet, unbounded queue, by when spares are paid (B=40; stylised)</text>']
for i, K in enumerate(sorted(rows)):
    x0 = L + 15 + i * 94
    for j, mode in enumerate(("join", "service", "replace-only")):
        v = rows[K][mode]
        h = v / top * (B - 25)
        o.append(f'<rect x="{x0 + j*28}" y="{B-h:.1f}" width="25" height="{h:.1f}" fill="{cols[mode]}"/>')
        o.append(f'<text x="{x0 + j*28 + 12}" y="{B-h-3:.1f}" text-anchor="middle" font-size="9">{v:.0f}</text>')
    o.append(f'<text x="{x0+42}" y="{B+16}" text-anchor="middle">K={K}</text>')
o.append(f'<text x="{W/2}" y="{B+34}" text-anchor="middle">repair benches K</text>')
for k, (mode, lab) in enumerate((("join", "pay at breakdown"), ("service", "pay at service start"), ("replace-only", "never repair"))):
    o.append(f'<rect x="{L+20}" y="{26+16*k}" width="10" height="10" fill="{cols[mode]}"/><text x="{L+36}" y="{35+16*k}">{lab}</text>')
o.append("</svg>")
(HERE / "pay_rule.svg").write_text("\n".join(o) + "\n")
