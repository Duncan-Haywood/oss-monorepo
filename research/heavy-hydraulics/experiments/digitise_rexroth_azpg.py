"""Milestone 6w: read the AZPG gear-pump characteristic curves out of Bosch Rexroth's data sheet RE 10093 and write
data/rexroth_azpg_curves.csv, in the schema of data/casappa_kp30_curves.csv (6k), so measured.gear_pump_point
reads it.

Source: Bosch Rexroth AG, "External gear pump High Performance AZPG, Series 2x", data sheet RE 10093/2019-09-27,
pages 8 (table of values) and 16 to 18 (diagrams/characteristic curves). "Characteristic curves measured at
nu = 32 mm2/s and t = 50 C." Page 16 has one flow chart, flow qV (L/min) against speed for the ten sizes 22 to 63,
each drawn twice: solid at p = 20 bar and dashed at p2, the size's maximum intermittent pressure (page 8 table).
Then one performance chart per size: drive power P (kW, solid, left axis) against speed at four to six pressure
differences (50 bar up to p2) and drive torque (dashed, right axis; not read here). The digitised numbers are facts
read from a manufacturer's published curves, credited here and in the README. Copy fetched 2026-11-15 from the
distributor mirror in URL (sha256 in SHA256; Rexroth's own site serves the same RE number through its store).

The charts are vector art, so they are read exactly, not by eye: `pdftocairo -svg` writes each page and
digitise_casappa_kappa30.svg_paths() turns every path into page coordinates. Every curve is a black stroke of width
1.2 (solid: flow at 20 bar and power; dash "5 3": flow at p2 and torque); every chart frame is a thin black
rectangle (width 0.538 to 0.55). The speed axis is fixed by the two grey vertical grid lines at 1000 and 2000
r/min, because some frames run a little wider than 0 to 3000 (up to 21 r/min at an edge, printed). The value
axis runs from 0 at the frame bottom to the top label at its top (the labels are real text, read with
`pdftotext -bbox` in the same page coordinates, and give the top value and step), refined by a least-squares line
through the frame edges and every grey horizontal grid line; its largest residual is printed (at most 0.22 L/min
and 0.12 kW). Fitting the label centres instead gave residuals up to 34 r/min: the labels are not centred on their
grid lines. A torque line drawn partly solid (size 40) is dropped because power rises with speed and torque
barely does. Within a chart, power curves are ranked by height and matched to the pressures printed on them
(PRESS, read from the page images); flow lines are ranked by slope and matched to the sizes. The dashed flow lines
are broken where the size labels cross them, so their pieces are joined by collinearity (each piece's least-squares
line must pass within 1 pt of the other piece's points).

Usage: python3 digitise_rexroth_azpg.py [RE10093.pdf]   (default: fetch into ~/.cache/heavy-hydraulics-rexroth)
Needs pdftocairo and pdftotext (poppler-utils) and the standard library.
"""
import csv
import hashlib
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from digitise_casappa_kappa30 import svg_paths, page_svg, interp_y  # noqa: E402

URL = "https://hydraulicsonline.com/wp-content/uploads/2019/03/Bosch-Rexroth-AZPG.pdf"
SHA256 = "a84807e15dc552307b3283d25a257b2c363f872ae1d5cdd9bdda47e6aecf2d3b"
OUT = os.path.join(HERE, "data", "rexroth_azpg_curves.csv")
BLACK = "rgb(0%, 0%, 0%)"
GREY = "rgb(86"                                               # grid-line stroke colour prefix
PERF_MAX_WIDTH = 180.0                                         # performance frames are narrower than this (pt)
NAME = "AZPG"                                                  # family name in the log lines
FLOW_POLYLINE = False      # 6y (AZPN): sample the drawn flow polyline itself instead of its least-squares line
PX_FROM_GRID = False       # 6y (AZPN): map speed to page x through the grid-fitted speed axis, not the frame edges

SIZES = (22, 25, 28, 32, 36, 40, 45, 50, 56, 63)               # catalogue size
DISPLACEMENT = {22: 22.5, 25: 25.0, 28: 28.0, 32: 32.0, 36: 36.0, 40: 40.0, 45: 45.0, 50: 50.0, 56: 56.0,
                63: 63.0}                                      # cm3/r, page 8
P2 = {22: 280, 25: 280, 28: 280, 32: 280, 36: 280, 40: 280, 45: 280, 50: 250, 56: 225, 63: 200}   # bar, page 8
FLOW_PAGE = 16
POWER_PAGES = {16: (22, 25), 17: (28, 32, 36, 40), 18: (45, 50, 56, 63)}   # charts in reading order
P6 = (280, 250, 200, 150, 100, 50)
PRESS = {s: P6 for s in (22, 25, 28, 32, 36, 40, 45)}           # labels on the power curves, top to bottom
PRESS.update({50: (250, 200, 150, 100, 50), 56: (225, 200, 150, 100, 50), 63: (200, 150, 100, 50)})


