"""Milestone 3j: digitise the 'Fluid flow at different spool travel + 10 bar / + 20 bar margin - uncompensated
PVB' figures (P -> A) of the Danfoss PVG 32 manual (BC152886483664en-001601, July 2024, pp. 95 and 96) and
write the full-travel (7 mm) flow band of each spool to data/pvg32_flow_full_travel.csv.

Usage: pdftoppm -f 95 -l 96 -r 300 pvg.pdf hi   (writes hi-095.ppm, hi-096.ppm)
       python3 digitise_pvg_flow.py hi-095.ppm hi-096.ppm
Calibration (300 dpi pixels, read from the figures' grid lines): p. 95: 7 mm travel at x 970, Q = 0 at
y 1666, 3.455 px per L/min; p. 96: x 758, y 1367, 3.865 px per L/min (grid lines 20 L/min apart, 200 at the top).
A spool's curve is a shaded band (first to eighth section after the inlet); pixels are classified by hue
and the band is the lowest and highest such pixel in columns 8 to 14 px right of the left edge.
Read error about +-2 L/min (line width 3 px = 1 L/min, grid calibration +-1).
"""
import colorsys
import sys
import numpy as np
from PIL import Image

PAGES = {10: (970, 1666, 3.455), 20: (758, 1367, 3.865)}   # margin bar -> (x_left, y_zero, px per L/min)
HUE = {'AA': 55, 'A': 358, 'B': 105, 'C': 215, 'D': 308, 'E': 190}
RATED = {'AA': 5, 'A': 10, 'B': 25, 'C': 40, 'D': 65, 'E': 100}


def band(im, xl, y0, s, hue):
    lo = hi = None
    for dx in range(8, 15):
        for y in range(y0 - int(190 * s), y0 + 1):
            r, g, b = (v / 255 for v in im[y, xl + dx])
            h, sat, v = colorsys.rgb_to_hsv(r, g, b)
            d = min(abs(h * 360 - hue), 360 - abs(h * 360 - hue))
            if sat > 0.35 and v > 0.5 and d < (20 if hue == 308 else 14):
                q = (y0 - y) / s
                lo = q if lo is None else min(lo, q)
                hi = q if hi is None else max(hi, q)
    return lo, hi


if __name__ == '__main__':
    imgs = dict(zip((10, 20), (np.array(Image.open(p).convert('RGB')) for p in sys.argv[1:3])))
    print('spool,rated_lpm,q10_low,q10_high,q20_low,q20_high')
    for k in HUE:
        row = []
        for m in (10, 20):
            row += [f'{v:.1f}' for v in band(imgs[m], *PAGES[m], HUE[k])]
        print(f'{k},{RATED[k]},' + ','.join(row))
