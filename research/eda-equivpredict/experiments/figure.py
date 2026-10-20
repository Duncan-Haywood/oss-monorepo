"""Bar chart of formal CPU and proofs found per policy (leave-one-line-out), parsed from results.txt (stdlib only)."""
import os, re
d = os.path.dirname(__file__)
rows, scheme = [], None
for l in open(os.path.join(d, "results.txt")):
    if l.startswith("-- "):
        scheme = l[3:].strip()
    m = re.match(r"(.+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)/16\s+(\d+)\s+[\d.]+$", l.rstrip())
    if m and scheme == "leave-one-line-out":
        rows.append((m.group(1), int(m.group(3)), int(m.group(4))))
    m = re.match(r"(oracle.+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)/16", l)
    if m:
        rows.append((m.group(1), int(m.group(3)), int(m.group(4))))
W, H, L, T = 640, 80 + 34 * len(rows), 210, 50
mx = 7500
s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     '<text x="10" y="20" font-weight="bold">Formal CPU on 27 survivors, by policy (leave-one-line-out)</text>',
     '<text x="10" y="38" fill="#555">bar = CPU seconds; label = equivalence proofs found of 16</text>']
for k, (name, cpu, eq) in enumerate(rows):
    y = T + 34 * k
    w = (W - L - 90) * cpu / mx
    s.append(f'<text x="{L-8}" y="{y+16}" text-anchor="end">{name}</text><rect x="{L}" y="{y}" width="{max(w,1):.1f}" height="22" fill="#2a6fb0"/>')
    s.append(f'<text x="{L+w+6:.1f}" y="{y+16}">{cpu} s, {eq}/16</text>')
s.append('</svg>')
open(os.path.join(d, "figure.svg"), "w").write("\n".join(s))
print(len(rows), "bars")
