"""Write experiments/resting_error.svg: resting error of the real loop vs the twin (which predicts zero).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad"]
TEXT = (HERE / "results.txt").read_text().splitlines()

def bars(title, alt, ylabel, cats, series, fname):
    """Grouped bars: cats on x, one bar per series; values parsed from results.txt."""
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 56
    hi = max(v for _, vs in series for v in vs) * 1.1
    py = lambda y: T + (1 - y / hi) * (H - T - B)
    o = [f"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {W} {H}\" role=\"img\" aria-label=\"{alt}\">",
         f"<rect width=\"{W}\" height=\"{H}\" fill=\"#fff\"/>",
         f"<text x=\"{W/2}\" y=\"22\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"14\">{title}</text>"]
    step = 10 ** math.floor(math.log10(hi / 4))
    step *= min((1, 2, 5, 10), key=lambda m: abs(hi / (m * step) - 5))
    for k in range(int(hi / step) + 1):
        v = k * step
        o.append(f"<line x1=\"{L}\" x2=\"{W-R}\" y1=\"{py(v):.1f}\" y2=\"{py(v):.1f}\" stroke=\"#ddd\"/>"
                 f"<text x=\"{L-6}\" y=\"{py(v)+4:.1f}\" text-anchor=\"end\" font-family=\"sans-serif\" font-size=\"11\">{v:g}</text>")
    gw = (W - L - R) / len(cats)
    bw = gw * 0.8 / len(series)
    for i, c in enumerate(cats):
        o.append(f"<text x=\"{L+gw*(i+.5):.1f}\" y=\"{H-B+16}\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"11\">{c}</text>")
        for j, (_, vs) in enumerate(series):
            x = L + gw * i + gw * 0.1 + bw * j
            o.append(f"<rect x=\"{x:.1f}\" y=\"{py(vs[i]):.1f}\" width=\"{bw:.1f}\" height=\"{py(0)-py(vs[i]):.1f}\" fill=\"{COLS[j % len(COLS)]}\"/>")
    o.append(f"<text x=\"14\" y=\"{(T+H-B)/2}\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"12\" transform=\"rotate(-90 14 {(T+H-B)/2})\">{ylabel}</text>")
    for j, (n, _) in enumerate(series):
        ly = T + 18 + 16 * j
        o.append(f"<rect x=\"{L+12}\" y=\"{ly-8}\" width=\"14\" height=\"10\" fill=\"{COLS[j % len(COLS)]}\"/><text x=\"{L+32}\" y=\"{ly+2}\" font-family=\"sans-serif\" font-size=\"11\">{n}</text>")
    o.append("</svg>")
    (HERE / fname).write_text("\n".join(o) + "\n")
    print("wrote", HERE / fname)




def main():
    cats, twin, real = [], [], []
    sec = False
    for l in TEXT:
        if l.startswith("== 1."):
            sec = True
            continue
        if sec and l.startswith("=="):
            break
        p = l.split()
        if sec and len(p) == 6 and p[0][0].isdigit():
            cats.append(f"d={p[0]} k={p[1]}")
            twin.append(float(p[2]))
            real.append(float(p[3]))
    bars("Resting error |x| after 2000 steps", "Grouped bars of twin and real-loop final error for four deadband and gain settings; the twin converges to zero, the real loop stalls at d over k", "final |x|", cats, [("twin (no deadband)", twin), ("real loop (deadband d)", real)], "resting_error.svg")


if __name__ == "__main__":
    main()
