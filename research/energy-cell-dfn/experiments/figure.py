"""Write experiments/scatter.svg: cycle-100 Wh/kg under SPMe against the full DFN model, from section C of results.txt.

    python experiments/figure.py
Numbers are parsed from the committed results.txt, never retyped. Stdlib only."""
from pathlib import Path

HERE = Path(__file__).resolve().parent


def points():
    pts, on = [], False
    for ln in (HERE / "results.txt").read_text().splitlines():
        if ln.startswith("C."):
            on = True
            continue
        t = ln.split()
        if on and len(t) == 7:
            try:
                pts.append((t[0], float(t[5]), float(t[6])))
            except ValueError:
                pass
    return pts


def main():
    pts = [p for p in points() if p[1] > 0 and p[2] > 0]
    lo, hi = 60.0, 160.0
    W = H = 460
    m = 60
    sx = lambda v: m + (v - lo) / (hi - lo) * (W - 1.5 * m)
    sy = lambda v: H - m - (v - lo) / (hi - lo) * (H - 1.5 * m)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d" font-family="sans-serif" font-size="12">',
         '<title id="t">SPMe against DFN energy density at cycle 100</title>',
         '<desc id="d">Scatter of Wh per kg at cycle 100 for each design under the single-particle model with electrolyte (x) and the full porous-electrode model (y), with the y = x line.</desc>',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<line x1="{sx(lo)}" y1="{sy(lo)}" x2="{sx(hi)}" y2="{sy(hi)}" stroke="#999" stroke-dasharray="4"/>']
    for v in range(60, 161, 20):
        o.append(f'<text x="{sx(v)}" y="{H-m+18}" text-anchor="middle">{v}</text><text x="{m-8}" y="{sy(v)+4}" text-anchor="end">{v}</text>')
    for _, a, b in pts:
        o.append(f'<circle cx="{sx(a):.1f}" cy="{sy(b):.1f}" r="4" fill="#1f6fb2" fill-opacity=".7"/>')
    o.append(f'<text x="{(W-m/2)/2+m/4}" y="{H-12}" text-anchor="middle">SPMe, Wh/kg at cycle 100</text>')
    o.append(f'<text transform="translate(16 {H/2}) rotate(-90)" text-anchor="middle">DFN, Wh/kg at cycle 100</text>')
    o.append(f'<text x="{m}" y="22" font-weight="bold">Same {len(pts)} designs, two electrochemical models (modelled, stack level)</text></svg>')
    (HERE / "scatter.svg").write_text("\n".join(o))


if __name__ == "__main__":
    main()
