"""Write experiments/wind.svg: wind demand on a gable-wall line as a share of its 6 in capacity, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    cap = int(re.search(r"across ridge / wind\s+[\d,]+\s+([\d,]+)", "\n".join(TEXT)).group(1).replace(",", ""))
    series = {"B-like": [], "C-like": []}
    for l in TEXT:
        m = re.match(r"\s*(\d+)\s+(0\.\d+)\s+[\d.]+\s+([\d,]+)\s+\d in\s+.*\((B|C)-like\)", l)
        if m:
            series[m.group(4) + "-like"].append((int(m.group(1)), int(m.group(3).replace(",", "")) / cap * 100))
    if any(len(v) != 6 for v in series.values()):
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 640, 380, 60, 20, 70, 50
    px = lambda v: L + (v - 80) / (210 - 80) * (W - L - R)
    py = lambda v: H - B - v / 100 * (H - T - B)
    f = 'font-family="sans-serif"'
    alt = "Line chart of wind load on a gable-wall line as a percent of its capacity at 6 inch nailing, by ultimate wind speed: " + "; ".join(
        f"{k}: " + ", ".join(f"{v} mph {p:.0f}%" for v, p in s) for k, s in series.items())
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Wind load on a gable-wall line, share of its capacity at 6 in nailing</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Stylised; capacities from memory of SDPWS; 100% means 6 in edge nailing is just enough</text>']
    for g in range(0, 101, 20):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(g):.1f}" y2="{py(g):.1f}" stroke="#ddd"/>')
        o.append(f'<text x="{L-6}" y="{py(g)+4:.1f}" text-anchor="end" {f} font-size="11">{g}%</text>')
    for v in (90, 115, 130, 150, 170, 200):
        o.append(f'<text x="{px(v):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{v}</text>')
    o.append(f'<text x="{W/2}" y="{H-8}" text-anchor="middle" {f} font-size="11">ultimate design wind speed, mph</text>')
    for (k, s), col in zip(series.items(), ("#2a6f97", "#b5651d")):
        pts = " ".join(f"{px(v):.1f},{py(p):.1f}" for v, p in s)
        o.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2.5"/>')
        x, y = px(s[-1][0]), py(s[-1][1])
        o.append(f'<text x="{x-4:.1f}" y="{y-8:.1f}" text-anchor="end" {f} font-size="11" fill="{col}">Exposure {k}</text>')
    o.append("</svg>")
    (HERE / "wind.svg").write_text("\n".join(o) + "\n")
    print("wrote wind.svg")


main()
