"""Digitise the 'Pressure drop at maximum spool travel position, A/B -> T' figure of the Danfoss
PVG 32 manual (BC152886483664en-001601, July 2024, p. 99) and write the drop at each spool's
rated flow to data/pvg32_dp_at_rated.csv.

Usage: pdftoppm -f 99 -l 99 -r 300 -x 700 -y 480 -W 1300 -H 800 pvg.pdf crop   (writes crop-099.ppm)
       python3 digitise_pvg_dp.py crop-099.ppm
Axis calibration (pixels in that crop): Q = 0 at x 150, Q = 220 L/min at x 1006.5; 0 bar at y 604.5,
60 bar at y 137.5 (read from the figure's grid lines). Curve pixels are picked by colour; the
value is the median drop of curve pixels within 2% of the flow (at 0.8, 1.0 and 1.2 x rated).
Read error is about +-1 bar (line width 4 px = 0.5 bar, calibration +-0.3 bar).
"""
import sys
import numpy as np
b = open(sys.argv[1], 'rb').read()
parts = b.split(b'\n', 3)
w, h = map(int, parts[1].split())
im = np.frombuffer(parts[3], np.uint8).reshape(h, w, 3).astype(int)
X0, X1, Y0, Y60 = 150.0, 1006.5, 604.5, 137.5
qx = lambda x: (x - X0) / (X1 - X0) * 220
py = lambda y: (Y0 - y) / (Y0 - Y60) * 60
COLS = {'A': (255, 0, 0), 'B': (50, 220, 20), 'C': (70, 100, 170), 'D': (255, 0, 255), 'E': (100, 255, 255)}
RATED = {'A': 10, 'B': 25, 'C': 40, 'D': 65, 'E': 100}
print('spool,rated_lpm,dp_0.8,dp_1.0,dp_1.2')
for k, c in COLS.items():
    m = np.abs(im - np.array(c)).sum(2) < (40 if k == 'C' else 90)
    m[:, :130] = False; m[640:, :] = False; m[:130, :] = False
    ys, xs = np.nonzero(m)
    Q, P = qx(xs), py(ys)
    r = RATED[k]
    v = []
    for f in (0.8, 1.0, 1.2):
        s = np.abs(Q - r * f) < max(0.8, 0.02 * r * f)
        v.append(f'{np.median(P[s]):.1f}')
    print(f'{k},{r},' + ','.join(v))
