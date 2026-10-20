"""Write experiments/split.svg: garage-line demand/capacity against door width from results.txt (hold-down on).

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    series, cur = {}, None
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"hold-down slip (on|off), reference unit shear v = (\d+) plf", l)
        if m:
            cur = int(m.group(2)) if m.group(1) == "on" else None
            continue
        m = re.match(r"\s*(\d+)ft\s+\d+\s+\d+\s+[\d.]+\s+[\d,]+\s+([\d.]+)\s+([\d.]+)", l)
        if cur and m:
            series.setdefault(cur, []).append((int(m.group(1)), float(m.group(2)), float(m.group(3))))
    if sorted(series) != [100, 250, 500] or any(len(s) != 5 for s in series.values()):
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 640, 380, 60, 20, 70, 50
    px = lambda v: L + (v - 8) / (23 - 8) * (W - L - R)
    py = lambda v: H - B - v / 1.2 * (H - T - B)
    f = 'font-family="sans-serif"'
    flex = series[100]
    alt = ("Garage-line demand over capacity by centred door width. Flexible: "
           + ", ".join(f"{w} ft {a:.2f}" for w, a, _ in flex) + ". Rigid at 100, 250, 500 plf at 22 ft: "
           + ", ".join(f"{series[v][-1][2]:.2f}" for v in (100, 250, 500)))
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Garage-wall line demand over capacity, centred door, 115 mph</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Four-term nailed-wall stiffness; 1.0 means 6 in nailing is just enough</text>']
    for g in (0, 0.2, 0.4, 0.6, 0.8, 1.0):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(g):.1f}" y2="{py(g):.1f}" stroke="{"#c0392b" if g == 1.0 else "#ddd"}"/>')
        o.append(f'<text x="{L-6}" y="{py(g)+4:.1f}" text-anchor="end" {f} font-size="11">{g:.1f}</text>')
    for w, _, _ in flex:
        o.append(f'<text x="{px(w):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{w}</text>')
    o.append(f'<text x="{W/2}" y="{H-8}" text-anchor="middle" {f} font-size="11">garage door width, ft</text>')
    lines = [("flexible (half each)", "#b5651d", [(w, a) for w, a, _ in flex])]
    for v, col in ((100, "#8ecae6"), (250, "#2a6f97"), (500, "#023047")):
        lines.append((f"rigid, v = {v} plf", col, [(w, r) for w, _, r in series[v]]))
    for name, col, pts in lines:
        o.append(f'<polyline points="{" ".join(f"{px(w):.1f},{py(d):.1f}" for w, d in pts)}" fill="none" stroke="{col}" stroke-width="2.5"/>')
        o.append(f'<text x="{px(pts[-1][0]) - 8:.1f}" y="{py(pts[-1][1]) - 6:.1f}" text-anchor="end" {f} font-size="11" fill="{col}">{name}</text>')
    o.append("</svg>")
    (HERE / "split.svg").write_text("\n".join(o) + "\n")
    print("wrote split.svg")


main()
