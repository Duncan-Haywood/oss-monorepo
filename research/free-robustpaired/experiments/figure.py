"""Write experiments/power_vs_n.svg: power at Coulomb -10% with Student-t(3) noise for five paired statistics,
parsed from the committed results.txt.

    python3 experiments/figure.py
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = {"mean_sq": "#c0392b", "median_sq": "#1f6fb2", "trim20_sq": "#2e8b57", "mean_abs": "#8e44ad", "huber": "#d68910"}


def parse():
    out = {s: [] for s in COLS}
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"student3\s+Coulomb -10%\s+n=\s*(\d+) (\S+)\s+power\s+([\d.]+)", l)
        if m:
            out[m.group(2)].append((int(m.group(1)), float(m.group(3))))
    assert all(len(v) == 4 for v in out.values()), "results.txt not as expected"
    return out


def main():
    data = parse()
    W, H, L, R, T, B = 700, 400, 60, 16, 70, 50
    lx = lambda n: L + (math.log10(n) - math.log10(50)) / (math.log10(400) - math.log10(50)) * (W - L - R)
    py = lambda y: T + (1 - y) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Power to reject a Coulomb-10% pendulum twin under Student-t noise, five paired statistics">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="14">Paired tests, Coulomb &#8722;10% twin, Student-t(3) noise</text>']
    for v in (0, 0.25, 0.5, 0.75, 1):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/><text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:g}</text>')
    for n in (50, 100, 200, 400):
        o.append(f'<text x="{lx(n):.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{n}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-10}" text-anchor="middle" font-family="sans-serif" font-size="12">matched trajectories n</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">power at 5% null quantile</text>')
    for j, (name, rows) in enumerate(data.items()):
        c = COLS[name]
        pts = " ".join(f"{lx(r[0]):.1f},{py(r[1]):.1f}" for r in rows)
        o.append(f'<polyline points="{pts}" fill="none" stroke="{c}" stroke-width="2"/>')
        o += [f'<circle cx="{lx(r[0]):.1f}" cy="{py(r[1]):.1f}" r="3" fill="{c}"/>' for r in rows]
        x0 = L + 125 * j
        o.append(f'<rect x="{x0}" y="34" width="14" height="10" fill="{c}"/><text x="{x0+20}" y="43" font-family="sans-serif" font-size="11">{name}</text>')
    o.append("</svg>")
    (HERE / "power_vs_n.svg").write_text("\n".join(o) + "\n")
    print("wrote power_vs_n.svg")


if __name__ == "__main__":
    main()
