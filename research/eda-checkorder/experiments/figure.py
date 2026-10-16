"""Bar chart of CPU seconds per cascade, parsed from results.txt (stdlib only)."""
import os, re
d = os.path.dirname(__file__)
rows = []
for l in open(os.path.join(d, "results.txt")):
    m = re.match(r"(.+?)\s{2,}(\d+)\s+([\d.]+)\s+", l)
    if m and "->" in m.group(1) or (m and "only" in m.group(1)):
        rows.append((m.group(1).strip(), int(m.group(2))))
W, H, L = 640, 40 + 28 * len(rows), 270
mx = max(v for _, v in rows)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     '<text x="10" y="20" font-weight="bold">CPU seconds per check cascade (91 mutants, eda-verify log)</text>']
for i, (n, v) in enumerate(rows):
    y = 36 + 28 * i
    w = (W - L - 70) * v / mx
    s.append(f'<text x="{L-8}" y="{y+14}" text-anchor="end">{n}</text><rect x="{L}" y="{y}" width="{w:.1f}" height="18" fill="#2a6fb0"/><text x="{L+w+5:.1f}" y="{y+14}">{v}</text>')
s.append('</svg>')
open(os.path.join(d, "figure.svg"), "w").write("\n".join(s))
print(len(rows), "bars")
