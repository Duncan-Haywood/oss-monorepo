"""Write experiments/replication.svg: hypotheses (of 20) that replicate on held-out comments against the
discovery sample size, real labels versus shuffled labels, from results.txt E1 and E2.

    python3 experiments/figure.py
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
sec, real, null = None, {}, {}
for line in (HERE / "results.txt").read_text().splitlines():
    if line.startswith("E1."):
        sec = real
    elif line.startswith("E2."):
        sec = null
    elif line.startswith("E3."):
        break
    else:
        p = line.split()
        if sec is not None and len(p) == 5 and p[0].isdigit():
            sec[int(p[0])] = float(p[3])
W, H, L, R, T, B = 560, 290, 60, 30, 40, 50
sizes = sorted(real)
x = lambda n: L + sizes.index(n) / (len(sizes) - 1) * (W - L - R)
y = lambda v: H - B - v / 20 * (H - B - T)
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d">',
       '<title id="t">Word hypotheses that replicate on held-out comments</title>',
       f'<desc id="d">With real labels the number of replicating hypotheses out of 20 rises from {real[sizes[0]]:.1f} at '
       f'{sizes[0]} discovery comments to {real[sizes[-1]]:.1f} at {sizes[-1]}; with shuffled labels it stays near zero.</desc>',
       '<style>text{font:13px sans-serif;fill:#222}@media(prefers-color-scheme:dark){text{fill:#eee}}</style>',
       f'<line x1="{L}" x2="{L}" y1="{T}" y2="{H-B}" stroke="#888"/><line x1="{L}" x2="{W-R}" y1="{H-B}" y2="{H-B}" stroke="#888"/>']
for v in (0, 5, 10, 15, 20):
    svg.append(f'<text x="{L-8}" y="{y(v)+4}" text-anchor="end">{v}</text>')
for n in sizes:
    svg.append(f'<text x="{x(n)}" y="{H-B+18}" text-anchor="middle">{n}</text>')
for data, col, name in ((real, "#1f6fb2", "real labels"), (null, "#c0392b", "shuffled labels")):
    pts = " ".join(f"{x(n)},{y(data[n])}" for n in sizes)
    svg.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="3"/>')
    svg += [f'<circle cx="{x(n)}" cy="{y(data[n])}" r="5" fill="{col}"/>' for n in sizes]
    svg.append(f'<text x="{x(sizes[-1])-8}" y="{y(data[sizes[-1]])-10}" text-anchor="end" fill="{col}" style="fill:{col}">{name}</text>')
svg += [f'<text x="{W/2}" y="{H-8}" text-anchor="middle">comments in the discovery sample</text>',
        f'<text x="{L}" y="{T-14}">hypotheses (of 20) that replicate on 3,000 held-out comments</text></svg>']
(HERE / "replication.svg").write_text("\n".join(svg))
