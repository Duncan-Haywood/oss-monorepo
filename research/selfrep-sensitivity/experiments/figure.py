"""Bar chart of total Sobol indices (scenarios A-C, output ln T) from the committed results.txt. Stdlib only."""
import pathlib, re
here = pathlib.Path(__file__).parent
rows, scen = {}, None
lines = (here / "results.txt").read_text().splitlines()
logmode = False
for ln in lines:
    m = re.match(r"== ([ABC]) (.*?):", ln)
    if m:
        scen = m.group(1) + " " + m.group(2); continue
    if ln.startswith("== D"):
        scen = None
    if scen and "output = ln" in ln:
        logmode = True; continue
    if scen and "output = doubling" in ln:
        logmode = False; continue
    m = re.match(r"\s+(\w+)\s+S1\s+(-?[\d.]+)\s+ST\s+(-?[\d.]+)", ln)
    if scen and logmode and m:
        rows.setdefault(scen, {})[m.group(1)] = float(m.group(3))
names = ["budget", "vit_cost", "fail", "print_rate", "assembly_h"]
cols = ["#1f77b4", "#d95f02", "#7570b3", "#1b9e77", "#999999"]
W, H, L, T = 640, 330, 60, 40
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
       '<rect width="100%" height="100%" fill="white"/>',
       f'<text x="{L}" y="22" font-size="14">Total Sobol index of ln(doubling time), by input</text>']
gw = (W - L - 20) / len(rows)
for gi, (sc, d) in enumerate(rows.items()):
    x0 = L + gi * gw
    bw = (gw - 20) / len(names)
    for j, n in enumerate(names):
        h = d[n] * 220
        svg.append(f'<rect x="{x0 + 10 + j * bw:.1f}" y="{T + 230 - h:.1f}" width="{bw - 3:.1f}" height="{h:.1f}" fill="{cols[j]}"/>')
        svg.append(f'<text x="{x0 + 10 + j * bw:.1f}" y="{T + 224 - h:.1f}" font-size="10">{d[n]:.2f}</text>')
    svg.append(f'<text x="{x0 + 10:.1f}" y="{T + 250}" font-size="11">{sc}</text>')
for j, n in enumerate(names):
    svg.append(f'<rect x="{L + j * 105}" y="{H - 22}" width="10" height="10" fill="{cols[j]}"/><text x="{L + 14 + j * 105}" y="{H - 13}">{n}</text>')
svg.append(f'<line x1="{L}" y1="{T + 230}" x2="{W - 10}" y2="{T + 230}" stroke="#333"/></svg>')
(here / "sobol_total.svg").write_text("\n".join(svg) + "\n")
print("wrote sobol_total.svg")
