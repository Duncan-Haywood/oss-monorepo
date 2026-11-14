"""Milestone 6o: read the ALP3 gear-pump performance curves out of Marzocchi's ALP catalogue and write
data/marzocchi_alp3_curves.csv (same schema as data/casappa_kp30_curves.csv, so measured.gear_pump_point reads it).

Source: Marzocchi Pompe S.p.A., "Serie ALP" catalogue (PDF created 2004-02-12, modified 2011-03-03),
https://www.marzocchipompe.com/wp-content/uploads/2025/12/SERIE-ALP-MARZOCCHI-POMPE.pdf (fetched 2026-11-14),
printed pages 38 (ALP3 size table) and 43 to 46 (PDF pages 45 to 48). "Each curve has been obtained at 50 C, using
oil with viscosity 30 cSt at these pressure." Page 43 has one flow chart, Q (L/min) against speed for the eleven
sizes ALP3-D-30 to -135, each size drawn twice: at 25 bar and at its own maximum pressure (250 to 150 bar, legend
under the chart). Then one chart per size: absorbed power P (kW, solid, left axis) and torque M (Nm, dashed, right
axis) against speed at five or six pressures (25 to 250 bar). The digitised numbers are facts read from a
manufacturer's published curves, credited here and in the README.

The charts are vector art, so they are read exactly, not by eye: `pdftocairo -svg` writes each page and
digitise_casappa_kappa30.svg_paths() turns every path into page coordinates. Flow lines are two-point strokes of
width 0.85; each power curve is a stroke of width 0.857 or 0.86 drawn in two or more pieces, joined end to end
here; each torque curve is a chain of filled dashes (outlined strokes, four corners each), joined by their centres.
Every chart's frame is the width-0.85 rectangle. The tick labels are outlined glyphs, not text, so each axis scale is
fitted by least squares through the centres of its label rows (values listed in CHARTS from the page images, the
number of rows checked against the count found); the largest residual is printed, so a non-linear or misread
axis shows. The glyph centres sit about 0.3 pt above their grid lines, so each power and torque axis is anchored
at zero on the frame bottom (the grid lines then fall on round values), and speed runs from 500 r/min at the
frame's left edge to the top label at its right edge (every curve then starts at 1000 r/min and ends at 2000, 2500
or 3000 to within 1 r/min; the label fit differs from that by 9 to 51 r/min, printed). Curves are ordered by height to match the pressures printed beside them.

Usage: python3 digitise_marzocchi_alp3.py [catalogue.pdf]   (default: fetch into ~/.cache/heavy-hydraulics-marzocchi)
Needs pdftocairo (poppler-utils) and the standard library.
"""
import csv
import os
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from digitise_casappa_kappa30 import svg_paths, interp_y  # noqa: E402

URL = "https://www.marzocchipompe.com/wp-content/uploads/2025/12/SERIE-ALP-MARZOCCHI-POMPE.pdf"
OUT = os.path.join(HERE, "data", "marzocchi_alp3_curves.csv")

SIZES = (30, 33, 40, 50, 60, 66, 80, 94, 110, 120, 135)       # catalogue type numbers
DISPLACEMENT = {30: 20.0, 33: 22.0, 40: 26.0, 50: 33.0, 60: 39.0, 66: 44.0, 80: 52.0, 94: 61.0, 110: 71.0,
                120: 78.0, 135: 87.0}                         # cm3/r, printed page 38 table
PMAX_FLOW = {30: 250, 33: 250, 40: 250, 50: 240, 60: 240, 66: 240, 80: 220, 94: 200, 110: 180, 120: 170,
             135: 150}                                        # the high-pressure flow line, legend of page 43
