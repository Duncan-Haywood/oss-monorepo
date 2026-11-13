"""Milestone 6m: read the GearMe Group 3 (SNP3) gear-pump performance curves out of Danfoss's technical information
and write data/danfoss_snp3_curves.csv, in the schema of data/casappa_kp30_curves.csv (6k).

Source: Danfoss, "GearMe Aluminum Group 3 Pump", Technical Information BC319661777599en-000202 (February 2023),
pages 19 to 21, https://assets.danfoss.com/documents/238499/BC319661777599en-000202.pdf (fetched 2026-11-13).
"The following graphs provide typical output flow and input power for Group 3 pumps at various working pressures.
Data were taken using ISO VG46 petroleum/mineral based fluid at 50 C (viscosity = 28 mm2/s)." One chart per frame
size (022 to 090): output flow (L/min, green, left axis) at 7 bar and at a high pressure, and input power (kW,
navy, right axis) at two or three pressures, against speed (0 to 3000 r/min). Displacements are the page 6 table
(22.1 to 88.2 cm3/r). The digitised numbers are facts read from a manufacturer's published curves, credited here
and in the README.

The curves are vector strokes (width 2.5, green or navy), so they are read exactly. The tick labels are outlined
glyphs (filled paths), not text: each axis is calibrated by clustering its label glyphs into rows, taking each row's
vertical centre, and fitting value = a + b y through the label values read from the page images (LABELS); the
largest residual of that fit is printed per axis, so an unevenly drawn axis shows. The x axis is the frame,
0 at its left edge and 3000 r/min at its right (six 500 r/min grid intervals, checked). The pressure of each
curve is the label printed on it (PRESS, read from the page images at 220 dpi); within a chart the green line
with more flow is the 7 bar one and power curves are ranked by height.

Usage: python3 digitise_danfoss_snp3.py [technical-information.pdf]
(default: fetch into ~/.cache/heavy-hydraulics-danfoss). Needs pdftocairo (poppler-utils) and the standard library.
"""
import csv
import os
import re
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from digitise_casappa_kappa30 import svg_paths, page_svg, interp_y  # noqa: E402

URL = "https://assets.danfoss.com/documents/238499/BC319661777599en-000202.pdf"
OUT = os.path.join(HERE, "data", "danfoss_snp3_curves.csv")
GREEN = "rgb(0%, 50.193787%, 24.31488%)"
NAVY = "rgb(5.488586%, 11.767578%, 38.818359%)"
BLACK = "rgb(0%, 0%, 0%)"

SIZES = (22, 26, 33, 38, 44, 48, 55, 63, 75, 90)        # frame size (type number)
DISPLACEMENT = {22: 22.1, 26: 26.2, 33: 33.1, 38: 37.9, 44: 44.1, 48: 48.3, 55: 55.1, 63: 63.4, 75: 74.4,
                90: 88.2}                                # cm3/r, page 6 table
RATED = {22: 250, 26: 250, 33: 250, 38: 250, 44: 250, 48: 230, 55: 230, 63: 210, 75: 180, 90: 150}  # bar, p. 6
PAGES = {19: (22, 26, 33, 38), 20: (44, 48, 55, 63), 21: (75, 90)}   # charts in reading order
# (flow labels bottom to top, power labels bottom to top), read from the page images
LABELS = {
    22: (range(0, 71, 10), range(0, 31, 10)),
    26: (range(0, 81, 10), range(0, 41, 10)),
    33: (range(0, 111, 10), range(0, 51, 10)),
    38: (range(0, 111, 10), range(0, 61, 10)),
    44: (range(0, 141, 10), range(0, 61, 10)),
    48: (range(0, 141, 10), range(0, 61, 10)),
    55: (range(0, 151, 10), range(0, 61, 10)),
    63: (range(0, 161, 20), range(0, 61, 20)),
    75: (range(0, 201, 20), range(0, 81, 20)),
    90: (range(0, 221, 20), range(0, 121, 20)),
}
# pressures printed on the curves: (high flow line, power curves top to bottom)
PRESS = {
    22: (250, (250, 150, 100)), 26: (250, (250, 150, 100)), 33: (250, (250, 150, 100)),
    38: (250, (250, 150, 100)), 44: (250, (250, 150, 100)), 48: (230, (230, 150, 100)),
    55: (230, (230, 150, 100)), 63: (210, (210, 150, 100)), 75: (180, (180, 150, 100)),
    90: (140, (140, 100)),
}


