"""Draw theme-counts.svg from results.txt (stdlib only)."""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
rows = []
on = False
for l in open(os.path.join(HERE, "results.txt")):
    if l.startswith("themes"):
        on = True; continue
    if on:
        m = re.match(r"\s+(\d+)\s+\d+%\s+(\S+)", l)
        if not m:
            break
        rows.append((m.group(2), int(m.group(1))))
W, H, L = 640, 40 + 26 * len(rows), 170
mx = max(v for _, v in rows)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="13">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     '<text x="10" y="20" font-weight="bold">doc_friction entries by keyword theme (n = %d)</text>' % sum(v for _, v in rows)]
for i, (k, v) in enumerate(rows):
    y = 36 + 26 * i
    o.append(f'<text x="{L-8}" y="{y+14}" text-anchor="end" fill="#222">{k}</text>')
    o.append(f'<rect x="{L}" y="{y}" width="{(W-L-50)*v/mx:.0f}" height="18" fill="#2b6cb0"/>')
    o.append(f'<text x="{L+(W-L-50)*v/mx+5:.0f}" y="{y+14}" fill="#222">{v}</text>')
o.append("</svg>")
open(os.path.join(HERE, "theme-counts.svg"), "w").write("\n".join(o))
print("ok")
