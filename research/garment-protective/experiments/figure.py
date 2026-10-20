"""Write experiments/areal_density.svg: areal density each fibre needs to match aramid V50, by exponent n, parsed from results.txt.

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
    groups, data, on = [], [], False
    names = ["nylon 6,6", "aramid", "UHMWPE"]
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("Areal density needed"):
            on = True
            continue
        if on and not l.strip():
            break
        m = re.match(r"\s+(n=[\d.]+): nylon 6,6=([\d.]+)\s+aramid=([\d.]+)\s+UHMWPE=([\d.]+)", l)
        if on and m:
            groups.append(m.group(1)); data.append([float(m.group(i)) for i in (2, 3, 4)])
    assert len(groups) == 3, groups
    (HERE / "areal_density.svg").write_text(bars_svg(
        "Areal density to match aramid's V50 (fraction of aramid's)",
        "Grouped bars of the areal density nylon, aramid and UHMWPE need to match aramid ballistic V50, relative to aramid, for three exponents n",
        groups, names, data, "areal density / aramid"))
    print("wrote", HERE / "areal_density.svg")


if __name__ == "__main__":
    main()
