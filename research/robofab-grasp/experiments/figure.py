"""Write experiments/bound_vs_mujoco.svg: MuJoCo-measured minimum grip force against the analytic bound, one point per case.

    python experiments/figure.py

Numbers are read from the committed results.json, never retyped: re-run the experiment first if it changes.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROWS = json.loads((HERE / "results.json").read_text())
COLS = {0.3: "#c0392b", 0.5: "#1f6fb2", 0.8: "#2e8b57"}


def main():
    W, H, L, R, T, B = 560, 420, 64, 16, 48, 56
    xs = [r["bound_N"] for r in ROWS]
    ys = [r["mujoco_N"] for r in ROWS]
    lo = math.floor(math.log10(min(xs + ys)))
    hi = math.ceil(math.log10(max(xs + ys)))
    px = lambda v: L + (math.log10(v) - lo) / (hi - lo) * (W - L - R)
    py = lambda v: T + (1 - (math.log10(v) - lo) / (hi - lo)) * (H - T - B)
    f = 'font-family="sans-serif"'
    worst = max(abs(r["ratio"] - 1) for r in ROWS)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Log-log scatter of MuJoCo grip force against the analytic bound; all {len(ROWS)} points lie on the y = x line">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Grip force: MuJoCo vs analytic bound ({len(ROWS)} cases)</text>',
         f'<text x="{W/2}" y="38" text-anchor="middle" {f} font-size="11" fill="#555">largest deviation from y = x: {worst*100:.1f}%</text>']
    for k in range(lo, hi + 1):
        v = 10.0 ** k
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" {f} font-size="11">{v:g}</text>'
                 f'<line y1="{T}" y2="{H-B}" x1="{px(v):.1f}" x2="{px(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{px(v):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{v:g}</text>')
    o.append(f'<line x1="{px(10.0**lo):.1f}" y1="{py(10.0**lo):.1f}" x2="{px(10.0**hi):.1f}" y2="{py(10.0**hi):.1f}" stroke="#888" stroke-dasharray="5 4"/>')
    for r in ROWS:
        o.append(f'<circle cx="{px(r["bound_N"]):.1f}" cy="{py(r["mujoco_N"]):.1f}" r="4" fill="{COLS[r["mu"]]}" fill-opacity=".75"/>')
    for i, (mu, c) in enumerate(COLS.items()):
        o.append(f'<circle cx="{L+12+i*70}" cy="{T+14}" r="4" fill="{c}"/><text x="{L+20+i*70}" y="{T+18}" {f} font-size="11">&#956; = {mu}</text>')
    o.append(f'<text x="{W/2}" y="{H-10}" text-anchor="middle" {f} font-size="12">analytic bound (N)</text>')
    o.append(f'<text transform="translate(16 {H/2}) rotate(-90)" text-anchor="middle" {f} font-size="12">MuJoCo (N)</text></svg>')
    (HERE / "bound_vs_mujoco.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
