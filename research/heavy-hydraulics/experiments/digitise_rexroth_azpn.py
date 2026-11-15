"""Milestone 6y: read the AZPN gear-pump characteristic curves out of Bosch Rexroth's data sheet RE 10091 and write
data/rexroth_azpn_curves.csv, in the schema of data/rexroth_azpg_curves.csv (6w), so measured.gear_pump_point
reads it.

Source: Bosch Rexroth AG, "High-Performance external gear pump AZPN", data sheet RE 10091/2024-11-18, page 9
(technical data) and pages 14 and 15 ("Flow characteristic curves" and "Power diagrams"). "Characteristic curves
measured at nu = 32 mm2/s and t = 50 C." Page 14 has one flow chart, flow qV (L/min) against speed for the six sizes
20 to 36, each drawn twice: solid at p = 20 bar and dashed at p2 ("maximal intermittierend"). Then one power diagram
per size (page 14: sizes 20 and 22; page 15: 25, 28, 32 and 36): drive power P (kW, solid, left axis) against speed
at four or five pressure differences, labelled 50 bar up to the series 1x p2 of page 9 (250, 250, 250, 230, 200 and
180 bar), and drive torque (dashed, right axis; not read here). The flow chart's dashed lines are therefore taken at
the same series 1x p2. The digitised numbers are facts read from a manufacturer's published curves, credited here
and in the README. Copy fetched 2026-11-15 from the distributor mirror in URL (sha256 in SHA256).

The method is 6w's digitiser unchanged (digitise_rexroth_azpg.read): every curve is a stroke of width 1.2, axes are
fixed by the grey 1000 and 2000 r/min grid lines and a least-squares value line through the frame edges and the
horizontal grid lines, residuals printed. Four settings differ for this sheet and are set below: the speed grid has a line every 500 r/min, so
the speed axis is a least-squares line through all five (axes below); the strokes are
dark grey rgb(13.7%, 12.2%, 12.5%) rather than black, the grid lines are rgb(85.0%...) grey, and the flow frame
(179 pt wide) shares page 14 with two power frames (154 pt), so power frames are those under 170 pt; the flow lines are drawn as polylines that bend below about 1000
r/min (up to 1.2 pt off a straight line), so the polyline itself is sampled rather than a fitted line, and speed
maps to page x through the grid-fitted speed axis rather than the frame edges (which miss 0 and 3000 r/min by up
to about 9 r/min).

Usage: python3 digitise_rexroth_azpn.py [RE10091.pdf]   (default: fetch into ~/.cache/heavy-hydraulics-rexroth)
Needs pdftocairo and pdftotext (poppler-utils) and the standard library.
"""
import csv
import hashlib
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import digitise_rexroth_azpg as rx  # noqa: E402

URL = "https://www.jhf.com/Portals/0/ProductModelDocuments/" + urllib.parse.quote("re10091_2024-11-18 AZPN.pdf")
SHA256 = "edaea63d2c87fa87151e7d5dc1907048f1a96e7b749c2fe1fe2ee83603a6cca4"
OUT = os.path.join(HERE, "data", "rexroth_azpn_curves.csv")

SIZES = (20, 22, 25, 28, 32, 36)                               # nominal size
DISPLACEMENT = {20: 20.0, 22: 22.5, 25: 25.0, 28: 28.0, 32: 32.0, 36: 36.0}   # cm3/r, page 9
P2 = {20: 250, 22: 250, 25: 250, 28: 230, 32: 200, 36: 180}    # bar, page 9, series 1x (= the power-curve labels)
PRESS = {20: (250, 200, 150, 100, 50), 22: (250, 200, 150, 100, 50), 25: (250, 200, 150, 100, 50),
         28: (230, 200, 150, 100, 50), 32: (200, 150, 100, 50), 36: (180, 150, 100, 50)}   # labels, top to bottom


