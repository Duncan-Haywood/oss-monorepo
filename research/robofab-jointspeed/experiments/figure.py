"""Write experiments/speed_gain.svg: move time of the optimised profile relative to a minimum-jerk profile, against the joint-speed cap.

    python experiments/figure.py

Numbers are read from the committed results.json, never retyped: re-run the experiment first if it changes.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = json.loads((HERE / "results.json").read_text())
COLS = ["#c0392b", "#1f6fb2", "#2e8b57"]


def main():
    series = []
    for c in CASES:
        pts = [(r["wmax"], r["T_opt"] / r["T_minjerk"]) for r in c["rows"] if r["wmax"] is not None]
        label = "L=%g, k=%s" % (c["L"], "none" if c["k"] is None else "%g" % c["k"])
        series.append((c["L"], label, sorted(pts)))
    W, H, L, R, T, B = 600, 400, 64, 150, 40, 56
    allx = [x for _, _, p in series for x, _ in p]
    ally = [y for _, _, p in series for _, y in p]
    x0, x1 = 0, max(allx)
    y0, y1 = min(0.4, min(ally) - 0.05), max(1.0, max(ally) + 0.05)
    px = lambda v: L + (v - x0) / (x1 - x0) * (W - L - R)
    py = lambda v: T + (1 - (v - y0) / (y1 - y0)) * (H - T - B)
    f = 'font-family="sans-serif"'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Optimised-to-minimum-jerk move-time ratio against joint-speed cap for nine arm configurations">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{(L+W-R)/2}" y="22" text-anchor="middle" {f} font-size="14">Time-optimal vs minimum-jerk move time</text>']
    for k in range(int(y0 * 10) + 1, int(y1 * 10) + 1):
        v = k / 10
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" {f} font-size="11">{v:.1f}</text>')
    for v in sorted(set(allx)):
        o.append(f'<text x="{px(v):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{v:g}</text>')
    lens = sorted({s[0] for s in series})
    for i, (Lg, label, pts) in enumerate(series):
        c = COLS[lens.index(Lg)]
        d = " ".join(f"{px(x):.1f},{py(y):.1f}" for x, y in pts)
        dash = "" if label.endswith("none") else (' stroke-dasharray="6 3"' if label.endswith("2") else ' stroke-dasharray="2 3"')
        o.append(f'<polyline points="{d}" fill="none" stroke="{c}" stroke-width="2"{dash}/>')
        o.append(f'<line x1="{W-R+10}" x2="{W-R+32}" y1="{T+14+i*18}" y2="{T+14+i*18}" stroke="{c}" stroke-width="2"{dash}/>'
                 f'<text x="{W-R+38}" y="{T+18+i*18}" {f} font-size="11">{label}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-10}" text-anchor="middle" {f} font-size="12">joint-speed cap w_max</text>')
    o.append(f'<text transform="translate(16 {(T+H-B)/2}) rotate(-90)" text-anchor="middle" {f} font-size="12">T_opt / T_minjerk</text></svg>')
    (HERE / "speed_gain.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
