"""Milestone 7z: read the POLARIS 30 (PLP 30) gear-pump performance curves out of Casappa's Polaris catalogue and
write data/casappa_plp30_curves.csv (same schema as data/casappa_kp30_curves.csv, so measured.gear_pump_point reads
it).

Source: Casappa S.p.A., "Polaris" catalogue PL 06 T A (PDF created 2024-02-13; the PLP 30 charts carry the drawing
date 01/10.2003), https://www.casappa.com/c/downloads/download/71/ (fetched 2026-11-19), printed pages 7 (size
table) and 18 to 20 (PDF pages 18 to 20). "Each curve has been obtained at 50 C (122 F), using oil with viscosity
46 cSt (210 SSU) at 40 C (104 F) and at these pressures." Page 18 has one flow chart, Q (L/min) against speed for
the ten sizes PLP 30.22 to 30.90, each size drawn twice: at 20 bar (solid) and at its own maximum pressure (dashed,
250 to 150 bar, legend beside the chart). Then one chart per size: absorbed power P (kW, solid, left axis) and torque
M (Nm, dashed, right axis) against speed at three to five pressures. The digitised numbers are facts read from a
manufacturer's published curves, credited here and in the README.

The charts are vector art in the layout digitise_casappa_kappa30.py reads, so the same reader is used: each page
goes through `pdftocairo -svg` and svg_paths(). Each chart's frame is four (or a three-point and two two-point)
strokes of width 0.54 to 0.56 inside the box listed in CHARTS; the reader takes its edges from those strokes and
checks that the thin (0.197 / 0.218) vertical grid lines fall at 1000 and 2000 r/min (flow chart: every 500) and
that the horizontal grid lines are evenly spaced, printing the count, so a chart whose top label is not the frame's
top shows. Speed runs 0 to 3000 r/min across every frame and power 0 to the top label (read from the page images,
CHARTS) up it. Power curves are solid strokes of width 1.309 to 1.316 spanning more than 30 pt; the dashed torque
curves are not read (the model uses flow and power only). The flow lines are 20 straight strokes of width 1.276.
Curves are ordered by height to match the pressures printed on them.

Usage: python3 digitise_casappa_polaris30.py [catalogue.pdf]   (default: fetch into ~/.cache/heavy-hydraulics-casappa)
Needs pdftocairo (poppler-utils) and the standard library.
"""
import csv
import os
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from digitise_casappa_kappa30 import svg_paths, page_svg, interp_y  # noqa: E402

URL = "https://www.casappa.com/c/downloads/download/71/"
OUT = os.path.join(HERE, "data", "casappa_plp30_curves.csv")

SIZES = (22, 27, 34, 38, 43, 51, 61, 73, 82, 90)                    # catalogue type numbers (PLP 30.<size>)
DISPLACEMENT = {22: 21.99, 27: 26.70, 34: 34.55, 38: 39.27, 43: 43.98, 51: 51.83, 61: 61.26, 73: 73.82,
                82: 81.68, 90: 91.10}                               # cm3/r, printed page 7 table
PMAX = {22: 250, 27: 250, 34: 240, 38: 240, 43: 230, 51: 210, 61: 190, 73: 170, 82: 160, 90: 150}  # flow legend p. 18
NMAX = {22: 3000, 27: 3000, 34: 3000, 38: 3000, 43: 3000, 51: 2500, 61: 2500, 73: 2500, 82: 2200, 90: 2200}  # p. 7

# flow chart, PDF page 18: box to search for its frame; speed 0..3000 r/min, flow 0..220 L/min (page image)
FLOW = {"page": 18, "box": (80.0, 300.0, 405.0, 110.0), "qtop": 220.0}
# per size: PDF page, search box (x0, x1, y_bottom, y_top) around the frame, P axis top label (kW), pressures of the
# power curves top to bottom (labels printed on the curves; page images)
CHARTS = {
    22: (18, (80, 245, 725, 455), 42.0, (250, 200, 150, 100, 50)),
    27: (18, (340, 507, 725, 455), 50.0, (250, 200, 150, 100, 50)),
    34: (19, (90, 256, 386, 117), 60.0, (240, 200, 150, 100, 50)),
    38: (19, (352, 518, 386, 117), 70.0, (240, 200, 150, 100, 50)),
    43: (19, (90, 256, 717, 448), 70.0, (230, 150, 100, 50)),
    51: (19, (352, 518, 719, 450), 60.0, (210, 150, 100, 50)),
    61: (20, (80, 245, 386, 117), 70.0, (190, 150, 100, 50)),
    73: (20, (340, 507, 386, 117), 70.0, (170, 100, 50)),
    82: (20, (80, 245, 717, 448), 70.0, (160, 100, 50)),
    90: (20, (340, 507, 718, 449), 80.0, (150, 100, 50)),
}
FRAME_W = (0.54, 0.565)
GRID_W = (0.19, 0.22)
CURVE_W = (1.305, 1.32)
FLOW_W = 1.276


