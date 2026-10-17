"""Write experiments/report_shift.svg: optimal report of the naive scheme vs the truthful report (results E1).

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
    rows = {}
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"\s+b=([\d.]+) p=([\d.]+): report ([\d.]+)", l)
        if m:
            rows.setdefault(m.group(1), {})[m.group(2)] = float(m.group(3))
    ps = sorted({p for r in rows.values() for p in r})
    series = [(f"b={b}", [r[p] for p in ps]) for b, r in rows.items()]
    series.append(("truthful", [float(p) for p in ps]))
    (HERE / "report_shift.svg").write_text(lines(
        "Naive scheme under report-dependent audits: what is reported (E1, a=0.2)",
        "Reported probability against true belief 0.2, 0.5 and 0.9 for audit slopes b of 0.1, 0.3 and 0.6, all below the truthful diagonal",
        "true belief p", "optimal report", [f"p={p}" for p in ps], series, ymin=0.0, ymax=1.0))
    print("wrote", HERE / "report_shift.svg")


if __name__ == "__main__":
    main()
