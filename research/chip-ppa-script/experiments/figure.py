"""Write experiments/ppa_scripts.svg: add16 cells*depth by ABC script and candidate group (results.txt, first block).

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad", "#d68910", "#555555"]
FONT = 'font-family="sans-serif"'


def nums(line):
    return [float(x) for x in re.findall(r"-?\d+\.?\d*(?:e-?\d+)?", line)]


def ticks_for(lo, hi):
    step = 10 ** math.floor(math.log10((hi - lo) / 4))
    step *= min((1, 2, 5, 10), key=lambda m: abs((hi - lo) / (m * step) - 5))
    return [round(k * step, 10) for k in range(math.ceil(lo / step), int(hi / step) + 1)]


def frame(title, alt, xlabel, ylabel, xlabels, lo, hi, px, py, W, H, L, R, T, B):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {FONT} font-size="14">{title}</text>']
    for v in ticks_for(lo, hi):
        y = py(v)
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{y+4:.1f}" text-anchor="end" {FONT} font-size="11">{v:g}</text>')
    for i, s in enumerate(xlabels):
        o.append(f'<text x="{px(i):.1f}" y="{H-B+16}" text-anchor="middle" {FONT} font-size="11">{s}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-14}" text-anchor="middle" {FONT} font-size="12">{xlabel}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {FONT} font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    return o


def legend(o, series, L, T):
    for j, (name, _) in enumerate(series):
        c = COLS[j % len(COLS)]
        ly = T + 18 + 16 * j
        o.append(f'<rect x="{L+12}" y="{ly-6}" width="18" height="10" fill="{c}"/>'
                 f'<text x="{L+36}" y="{ly+4}" {FONT} font-size="11">{name}</text>')


def lines(title, alt, xlabel, ylabel, xlabels, series, ymin=None, ymax=None):
    """series = [(name, ys)]; categorical, evenly spaced x positions."""
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 56
    ys = [y for _, v in series for y in v]
    lo, hi = min(ys), max(ys)
    pad = 0.08 * (hi - lo or 1)
    lo = ymin if ymin is not None else lo - pad
    hi = ymax if ymax is not None else hi + pad
    n = len(xlabels)
    px = lambda i: L + i / max(n - 1, 1) * (W - L - R)
    py = lambda y: T + (hi - y) / (hi - lo) * (H - T - B)
    o = frame(title, alt, xlabel, ylabel, xlabels, lo, hi, px, py, W, H, L, R, T, B)
    for j, (name, v) in enumerate(series):
        c = COLS[j % len(COLS)]
        pts = " ".join(f"{px(i):.1f},{py(y):.1f}" for i, y in enumerate(v))
        o.append(f'<polyline fill="none" stroke="{c}" stroke-width="2" points="{pts}"/>')
        o += [f'<circle cx="{px(i):.1f}" cy="{py(y):.1f}" r="2.5" fill="{c}"/>' for i, y in enumerate(v)]
    legend(o, [(n, None) for n, _ in series], L, T)
    o.append("</svg>")
    return "\n".join(o) + "\n"


def bars(title, alt, xlabel, ylabel, groups, series, ymin=0.0):
    """Grouped bars: series = [(name, [value per group])]."""
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 56
    hi = max(y for _, v in series for y in v) * 1.1
    lo = ymin
    n, k = len(groups), len(series)
    slot = (W - L - R) / n
    bw = slot * 0.8 / k
    px = lambda i: L + (i + 0.5) * slot
    py = lambda y: T + (hi - y) / (hi - lo) * (H - T - B)
    o = frame(title, alt, xlabel, ylabel, groups, lo, hi, px, py, W, H, L, R, T, B)
    for j, (name, v) in enumerate(series):
        c = COLS[j % len(COLS)]
        for i, y in enumerate(v):
            x = px(i) - slot * 0.4 + j * bw
            o.append(f'<rect x="{x:.1f}" y="{py(y):.1f}" width="{bw:.1f}" height="{py(lo)-py(y):.1f}" fill="{c}"/>')
    legend(o, series, W - R - 150, T - 10)
    o.append("</svg>")
    return "\n".join(o) + "\n"


def main():
    lines = (HERE / "results.txt").read_text().splitlines()
    i = next(k for k, l in enumerate(lines) if l.startswith("== add16"))
    hdr = lines[i + 2].split()
    scripts = hdr[1:6]  # yosys_default strash_map dc2_map dch_map resyn2_map
    series = []
    for l in lines[i + 3:i + 6]:
        parts = re.split(r"\s{2,}", l.strip())
        name, v = parts[0], [float(x) for x in parts[1:6]]
        assert len(v) == 5, l
        series.append((name, v))
    assert len(scripts) == 5 and len(series) == 3
    out = HERE / "ppa_scripts.svg"
    out.write_text(bars(
        "add16: cells x depth by ABC script (lower is better)",
        "Grouped bars of cells times depth for a 16-bit adder under five ABC scripts, for the reference design, the best proposer file and the best sweep config",
        "ABC script", "cells x depth", scripts, series))
    print("wrote", out)


if __name__ == "__main__":
    main()