def axes(ws, svg, fr, what):
    """6w's axes (digitise_rexroth_azpg.axes) with one change: this sheet draws a vertical grid line every 500
    r/min (five per chart, 500 to 2500) instead of only at 1000 and 2000, so the speed axis is a least-squares line
    through all five; its largest residual is folded into the frame-edge miss that is printed. The power diagrams
    also draw a horizontal grid line every half label step, so the value grid spacing is chosen between the label
    step and half of it."""
    fx0, fx1, fyb, fyt = fr
    left = sorted(w[6] for w in ws if fx0 - 14 <= w[3] <= fx0 - 0.5 and fyt - 8 <= w[1] <= fyb + 8)
    if len(left) < 3 or left[0] != 0:
        raise SystemExit(f"{what}: y labels {left}")
    top, step = left[-1], left[1] - left[0]
    if any(abs(b - a - step) > 1e-9 for a, b in zip(left, left[1:])):
        raise SystemExit(f"{what}: uneven y labels {left}")
    vx, hy = rx.grid(svg, fr)
    vx = sorted(vx)
    if len(vx) != 5:
        raise SystemExit(f"{what}: {len(vx)} vertical grid lines, expected five (500 to 2500 r/min)")
    ns = [500.0 * (i + 1) for i in range(5)]
    mn_, mx_ = sum(ns) / 5, sum(vx) / 5
    dx = sum((n - mn_) * (x - mx_) for n, x in zip(ns, vx)) / sum((n - mn_) ** 2 for n in ns)
    x0 = mx_ - dx * mn_                                 # page x of 0 r/min
    to_n = lambda x: (x - x0) / dx  # noqa: E731
    miss_grid = max(abs(to_n(x) - n) for n, x in zip(ns, vx))
    miss_n = max(abs(to_n(fx0)), abs(to_n(fx1) - 3000), miss_grid)
    est = lambda y: top * (fyb - y) / (fyb - fyt)  # noqa: E731
    # the power diagrams draw a grid line every half label step (5 kW against labels every 10 kW): take the
    # spacing, step or step / 2, that puts every grid line nearest a multiple of itself
    gs = min((step, step / 2.0), key=lambda g: max([abs(est(y) - g * round(est(y) / g)) for y in hy] or [0.0]))
    pts = [(fyb, 0.0), (fyt, float(top))] + [(y, gs * round(est(y) / gs)) for y in hy]
    n = len(pts)
    my, mv = sum(y for y, _ in pts) / n, sum(v for _, v in pts) / n
    b = sum((y - my) * (v - mv) for y, v in pts) / sum((y - my) ** 2 for y, _ in pts)
    a = mv - b * my
    to_v = lambda y: a + b * y  # noqa: E731
    miss_v = max(abs(to_v(y) - v) for y, v in pts)
    return to_n, to_v, top, step, len(vx), len(hy), miss_n, miss_v


def configure():
    """Point 6w's digitiser at this sheet."""
    rx.axes = axes
    rx.FLOW_POLYLINE = True
    rx.PX_FROM_GRID = True
    rx.BLACK = "rgb(13.729858%, 12.159729%, 12.548828%)"
    rx.GREY = "rgb(8"                                       # 84.99% and 85.08% greys
    rx.PERF_MAX_WIDTH = 170.0
    rx.NAME = "AZPN"
    rx.SIZES = SIZES
    rx.DISPLACEMENT = DISPLACEMENT
    rx.P2 = P2
    rx.PRESS = PRESS
    rx.FLOW_PAGE = 14
    rx.POWER_PAGES = {14: (20, 22), 15: (25, 28, 32, 36)}


def main(pdf=None):
    if pdf is None:
        cache = os.path.expanduser("~/.cache/heavy-hydraulics-rexroth")
        os.makedirs(cache, exist_ok=True)
        pdf = os.path.join(cache, "rexroth_azpn_RE10091_2024-11-18.pdf")
        if not os.path.exists(pdf):
            req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r, open(pdf, "wb") as fh:
                fh.write(r.read())
    with open(pdf, "rb") as fh:
        h = hashlib.sha256(fh.read()).hexdigest()
    print(f"source sha256 {h} ({'matches' if h == SHA256 else 'DIFFERS from'} the copy read for 6y)")
    configure()
    rows = rx.read(pdf)
    with open(OUT, "w", newline="") as fh:
        fh.write("# Bosch Rexroth AZPN external gear pumps, data sheet RE 10091/2024-11-18, pp. 9, 14 and 15, read "
                 "from the PDF's vector paths by digitise_rexroth_azpn.py.\n# 32 mm2/s at 50 C. kind: flow (L/min, at "
                 "20 bar and at the size's series 1x maximum intermittent pressure p2), flow_ends (the drawn line's end "
                 "points), power (kW drive power). size = nominal size (cm3/r).\n")
        w = csv.writer(fh)
        w.writerow(["size", "kind", "pressure_bar", "speed_rpm", "value"])
        w.writerows(rows)
    n = {}
    for r in rows:
        n[(r[0], r[1])] = n.get((r[0], r[1]), 0) + 1
    print(f"wrote {OUT}: {len(rows)} rows")
    for size in SIZES:
        print(f"  AZPN {size}: " + ", ".join(f"{kd} {n.get((size, kd), 0)}" for kd in ("flow", "power")))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