def _in(pts, box, tol=1.0):
    x0, x1, yb, yt = box
    return all(x0 - tol <= x <= x1 + tol and yt - tol <= y <= yb + tol for x, y in pts)


def _span(pts):
    xs, ys = [x for x, _ in pts], [y for _, y in pts]
    return max(xs) - min(xs), max(ys) - min(ys)


def frame(paths, box, label, xgrid):
    """(x0, x1, y_bottom, y_top) of the chart frame inside box, checked against its grid lines; also the number of
    horizontal grid intervals."""
    xs, ys = [], []
    for sw, pts in paths:
        if sw is None or not (FRAME_W[0] <= sw <= FRAME_W[1]) or not _in(pts, box):
            continue
        w, h = _span(pts)
        if w > 100 or h > 100:
            for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
                if abs(xa - xb) < 0.05 and abs(ya - yb) > 100:
                    xs.append(xa)
                if abs(ya - yb) < 0.05 and abs(xa - xb) > 100:
                    ys.append(ya)
    if not xs or not ys:
        raise SystemExit(f"{label}: no frame found in {box}")
    x0, x1, yt, yb = min(xs), max(xs), min(ys), max(ys)
    if x1 - x0 < 100 or yb - yt < 100:
        raise SystemExit(f"{label}: frame edges incomplete ({x0:.2f}, {x1:.2f}, {yb:.2f}, {yt:.2f})")
    vx, hy = set(), set()
    for sw, pts in paths:
        if sw is None or not (GRID_W[0] <= sw <= GRID_W[1]) or len(pts) != 2 or not _in(pts, (x0, x1, yb, yt)):
            continue
        (xa, ya), (xb, yb2) = pts
        if abs(xa - xb) < 0.05 and abs(ya - yb2) > 0.9 * (yb - yt):
            vx.add(round(xa, 2))
        if abs(ya - yb2) < 0.05 and abs(xa - xb) > 0.9 * (x1 - x0):
            hy.add(round(ya, 2))
    want = [x0 + (x1 - x0) * g for g in xgrid]
    got = sorted(vx)
    if len(got) != len(want) or max(abs(a - b) for a, b in zip(got, want)) > 0.3:
        raise SystemExit(f"{label}: vertical grid {got} not at {[round(w, 2) for w in want]}")
    lv = sorted(hy | {round(yt, 2), round(yb, 2)})
    gaps = [b - a for a, b in zip(lv, lv[1:])]
    if max(gaps) - min(gaps) > 0.3:
        raise SystemExit(f"{label}: horizontal grid uneven {lv}")
    return (x0, x1, yb, yt), len(gaps), max(abs(a - b) for a, b in zip(got, want))


