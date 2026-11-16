"""Milestone 6z: read the AZPU gear-pump characteristic curves out of Bosch Rexroth's data sheet RE 10098 and write
data/rexroth_azpu_curves.csv, in the schema of data/rexroth_azpg_curves.csv (6w), so measured.gear_pump_point
reads it.

Source: Bosch Rexroth AG, "External gear pump AZPU, SILENCE", data sheet RE 10 098/02.12, page 14 (technical data:
sizes 22.5 to 63 cm3/r; maximum intermittent pressure p2 280 bar up to size 45, then 250, 225 and 200 bar) and pages
9 to 11 ("Performance charts", "nu = 35 mm2/s, theta = 50 C"). Page 9 has one flow chart, Q (L/min) against speed
for the ten sizes, each drawn twice: solid at p = 20 bar and dashed at p2. Then one chart per size (page 9: 22.5 and
25; page 10: 28, 32, 36 and 40; page 11: 45, 50, 56 and 63): drive power P (kW, solid, left axis) against speed at
four to six pressure differences, 50 bar up to p2, and torque (dashed, right axis; not read here). The digitised
numbers are facts read from a manufacturer's published curves, credited here and in the README. Copy fetched
2026-11-16 from the distributor mirror in URL (sha256 in SHA256).

The method is 6w's digitiser (digitise_rexroth_azpg.read) with 6y's two switches (flow lines sampled as polylines;
speed mapped to page x through the grid-fitted axis), and with this sheet's drawing conventions, all checked on the
SVG before any number was computed:
  * curves and frames are dark grey rgb(13.7%, 12.2%, 12.5%) (as in 6y's AZPN), not black;
  * the grid is drawn as white lines on a grey ground (one vertical line at 1000 and one at 2000 r/min, horizontal
    lines at every value label), so the grid colour is white;
  * the charts are placed at slightly different scales, so the curve strokes are 1.176 to 1.2 wide (1.188 on page
    9's power charts): every stroke 1.165 to 1.215 wide is a curve;
  * where a size label crosses a dashed flow line, the dashed line is continued in light grey rgb(87%...) under the
    label: those pieces are kept and joined to their line by collinearity, as 6w joins broken dashed pieces;
  * the flow chart's legend (two short horizontal sample lines inside the frame) is dropped: strokes shorter than
    25 pt and flatter than 0.1 pt are not curves.
The power charts keep 6w's rule that a power curve rises with speed by at least 8% of the frame height, which also
drops the short light-grey solid pieces drawn under labels.

Usage: python3 digitise_rexroth_azpu.py [RE10098.pdf]   (default: fetch into ~/.cache/heavy-hydraulics-rexroth)
Needs pdftocairo and pdftotext (poppler-utils) and the standard library.
"""
import csv
import hashlib
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import digitise_rexroth_azpg as rx  # noqa: E402
from digitise_casappa_kappa30 import svg_paths  # noqa: E402

URL = ("https://www.pneu-hyd.co.th/images/Products/rexroth-thailand/industrial-hydraulic/pumps/"
       "external-gear-pump-standard/AZPU_re10098_2012-02.pdf")
SHA256 = "f8da1a74926b3be258906f60829af3b6345e99e761fd9311dee6e3be4f5da878"
OUT = os.path.join(HERE, "data", "rexroth_azpu_curves.csv")
DARK = "rgb(13.729858%, 12.159729%, 12.548828%)"
LIGHT = "rgb(87.059021%, 86.824036%, 86.882019%)"

SIZES = (22, 25, 28, 32, 36, 40, 45, 50, 56, 63)               # catalogue size
DISPLACEMENT = {22: 22.5, 25: 25.0, 28: 28.0, 32: 32.0, 36: 36.0, 40: 40.0, 45: 45.0, 50: 50.0, 56: 56.0,
                63: 63.0}                                      # cm3/r, page 14
