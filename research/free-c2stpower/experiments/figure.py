"""Write experiments/power_vs_n.svg: detection power against sample size, parsed from the committed results.txt.

    python3 experiments/figure.py
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = {"coulomb -10%": "#c0392b", "coulomb -20%": "#1f6fb2", "gauss noise, same sd": "#2e8b57"}


def parse():
    out, cur = {}, None
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"== (.+?)\s+\(C2ST", l)
        if m:
            cur = m.group(1)
            out[cur] = []
        elif cur and re.match(r"\s+\d+ ", l):
            p = l.split()
            out[cur].append((int(p[0]), float(p[3]), float(p[5])))  # n, C2ST power, paired power
        elif l.startswith("Null"):
            cur = None
    assert len(out) == 3 and all(len(v) == 5 for v in out.values()), "results.txt not as expected"
    return out


def main():
    data = parse()
    W, H, L, R, T, B = 700, 400, 60, 16, 70, 50
    lx = lambda n: L + (math.log10(n) - math.log10(50)) / (math.log10(800) - math.log10(50)) * (W - L - R)
    py = lambda y: T + (1 - y) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Power to reject a wrong pendulum twin against number of trajectories, C2ST solid and paired error dashed">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="14">Power to reject a wrong twin (solid: C2ST, dashed: paired error)</text>']
    for v in (0, 0.25, 0.5, 0.75, 1):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/><text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:g}</text>')
    for n in (50, 100, 200, 400, 800):
        o.append(f'<text x="{lx(n):.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{n}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-10}" text-anchor="middle" font-family="sans-serif" font-size="12">real trajectories n (equal number of twin trajectories)</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">power at 5% null quantile</text>')
    o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(0.05):.1f}" y2="{py(0.05):.1f}" stroke="#555" stroke-dasharray="2 3"/>')
    for j, (name, rows) in enumerate(data.items()):
        c = COLS[name]
        for k, dash in ((1, ""), (2, ' stroke-dasharray="6 4"')):
            pts = " ".join(f"{lx(r[0]):.1f},{py(r[k]):.1f}" for r in rows)
            o.append(f'<polyline points="{pts}" fill="none" stroke="{c}" stroke-width="2"{dash}/>')
            o += [f'<circle cx="{lx(r[0]):.1f}" cy="{py(r[k]):.1f}" r="3" fill="{c}"/>' for r in rows]
        x0 = L + 215 * j
        o.append(f'<rect x="{x0}" y="34" width="14" height="10" fill="{c}"/><text x="{x0+20}" y="43" font-family="sans-serif" font-size="11">{name}</text>')
    o.append("</svg>")
    (HERE / "power_vs_n.svg").write_text("\n".join(o) + "\n")
    print("wrote power_vs_n.svg")


if __name__ == "__main__":
    main()
