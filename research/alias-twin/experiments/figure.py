"""Write experiments/rmse_vs_speed.svg from experiments/results.txt (section 2), no plotting dependency.

    python experiments/figure.py

The numbers are parsed from the committed run output, never retyped: re-run run.py first if the
experiment changes.
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def parse_section2(text):
    """Return rows (v, twin_sim, real_naive, real_unfold) from section 2 of results.txt."""
    block = text.split("2. Twin vs real RMSE", 1)[1].split("\n3.", 1)[0]
    rows = []
    for line in block.splitlines():
        m = re.match(r"\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+\d+/\d+\s*$", line)
        if m:
            v, _pred, twin, naive, unfold = map(float, m.groups())
            rows.append((v, twin, naive, unfold))
    return rows


def svg(rows, vu=10.0):
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 52
    xs = [r[0] for r in rows]
    lo, hi = math.log10(0.01), math.log10(100)
    xmax = max(xs)

    def px(v):
        return L + (v / xmax) * (W - L - R)

    def py(y):
        return T + (hi - math.log10(y)) / (hi - lo) * (H - T - B)

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" '
           f'aria-label="RMSE of the speed estimate versus true speed: the naive estimator on aliased data diverges above the unambiguous speed, the twin and unfolding estimators stay near 0.02 m/s">',
           f'<rect width="{W}" height="{H}" fill="#fff"/>',
           f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Speed-estimate RMSE vs true speed (stylised simulation)</text>']
    for e in range(-2, 3):
        y = py(10 ** e)
        out.append(f'<line x1="{L}" x2="{W-R}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/>'
                   f'<text x="{L-6}" y="{y+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{10**e:g}</text>')
    for v in range(0, int(xmax) + 1, 10):
        out.append(f'<text x="{px(v):.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{v}</text>')
    out.append(f'<line x1="{px(vu):.1f}" x2="{px(vu):.1f}" y1="{T}" y2="{H-B}" stroke="#888" stroke-dasharray="4 3"/>'
               f'<text x="{px(vu)+4:.1f}" y="{T+12}" font-family="sans-serif" font-size="11" fill="#555">unambiguous speed v_u</text>')
    out.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle" font-family="sans-serif" font-size="12">true speed v (m/s)</text>')
    out.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">RMSE (m/s, log scale)</text>')
    series = [("real, naive estimator", 2, "#c0392b"), ("real, unfolded (grid search)", 3, "#1f6fb2"), ("twin simulation", 1, "#2e8b57")]
    for i, (name, k, col) in enumerate(series):
        pts = " ".join(f"{px(r[0]):.1f},{py(r[k]):.1f}" for r in rows)
        out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" points="{pts}"' + (' stroke-dasharray="6 3"' if k == 1 else "") + '/>')
        ly = T + 34 + 16 * i
        out.append(f'<line x1="{W-250}" x2="{W-226}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2"/>'
                   f'<text x="{W-220}" y="{ly+4}" font-family="sans-serif" font-size="11">{name}</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


def main():
    rows = parse_section2((HERE / "results.txt").read_text())
    if len(rows) < 10:
        raise SystemExit("could not parse section 2 of results.txt")
    (HERE / "rmse_vs_speed.svg").write_text(svg(rows))
    print("wrote rmse_vs_speed.svg from %d rows" % len(rows))


if __name__ == "__main__":
    main()
