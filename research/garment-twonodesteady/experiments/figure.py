"""Write experiments/steady.svg: dry-loss effect of each property at 60 minutes vs steady state in the cool room, ours vs reference.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    start = next(i for i, l in enumerate(TEXT) if l.startswith("cool room 16 C"))
    rows = []
    for l in TEXT[start + 1:start + 5]:
        m = re.match(r"\s+(\w+ [\d.]+ -> [\d.]+)\s+ours@60: \S+ \S+\s+([-+][\d.]+) \| ours@ss: \S+ \S+\s+([-+][\d.]+) \| ref@60: \S+ \S+\s+([-+][\d.]+) \| ref@ss: \S+ \S+\s+([-+][\d.]+)", l)
        if m:
            rows.append((m.group(1),) + tuple(abs(float(m.group(i))) for i in (2, 3, 4, 5)))
    if len(rows) != 4:
        raise SystemExit("no rows parsed")
    bars("Dry-loss effect, 60 min vs steady state, cool room 16 C", "Grouped bars of the absolute change in dry heat loss in W per square metre for each garment property in a 16 C room, for our model and the reference at 60 minutes and at steady state: the reference's 60 minute effects are far from its steady state ones",
         "|change in dry loss| (W/m2)", [r[0] for r in rows], ["ours 60 min", "ours steady", "ref 60 min", "ref steady"], [list(r[1:]) for r in rows], "steady.svg")


def bars(title, alt, ylabel, groups, series_names, values, fname, ymax=None):
    """Grouped bar SVG: values[g][s]."""
    W, H, L, R, T, B = 640, 380, 64, 16, 56, 56
    cols = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad"]
    y1 = ymax or max(v for r in values for v in r) * 1.1
    py = lambda y: T + (1 - y / y1) * (H - T - B)
    f = 'font-family="sans-serif"'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">{title}</text>']
    step = 10 ** math.floor(math.log10(y1 / 4))
    step *= min((1, 2, 5, 10), key=lambda m: abs(y1 / (m * step) - 5))
    for k in range(int(y1 / step) + 1):
        v = k * step
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" {f} font-size="11">{v:g}</text>')
    gw = (W - L - R) / len(groups)
    bw = gw * 0.8 / len(series_names)
    for i, g in enumerate(groups):
        x0 = L + i * gw + gw * 0.1
        for j, v in enumerate(values[i]):
            o.append(f'<rect x="{x0+j*bw:.1f}" y="{py(v):.1f}" width="{bw-2:.1f}" height="{py(0)-py(v):.1f}" fill="{cols[j%4]}"/>')
        o.append(f'<text x="{x0+gw*0.4:.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{g}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {f} font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    for j, n in enumerate(series_names):
        lx = L + 130 * j
        o.append(f'<rect x="{lx}" y="32" width="14" height="10" fill="{cols[j%4]}"/><text x="{lx+20}" y="41" {f} font-size="11">{n}</text>')
    o.append("</svg>")
    (HERE / fname).write_text("\n".join(o) + "\n")
    print("wrote", HERE / fname)


if __name__ == "__main__":
    main()
