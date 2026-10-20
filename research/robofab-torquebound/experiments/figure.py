"""Write experiments/edge.svg: time-optimal edge over a trapezoid ramp, by travel length L and parameter k (as in results.txt).

    python experiments/figure.py

The numbers are parsed from the committed results.txt (column e25k/40, the 25,600-node solver against the 40-sample trapezoid),
never retyped: re-run run.py first if the experiment changes.
"""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
COLS = ["#1f6fb2", "#c0392b", "#2e8b57"]


def parse():
    groups, L = {}, None
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"## L=([\d.]+) m", l)
        if m:
            L = m.group(1)
            continue
        m = re.match(r"\s*(2\.0|5\.0|inf)\s+(?:[\d.]+\s+){6}[\d.]+%\s+([\d.]+)%", l)
        if L and m:
            groups.setdefault(L, {})[m.group(1)] = float(m.group(2))
    return groups


def bars_svg(title, alt, ylabel, groups, series):
    W, H, L0, R, T, B = 640, 380, 64, 16, 40, 64
    ymax = max(v for g in groups.values() for v in g.values()) * 1.15
    py = lambda y: T + (1 - y / ymax) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">{title}</text>']
    for i in range(6):
        v = ymax * i / 5
        o.append(f'<line x1="{L0}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L0-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:.0f}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    gw = (W - L0 - R) / len(groups)
    bw = gw * 0.8 / len(series)
    for gi, (gname, g) in enumerate(groups.items()):
        x0 = L0 + gi * gw + gw * 0.1
        for si, (key, _) in enumerate(series):
            v = g[key]
            x = x0 + si * bw
            o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="{bw-3:.1f}" height="{py(0)-py(v):.1f}" fill="{COLS[si]}"/>'
                     f'<text x="{x+(bw-3)/2:.1f}" y="{py(v)-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="10">{v:.1f}</text>')
        o.append(f'<text x="{L0+gi*gw+gw/2:.1f}" y="{H-B+18}" text-anchor="middle" font-family="sans-serif" font-size="12">L = {gname} m</text>')
    for si, (_, name) in enumerate(series):
        o.append(f'<rect x="{L0+10+si*120}" y="{H-24}" width="12" height="10" fill="{COLS[si]}"/>'
                 f'<text x="{L0+26+si*120}" y="{H-15}" font-family="sans-serif" font-size="11">{name}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def main():
    groups = parse()
    assert len(groups) == 3 and all(len(g) == 3 for g in groups.values()), groups
    (HERE / "edge.svg").write_text(bars_svg(
        "Time saved by the time-optimal profile vs a trapezoid ramp",
        "Percent of six-part carry time saved by the time-optimal solver over a trapezoid, for three travel lengths and three values of k",
        "time saved (%)", groups, [("2.0", "k = 2"), ("5.0", "k = 5"), ("inf", "k = inf")]))
    print("wrote", HERE / "edge.svg")


if __name__ == "__main__":
    main()
