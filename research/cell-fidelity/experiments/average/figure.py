"""Figure for milestone 3 part 2a: predicted against observed mean DFN@100 calls per screen cell (pools of 64).

    python experiments/average/figure.py    # summary.json -> average.svg (stdlib only)

Hollow markers: model G with the whole-design-space sigma (H15's primary). Filled: the same model with sigma from the
top of the space (sigma_q, an extra). Log-log axes; the grey band is within a factor of 2.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
COL = {"SPM": "#2a6fb0", "SPMe": "#c0392b", "DFN": "#2e8b57"}


def main():
    S = json.loads((HERE / "summary.json").read_text())
    C = S["cells"]
    W, H, l, r, t, b = 800, 440, 70, 260, 50, 55
    lo, hi = 0.8, 20.0
    L = lambda v: (math.log(v) - math.log(lo)) / (math.log(hi) - math.log(lo))
    X = lambda v: l + (W - l - r) * L(v)
    Y = lambda v: H - b - (H - t - b) * L(v)
    h15, gq = S["h15"], S["h15"]["extras"]["R_Gq"]
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{l}" y="20" font-size="14" fill="#222">Noise model of the screen: whole-space sigma misses (Spearman {h15["rho"]:.2f}),</text>',
         f'<text x="{l}" y="36" font-size="14" fill="#222">sigma from the top of the space ranks the screens (Spearman {gq["rho"]:.2f})</text>']
    band = [(lo, lo / 2), (hi, hi / 2), (hi, min(hi, 2 * hi)), (hi / 2, hi), (lo, 2 * lo)]
    pts = " ".join(f"{X(min(max(x, lo), hi)):.1f},{Y(min(max(y, lo), hi)):.1f}" for x, y in band)
    o.append(f'<polygon points="{pts}" fill="#eee"/>')
    o.append(f'<line x1="{X(lo):.1f}" y1="{Y(lo):.1f}" x2="{X(hi):.1f}" y2="{Y(hi):.1f}" stroke="#999" stroke-dasharray="4 3"/>')
    o += [f'<line x1="{l}" y1="{H - b}" x2="{W - r}" y2="{H - b}" stroke="#444"/>',
          f'<line x1="{l}" y1="{t}" x2="{l}" y2="{H - b}" stroke="#444"/>']
    for v in (1, 2, 5, 10, 20):
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 16}" text-anchor="middle" fill="#444">{v}</text>')
        o.append(f'<text x="{l - 8}" y="{Y(v) + 4:.1f}" text-anchor="end" fill="#444">{v}</text>')
    o.append(f'<text x="{(l + W - r) / 2}" y="{H - 14}" text-anchor="middle" fill="#222">'
             'observed mean DFN@100 calls to within 1% (30 pools of 64)</text>')
    o.append(f'<text transform="translate(18 {(t + H - b) / 2}) rotate(-90)" text-anchor="middle" fill="#222">'
             'predicted E[R], Gaussian residual model</text>')
    for k, v in C.items():
        m = k.split("@")[0]
        x = X(max(v["R_obs_mean"], lo))
        yg, yq = Y(min(max(v["R_G"], lo), hi)), Y(min(max(v["R_Gq"], lo), hi))
        o.append(f'<line x1="{x:.1f}" y1="{yg:.1f}" x2="{x:.1f}" y2="{yq:.1f}" stroke="{COL[m]}" stroke-opacity="0.4"/>')
        o.append(f'<circle cx="{x:.1f}" cy="{yg:.1f}" r="5" fill="#fff" stroke="{COL[m]}" stroke-width="1.5"/>')
        o.append(f'<circle cx="{x:.1f}" cy="{yq:.1f}" r="5" fill="{COL[m]}"/>')
    ly = t + 10
    for k, v in sorted(C.items(), key=lambda kv: -kv[1]["R_obs_mean"]):
        m = k.split("@")[0]
        o.append(f'<text x="{W - r + 12}" y="{ly}" fill="{COL[m]}">{k}: observed {v["R_obs_mean"]:.1f}, '
                 f'G {v["R_G"]:.1f}, G_q {v["R_Gq"]:.1f}</text>')
        ly += 16
    o.append(f'<circle cx="{W - r + 16}" cy="{ly + 10}" r="5" fill="#fff" stroke="#444"/>'
             f'<text x="{W - r + 26}" y="{ly + 14}" fill="#444">G (whole space)</text>')
    o.append(f'<circle cx="{W - r + 16}" cy="{ly + 28}" r="5" fill="#444"/>'
             f'<text x="{W - r + 26}" y="{ly + 32}" fill="#444">G_q (top of space)</text>')
    o.append("</svg>")
    (HERE / "average.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
