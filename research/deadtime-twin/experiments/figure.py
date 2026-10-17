"""Write experiments/observed_rate.svg from experiments/results.txt (section 1).

    python experiments/figure.py

The numbers are parsed from the committed run output, never retyped: re-run run.py first if the
experiment changes. Standard library only.
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

def chart(title, aria, xlabel, ylabel, xlabels, series, ymin, ymax, log=False, hline=None, fmt="{:g}", ticks=()):
    """Line chart over equally spaced categorical x positions. series: [(name, colour, values)]."""
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 52
    n = len(xlabels)

    def px(i):
        return L + (i + 0.5) / n * (W - L - R)

    def py(y):
        if log:
            a, b = math.log10(ymin), math.log10(ymax)
            return T + (b - math.log10(max(y, ymin))) / (b - a) * (H - T - B)
        return T + (ymax - y) / (ymax - ymin) * (H - T - B)

    f = 'font-family="sans-serif"'
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{aria}">',
           f'<rect width="{W}" height="{H}" fill="#fff"/>',
           f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">{title}</text>']
    for t in ticks:
        y = py(t)
        out.append(f'<line x1="{L}" x2="{W-R}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/>'
                   f'<text x="{L-6}" y="{y+4:.1f}" text-anchor="end" {f} font-size="11">{fmt.format(t)}</text>')
    for i, lab in enumerate(xlabels):
        out.append(f'<text x="{px(i):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{lab}</text>')
    if hline is not None:
        y = py(hline[0])
        out.append(f'<line x1="{L}" x2="{W-R}" y1="{y:.1f}" y2="{y:.1f}" stroke="#888" stroke-dasharray="4 3"/>'
                   f'<text x="{W-R-4}" y="{y-4:.1f}" text-anchor="end" {f} font-size="11" fill="#555">{hline[1]}</text>')
    out.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle" {f} font-size="12">{xlabel}</text>')
    out.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {f} font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    for k, (name, col, vals) in enumerate(series):
        pts = " ".join(f"{px(i):.1f},{py(v):.1f}" for i, v in enumerate(vals))
        out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" points="{pts}"/>')
        for i, v in enumerate(vals):
            out.append(f'<circle cx="{px(i):.1f}" cy="{py(v):.1f}" r="3" fill="{col}"/>')
        ly = T + 34 + 16 * k
        out.append(f'<line x1="{W-250}" x2="{W-226}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2"/>'
                   f'<text x="{W-220}" y="{ly+4}" {f} font-size="11">{name}</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


def section(text, n):
    block = text.split("== %d." % n, 1)[1]
    return block.split("\n== ", 1)[0]


def parse(text):
    """[(x, twin, non-paralyzable, paralyzable)] from section 1."""
    rows = []
    for line in section(text, 1).splitlines():
        m = re.match(r"\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+[\d.]+\s+([\d.]+)\s+[\d.]+\s*$", line)
        if m:
            rows.append(tuple(map(float, m.groups())))
    return rows


def main():
    rows = parse((HERE / "results.txt").read_text())
    s = chart("Observed rate of a dead-time detector vs the ideal twin (stylised)",
              "Observed count rate times dead time against true flux times dead time: the ideal counter rises linearly, a non-paralyzable detector saturates at 1 and a paralyzable one collapses towards 0",
              "true flux x = n tau", "observed rate m tau",
              [f"{r[0]:g}" for r in rows],
              [("twin (ideal counter)", "#888888", [r[1] for r in rows]),
               ("non-paralyzable", "#1f6fb2", [r[2] for r in rows]),
               ("paralyzable", "#c0392b", [r[3] for r in rows])],
              0.0003, 12, log=True, ticks=[0.001, 0.01, 0.1, 1, 10], fmt="{:g}")
    (HERE / "observed_rate.svg").write_text(s)
    print("wrote observed_rate.svg from %d rows" % len(rows))


if __name__ == "__main__":
    main()
