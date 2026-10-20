"""Write experiments/edge.svg: time-optimal solver's edge over the trapezoid baseline (%) at 400 and 6400 nodes and Richardson-extrapolated, per (L, k, w) case, parsed from results.txt.

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
COLS = ["#1f6fb2", "#c0392b", "#2e8b57", "#8e44ad", "#e08e0b"]


def bars_svg(title, alt, groups, names, data, ylabel):
    """data[g][s] = value; grouped bars with a zero line and a legend."""
    W, H, L, R, T, B = 720, 400, 56, 16, 40, 70
    lo = min(0, min(min(r) for r in data)); hi = max(0, max(max(r) for r in data))
    pad = (hi - lo) * 0.08; lo -= pad; hi += pad
    py = lambda v: T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
    gw = (W - L - R) / len(groups); bw = gw * 0.8 / len(names)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">{title}</text>',
         f'<rect x="{L}" y="{T}" width="{W-L-R}" height="{H-T-B}" fill="none" stroke="#999"/>']
    for i in range(6):
        v = lo + (hi - lo) * i / 5
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#eee"/><text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:.1f}</text>')
    o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(0):.1f}" y2="{py(0):.1f}" stroke="#333"/>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    for g, gname in enumerate(groups):
        x0 = L + g * gw + gw * 0.1
        for s in range(len(names)):
            v = data[g][s]; y = py(v)
            o.append(f'<rect x="{x0+s*bw:.1f}" y="{min(y, py(0)):.1f}" width="{bw-1:.1f}" height="{abs(y-py(0)):.1f}" fill="{COLS[s % len(COLS)]}"/>')
        o.append(f'<text x="{L+g*gw+gw/2:.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{gname}</text>')
    for s, n in enumerate(names):
        lx = L + s * 135
        o.append(f'<rect x="{lx}" y="{H-24}" width="12" height="10" fill="{COLS[s % len(COLS)]}"/><text x="{lx+16}" y="{H-15}" font-family="sans-serif" font-size="11">{n}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def main():
    groups, data = [], []
    for l in (HERE / "results.txt").read_text().splitlines():
        t = l.split()
        if len(t) == 12 and re.fullmatch(r"\d\.\d+", t[0]):
            groups.append(f"{t[0][1:]}/{t[1]}/{t[2]}")
            data.append([float(t[i].rstrip("%")) for i in (8, 9, 10)])
    assert len(groups) == 12, groups
    (HERE / "edge.svg").write_text(bars_svg(
        "Edge of time-optimal solver over trapezoid (%); groups are L/k/w",
        "Grouped bars of the percentage time saved by the time-optimal solver versus the trapezoid baseline at 400 nodes, 6400 nodes and the extrapolated limit for twelve cases",
        groups, ["400 nodes", "6400 nodes", "extrapolated"], data, "edge (%)"))
    print("wrote", HERE / "edge.svg")


if __name__ == "__main__":
    main()
