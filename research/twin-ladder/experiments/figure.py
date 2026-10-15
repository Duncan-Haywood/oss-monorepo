"""Writes experiments/rho_star.svg: the pay threshold rho*(r) and the (r, q) settings of experiment E3.

Pure Python, no plotting library.  Every plotted value comes from twin_ladder.rho_star and the
(q, r) list quoted in experiments/run.py (E3); nothing is simulated here.
Run:  PYTHONPATH=src python3 experiments/figure.py
"""
import math, pathlib
from twin_ladder import rho_star

E3_SETTINGS = ((0.99, 0.5), (0.95, 0.5), (0.90, 0.5), (0.98, 0.25), (0.90, 0.25), (0.80, 0.1), (0.60, 0.1))
W, H, L, R, T, B = 640, 400, 64, 24, 40, 56
RMIN, RMAX, YMIN = 0.005, 1.0, 0.0


def _x(r):
    return L + (math.log10(r) - math.log10(RMIN)) / (math.log10(RMAX) - math.log10(RMIN)) * (W - L - R)


def _y(rho):
    return H - B - (rho - YMIN) / (1 - YMIN) * (H - T - B)


def build():
    curve = " ".join(f"{_x(r):.1f},{_y(rho_star(r)):.1f}" for r in (10 ** (math.log10(RMIN) + i * (math.log10(RMAX) - math.log10(RMIN)) / 200) for i in range(201)))
    top = f"{_x(RMIN):.1f},{_y(1):.1f} {_x(RMAX):.1f},{_y(1):.1f}"
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-label="Pay threshold rho star of r, with the experiment E3 settings marked">',
         '<rect width="100%" height="100%" fill="#fff"/>',
         f'<polygon points="{curve} {top}" fill="#2a9d8f" fill-opacity="0.15"/>',
         f'<polyline points="{curve}" fill="none" stroke="#1d6f66" stroke-width="2"/>']
    for rho in (0, 0.2, 0.4, 0.6, 0.8, 1.0):
        s.append(f'<line x1="{L}" x2="{W-R}" y1="{_y(rho):.1f}" y2="{_y(rho):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-8}" y="{_y(rho)+4:.1f}" font-size="12" text-anchor="end" fill="#333">{rho:.1f}</text>')
    for r in (0.01, 0.03, 0.1, 0.3, 1.0):
        s.append(f'<line x1="{_x(r):.1f}" x2="{_x(r):.1f}" y1="{T}" y2="{H-B}" stroke="#eee"/>'
                 f'<text x="{_x(r):.1f}" y="{H-B+18}" font-size="12" text-anchor="middle" fill="#333">{r:g}</text>')
    for q, r in E3_SETTINGS:
        pays = q > rho_star(r)
        s.append(f'<circle cx="{_x(r):.1f}" cy="{_y(q):.1f}" r="5" fill="{"#e76f51" if pays else "#fff"}" stroke="#e76f51" stroke-width="2"/>')
    s += [f'<text x="{(L+W-R)/2:.0f}" y="{H-14}" font-size="13" text-anchor="middle" fill="#111">cost ratio r = c(twin) / c(parent), log scale</text>',
          f'<text x="16" y="{(T+H-B)/2:.0f}" font-size="13" text-anchor="middle" fill="#111" transform="rotate(-90 16 {(T+H-B)/2:.0f})">step correlation q</text>',
          f'<text x="{L}" y="24" font-size="14" font-weight="bold" fill="#111">A cheaper twin pays above rho*(r) = 2&#8730;r/(1+r)</text>',
          f'<text x="{W-R-8}" y="{_y(0.08):.0f}" font-size="12" text-anchor="end" fill="#555">filled: E3 setting above the line (pays); hollow: below (does not)</text>',
          '</svg>']
    return "\n".join(s)


if __name__ == "__main__":
    out = pathlib.Path(__file__).with_name("rho_star.svg")
    out.write_text(build() + "\n")
    print("wrote", out)
