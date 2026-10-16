"""Write experiments/shift.svg: comfort-equivalent shift (C) of each fabric treatment in each scenario, parsed from section C of results.txt.

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
    scen, data, on = [], [], False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("== C."):
            on = True
        elif l.startswith("==") and on:
            break
        elif on and l.strip():
            m = re.match(r"\s+(.+?)\s+PMV\s+[-+\d.]+\s+shift\s+([-+\d.]+) C", l)
            if m:
                data[-1][m.group(1)] = float(m.group(2))
            else:
                scen.append(l.split(" (")[0]); data.append({})
    names = ["IR-transparent (tau .8)", "IR-opaque low-e outside (eps .2)", "white (alpha .15)", "dark (alpha .9)"]
    short = ["IR-transparent", "low-e outside", "white", "dark"]
    assert len(scen) == 4 and all(len(d) == 6 for d in data), (scen, data)
    (HERE / "shift.svg").write_text(bars_svg(
        "Comfort-equivalent shift of a fabric treatment, by scenario",
        "Grouped bars of the comfort-equivalent temperature shift in degrees C for four fabric treatments in four scenarios",
        scen, short, [[d[n] for n in names] for d in data], "shift vs baseline (C)"))
    print("wrote", HERE / "shift.svg")


if __name__ == "__main__":
    main()
