"""Write experiments/mutants.svg: where single-point mutants of round-0 designs are first caught.

    python experiments/figure.py

Parsed from the committed results.txt (section 2), never retyped. Stacked bars per task:
first failing stage lint / sim / formal, plus mutants that survive all three.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROW = re.compile(r"^(?!TOTAL)(\w+)\s+mutants=\s*(\d+) lint=(\d+) sim=(\d+) formal=(\d+) survived=(\d+)")
STAGES = (("lint", "#8e44ad"), ("sim", "#1f6fb2"), ("formal", "#e67e22"), ("survived", "#c0392b"))


def rows():
    out = []
    for line in (HERE / "results.txt").read_text().splitlines():
        m = ROW.match(line)
        if m:
            out.append((m[1], [int(m[i]) for i in range(3, 7)], int(m[2])))
    return out


def main():
    r = rows()
    W, H, L, R, T, B = 640, 360, 50, 16, 40, 70
    top = 120  # >= max mutants per task (109)
    gw = (W - L - R) / len(r)
    py = lambda v: T + (1 - v / top) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Stacked bars: stage that first catches each single-point mutant, per task">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">First stage to catch each mutant (counts)</text>']
    for k in range(5):
        v = top * k / 5
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:.0f}</text>')
    for i, (name, vals, _) in enumerate(r):
        y = H - B
        x = L + i * gw + gw * 0.15
        for (_, col), v in zip(STAGES, vals):
            h = v / top * (H - T - B)
            y -= h
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{gw*0.7:.1f}" height="{h:.1f}" fill="{col}"/>')
        o.append(f'<text x="{x+gw*0.35:.1f}" y="{H-B+12}" text-anchor="end" transform="rotate(-40 {x+gw*0.35:.1f} {H-B+12})" font-family="sans-serif" font-size="10">{name}</text>')
    for j, (s, col) in enumerate(STAGES):
        o.append(f'<rect x="{L+10+95*j}" y="{H-16}" width="10" height="10" fill="{col}"/>'
                 f'<text x="{L+25+95*j}" y="{H-7}" font-family="sans-serif" font-size="11">{s}</text>')
    o.append("</svg>")
    (HERE / "mutants.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