def read(pdf, log=print):
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        svgs = {pg: svg_paths(page_svg(pdf, pg, tmp)) for pg in (18, 19, 20)}
        # flow chart
        fr, nh, err = frame(svgs[18], FLOW["box"], "flow chart", (1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6))
        x0, x1, yb, yt = fr
        log(f"flow chart frame x {x0:.2f}..{x1:.2f}, y {yb:.2f}..{yt:.2f}; {nh} horizontal intervals "
            f"({FLOW['qtop'] / nh:g} L/min each); grid off by <= {err:.2f} pt")
        to_n = lambda x: (x - x0) * 3000.0 / (x1 - x0)  # noqa: E731
        to_q = lambda y: (yb - y) * FLOW["qtop"] / (yb - yt)  # noqa: E731
        lines = []
        for sw, pts in svgs[18]:
            if sw == FLOW_W and len(pts) == 2 and _in(pts, fr):
                (xa, ya), (xb, yb_) = sorted(pts)
                na, nb, qa, qb = to_n(xa), to_n(xb), to_q(ya), to_q(yb_)
                lines.append((na, qa, nb, qb, (qb - qa) / (nb - na) * 1000.0))
        if len(lines) != 2 * len(SIZES):
            raise SystemExit(f"flow chart: expected {2 * len(SIZES)} lines, found {len(lines)}")
        # each size is a pair of near-parallel lines with the same end speed (its max speed); sorted by slope,
        # neighbours pair; the higher line at the shared end is the 20 bar line
        lines.sort(key=lambda l: l[4])
        for k, size in enumerate(SIZES):
            a, b = lines[2 * k], lines[2 * k + 1]
            if abs(a[2] - b[2]) > 5 or abs(a[2] - NMAX[size]) > 10:
                raise SystemExit(f"PLP 30.{size}: flow lines end at {a[2]:.0f} and {b[2]:.0f} r/min, "
                                 f"expected {NMAX[size]}")
            lo, hi = sorted((a, b), key=lambda l: l[3])
            for line, pr in ((hi, 20), (lo, PMAX[size])):
                na, qa, nb, qb, _ = line
                for n in range(int(-(-na // 100) * 100), int(nb) + 1, 100):
                    rows.append((size, "flow", pr, n, round(qa + (qb - qa) * (n - na) / (nb - na), 3)))
                rows.append((size, "flow_ends", pr, round(na, 1), round(qa, 3)))
                rows.append((size, "flow_ends", pr, round(nb, 1), round(qb, 3)))
            log(f"  PLP 30.{size}: 20 bar line {hi[0]:.0f}..{hi[2]:.0f} r/min, {hi[4]:.3f} L/min per 1000 r/min "
                f"(V {DISPLACEMENT[size]}); {PMAX[size]} bar line from {lo[0]:.0f} r/min, {lo[4]:.3f}")
        # power charts
        for size, (pg, box, ptop, press) in CHARTS.items():
            fr, nh, err = frame(svgs[pg], box, f"PLP 30.{size}", (1 / 3, 2 / 3))
            x0, x1, yb, yt = fr
            to_n = lambda x: (x - x0) * 3000.0 / (x1 - x0)  # noqa: E731
            to_p = lambda y: (yb - y) * ptop / (yb - yt)  # noqa: E731
            solid = [sorted(pts) for sw, pts in svgs[pg]
                     if sw is not None and CURVE_W[0] <= sw <= CURVE_W[1] and _in(pts, fr) and _span(pts)[0] > 30]
            if len(solid) != len(press):
                raise SystemExit(f"PLP 30.{size}: {len(solid)} power curves, expected {len(press)}")
            xr = min(c[-1][0] for c in solid)
            solid.sort(key=lambda c: interp_y(c, xr))          # top of the page first = highest power
            log(f"  PLP 30.{size}: frame x {x0:.2f}..{x1:.2f}, y {yb:.2f}..{yt:.2f}; {nh} horizontal intervals "
                f"({ptop / nh:g} kW each); curves {to_n(min(c[0][0] for c in solid)):.0f}.."
                f"{to_n(max(c[-1][0] for c in solid)):.0f} r/min")
            for pr, c in zip(press, solid):
                lo_n, hi_n = to_n(c[0][0]), to_n(c[-1][0])
                for n in range(int(-(-lo_n // 100) * 100), int(hi_n) + 1, 100):
                    y = interp_y(c, x0 + n * (x1 - x0) / 3000.0)
                    if y is not None:
                        rows.append((size, "power", pr, n, round(to_p(y), 3)))
    return rows


def main(pdf=None):
    if pdf is None:
        cache = os.path.expanduser("~/.cache/heavy-hydraulics-casappa")
        os.makedirs(cache, exist_ok=True)
        pdf = os.path.join(cache, "casappa_polaris_PL06TA.pdf")
        if not os.path.exists(pdf):
            urllib.request.urlretrieve(URL, pdf)
    rows = read(pdf)
    with open(OUT, "w", newline="") as fh:
        fh.write("# Casappa Polaris catalogue PL 06 T A (2024; charts dated 01/10.2003), PLP 30 gear pumps, pages 7 "
                 "and 18-20, read from the PDF's vector paths by digitise_casappa_polaris30.py.\n# 50 C, oil 46 cSt "
                 "at 40 C. kind: flow (L/min, at 20 bar and at the size's maximum pressure), flow_ends (the drawn "
                 "line's end points), power (kW absorbed). size = catalogue type number (PLP 30.<size>).\n")
        w = csv.writer(fh)
        w.writerow(["size", "kind", "pressure_bar", "speed_rpm", "value"])
        w.writerows(rows)
    n = {}
    for r in rows:
        n[(r[0], r[1])] = n.get((r[0], r[1]), 0) + 1
    print(f"wrote {OUT}: {len(rows)} rows")
    for size in SIZES:
        print(f"  PLP 30.{size}: " + ", ".join(f"{kd} {n.get((size, kd), 0)}" for kd in ("flow", "power")))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