# flow chart, PDF page 45: speed labels 500..3500 r/min, flow labels 0..200 L/min (from the page image)
FLOW_PAGE, FLOW_N, FLOW_Q = 45, (500.0, 3500.0, 500.0), (0.0, 200.0, 20.0)
# per size chart: PDF page, chart index on the page (frames ordered top-left, top-right, bottom-left, ...),
# P label values (0..top step), M label values (0..top step), speed label top (500..top step 500), pressures
# of the curves top to bottom (labels printed on the curves)
P6 = (250, 200, 150, 100, 50, 25)
P5 = (200, 150, 100, 50, 25)
CHARTS = {
    30: (46, 0, (30, 5), (90, 10), 3000, P6),
    33: (46, 1, (35, 5), (100, 10), 3000, P6),
    40: (46, 2, (40, 5), (120, 20), 3000, P6),
    50: (46, 3, (45, 5), (140, 20), 3000, P6),
    60: (47, 0, (50, 10), (160, 20), 3000, P6),
    66: (47, 1, (60, 10), (180, 20), 3000, P6),
    80: (47, 2, (60, 10), (240, 20), 2500, P6),
    94: (47, 3, (80, 10), (250, 50), 2500, P6),
    110: (48, 0, (70, 10), (300, 50), 2500, P5),
    120: (48, 1, (80, 10), (300, 50), 2500, P5),
    135: (48, 2, (80, 10), (300, 50), 2500, P5),
}


def page_svg(pdf, page, tmp):
    path = os.path.join(tmp, f"p{page}.svg")
    subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), pdf, path], check=True)
    with open(path) as fh:
        return fh.read()


def frames(paths):
    """Chart frames (x0, x1, y_bottom, y_top) on a page: width-0.85 four-corner rectangles, ordered by row then x."""
    out = []
    for sw, pts in paths:
        if sw == 0.85 and len(pts) == 4:
            xs, ys = [x for x, _ in pts], [y for _, y in pts]
            if max(xs) - min(xs) > 150:
                out.append((min(xs), max(xs), max(ys), min(ys)))
    return sorted(out, key=lambda f: (round(f[3] / 100), f[0]))


def box(pts):
    xs, ys = [x for x, _ in pts], [y for _, y in pts]
    return min(xs), max(xs), min(ys), max(ys)


def rows_of(boxes, key, gap):
    """Group glyph boxes into label rows (or columns) along key; return each group's mean key, in order."""
    boxes = sorted(boxes, key=key)
    groups = []
    for b in boxes:
        if groups and key(b) - key(groups[-1][-1]) < gap:
            groups[-1].append(b)
        else:
            groups.append([b])
    return [sum(key(b) for b in g) / len(g) for g in groups]


def fit(coords, values, what):
    """Least-squares line value = a + b * coord through label positions; returns (a, b, largest residual)."""
    if len(coords) != len(values):
        raise SystemExit(f"{what}: {len(coords)} label rows found, expected {len(values)}")
    n = len(coords)
    mx, mv = sum(coords) / n, sum(values) / n
    b = sum((c - mx) * (v - mv) for c, v in zip(coords, values)) / sum((c - mx) ** 2 for c in coords)
    a = mv - b * mx
    return a, b, max(abs(a + b * c - v) for c, v in zip(coords, values))


