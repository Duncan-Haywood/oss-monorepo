"""Write experiments/ratio_by_script.svg: best array / best MAC engine (cells*cycles/vec) per ABC script and F.

    python experiments/figure.py

Parsed from the committed results.txt (never retyped). A ratio above 1 means the MAC engine wins.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
RE = re.compile(r"^F=(\d+) (\w+): best array / best MAC engine \(cells\*cycles/vec\) = ([\d.]+)")


def main():
    rows = [(int(m[1]), m[2], float(m[3])) for l in (HERE / "results.txt").read_text().splitlines() if (m := RE.match(l))]
    scripts = list(dict.fromkeys(r[1] for r in rows))
    W, H, L, T, B = 560, 320, 60, 40, 60
    top = 1.8
    py = lambda v: T + (1 - v / top) * (H - T - B)
    cols = {16: "#1f6fb2", 32: "#c0392b"}
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Bars: best systolic array divided by best MAC engine, by ABC script and layer width F; every bar is above 1">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Best array / best MAC engine (above 1: MAC engine wins)</text>']
    for v in (0, 0.5, 1, 1.5):
        o.append(f'<line x1="{L}" x2="{W-16}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="{"#333" if v == 1 else "#ddd"}"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v}</text>')
    gw = (W - L - 16) / len(scripts)
    for i, s in enumerate(scripts):
        for j, f in enumerate((16, 32)):
            v = next(r[2] for r in rows if r[0] == f and r[1] == s)
            x = L + i * gw + gw * (0.12 + 0.4 * j)
            o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="{gw*0.36:.1f}" height="{py(0)-py(v):.1f}" fill="{cols[f]}"/>'
                     f'<text x="{x+gw*0.18:.1f}" y="{py(v)-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="10">{v:.2f}</text>')
        o.append(f'<text x="{L+(i+0.5)*gw:.1f}" y="{H-B+18}" text-anchor="middle" font-family="sans-serif" font-size="11">{s}</text>')
    o.append(f'<text x="{L}" y="{H-12}" font-family="sans-serif" font-size="11"><tspan fill="{cols[16]}">&#9632;</tspan> F = 16   <tspan fill="{cols[32]}">&#9632;</tspan> F = 32</text></svg>')
    (HERE / "ratio_by_script.svg").write_text("\n".join(o))


main()
