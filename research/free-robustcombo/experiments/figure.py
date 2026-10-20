"""Write experiments/power_vs_n.svg: power at Coulomb -10% under t(2) cells, bad runs, and both for six
paired statistics, parsed from the committed results.txt.

    python3 experiments/figure.py
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = {"median_sq": "#1f6fb2", "run_median": "#555555", "run_med_med": "#c0392b", "run_med_trim": "#d68910",
        "run_trim_med": "#8e44ad", "run_trim_trim": "#2e8b57"}
PANELS = (("student2", "t(2) cells"), ("badruns", "bad runs"), ("both", "t(2) cells in bad runs"))
NS = (50, 100, 200)


def parse():
    out = {k: {s: [] for s in COLS} for k, _ in PANELS}
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"(\w+)\s+Coulomb -10%\s+n=\s*(\d+) (\S+)\s+power\s+([\d.]+)", l)
        if m and m.group(1) in out:
            out[m.group(1)][m.group(3)].append((int(m.group(2)), float(m.group(4))))
    assert all(len(v) == len(NS) for k in out.values() for v in k.values()), "results.txt not as expected"
    return out


def main():
    data = parse()
    W, H, T, B = 900, 400, 78, 50
    PW, GAP, L = 250, 40, 50
    f = 'font-family="sans-serif"'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Power to reject a Coulomb-10% pendulum twin, six paired statistics, under t(2) cells, bad runs, and both">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="18" text-anchor="middle" {f} font-size="14">Paired tests, Coulomb &#8722;10% twin</text>']
    for j, name in enumerate(COLS):
        x0 = 20 + 140 * j
        o.append(f'<rect x="{x0}" y="30" width="14" height="10" fill="{COLS[name]}"/><text x="{x0+20}" y="39" {f} font-size="11">{name}</text>')
    py = lambda y: T + (1 - y) * (H - T - B)
    for i, (key, title) in enumerate(PANELS):
        x0 = L + i * (PW + GAP)
        lx = lambda n: x0 + (math.log10(n) - math.log10(50)) / (math.log10(200) - math.log10(50)) * PW
        o.append(f'<text x="{x0+PW/2}" y="{T-8}" text-anchor="middle" {f} font-size="12">{title}</text>')
        for v in (0, 0.25, 0.5, 0.75, 1):
            o.append(f'<line x1="{x0}" x2="{x0+PW}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>')
            if i == 0:
                o.append(f'<text x="{x0-6}" y="{py(v)+4:.1f}" text-anchor="end" {f} font-size="11">{v:g}</text>')
        for n in NS:
            o.append(f'<text x="{lx(n):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{n}</text>')
        o.append(f'<text x="{x0+PW/2}" y="{H-12}" text-anchor="middle" {f} font-size="12">matched trajectories n</text>')
        for name, rows in data[key].items():
            c = COLS[name]
            o.append(f'<polyline points="{" ".join(f"{lx(r[0]):.1f},{py(r[1]):.1f}" for r in rows)}" fill="none" stroke="{c}" stroke-width="2"/>')
            o += [f'<circle cx="{lx(r[0]):.1f}" cy="{py(r[1]):.1f}" r="3" fill="{c}"/>' for r in rows]
    o.append(f'<text x="12" y="{(T+H-B)/2}" text-anchor="middle" {f} font-size="12" transform="rotate(-90 12 {(T+H-B)/2})">power at 5% null quantile</text>')
    o.append("</svg>")
    (HERE / "power_vs_n.svg").write_text("\n".join(o) + "\n")
    print("wrote power_vs_n.svg")


if __name__ == "__main__":
    main()