def axes(glyphs, fr, ptop, mtop, ntop):
    """Fit the speed, power and torque axes of one chart from its glyph label rows."""
    x0, x1, yb, yt = fr
    bx = [box(g) for g in glyphs]
    left = [b for b in bx if x0 - 16 < b[0] and b[1] < x0 - 1 and yt - 8 < b[2] and b[3] < yb + 8]
    right = [b for b in bx if x1 + 1 < b[0] and b[0] < x1 + 12 and b[1] < x1 + 30 and yt - 8 < b[2] and b[3] < yb + 8]
    bottom = [b for b in bx if yb + 1 < b[2] and b[3] < yb + 18 and x0 - 15 < b[0] and b[1] < x1 + 15]
    ymid = lambda b: (b[2] + b[3]) / 2  # noqa: E731
    pv = [ptop[0] - k * ptop[1] for k in range(ptop[0] // ptop[1] + 1)]     # top row first
    mv = [mtop[0] - k * mtop[1] for k in range(mtop[0] // mtop[1] + 1)]
    nv = list(range(500, ntop + 1, 500))
    pa = fit(rows_of(left, ymid, 4.0), pv, "power axis")
    ma = fit(rows_of(right, ymid, 4.0), mv, "torque axis")
    na = fit(rows_of(bottom, lambda b: (b[0] + b[1]) / 2, 12.0), nv, "speed axis")
    return na, pa, ma


def join_pieces(pieces):
    """Join stroke pieces of curves end to end: each piece goes after the chain whose right end is nearest
    (within 2 pt in y and 0 to 30 pt in x to the right)."""
    chains = []
    for s in sorted((sorted(p) for p in pieces), key=lambda s: s[0][0]):
        best, bd = None, 2.0
        for c in chains:
            dx, dy = s[0][0] - c[-1][0], abs(s[0][1] - c[-1][1])
            if -0.5 <= dx < 30.0 and dy < bd:
                best, bd = c, dy
        if best is None:
            chains.append(list(s))
        else:
            best.extend(s[1:] if abs(s[0][0] - best[-1][0]) < 0.01 else s)
    return chains


def chain_centres(pts, fr, gap_x=40.0, gap_y=3.0):
    """Join dash centres into curves: attach each centre (left to right) to the chain whose last point is
    nearest in y (within gap_y) and less than gap_x to the left; keep chains over half the frame wide."""
    chains = []
    for x, y in sorted(pts):
        best, bd = None, gap_y
        for c in chains:
            lx, ly = c[-1]
            if 0 < x - lx < gap_x and abs(y - ly) < bd:
                best, bd = c, abs(y - ly)
        if best is None:
            chains.append([(x, y)])
        else:
            best.append((x, y))
    return [c for c in chains if c[-1][0] - c[0][0] > 0.5 * (fr[1] - fr[0])]


def end_y(c, x):
    """y of a polyline continued past its nearer end along its end segment."""
    (xa, ya), (xb, yb) = (c[0], c[1]) if x < c[0][0] else (c[-2], c[-1])
    return ya + (yb - ya) * (x - xa) / (xb - xa)


def read(pdf, log=print):
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        svgs = {pg: svg_paths(page_svg(pdf, pg, tmp)) for pg in (45, 46, 47, 48)}
    # flow chart
    paths = svgs[FLOW_PAGE]
    glyphs = [pts for sw, pts in paths if sw is None and len(pts) > 2]
    fr = max(frames([(sw, p) for sw, p in paths if sw == 0.85]) or [None], key=lambda f: f and f[1] - f[0])
    x0, x1, yb, yt = fr
    bx = [box(g) for g in glyphs]
    left = [b for b in bx if x0 - 25 < b[0] and b[1] < x0 - 1 and yt - 8 < b[2] and b[3] < yb + 8]
    bottom = [b for b in bx if yb + 1 < b[2] and b[3] < yb + 18 and x0 - 15 < b[0] and b[1] < x1 + 15]
    qa = fit(rows_of(left, lambda b: (b[2] + b[3]) / 2, 4.0),
             [200 - 20 * k for k in range(11)], "flow axis")
    na = fit(rows_of(bottom, lambda b: (b[0] + b[1]) / 2, 12.0), list(range(500, 3501, 500)), "flow speed axis")
    to_n = lambda x: 500.0 + (x - x0) * 3000.0 / (x1 - x0)  # noqa: E731   (frame edges 500 and 3500 r/min)
    q_bottom = qa[0] + qa[1] * yb
    qa = (-qa[1] * yb, qa[1], qa[2])                          # zero on the frame bottom, as for the power charts
    log(f"flow chart frame {tuple(round(v, 2) for v in fr)}; label rows put the frame bottom at {q_bottom:+.3f} "
        f"L/min (anchored to 0), top at {qa[0] + qa[1] * yt:.2f}; axis residuals: flow {qa[2]:.3f} L/min, "
        f"speed labels {na[2]:.2f} r/min (label fit vs frame {max(abs(na[0] + na[1] * x - to_n(x)) for x in (x0, x1)):.1f})")
    to_q = lambda y: qa[0] + qa[1] * y  # noqa: E731
    lines = []
    for sw, pts in paths:
        if sw == 0.85 and len(pts) == 2 and all(x0 - 1 <= x <= x1 + 1 and yt - 1 <= y <= yb + 1 for x, y in pts):
            (xa, ya), (xb, yb_) = sorted(pts)
            n_a, n_b, q_a, q_b = to_n(xa), to_n(xb), to_q(ya), to_q(yb_)
            lines.append((n_a, q_a, n_b, q_b, (q_b - q_a) / (n_b - n_a) * 1000.0))
    if len(lines) != 2 * len(SIZES):
        raise SystemExit(f"flow chart: expected {2 * len(SIZES)} lines, found {len(lines)}")
    # each size is a pair of near-parallel lines (slope ~ displacement) ending at the same speed: sort by slope
    # and pair neighbours; the higher line of each pair at its end is the 25 bar line
    lines.sort(key=lambda l: l[4])
    for k, size in enumerate(SIZES):
        a, b = lines[2 * k], lines[2 * k + 1]
        if abs(a[2] - b[2]) > 5.0:
            raise SystemExit(f"ALP3-{size}: paired flow lines end at {a[2]:.0f} and {b[2]:.0f} r/min")
        lo, hi = sorted((a, b), key=lambda l: l[3])
        for line, pr in ((hi, 25), (lo, PMAX_FLOW[size])):
            n_a, q_a, n_b, q_b, _ = line
            for n in range(int(-(-round(n_a, 3) // 100) * 100), int(round(n_b, 3)) + 1, 100):
                rows.append((size, "flow", pr, n, round(q_a + (q_b - q_a) * (n - n_a) / (n_b - n_a), 3)))
            rows.append((size, "flow_ends", pr, round(n_a, 1), round(q_a, 3)))
            rows.append((size, "flow_ends", pr, round(n_b, 1), round(q_b, 3)))
        log(f"  ALP3-{size}: flow lines {hi[4]:.2f} and {lo[4]:.2f} L/min per 1000 r/min (V {DISPLACEMENT[size]}), "
            f"drawn {hi[0]:.0f} to {hi[2]:.0f} r/min")
    # power and torque charts
    for size, (pg, idx, ptop, mtop, ntop, press) in CHARTS.items():
        paths = svgs[pg]
        fr = frames(paths)[idx]
        x0, x1, yb, yt = fr
        glyphs = [pts for sw, pts in paths if sw is None and len(pts) > 4]
        na, pa, ma = axes(glyphs, fr, ptop, mtop, ntop)
        # zero is the frame bottom: the label glyph centres sit about 0.3 pt above their grid lines (the P grid
        # rows read 0.06 to 0.14 kW under round values on the raw fit), so keep the fitted scale, anchor at yb
        shift = (pa[0] + pa[1] * yb, ma[0] + ma[1] * yb)
        pa, ma = (-pa[1] * yb, pa[1], pa[2]), (-ma[1] * yb, ma[1], ma[2])
        inside = lambda pts: all(x0 - 1 <= x <= x1 + 1 and yt - 1 <= y <= yb + 1 for x, y in pts)  # noqa: E731
        pieces = [pts for sw, pts in paths if sw is not None and 0.845 <= sw <= 0.865 and sw != 0.85 and inside(pts)]
        solid = join_pieces(pieces)
        quads = [pts for sw, pts in paths if sw is None and len(pts) == 4 and inside(pts)]
        centres = []
        for q in quads:
            b = box(q)
            if b[3] - b[2] <= 3.0 and b[1] - b[0] >= 0.5:
                centres.append(((b[0] + b[1]) / 2, sum(y for _, y in q) / 4))
        torque = chain_centres(centres, fr)
        if len(solid) != len(press) or len(torque) != len(press):
            raise SystemExit(f"ALP3-{size}: {len(solid)} power and {len(torque)} torque curves, expected {len(press)}")
        xr = min(c[-1][0] for c in solid)
        solid.sort(key=lambda c: interp_y(c, xr))          # top of the page first = highest power
        torque.sort(key=lambda c: sum(y for _, y in c) / len(c))
        # speed from the frame (its edges are 500 r/min and the top label; the label fit is printed as a check)
        to_n = lambda x: 500.0 + (x - x0) * (ntop - 500.0) / (x1 - x0)  # noqa: E731
        to_x = lambda n: x0 + (n - 500.0) * (x1 - x0) / (ntop - 500.0)  # noqa: E731
        dn = max(abs(na[0] + na[1] * x - to_n(x)) for x in (x0, x1))
        log(f"  ALP3-{size}: page {pg} frame {tuple(round(v, 1) for v in fr)}; label fit vs frame speed {dn:.1f} "
            f"r/min (label residual {na[2]:.1f}); axis residuals power {pa[2]:.3f} kW, torque {ma[2]:.3f} Nm; "
            f"label rows put the frame bottom at {shift[0]:+.3f} kW, {shift[1]:+.2f} Nm (anchored to 0); "
            f"{len(pieces)} power pieces, {len(centres)} dashes; "
            f"power drawn {to_n(min(c[0][0] for c in solid)):.0f} to {to_n(max(c[-1][0] for c in solid)):.0f} r/min")
        for kind, curves, ax in (("power", solid, pa), ("torque", torque, ma)):
            for pr, c in zip(press, curves):
                lo_n, hi_n = to_n(c[0][0]), to_n(c[-1][0])
                # a curve that starts or ends within 5 r/min of a 100 r/min sample (ALP3-30's 100 bar curve starts at
                # 1002.9) is continued there along its end segment
                for n in range(int(-(-(lo_n - 5.0) // 100) * 100), int(hi_n + 5.0) + 1, 100):
                    y = interp_y(c, to_x(n)) if c[0][0] <= to_x(n) <= c[-1][0] else end_y(c, to_x(n))
                    if y is None:
                        continue
                    rows.append((size, kind, pr, n, round(ax[0] + ax[1] * y, 3)))
    return rows


def main(pdf=None):
    if pdf is None:
        cache = os.path.expanduser("~/.cache/heavy-hydraulics-marzocchi")
        os.makedirs(cache, exist_ok=True)
        pdf = os.path.join(cache, "marzocchi_serie_alp.pdf")
        if not os.path.exists(pdf):
            urllib.request.urlretrieve(URL, pdf)
    rows = read(pdf)
    with open(OUT, "w", newline="") as fh:
        fh.write("# Marzocchi Pompe 'Serie ALP' catalogue (2004, rev. 2011), ALP3 gear pumps, printed pages 38 and 43-46, "
                 "read from the PDF's vector paths by digitise_marzocchi_alp3.py.\n# 50 C, oil 30 cSt. kind: flow (L/min, "
                 "at 25 bar and at the size's maximum pressure), flow_ends (the drawn line's end points), power (kW "
                 "absorbed), torque (Nm). size = catalogue type number (ALP3-D-<size>).\n")
        w = csv.writer(fh)
        w.writerow(["size", "kind", "pressure_bar", "speed_rpm", "value"])
        w.writerows(rows)
    n = {}
    for r in rows:
        n[(r[0], r[1])] = n.get((r[0], r[1]), 0) + 1
    print(f"wrote {OUT}: {len(rows)} rows")
    for size in SIZES:
        print(f"  ALP3-{size}: " + ", ".join(f"{kd} {n.get((size, kd), 0)}" for kd in ("flow", "power", "torque")))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
