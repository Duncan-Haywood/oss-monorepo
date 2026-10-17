"""Draw success.svg (held-out success by method, both tasks) from the committed results.txt only. Pure Python."""
import os, re
here = os.path.dirname(os.path.abspath(__file__))
rows = {}; task = None
for line in open(os.path.join(here, "results.txt")):
    m = re.match(r"=== task: (\w+)", line)
    if m: task = m.group(1)
    m = re.match(r"\s*(ctrl_only|ctrl_base|random|evo): success mean ([\d.]+) \(min ([\d.]+), max ([\d.]+)\)", line)
    if m: rows.setdefault(task, []).append((m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4))))
labels = {"ctrl_only": "fixed body,\ncontroller tuned", "ctrl_base": "fixed links,\n+ mount tuned", "random": "co-design:\nrandom search", "evo": "co-design:\n(1+4) evolution"}
W, H, x0, y0, ph = 640, 330, 60, 40, 220
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="11">',
       '<rect width="100%" height="100%" fill="#fff"/>',
       '<text x="320" y="20" text-anchor="middle" font-size="13">Held-out success at equal cost budget (bar = mean of 10 seeds, whisker = min to max)</text>']
for g in range(0, 6):
    y = y0 + ph - ph * g / 5
    out.append(f'<line x1="{x0}" x2="{W-10}" y1="{y}" y2="{y}" stroke="#ddd"/><text x="{x0-6}" y="{y+4}" text-anchor="end">{g/5:.1f}</text>')
bw = 28
for ti, t in enumerate(("shelf", "far")):
    base = x0 + 20 + ti * 290
    out.append(f'<text x="{base+2*bw+30}" y="{y0+ph+52}" text-anchor="middle" font-weight="bold">{t} task</text>')
    for i, (m, mean, lo, hi) in enumerate(rows[t]):
        x = base + i * (bw + 12)
        col = "#999" if m.startswith("ctrl") else "#1f77b4"
        out.append(f'<rect x="{x}" y="{y0+ph-ph*mean}" width="{bw}" height="{ph*mean}" fill="{col}"/>')
        out.append(f'<line x1="{x+bw/2}" x2="{x+bw/2}" y1="{y0+ph-ph*hi}" y2="{y0+ph-ph*lo}" stroke="#000"/>')
        for j, l in enumerate(labels[m].split("\n")):
            out.append(f'<text x="{x+bw/2}" y="{y0+ph+14+12*j}" text-anchor="middle" font-size="8">{l}</text>')
out.append('</svg>')
open(os.path.join(here, "success.svg"), "w").write("\n".join(out))
