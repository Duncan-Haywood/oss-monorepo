"""Write experiments/torsion.svg: line A demand/capacity at a 22 ft door against load offset, from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ES = (0, 5, 10, 15)


def main():
    series, cur = {}, None
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"reference unit shear v = (\d+) plf", l)
        if m:
            cur = int(m.group(1))
            continue
        m = re.match(r"\s*22ft\s+(.*)", l)
        if cur and m:
            series[cur] = [float(x) for x in re.findall(r"([\d.]+) \|", m.group(1))]
    if sorted(series) != [100, 250, 500] or any(len(s) != 4 for s in series.values()):
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 640, 360, 60, 90, 60, 50
    px = lambda e: L + e / 15 * (W - L - R)
    py = lambda v: H - B - v / 0.8 * (H - T - B)
    f = 'font-family="sans-serif"'
    alt = "Garage-line demand over capacity at a 22 ft door for load offsets 0, 5, 10, 15 percent: " + "; ".join(
        f"{v} plf " + ", ".join(f"{x:.2f}" for x in s) for v, s in sorted(series.items()))
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Garage-wall line demand over capacity against load offset</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Centred 22 ft door, rigid diaphragm, 115 mph; flexible split gives 1.05</text>']
    for g in (0, 0.2, 0.4, 0.6, 0.8):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(g):.1f}" y2="{py(g):.1f}" stroke="#ddd"/>')
        o.append(f'<text x="{L-6}" y="{py(g)+4:.1f}" text-anchor="end" {f} font-size="11">{g:.1f}</text>')
    for e in ES:
        o.append(f'<text x="{px(e):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{e}%</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-8}" text-anchor="middle" {f} font-size="11">load offset from centre, % of house length</text>')
    for v, col in ((100, "#8ecae6"), (250, "#2a6f97"), (500, "#023047")):
        s = series[v]
        o.append(f'<polyline points="{" ".join(f"{px(e):.1f},{py(d):.1f}" for e, d in zip(ES, s))}" fill="none" stroke="{col}" stroke-width="2.5"/>')
        o.append(f'<text x="{px(15) + 6:.1f}" y="{py(s[-1]) + 4:.1f}" {f} font-size="11" fill="{col}">v = {v} plf</text>')
    o.append("</svg>")
    (HERE / "torsion.svg").write_text("\n".join(o) + "\n")
    print("wrote torsion.svg")


main()
