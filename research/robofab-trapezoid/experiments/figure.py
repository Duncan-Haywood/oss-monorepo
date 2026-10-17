"""Write experiments/carry_time.svg from experiments/results.json, no plotting dependency.

    python experiments/figure.py

Plots the block L=0.08 m, k=2.0 (jaw cap twice the static hold force). The numbers are read from the committed run output,
never retyped: re-run run.py first if the experiment changes.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
XKEY = "wmax"
XLABEL = "peak joint-speed limit wmax (rad/s)"
SERIES = [("T_minjerk", "min-jerk", "#c0392b"), ("T_trap", "trapezoid", "#1f6fb2"), ("T_opt", "time-optimal", "#2e8b57")]
TITLE = "Carry time vs joint-speed limit (stylised simulation)"
ALT = "Carry time versus peak joint-speed limit for min-jerk, trapezoidal and time-optimal profiles in a stylised simulation"


def pick(blocks):
    for b in blocks:
        if b["L"] == 0.08 and b["k"] == 2.0:
            return b
    raise SystemExit("block not found in results.json")


def label(v):
    return "inf" if v is None else f"{v:g}"


def svg(block):
    rows = block["rows"]
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 56
    ys = [r[k] for r in rows for k, _, _ in SERIES]
    lo, hi = math.log10(min(ys)) - 0.1, math.log10(max(ys)) + 0.1
    n = len(rows)

    def px(i):
        return L + i / (n - 1) * (W - L - R)

    def py(y):
        return T + (hi - math.log10(y)) / (hi - lo) * (H - T - B)

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{ALT}">',
           f'<rect width="{W}" height="{H}" fill="#fff"/>',
           f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">{TITLE}</text>']
    for e in range(math.floor(lo) - 1, math.ceil(hi) + 1):
        for m in (1, 2, 5):
            v = m * 10 ** e
            if lo <= math.log10(v) <= hi:
                y = py(v)
                out.append(f'<line x1="{L}" x2="{W-R}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/>'
                           f'<text x="{L-6}" y="{y+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:g}</text>')
    for i, r in enumerate(rows):
        out.append(f'<text x="{px(i):.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{label(r[XKEY])}</text>')
    out.append(f'<text x="{(L+W-R)/2}" y="{H-14}" text-anchor="middle" font-family="sans-serif" font-size="12">{XLABEL}</text>')
    out.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">carry time (s, log scale)</text>')
    for j, (k, name, col) in enumerate(SERIES):
        pts = " ".join(f"{px(i):.1f},{py(r[k]):.1f}" for i, r in enumerate(rows))
        out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" points="{pts}"/>')
        ly = T + 18 + 16 * j
        out.append(f'<line x1="{L+12}" x2="{L+36}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2"/>'
                   f'<text x="{L+42}" y="{ly+4}" font-family="sans-serif" font-size="11">{name}</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    blocks = json.loads((HERE / "results.json").read_text())
    (HERE / "carry_time.svg").write_text(svg(pick(blocks)))
    print("wrote", HERE / "carry_time.svg")
