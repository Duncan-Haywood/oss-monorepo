"""Write experiments/fog_range.svg: exact lidar detection range against fog visibility.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad"]
TEXT = (HERE / "results.txt").read_text().splitlines()


def lines(title, alt, xlabel, ylabel, series, fname, logx=False, logy=False, hline=None):
    """Line plot: one polyline per series; values parsed from results.txt."""
    W, H, L, R, T, B = 640, 380, 64, 16, 56, 56
    fx = math.log10 if logx else (lambda v: v)
    fy = math.log10 if logy else (lambda v: v)
    xs_all = [fx(x) for _, xs, _ in series for x in xs]
    ys_all = [fy(y) for _, _, ys in series for y in ys] + ([fy(hline)] if hline else [])
    x0, x1 = min(xs_all), max(xs_all)
    y0, y1 = min(ys_all), max(ys_all)
    if not logy:
        y0 = min(y0, 0)
    pad = (y1 - y0) * 0.06 or 1
    y1 += pad
    if logy:
        y0 -= pad
    px = lambda x: L + (fx(x) - x0) / ((x1 - x0) or 1) * (W - L - R)
    py = lambda y: T + (1 - (fy(y) - y0) / (y1 - y0)) * (H - T - B)
    o = [f"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {W} {H}\" role=\"img\" aria-label=\"{alt}\">",
         f"<rect width=\"{W}\" height=\"{H}\" fill=\"#fff\"/>",
         f"<text x=\"{W/2}\" y=\"22\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"14\">{title}</text>"]
    if logy:
        ticks = [10 ** k for k in range(math.ceil(y0), math.floor(y1) + 1)]
    else:
        step = 10 ** math.floor(math.log10((y1 - y0) / 4))
        step *= min((1, 2, 5, 10), key=lambda m: abs((y1 - y0) / (m * step) - 5))
        ticks = [k * step for k in range(math.ceil(y0 / step), math.floor(y1 / step) + 1)]
    for v in ticks:
        o.append(f"<line x1=\"{L}\" x2=\"{W-R}\" y1=\"{py(v):.1f}\" y2=\"{py(v):.1f}\" stroke=\"#ddd\"/>"
                 f"<text x=\"{L-6}\" y=\"{py(v)+4:.1f}\" text-anchor=\"end\" font-family=\"sans-serif\" font-size=\"11\">{v:g}</text>")
    if logx:
        xt = [10 ** k for k in range(math.ceil(x0), math.floor(x1) + 1)]
        if len(xt) < 3:
            xt = sorted({x for _, xs, _ in series for x in xs})
    else:
        xt = sorted({x for _, xs, _ in series for x in xs})
        if len(xt) > 8:
            xt = xt[:: math.ceil(len(xt) / 8)]
    for v in xt:
        o.append(f"<text x=\"{px(v):.1f}\" y=\"{H-B+16}\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"11\">{v:g}</text>")
    o.append(f"<text x=\"{(L+W-R)/2}\" y=\"{H-12}\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"12\">{xlabel}</text>")
    o.append(f"<text x=\"14\" y=\"{(T+H-B)/2}\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"12\" transform=\"rotate(-90 14 {(T+H-B)/2})\">{ylabel}</text>")
    if hline:
        o.append(f"<line x1=\"{L}\" x2=\"{W-R}\" y1=\"{py(hline):.1f}\" y2=\"{py(hline):.1f}\" stroke=\"#555\" stroke-dasharray=\"4 3\"/>")
    for j, (n, xs, ys) in enumerate(series):
        c = COLS[j % len(COLS)]
        pts = " ".join(f"{px(x):.1f},{py(y):.1f}" for x, y in zip(xs, ys))
        o.append(f"<polyline points=\"{pts}\" fill=\"none\" stroke=\"{c}\" stroke-width=\"2\"/>")
        o += [f"<circle cx=\"{px(x):.1f}\" cy=\"{py(y):.1f}\" r=\"3\" fill=\"{c}\"/>" for x, y in zip(xs, ys)]
        lx = L + 140 * j
        o.append(f"<rect x=\"{lx}\" y=\"32\" width=\"14\" height=\"10\" fill=\"{c}\"/><text x=\"{lx+20}\" y=\"41\" font-family=\"sans-serif\" font-size=\"11\">{n}</text>")
    o.append("</svg>")
    (HERE / fname).write_text("\n".join(o) + "\n")
    print("wrote", HERE / fname)


def main():
    vis, rng = [], []
    sec = False
    for l in TEXT:
        if l.startswith("== 1."):
            sec = True
            continue
        if sec and l.startswith("=="):
            break
        p = l.split()
        if sec and len(p) > 4 and p[0].isdigit():
            vis.append(float(p[0]))
            rng.append(float(p[3]))
    lines("Lidar detection range in uniform fog (clear-air range 100 m)", "Line of exact lidar detection range against meteorological visibility on a log axis: range falls from 93 m in light fog to 15 m in dense fog", "visibility V (m)", "detection range (m)", [("range (Lambert W)", vis, rng)], "fog_range.svg", logx=True, hline=100.0)


if __name__ == "__main__":
    main()