def styled(svg):
    """(stroke colour or None, fill colour or None, points) for every subpath, in page points."""
    body = svg[svg.find("</defs>"):]
    out = []
    for attrs in re.findall(r"<path ([^>]*)/>", body):
        st = re.search(r'stroke="([^"]*)"', attrs)
        fi = re.search(r'fill="([^"]*)"', attrs)
        st = st.group(1) if st and st.group(1) != "none" else None
        fi = fi.group(1) if fi and fi.group(1) != "none" else None
        for _, pts in svg_paths("</defs><path " + attrs + "/>"):
            out.append((st, fi, pts))
    return out


def span(pts):
    xs, ys = [x for x, _ in pts], [y for _, y in pts]
    return min(xs), max(xs), min(ys), max(ys)


def rows_of(glyphs, gap=3.0):
    """Cluster glyph boxes into text rows by vertical overlap; return each row's centre y."""
    boxes = sorted((b[2], b[3]) for b in glyphs)
    rows = []
    for y0, y1 in boxes:
        if rows and y0 <= rows[-1][1] + gap * 0.3 and y0 - rows[-1][0] < gap * 4:
            rows[-1] = (rows[-1][0], max(rows[-1][1], y1))
        else:
            rows.append((y0, y1))
    return [(a + b) / 2.0 for a, b in rows]


def axis_fit(ys, values, what):
    vals = list(values)
    if len(ys) != len(vals):
        raise SystemExit(f"{what}: {len(ys)} label rows found, {len(vals)} labels expected ({ys})")
    ys = sorted(ys, reverse=True)                          # bottom (largest y) first = smallest value
    n = len(ys)
    my, mv = sum(ys) / n, sum(vals) / n
    b = sum((y - my) * (v - mv) for y, v in zip(ys, vals)) / sum((y - my) ** 2 for y in ys)
    a = mv - b * my
    res = max(abs(a + b * y - v) for y, v in zip(ys, vals))
    return a, b, res


