"""Write experiments/dscorr.svg: population utility of naive, em-known and Dawid-Skene vs auditor correlation rho.

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad", "#d68910", "#555555"]


def nums(line):
    return [float(x) for x in re.findall(r"-?\d+\.?\d*(?:e-?\d+)?", line)]


def section(text, start, stop=None):
    """Lines of results.txt from the line starting with `start` up to the next blank line."""
    lines = text.splitlines()
    i = next(k for k, l in enumerate(lines) if l.strip().startswith(start))
    out = []
    for l in lines[i + 1:]:
        if not l.strip():
            break
        out.append(l)
    return out


def svg(title, alt, xlabel, ylabel, xlabels, series, logy=False, ymin=None):
    """series = [(name, ys)]; categorical, evenly spaced x positions."""
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 56
    ys = [y for _, v in series for y in v]
    f = (lambda v: math.log10(v)) if logy else (lambda v: v)
    lo, hi = f(min(ys)), f(max(ys))
    pad = 0.08 * (hi - lo or 1)
    lo, hi = lo - pad, hi + pad
    if ymin is not None and not logy:
        lo = ymin
    n = len(xlabels)
    px = lambda i: L + i / max(n - 1, 1) * (W - L - R)
    py = lambda y: T + (hi - f(y)) / (hi - lo) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">{title}</text>']
    if logy:
        ticks = [m * 10 ** e for e in range(math.floor(lo) - 1, math.ceil(hi) + 1) for m in (1, 2, 5)]
        ticks = [t for t in ticks if lo <= math.log10(t) <= hi]
    else:
        step = 10 ** math.floor(math.log10((hi - lo) / 4))
        step *= min((1, 2, 5, 10), key=lambda m: abs((hi - lo) / (m * step) - 5))
        t0 = math.ceil(lo / step)
        ticks = [round(k * step, 10) for k in range(t0, int(hi / step) + 1)]
    for v in ticks:
        y = py(v)
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{y+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:g}</text>')
    for i, s in enumerate(xlabels):
        o.append(f'<text x="{px(i):.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{s}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-14}" text-anchor="middle" font-family="sans-serif" font-size="12">{xlabel}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    for j, (name, v) in enumerate(series):
        c = COLS[j % len(COLS)]
        pts = " ".join(f"{px(i):.1f},{py(y):.1f}" for i, y in enumerate(v))
        o.append(f'<polyline fill="none" stroke="{c}" stroke-width="2" points="{pts}"/>')
        o += [f'<circle cx="{px(i):.1f}" cy="{py(y):.1f}" r="2.5" fill="{c}"/>' for i, y in enumerate(v)]
        ly = T + 18 + 16 * j
        o.append(f'<line x1="{L+12}" x2="{L+36}" y1="{ly}" y2="{ly}" stroke="{c}" stroke-width="2"/>'
                 f'<text x="{L+42}" y="{ly+4}" font-family="sans-serif" font-size="11">{name}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"




def main():
    text = (HERE / "results.txt").read_text()
    i = text.index("== label accuracy 0.7")
    j = text.index("==", i + 5) if "==" in text[i + 5:] else len(text)
    rows = []
    for l in text[i:j].splitlines():
        if "|" in l and l.strip()[0].isdigit():
            rows.append(nums(l.split("|")[0]) + nums(l.split("|")[1])[:3])
    (HERE / "dscorr.svg").write_text(svg(
        "Correlated auditors, label accuracy 0.7: population utility",
        "Population utility of naive, known-accuracy EM and Dawid-Skene versus auditor correlation rho",
        "auditor correlation rho", "mean utility per message", [f"{r[0]:g}" for r in rows],
        [("naive", [r[1] for r in rows]), ("em-known (oracle)", [r[2] for r in rows]), ("Dawid-Skene", [r[3] for r in rows])]))
    print("wrote", HERE / "dscorr.svg")


if __name__ == "__main__":
    main()