P2 = {22: 280, 25: 280, 28: 280, 32: 280, 36: 280, 40: 280, 45: 280, 50: 250, 56: 225, 63: 200}   # bar, page 14
P6 = (280, 250, 200, 150, 100, 50)
PRESS = {s: P6 for s in (22, 25, 28, 32, 36, 40, 45)}           # labels on the power curves, top to bottom
PRESS.update({50: (250, 200, 150, 100, 50), 56: (225, 200, 150, 100, 50), 63: (200, 150, 100, 50)})


def strokes(svg):
    """(stroke width, dash or None, points) for every curve or frame stroke: dark grey strokes, plus light-grey
    curve-width pieces (dashed lines continued under labels). Curve widths 1.165 to 1.215 are reported as 1.2,
    which is what 6w's reader selects curves by."""
    body = svg[svg.find("</defs>"):]
    out = []
    for attrs in re.findall(r"<path ([^>]*)/>", body):
        st = re.search(r'stroke="([^"]*)"', attrs)
        if not st or st.group(1) not in (DARK, LIGHT):
            continue
        da = re.search(r'stroke-dasharray="([^"]*)"', attrs)
        for sw, pts in svg_paths("</defs><path " + attrs + "/>"):
            curve = sw is not None and abs(sw - 1.19) < 0.025
            if st.group(1) == LIGHT and not curve:
                continue
            if curve:
                sw = 1.2
            xs, ys = [x for x, _ in pts], [y for _, y in pts]
            if max(xs) - min(xs) < 25 and max(ys) - min(ys) < 0.1:      # legend sample lines
                continue
            out.append((sw, da.group(1) if da else None, pts))
    return out


def configure():
    """Point 6w's digitiser at this sheet."""
    rx.strokes = strokes
    rx.BLACK = DARK
    rx.GREY = "rgb(100%"                                    # white grid lines on a grey ground
    rx.FLOW_POLYLINE = True
    rx.PX_FROM_GRID = True
    rx.NAME = "AZPU"
    rx.SIZES = SIZES
    rx.DISPLACEMENT = DISPLACEMENT
    rx.P2 = P2
    rx.PRESS = PRESS
    rx.FLOW_PAGE = 9
    rx.POWER_PAGES = {9: (22, 25), 10: (28, 32, 36, 40), 11: (45, 50, 56, 63)}


def fetch():
    cache = os.path.expanduser("~/.cache/heavy-hydraulics-rexroth")
    os.makedirs(cache, exist_ok=True)
    pdf = os.path.join(cache, "rexroth_azpu_RE10098_2012-02.pdf")
    if not os.path.exists(pdf):
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(pdf, "wb") as fh:
            fh.write(r.read())
    return pdf


def main(pdf=None):
    pdf = pdf or fetch()
    with open(pdf, "rb") as fh:
        h = hashlib.sha256(fh.read()).hexdigest()
    print(f"source sha256 {h} ({'matches' if h == SHA256 else 'DIFFERS from'} the copy read for 6z)")
    configure()
    rows = rx.read(pdf)
    with open(OUT, "w", newline="") as fh:
        fh.write("# Bosch Rexroth AZPU external gear pumps (SILENCE), data sheet RE 10 098/02.12, pp. 9-11 and 14, read "
                 "from the PDF's vector paths by digitise_rexroth_azpu.py.\n# 35 mm2/s at 50 C. kind: flow (L/min, at "
                 "20 bar and at the size's maximum intermittent pressure p2), flow_ends (the drawn line's end points), "
                 "power (kW drive power). size = catalogue size (cm3/r nominal).\n")
        w = csv.writer(fh)
        w.writerow(["size", "kind", "pressure_bar", "speed_rpm", "value"])
        w.writerows(rows)
    n = {}
    for r in rows:
        n[(r[0], r[1])] = n.get((r[0], r[1]), 0) + 1
    print(f"wrote {OUT}: {len(rows)} rows")
    for size in SIZES:
        print(f"  AZPU {size}: " + ", ".join(f"{kd} {n.get((size, kd), 0)}" for kd in ("flow", "power")))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