def read(pdf, log=print):
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for pg, sizes in PAGES.items():
            paths = styled(page_svg(pdf, pg, tmp))
            frames = []
            for st, fi, pts in paths:
                if st == BLACK and len(pts) >= 4:
                    x0, x1, y0, y1 = span(pts)
                    if 100 < x1 - x0 < 160 and 150 < y1 - y0 < 260:
                        frames.append((x0, x1, y1, y0))     # (left, right, bottom, top)
            frames.sort(key=lambda f: (round(f[3] / 50.0), f[0]))
            if len(frames) != len(sizes):
                raise SystemExit(f"page {pg}: {len(frames)} chart frames, expected {len(sizes)}")
            for size, (fx0, fx1, fyb, fyt) in zip(sizes, frames):
                inside = lambda p, tol=1.5: all(fx0 - tol <= x <= fx1 + tol and fyt - tol <= y <= fyb + tol  # noqa: E731
                                                for x, y in p)
                gl = [span(p) for st, fi, p in paths if fi == GREEN and st is None]
                gl = [b for b in gl if fx0 - 14 <= b[1] <= fx0 - 1 and fyt - 8 <= b[2] and b[3] <= fyb + 8
                      and b[3] - b[2] < 9]
                nv = [span(p) for st, fi, p in paths if fi == NAVY and st is None]
                nv = [b for b in nv if fx1 + 1 <= b[0] <= fx1 + 6 and fyt - 8 <= b[2] and b[3] <= fyb + 8
                      and b[3] - b[2] < 9]
                qa, qb, qres = axis_fit(rows_of(gl), LABELS[size][0], f"SNP3 {size:03d} flow axis")
                pa, pb, pres = axis_fit(rows_of(nv), LABELS[size][1], f"SNP3 {size:03d} power axis")
                to_n = lambda x: (x - fx0) * 3000.0 / (fx1 - fx0)  # noqa: E731
                green = [sorted(p) for st, fi, p in paths if st == GREEN and len(p) >= 2 and inside(p)]
                navy = [sorted(p) for st, fi, p in paths if st == NAVY and fi is None and len(p) >= 2 and inside(p)
                        and span(p)[1] - span(p)[0] > 30]
                hi_p, pw_p = PRESS[size]
                if len(green) != 2 or len(navy) != len(pw_p):
                    raise SystemExit(f"SNP3 {size:03d}: {len(green)} flow lines and {len(navy)} power curves, "
                                     f"expected 2 and {len(pw_p)}")
                xm = max(min(c[-1][0] for c in green), max(c[0][0] for c in green))
                green.sort(key=lambda c: interp_y(c, xm))   # smaller y = more flow = 7 bar
                xm = min(c[-1][0] for c in navy)
                navy.sort(key=lambda c: interp_y(c, xm))
                log(f"  SNP3 {size:03d}: frame x {fx0:.1f}-{fx1:.1f}, y {fyb:.1f}-{fyt:.1f}; flow axis {len(gl)} glyphs,"
                    f" fit residual {qres:.2f} L/min; power axis residual {pres:.2f} kW; "
                    f"{len(navy[0])}-point top power curve")
                for kind, curves, press, a, b in (("flow", green, (7, hi_p), qa, qb),
                                                  ("power", navy, pw_p, pa, pb)):
                    for pr, c in zip(press, curves):
                        lo_n, hi_n = to_n(c[0][0]), to_n(c[-1][0])
                        for n in range(int(-(-lo_n // 100) * 100), int(hi_n) + 1, 100):
                            y = interp_y(c, fx0 + n * (fx1 - fx0) / 3000.0)
                            if y is not None:
                                rows.append((size, kind, pr, n, round(a + b * y, 3)))
                        if kind == "flow":
                            rows.append((size, "flow_ends", pr, round(lo_n, 1), round(a + b * c[0][1], 3)))
                            rows.append((size, "flow_ends", pr, round(hi_n, 1), round(a + b * c[-1][1], 3)))
    return rows


def main(pdf=None):
    if pdf is None:
        cache = os.path.expanduser("~/.cache/heavy-hydraulics-danfoss")
        os.makedirs(cache, exist_ok=True)
        pdf = os.path.join(cache, "danfoss_gearme_group3_BC319661777599en-000202.pdf")
        if not os.path.exists(pdf):
            urllib.request.urlretrieve(URL, pdf)
    rows = read(pdf)
    with open(OUT, "w", newline="") as fh:
        fh.write("# Danfoss GearMe Aluminum Group 3 (SNP3) gear pumps, Technical Information BC319661777599en-000202 "
                 "(Feb 2023), pp. 19-21, read from the PDF's vector paths by digitise_danfoss_snp3.py.\n# ISO VG46 at "
                 "50 C (28 mm2/s). kind: flow (L/min, at 7 bar and at the high pressure drawn), flow_ends (the drawn "
                 "line's end points), power (kW input). size = frame size (cm3/r nominal).\n")
        w = csv.writer(fh)
        w.writerow(["size", "kind", "pressure_bar", "speed_rpm", "value"])
        w.writerows(rows)
    n = {}
    for r in rows:
        n[(r[0], r[1])] = n.get((r[0], r[1]), 0) + 1
    print(f"wrote {OUT}: {len(rows)} rows")
    for size in SIZES:
        print(f"  SNP3 {size:03d}: " + ", ".join(f"{kd} {n.get((size, kd), 0)}" for kd in ("flow", "power")))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
