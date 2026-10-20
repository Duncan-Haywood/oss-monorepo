"""Write experiments/leaveone.svg: skin-temperature gap each single modelling choice causes (section C).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()
COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad"]


def main():
    start = next(i for i, l in enumerate(TEXT) if l.startswith("== C."))
    rows = {}
    for l in TEXT[start + 1:]:
        if l.startswith("== "):
            break
        m = re.match(r"(\w+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*$", l)
        if m:
            rows[m.group(1)] = float(m.group(2))
    if len(rows) != 9:
        raise SystemExit("no rows parsed")
    names = list(rows)
    bars("Two-node alignment: gap each choice alone causes", "Bars of the skin temperature gap in C that each of nine modelling choices causes alone when every other choice matches pythermalcomfort: convection and alfa dominate",
         "mean |d t_skin| (C)", names, ["leave-one-out gap"], [[rows[n]] for n in names], "leaveone.svg")


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