def strokes(svg):
    """(stroke width, dash or None, points) for every black stroked subpath, in page points."""
    body = svg[svg.find("</defs>"):]
    out = []
    for attrs in re.findall(r"<path ([^>]*)/>", body):
        st = re.search(r'stroke="([^"]*)"', attrs)
        if not st or st.group(1) != BLACK:
            continue
        da = re.search(r'stroke-dasharray="([^"]*)"', attrs)
        for sw, pts in svg_paths("</defs><path " + attrs + "/>"):
            out.append((sw, da.group(1) if da else None, pts))
    return out


def words(pdf, page, tmp):
    """Numeric words of a page as (x centre, y centre, xmin, xmax, ymin, ymax, value)."""
    path = os.path.join(tmp, f"w{page}.html")
    subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), "-bbox", pdf, path], check=True)
    out = []
    with open(path) as fh:
        for m in re.finditer(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<', fh.read()):
            x0, y0, x1, y1 = (float(v) for v in m.groups()[:4])
            if re.fullmatch(r"\d+", m.group(5)):
                out.append(((x0 + x1) / 2, (y0 + y1) / 2, x0, x1, y0, y1, float(m.group(5))))
    return out


def span(pts):
    xs, ys = [x for x, _ in pts], [y for _, y in pts]
    return min(xs), max(xs), min(ys), max(ys)


def frames_of(paths):
    """Chart frames (left, right, bottom, top): thin black rectangles at least 100 pt wide and 150 pt tall."""
    out = []
    for sw, da, pts in paths:
        if sw is not None and sw < 0.7 and da is None and len(pts) >= 4:
            x0, x1, y0, y1 = span(pts)
            if x1 - x0 > 100 and y1 - y0 > 150:
                out.append((x0, x1, y1, y0))
    return sorted(set(out), key=lambda f: (round(f[3] / 50.0), f[0]))


def grid(svg, fr):
    """Grey grid lines inside a frame: (x of vertical lines, y of horizontal lines)."""
    body = svg[svg.find("</defs>"):]
    vx, hy = [], []
    for attrs in re.findall(r"<path ([^>]*)/>", body):
        st = re.search(r'stroke="([^"]*)"', attrs)
        if not st or st.group(1) in (BLACK, "none") or not st.group(1).startswith(GREY):
            continue
        for _, pts in svg_paths("</defs><path " + attrs + "/>"):
            x0, x1, y0, y1 = span(pts)
            if not (fr[0] - 1 <= x0 and x1 <= fr[1] + 1 and fr[3] - 1 <= y0 and y1 <= fr[2] + 1):
                continue
            if x1 - x0 < 0.5 and y1 - y0 > 50:
                vx.append(x0)
            elif y1 - y0 < 0.5 and x1 - x0 > 50:
                hy.append(y0)
    return vx, hy


def axes(ws, svg, fr, what):
    """Axes of one frame: speed through the 1000 and 2000 r/min grid lines; value 0 at the bottom and the top label
    at the top (labels give the top value and step), refined by least squares through the frame edges and the
    horizontal grid lines. Returns the maps, the label top and step, grid counts, how far the frame edges sit from
    0 and 3000 r/min, and the value fit's largest residual."""
    fx0, fx1, fyb, fyt = fr
    left = sorted(w[6] for w in ws if fx0 - 14 <= w[3] <= fx0 - 0.5 and fyt - 8 <= w[1] <= fyb + 8)
    if len(left) < 3 or left[0] != 0:
        raise SystemExit(f"{what}: y labels {left}")
    top, step = left[-1], left[1] - left[0]
    if any(abs(b - a - step) > 1e-9 for a, b in zip(left, left[1:])):
        raise SystemExit(f"{what}: uneven y labels {left}")
    vx, hy = grid(svg, fr)
    vx = sorted(vx)
    if len(vx) == 2:                                   # the 1000 and 2000 r/min grid lines fix the speed axis
        x1k, dx = vx[0], (vx[1] - vx[0]) / 1000.0
        miss_n = max(abs((fx0 - x1k) / dx + 1000), abs((fx1 - x1k) / dx - 2000))   # frame edges vs 0 and 3000
    else:
        raise SystemExit(f"{what}: {len(vx)} vertical grid lines, expected the 1000 and 2000 r/min pair")
    to_n = lambda x: 1000.0 + (x - x1k) / dx  # noqa: E731
    est = lambda y: top * (fyb - y) / (fyb - fyt)  # noqa: E731
    pts = [(fyb, 0.0), (fyt, float(top))] + [(y, step * round(est(y) / step)) for y in hy]
    n = len(pts)                                       # value = a + b y through frame edges and grid lines
    my, mv = sum(y for y, _ in pts) / n, sum(v for _, v in pts) / n
    b = sum((y - my) * (v - mv) for y, v in pts) / sum((y - my) ** 2 for y, _ in pts)
    a = mv - b * my
    to_v = lambda y: a + b * y  # noqa: E731
    miss_v = max(abs(to_v(y) - v) for y, v in pts)
    return to_n, to_v, top, step, len(vx), len(hy), miss_n, miss_v


def inverse(to_n):
    """Page x of a speed, for a linear speed axis to_n."""
    a, b = to_n(0.0), to_n(100.0)
    return lambda n: (n - a) * 100.0 / (b - a)


def line(pts):
    """Least-squares line y = c + m x through the points of a straight stroke."""
    n = len(pts)
    mx, my = sum(x for x, _ in pts) / n, sum(y for _, y in pts) / n
    sxx = sum((x - mx) ** 2 for x, _ in pts)
    m = sum((x - mx) * (y - my) for x, y in pts) / sxx if sxx > 0 else 0.0
    return my - m * mx, m


def join_collinear(pieces, tol=1.0):
    """Join the pieces of broken straight lines: two pieces belong together when each one's line passes within
    tol of the other's points."""
    groups = []
    for p in sorted(pieces, key=lambda p: -len(p)):
        for g in groups:
            c, m = line(g)
            c2, m2 = line(p) if len(p) >= 2 and span(p)[1] - span(p)[0] > 2 else (c, m)
            if all(abs(c + m * x - y) < tol for x, y in p) and all(abs(c2 + m2 * x - y) < tol * 3 for x, y in g):
                g.extend(p)
                break
        else:
            groups.append(list(p))
    return [sorted(g) for g in groups]


def sample(curve, to_px, to_val, lo_n, hi_n):
    """Values of a curve at every 100 r/min inside its drawn span."""
    out = []
    for n in range(int(-(-lo_n // 100) * 100), int(hi_n) + 1, 100):
        y = interp_y(curve, to_px(n))
        if y is not None:
            out.append((n, to_val(y)))
    return out


def read(pdf, log=print):
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        # flow chart
        svg = page_svg(pdf, FLOW_PAGE, tmp)
        paths = strokes(svg)
        ws = words(pdf, FLOW_PAGE, tmp)
        fr = max(frames_of(paths), key=lambda f: f[1] - f[0])
        to_n, to_q, top, step, nv, nh, mn, mv = axes(ws, svg, fr, "flow chart")
        log(f"  flow chart: frame x {fr[0]:.1f}-{fr[1]:.1f}, y {fr[2]:.1f}-{fr[3]:.1f}; flow 0 to {top:.0f} L/min; "
            f"grid {nv} vertical (frame edges miss 0 and 3000 by {mn:.1f} r/min), {nh} horizontal (largest miss {mv:.3f} L/min)")
        ins = [(sw, da, p) for sw, da, p in paths if sw == 1.2 and
               all(fr[0] - 1 <= x <= fr[1] + 1 and fr[3] - 1 <= y <= fr[2] + 1 for x, y in p)]
        solid = [sorted(p) for sw, da, p in ins if da is None]
        dashed = join_collinear([sorted(p) for sw, da, p in ins if da is not None])
        if len(solid) != len(SIZES) or len(dashed) != len(SIZES):
            raise SystemExit(f"flow chart: {len(solid)} solid and {len(dashed)} dashed lines, expected {len(SIZES)}")
        to_px = inverse(to_n) if PX_FROM_GRID else (lambda n: fr[0] + n * (fr[1] - fr[0]) / 3000.0)  # noqa: E731
        for kind_p, lines in (("lo", solid), ("hi", dashed)):
            lines.sort(key=lambda c: line(c)[1], reverse=True)       # y falls with flow: steepest last
            for size, c in zip(SIZES, lines):
                pr = 20 if kind_p == "lo" else P2[size]
                cc, m = line(c)
                lo_n, hi_n = to_n(c[0][0]), to_n(c[-1][0])
                straight = max(abs(cc + m * x - y) for x, y in c)
                for n in range(int(-(-lo_n // 100) * 100), int(hi_n) + 1, 100):
                    y = interp_y(c, to_px(n)) if FLOW_POLYLINE else cc + m * to_px(n)
                    rows.append((size, "flow", pr, n, round(to_q(y), 3)))
                ends = (c[0][1], c[-1][1]) if FLOW_POLYLINE else (cc + m * c[0][0], cc + m * c[-1][0])
                rows.append((size, "flow_ends", pr, round(lo_n, 1), round(to_q(ends[0]), 3)))
                rows.append((size, "flow_ends", pr, round(hi_n, 1), round(to_q(ends[1]), 3)))
                if FLOW_POLYLINE:
                    log(f"  flow {size} at {pr} bar: polyline, largest departure from a straight line {straight:.2f} pt")
                elif straight > 0.6:
                    raise SystemExit(f"flow line size {size} at {pr} bar is not straight ({straight:.2f} pt)")
        # performance charts
        for pg, sizes in POWER_PAGES.items():
            svg = page_svg(pdf, pg, tmp)
            paths = strokes(svg)
            ws = words(pdf, pg, tmp)
            frs = [f for f in frames_of(paths) if f[1] - f[0] < PERF_MAX_WIDTH]
            if len(frs) != len(sizes):
                raise SystemExit(f"page {pg}: {len(frs)} performance chart frames, expected {len(sizes)}")
            for size, f in zip(sizes, frs):
                to_n, to_p, top, step, nv, nh, mn, mv = axes(ws, svg, f, f"{NAME} {size}")
                cur = [sorted(p) for sw, da, p in paths if sw == 1.2 and da is None and len(p) >= 2 and
                       all(f[0] - 1 <= x <= f[1] + 1 and f[3] - 1 <= y <= f[2] + 1 for x, y in p)]
                # power rises with speed; a torque line (nearly flat) drawn with a solid piece is dropped
                cur = [c for c in cur if c[0][1] - c[-1][1] > 0.08 * (f[2] - f[3])]
                if len(cur) != len(PRESS[size]):
                    raise SystemExit(f"{NAME} {size}: {len(cur)} power curves, expected {len(PRESS[size])}")
                xm = min(c[-1][0] for c in cur)
                cur.sort(key=lambda c: interp_y(c, xm))               # smallest y = most power = highest p
                log(f"  {NAME} {size}: frame x {f[0]:.1f}-{f[1]:.1f}; power 0 to {top:.0f} kW; grid {nv} vertical "
                    f"(frame edges miss 0 and 3000 by {mn:.1f} r/min), {nh} horizontal (largest miss {mv:.3f} kW); {len(cur)} curves, "
                    f"top one {to_n(cur[0][0][0]):.0f} to {to_n(cur[0][-1][0]):.0f} r/min")
                for pr, c in zip(PRESS[size], cur):
                    px = inverse(to_n) if PX_FROM_GRID else (lambda n, f=f: f[0] + n * (f[1] - f[0]) / 3000.0)
                    for n, v in sample(c, px, to_p,
                                       to_n(c[0][0]), to_n(c[-1][0])):
                        rows.append((size, "power", pr, n, round(v, 3)))
    return rows


def main(pdf=None):
    if pdf is None:
        cache = os.path.expanduser("~/.cache/heavy-hydraulics-rexroth")
        os.makedirs(cache, exist_ok=True)
        pdf = os.path.join(cache, "rexroth_azpg_RE10093_2019-09-27.pdf")
        if not os.path.exists(pdf):
            req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r, open(pdf, "wb") as fh:
                fh.write(r.read())
    with open(pdf, "rb") as fh:
        h = hashlib.sha256(fh.read()).hexdigest()
    print(f"source sha256 {h} ({'matches' if h == SHA256 else 'DIFFERS from'} the copy read for 6w)")
    rows = read(pdf)
    with open(OUT, "w", newline="") as fh:
        fh.write("# Bosch Rexroth AZPG external gear pumps, data sheet RE 10093/2019-09-27, pp. 8 and 16-18, read from "
                 "the PDF's vector paths by digitise_rexroth_azpg.py.\n# 32 mm2/s at 50 C. kind: flow (L/min, at 20 "
                 "bar and at the size's maximum intermittent pressure p2), flow_ends (the drawn line's end points), "
                 "power (kW drive power). size = catalogue size (cm3/r nominal).\n")
        w = csv.writer(fh)
        w.writerow(["size", "kind", "pressure_bar", "speed_rpm", "value"])
        w.writerows(rows)
    n = {}
    for r in rows:
        n[(r[0], r[1])] = n.get((r[0], r[1]), 0) + 1
    print(f"wrote {OUT}: {len(rows)} rows")
    for size in SIZES:
        print(f"  AZPG {size}: " + ", ".join(f"{kd} {n.get((size, kd), 0)}" for kd in ("flow", "power")))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
