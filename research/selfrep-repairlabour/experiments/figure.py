"""Write experiments/queue_cap.svg from experiments/results.txt (queue-cap section, K=1 and K=4).

Numbers are parsed from the committed run output. Standard library only. Stylised model.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
text = (HERE / "results.txt").read_text().split("== queue cap", 1)[1]
rows = {}
for m in re.finditer(r"K=(\d) queue_cap=(\w+)\s+work\s+([\d.]+)", text):
    rows.setdefault(int(m.group(1)), []).append((m.group(2), float(m.group(3))))
W, H, L, B = 560, 300, 60, 250
top = max(v for r in rows.values() for _, v in r) * 1.1
cols = {1: "#2a6fb0", 4: "#c0561b"}
labels = [k for k, _ in rows[1]]
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     f'<line x1="{L}" y1="{B}" x2="{W-10}" y2="{B}" stroke="#444"/><line x1="{L}" y1="20" x2="{L}" y2="{B}" stroke="#444"/>',
     f'<text x="{W/2}" y="14" text-anchor="middle">Working fleet vs queue cap (B=40, h=50 h, L=2000 h; stylised)</text>']
for i, lab in enumerate(labels):
    x0 = L + 15 + i * 94
    for j, K in enumerate((1, 4)):
        v = rows[K][i][1]
        h = v / top * (B - 25)
        o.append(f'<rect x="{x0 + j*38}" y="{B-h:.1f}" width="34" height="{h:.1f}" fill="{cols[K]}"/>')
        o.append(f'<text x="{x0 + j*38 + 17}" y="{B-h-3:.1f}" text-anchor="middle" font-size="10">{v:.0f}</text>')
    o.append(f'<text x="{x0+36}" y="{B+16}" text-anchor="middle">{"none" if lab == "None" else lab}</text>')
o.append(f'<text x="{W/2}" y="{B+34}" text-anchor="middle">queue cap (0 = never repair)</text>')
o.append(f'<rect x="{W-130}" y="26" width="10" height="10" fill="{cols[1]}"/><text x="{W-116}" y="35">1 bench</text>')
o.append(f'<rect x="{W-130}" y="42" width="10" height="10" fill="{cols[4]}"/><text x="{W-116}" y="55">4 benches</text>')
o.append("</svg>")
(HERE / "queue_cap.svg").write_text("\n".join(o) + "\n")
