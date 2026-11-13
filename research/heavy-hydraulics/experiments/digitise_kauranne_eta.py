"""Milestone 6g: digitise Figure 13 of Kauranne (2022), total efficiency of a swash-plate axial piston pump
against derived capacity at 1500 r/min, six pressures, inlet 25 C (84 cSt, left panel) and 60 C (21 cSt, right
panel), and write data/kauranne2022_fig13_total_efficiency.csv.

Source: H. Kauranne, "Effect of Operating Parameters on Efficiency of Swash-Plate Type Axial Piston Pump",
Energies 15(11):4030, 2022, doi:10.3390/en15114030, CC BY 4.0 (the digitised values are a derived work under
the same licence, credited here and in the README). The paper releases no data, so the figure is read.

Usage: pdfimages -f 15 -l 15 kauranne.pdf raw   (writes raw-000.ppm: Figure 13, 2964 x 1160 px)
       python3 digitise_kauranne_eta.py raw-000.ppm
Calibration (pixels of that image, read from the plot frames and checked on the 60% and 80% grid lines at
y 589 and 335): x 10 cm3/r at 178.5 (left) and 1815.5 (right), 50 cm3/r at 1285.5 and 2922.5;
y 100% at 81.5, 30% at 969.5. One unit of capacity is 27.7 px and one point of efficiency 12.7 px, so the
curves' 3 to 5 px line width is under 0.4 points; JPEG compression and overdrawn curves add a little more.
Per column the curve is the median row of the pixels of its colour; columns where the curve is hidden under
another (the 100 to 250 bar curves overlap) take the covering curve's row (see read_panel), and the shares
are printed. The legend box is masked.
Needs numpy only (the PPM is parsed directly).
"""
import sys

import numpy as np

X0 = {"25C": 178.5, "60C": 1815.5}
PX_X = (1285.5 - 178.5) / 40.0
Y100, Y30 = 81.5, 969.5
PX_Y = (Y30 - Y100) / 70.0
CAPS = (12.0, 15.0, 20.0, 23.0, 25.0, 30.0, 33.0, 35.0, 40.0, 45.0)


def colour_masks(im):
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    return {
        25: (r < 70) & (g > 95) & (g < 170) & (b < 70),
        50: (r > 200) & (g > 90) & (g < 175) & (b < 70),
        100: (r < 70) & (g < 70) & (b > 140),
        150: (r > 190) & (g < 80) & (b < 80),
        200: (r < 90) & (g > 190) & (b > 190),
        250: (r < 55) & (g < 55) & (b < 55),
    }


def ppm(path):
    raw = open(path, "rb").read()
    head, rest = raw.split(b"\n", 3)[:3], raw.split(b"\n", 3)[3]
    w, h = map(int, head[1].split())
    return np.frombuffer(rest, np.uint8)[: w * h * 3].reshape(h, w, 3).astype(int)


def column_rows(m, x, x0):
    col = np.where(m[int(Y100) + 4:int(Y30) - 4, x])[0] + int(Y100) + 4
    if x - x0 > 28.5 * PX_X:       # legend box (lower right of each panel)
        col = col[col < 598]
    return col


def read_panel(masks, x0):
    """Efficiency (fraction) against capacity for each pressure, one value per CAPS entry; plus fill share.

    A column where a curve has no pixels of its own is one where another curve is drawn over it. There the
    curve is placed on the covering curve: the other colour whose pixels lie nearest (within 12 px, about one
    efficiency point) to the curve's last visible row, carried along capacity. If no colour is that close,
    linear interpolation between the visible neighbours is used."""
    xs = np.arange(int(x0 + 2 * PX_X) - 1, int(x0 + 35 * PX_X) + 2)
    own = {p: [column_rows(m, x, x0) for x in xs] for p, m in masks.items()}
    out, filled, covered = {}, {}, {}
    for p in masks:
        ys = np.full(len(xs), np.nan)
        for i, col in enumerate(own[p]):
            if len(col):
                ys[i] = float(np.median(col))
        ok = ~np.isnan(ys)
        filled[p] = 1.0 - ok.mean()
        cov = 0
        last = None
        for i in range(len(xs)):
            if ok[i]:
                last = ys[i]
                continue
            ref = last if last is not None else ys[ok][0]
            best = None
            for q in masks:
                if q == p or not len(own[q][i]):
                    continue
                y = float(np.median(own[q][i]))
                if abs(y - ref) <= 12 and (best is None or abs(y - ref) < abs(best - ref)):
                    best = y
            if best is not None:
                ys[i] = best
                last = best
                cov += 1
        covered[p] = cov / len(xs)
        ok = ~np.isnan(ys)
        cap = 10.0 + (xs - x0) / PX_X
        ys = np.interp(cap, cap[ok], ys[ok])
        eff = (100.0 - (ys - Y100) / PX_Y) / 100.0
        out[p] = [float(np.interp(c, cap, eff)) for c in CAPS]
    return out, filled, covered


def main(path):
    im = ppm(path)
    masks = colour_masks(im)
    print("temperature_c,pressure_bar," + ",".join(f"cap_{c:g}" for c in CAPS))
    notes = []
    for t, x0 in X0.items():
        vals, filled, covered = read_panel(masks, x0)
        for p in sorted(vals):
            print(f"{t[:2]},{p}," + ",".join(f"{v:.4f}" for v in vals[p]))
            notes.append(f"# {t} {p} bar: {filled[p] * 100:.0f}% of columns hidden; {covered[p] * 100:.0f}% placed on "
                         f"the covering curve, the rest interpolated")
    print("\n".join(notes))


if __name__ == "__main__":
    main(sys.argv[1])
