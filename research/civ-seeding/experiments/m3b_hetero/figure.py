"""Write misfit_by_moment.svg: the real villages' held-out squared error per moment (information
family) against the 5-95% band of the same quantity on 200 synthetic datasets from the fitted
information and threshold processes. Parsed from results.txt (never retyped). Stdlib only.

python3 experiments/m3b_hetero/figure.py
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
BANDS = (("I", "information process", "#2a6fdb", -6), ("T", "threshold process", "#d9822b", 6))


def rows(text):
    blk = text.split("## diagnostic: held-out squared error by moment")[1].split("\n## ")[0]
    out = []
    for line in blk.splitlines()[1:]:
        m = re.match(r"  (m\d) ([^:]+): real ([\d.]+); I ([\d.]+)-([\d.]+); T ([\d.]+)-([\d.]+); "
                     r"R ([\d.]+)-([\d.]+)", line)
        if m:
            g = m.groups()
            out.append({"id": g[0], "name": g[1], "real": float(g[2]),
                        "I": (float(g[3]), float(g[4])), "T": (float(g[5]), float(g[6]))})
    return out


def main():
    R = rows((HERE / "results.txt").read_text())
    left, right, top, rh = 210, 30, 56, 34
    W, H = 720, top + rh * len(R) + 70
    lo, hi = -4.0, 0.0                     # log10 axis, 1e-4 to 1
    x = lambda v: left + (math.log10(max(v, 1e-4)) - lo) / (hi - lo) * (W - left - right)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         'font-family="system-ui, sans-serif" font-size="12" role="img" aria-labelledby="t d">',
         '<title id="t">Where the real villages miss the model, moment by moment</title>',
         '<desc id="d">Held-out squared error of each of nine moments for the information model on '
         'the 43 real villages (black dots), against the 5 to 95 percent range on synthetic villages '
         'from the fitted information and threshold models (bars). The real error is above the '
         'information band for every moment, most of all for the second-neighbour moment m5.</desc>',
         f'<rect width="{W}" height="{H}" fill="#ffffff"/>',
         f'<text x="20" y="20" font-weight="600">Held-out squared error per moment, information '
         'family, 200 synthetic datasets per process (log scale)</text>']
    for e in range(-4, 1):
        xx = x(10 ** e)
        o.append(f'<line x1="{xx:.1f}" y1="{top - 10}" x2="{xx:.1f}" y2="{top + rh * len(R)}" stroke="#ddd"/>')
        o.append(f'<text x="{xx:.1f}" y="{top + rh * len(R) + 16}" text-anchor="middle" fill="#555">1e{e}</text>')
    for i, r in enumerate(R):
        y = top + i * rh + rh / 2
        o.append(f'<text x="{left - 10}" y="{y + 4:.1f}" text-anchor="end">{r["id"]} {r["name"]}</text>')
        for key, _nm, col, dy in BANDS:
            a, b = r[key]
            o.append(f'<line x1="{x(a):.1f}" y1="{y + dy:.1f}" x2="{x(b):.1f}" y2="{y + dy:.1f}" '
                     f'stroke="{col}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>')
        o.append(f'<circle cx="{x(r["real"]):.1f}" cy="{y:.1f}" r="5" fill="#111"/>')
    ly = H - 30
    o.append(f'<circle cx="{left - 150}" cy="{ly - 4}" r="5" fill="#111"/>'
             f'<text x="{left - 140}" y="{ly}">real villages</text>')
    for j, (_k, nm, col, _dy) in enumerate(BANDS):
        lx = left - 30 + j * 230
        o.append(f'<line x1="{lx}" y1="{ly - 4}" x2="{lx + 24}" y2="{ly - 4}" stroke="{col}" '
                 f'stroke-width="6" stroke-linecap="round"/><text x="{lx + 32}" y="{ly}">'
                 f'{nm} (5-95%)</text>')
    o.append("</svg>")
    (HERE / "misfit_by_moment.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
