"""experiments/hosting_day.svg from results_day.txt: median minutes per day out of band at 2,000 kW of PV, peak-load day (stdlib only)."""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows, day, block = [], "", ""
for line in (HERE / "results_day.txt").read_text().splitlines():
    if line.startswith("---"):
        day = line
    elif line.startswith("PV total"):
        block = line
    elif line.startswith("  ") and "peak-load" in day and block.startswith("PV total 2000"):
        m = re.match(r"\s+(.+?)\s+over\s+(\d+) \[.*?\] \| under\s+(\d+) \[.*?\] \| tap ops\s+(\d+)", line)
        rows.append((m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))))
W, H, L, T, BH = 760, 60 + 40 * len(rows), 190, 40, 14
mx = max(max(r[1], r[2], r[3]) for r in rows) * 1.05
sc = lambda v: (W - L - 20) * v / mx
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{L}" y="18" font-weight="bold">IEEE 123-node, 2,000 kW of PV, peak-load day: median per day (40 placements)</text>']
cols = (("#d95f02", "minutes above 1.05 pu"), ("#1b9e77", "minutes below 0.95 pu"), ("#7570b3", "regulator tap operations"))
for j, (c, n) in enumerate(cols):
    s.append(f'<rect x="{L + j * 190}" y="26" width="10" height="10" fill="{c}"/><text x="{L + j * 190 + 14}" y="35">{n}</text>')
for i, r in enumerate(rows):
    y = T + 12 + i * 40
    s.append(f'<text x="{L - 8}" y="{y + 20}" text-anchor="end">{r[0]}</text>')
    for j, (c, _) in enumerate(cols):
        s.append(f'<rect x="{L}" y="{y + j * BH * 0.9:.0f}" width="{sc(r[1 + j]):.1f}" height="{BH * 0.8:.0f}" fill="{c}"/>'
                 f'<text x="{L + sc(r[1 + j]) + 4:.1f}" y="{y + j * BH * 0.9 + 10:.0f}" font-size="10">{r[1 + j]}</text>')
s.append("</svg>")
(HERE / "hosting_day.svg").write_text("\n".join(s))
print(len(rows), "rows")
