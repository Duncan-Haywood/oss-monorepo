"""Milestone 6z figure: which vehicle goes further per day, by latitude and month of 2024, along 150 W and 30 W.

Each cell is log2 of the central 4 m deck-solar boat's sustained km/day (A) over the 2015 Wave Glider's best-state ERA5
plan (run_flip_map.py, unchanged rules). Orange: the boat goes further; blue: the Wave Glider; the boat's 0 km/day
cells (harvest below the 30 W payload) are the darkest blue; grey: no ERA5 waves (sea ice).
Run (from research/marine-hull): PYTHONPATH=src python3 experiments/figure_flip_map.py
  -> experiments/waveglider_vs_solar_flip_map.svg (stdlib)"""
import contextlib
import io
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_flip_map as f  # noqa: E402

OUT = os.path.join(HERE, "waveglider_vs_solar_flip_map.svg")
CW, CH, X0, Y0, GAP = 30, 22, 52, 58, 40
ORANGE, BLUE, GREY = (213, 94, 0), (0, 114, 178), (200, 200, 200)


def colour(r):
    if r is None:
        return "rgb(%d,%d,%d)" % GREY
    x = max(-2.0, min(2.0, math.log2(max(r["A"], 1e-9) / r["wg"]) if r["A"] > 0 else -2.0)) / 2.0
    base = ORANGE if x > 0 else BLUE
    t = abs(x)
    return "rgb(%d,%d,%d)" % tuple(round(255 + (c - 255) * (0.15 + 0.85 * t)) for c in base)


def main():
    with contextlib.redirect_stdout(io.StringIO()):
        f.load_sun()
        rows = f.evaluate(*f.vehicle())
    lats = sorted(f.LATS, reverse=True)
    pw = 12 * CW
    W = X0 + 2 * pw + GAP + 20
    H = Y0 + len(lats) * CH + 70
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
         'font-family="Helvetica, Arial, sans-serif" font-size="11">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{X0}" y="18" font-size="13" font-weight="bold">Deck-solar boat or Wave Glider: which goes further '
         'per day? (2024)</text>',
         f'<text x="{X0}" y="34" fill="#444">orange: 4 m solar boat, 30 W payload; blue: 2015 Wave Glider, best state; '
         'darker = bigger ratio (to 4x)</text>']
    for p, (mer, title) in enumerate((("P", "Pacific, 150 W"), ("A", "Atlantic, 30 W"))):
        x0 = X0 + p * (pw + GAP)
        s.append(f'<text x="{x0}" y="{Y0 - 6}" font-weight="bold">{title}</text>')
        for i, la in enumerate(lats):
            y = Y0 + i * CH
            if p == 0:
                s.append(f'<text x="{X0 - 6}" y="{y + 15}" text-anchor="end">'
                         f'{abs(la)}{"N" if la > 0 else ("S" if la < 0 else "")}</text>')
            for m in range(1, 13):
                r = rows.get((f.name(mer, la), m))
                lab = "" if r is None else ("B" if r["A"] > r["wg"] else "W")
                s.append(f'<rect x="{x0 + (m - 1) * CW}" y="{y}" width="{CW - 1}" height="{CH - 1}" fill="{colour(r)}"/>')
                if lab:
                    ink = "#fff" if r["A"] == 0 or abs(math.log2(r["A"] / r["wg"])) > 1.0 else "#111"
                    s.append(f'<text x="{x0 + (m - 1) * CW + CW / 2 - 0.5}" y="{y + 15}" text-anchor="middle" '
                             f'fill="{ink}" font-size="10">{lab}</text>')
        for m in range(12):
            s.append(f'<text x="{x0 + m * CW + CW / 2}" y="{Y0 + len(lats) * CH + 14}" text-anchor="middle">'
                     f'{f.MON[m]}</text>')
    yb = Y0 + len(lats) * CH + 36
    s.append(f'<text x="{X0}" y="{yb}" fill="#444">B = boat sustains more km/day; W = Wave Glider plans more. Sun: NASA '
             'POWER daily all-sky; waves: ERA5 (Copernicus, via Open-Meteo).</text>')
    s.append(f'<text x="{X0}" y="{yb + 16}" fill="#444">Calm-water boat, energy-neutral at the month\'s mean sun; '
             'grey = sea ice. research/marine-hull, milestone 6z.</text>')
    s.append("</svg>")
    open(OUT, "w").write("\n".join(s) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
