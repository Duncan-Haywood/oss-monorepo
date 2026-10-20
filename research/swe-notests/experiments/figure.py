"""Bar chart (SVG, stdlib only) of the share of counted runs that add no tests, by track, parsed from results.txt."""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
rows = []
sec = False
for line in open(os.path.join(HERE, "results.txt")):
    if line.startswith("== A."):
        sec = True
        continue
    if line.startswith("==") and sec:
        break
    m = re.match(r"\s+(\w+)\s+(\d+)/(\d+)\s+([\d.]+)%", line)
    if sec and m:
        rows.append((m.group(1), int(m.group(2)), int(m.group(3)), float(m.group(4))))
W, H, L = 520, 40 + 34 * len(rows), 90
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Share of runs that add no tests, by track">',
       '<style>text{font:13px sans-serif;fill:#222}</style><rect width="100%" height="100%" fill="#fff"/>',
       f'<text x="{L}" y="18">Runs adding no tests, % of runs with a tests_added count</text>']
for i, (t, k, n, pct) in enumerate(rows):
    y = 32 + 34 * i
    out.append(f'<text x="8" y="{y + 16}">{t}</text><rect x="{L}" y="{y}" width="{pct * 15:.1f}" height="22" fill="#2a6fb0"/>'
               f'<text x="{L + pct * 15 + 6:.1f}" y="{y + 16}">{pct:.1f}% ({k}/{n})</text>')
out.append("</svg>")
open(os.path.join(HERE, "notests_by_track.svg"), "w").write("\n".join(out))
