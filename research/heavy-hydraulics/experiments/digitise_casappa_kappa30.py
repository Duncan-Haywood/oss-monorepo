"""Milestone 6k: read the KAPPA 30 gear-pump performance curves out of Casappa's catalogue and write
data/casappa_kp30_curves.csv.

Source: Casappa S.p.A., "KAPPA hydraulic gear pumps and motors", catalogue K 05 T A (05/03.2012), pages 9 to 11
(PDF pages 11 to 13), https://www.casappa.com/c/downloads/download/10/ (fetched 2026-11-13). "Each curve has been
obtained at 50 C, using oil with viscosity 36 cSt at 40 C". Page 9 has one flow chart, Q (L/min) against speed
for the eight sizes 27 to 73 cm3/r, each size drawn twice: at 20 bar and at its own maximum pressure (280 to
180 bar). Then one chart per size: absorbed power P (kW, solid, left axis) and torque M (Nm, dashed, right
axis) against speed at four or five pressures. The digitised numbers are facts read from a manufacturer's
published curves, credited here and in the README.

The curves are vector paths in the PDF, so they are read exactly, not by eye: `pdftocairo -svg` writes each
page, svg_paths() turns every path (Beziers sampled at 8 points) into page coordinates, and each chart's frame
and grid lines (found below, printed) give the axes. Solid curves are strokes of width 1.316, the dashes of the
torque curves are short strokes of the same width chained into lines, and the flow lines are straight strokes
of width 1.264. Curves are ordered by height to match the pressures printed beside them (one pressure per
curve, listed in CHARTS from the page images). The right (torque) axis has no grid of its own: its labels sit on
the left axis's grid lines (checked: each label's glyph cluster centre is within 1.3 pt of a grid line), so
M = (P_grid - P0) * k with (P0, k) read off the labels, per chart, in CHARTS.

Usage: python3 digitise_casappa_kappa30.py [catalogue.pdf]   (default: fetch into ~/.cache/heavy-hydraulics-casappa)
Needs pdftocairo (poppler-utils) and the standard library.
"""
import csv
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://www.casappa.com/c/downloads/download/10/"
OUT = os.path.join(HERE, "data", "casappa_kp30_curves.csv")
NUM = r"-?\d*\.?\d+(?:e-?\d+)?"

# flow chart, PDF page 11: frame x 122.83 (0 r/min) to 321.9 (3000), y 402.7 (0 L/min) to 124.02 (200)
FLOW = {"page": 11, "x": (122.83, 321.9, 0.0, 3000.0), "y": (402.7, 124.02, 0.0, 200.0)}
SIZES = (27, 34, 38, 43, 51, 56, 61, 73)                     # nominal cm3/r (catalogue type numbers)
PMAX = {27: 280, 34: 260, 38: 260, 43: 250, 51: 230, 56: 215, 61: 200, 73: 180}   # p1, max continuous (p. 4)
DISPLACEMENT = {27: 26.7, 34: 34.56, 38: 39.27, 43: 43.98, 51: 51.83, 56: 56.54, 61: 61.26, 73: 73.82}  # cm3/r, p. 4 table

# per size chart: page, frame (x0, x1, y_bottom, y_top), P axis top (kW), pressures top to bottom,
# torque axis (P0, k): M = (P - P0) * k, from the right-hand labels
CHARTS = {
    27: (11, (117.11, 272.56, 729.3, 470.23), 60.0, (280, 200, 150, 100, 50), (20.0, 4.0)),
    34: (11, (383.6, 539.05, 728.9, 469.83), 70.0, (260, 200, 150, 100, 50), (20.0, 4.0)),
    38: (12, (91.56, 246.98, 380.24, 121.17), 70.0, (260, 200, 150, 100, 50), (15.0, 4.0)),
    43: (12, (357.97, 513.39, 382.26, 123.24), 80.0, (250, 200, 150, 100, 50), (40.0, 6.0)),
    51: (12, (91.56, 246.98, 716.5, 457.43), 70.0, (230, 150, 100, 50), (20.0, 5.0)),
    56: (12, (358.02, 513.4, 716.46, 457.43), 70.0, (215, 150, 100, 50), (20.0, 5.0)),
    61: (13, (102.89, 258.32, 380.22, 121.19), 80.0, (200, 150, 100, 50), (20.0, 5.0)),
    73: (13, (369.35, 524.74, 380.24, 121.21), 80.0, (180, 100, 50), (20.0, 5.0)),
}


def svg_paths(svg):
    """Every stroked or filled path of a pdftocairo SVG page as (stroke width, [(x, y), ...]) in page points."""
    body = svg[svg.find("</defs>"):]
    out = []
    for attrs in re.findall(r"<path ([^>]*)/>", body):
        d = re.search(r' d="([^"]*)"', attrs).group(1)
        tr = re.search(r'transform="matrix\(([^)]*)\)"', attrs)
        m = [float(v) for v in tr.group(1).split(",")] if tr else [1, 0, 0, 1, 0, 0]
        sw = re.search(r'stroke-width="([^"]*)"', attrs)
        sw = float(sw.group(1)) if sw else None
        toks = re.findall(r"[MLCZ]|" + NUM, d)
        subs, pts, i = [], [], 0
        while i < len(toks):
            t = toks[i]
            if t == "M":
                if pts:
                    subs.append(pts)
                pts = [(float(toks[i + 1]), float(toks[i + 2]))]
                i += 3
            elif t == "L":
                pts.append((float(toks[i + 1]), float(toks[i + 2])))
                i += 3
            elif t == "C":
                q = [pts[-1]] + [(float(toks[i + 1 + 2 * k]), float(toks[i + 2 + 2 * k])) for k in range(3)]
                for k in range(1, 9):
                    u = k / 8.0
                    w = ((1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3)
                    pts.append((sum(w[j] * q[j][0] for j in range(4)), sum(w[j] * q[j][1] for j in range(4))))
                i += 7
            else:
                i += 1
        if pts:
            subs.append(pts)
        for sp in subs:
            out.append((sw, [(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]) for x, y in sp]))
    return out


def page_svg(pdf, page, tmp):
    path = os.path.join(tmp, f"p{page}.svg")
    subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), pdf, path], check=True)
    with open(path) as fh:
        return fh.read()


def interp_y(pts, x):
    """y of a polyline at x (pts sorted by x), None outside its span."""
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1 and x1 > x0:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return None


def inside(pts, fr, tol=1.0):
    x0, x1, yb, yt = fr
    return all(x0 - tol <= x <= x1 + tol and yt - tol <= y <= yb + tol for x, y in pts)


def chain_dashes(segs, fr):
    """Join a dashed curve's short strokes into lines: sort by x, attach each dash to the chain whose last
    point is nearest in y (within 4 pt) and within 15 pt in x; keep chains spanning over half the frame."""
    chains = []
    for s in sorted(segs, key=lambda s: min(x for x, _ in s)):
        s = sorted(s)
        best, bd = None, 4.0
        for c in chains:
            lx, ly = c[-1]
            if s[0][0] - lx < 15.0:
                d = abs(s[0][1] - ly)
                if d < bd:
                    best, bd = c, d
        if best is None:
            chains.append(list(s))
        else:
            best.extend(s)
    w = fr[1] - fr[0]
    return [c for c in chains if c[-1][0] - c[0][0] > 0.5 * w]


def read(pdf):
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        svgs = {pg: svg_paths(page_svg(pdf, pg, tmp)) for pg in (11, 12, 13)}
        # flow chart
        (fx0, fx1, n0, n1), (fy0, fy1, q0, q1) = FLOW["x"], FLOW["y"]
        to_n = lambda x: n0 + (x - fx0) * (n1 - n0) / (fx1 - fx0)  # noqa: E731
        to_q = lambda y: q0 + (y - fy0) * (q1 - q0) / (fy1 - fy0)  # noqa: E731
        lines = []
        for sw, pts in svgs[11]:
            if sw == 1.264 and len(pts) == 2 and all(fx0 - 1 <= x <= fx1 + 1 and fy1 - 1 <= y <= fy0 + 1
                                                      for x, y in pts):
                (xa, ya), (xb, yb) = sorted(pts)
                na, nb, qa, qb = to_n(xa), to_n(xb), to_q(ya), to_q(yb)
                lines.append((na, qa, nb, qb, (qb - qa) / (nb - na) * 1000.0))
        if len(lines) != 16:
            raise SystemExit(f"flow chart: expected 16 lines, found {len(lines)}")
        # each size is a pair of near-parallel lines (slope ~ displacement); sort by slope and pair neighbours,
        # the higher line of each pair at its end speed is the 20 bar line
        lines.sort(key=lambda l: l[4])
        for k, size in enumerate(SIZES):
            a, b = lines[2 * k], lines[2 * k + 1]
            lo, hi = sorted((a, b), key=lambda l: l[3])
            for line, pr in ((hi, 20), (lo, PMAX[size])):
                na, qa, nb, qb, _ = line
                for n in range(int(-(-na // 100) * 100), int(nb) + 1, 100):
                    rows.append((size, "flow", pr, n, round(qa + (qb - qa) * (n - na) / (nb - na), 3)))
                rows.append((size, "flow_ends", pr, round(na, 1), round(qa, 3)))
                rows.append((size, "flow_ends", pr, round(nb, 1), round(qb, 3)))
        # power and torque charts
        for size, (pg, fr, ptop, press, (p0, k)) in CHARTS.items():
            x0, x1, yb, yt = fr
            to_n = lambda x: (x - x0) * 3000.0 / (x1 - x0)  # noqa: E731
            to_p = lambda y: (yb - y) * ptop / (yb - yt)  # noqa: E731
            paths = [(sw, pts) for sw, pts in svgs[pg] if sw == 1.316 and inside(pts, fr)]
            solid = [sorted(pts) for sw, pts in paths if max(x for x, _ in pts) - min(x for x, _ in pts) > 30]
            dashes = [pts for sw, pts in paths if max(x for x, _ in pts) - min(x for x, _ in pts) <= 30]
            torque = chain_dashes(dashes, fr)
            if len(solid) != len(press) or len(torque) != len(press):
                raise SystemExit(f"KP 30.{size}: {len(solid)} power and {len(torque)} torque curves, "
                                 f"expected {len(press)}")
            xr = min(c[-1][0] for c in solid)
            solid.sort(key=lambda c: interp_y(c, xr))          # top of the page first = highest power
            torque.sort(key=lambda c: sum(y for _, y in c) / len(c))
            for kind, curves in (("power", solid), ("torque", torque)):
                for pr, c in zip(press, curves):
                    lo_n, hi_n = to_n(c[0][0]), to_n(c[-1][0])
                    for n in range(int(-(-lo_n // 100) * 100), int(hi_n) + 1, 100):
                        y = interp_y(c, x0 + n * (x1 - x0) / 3000.0)
                        if y is None:
                            continue
                        v = to_p(y) if kind == "power" else (to_p(y) - p0) * k
                        rows.append((size, kind, pr, n, round(v, 3)))
    return rows


def main(pdf=None):
    if pdf is None:
        cache = os.path.expanduser("~/.cache/heavy-hydraulics-casappa")
        os.makedirs(cache, exist_ok=True)
        pdf = os.path.join(cache, "casappa_kappa_K05TA.pdf")
        if not os.path.exists(pdf):
            urllib.request.urlretrieve(URL, pdf)
    rows = read(pdf)
    with open(OUT, "w", newline="") as fh:
        fh.write("# Casappa KAPPA catalogue K 05 T A (05/03.2012), KP 30 gear pumps, pages 9-11, read from the PDF's "
                 "vector paths by digitise_casappa_kappa30.py.\n# 50 C, oil 36 cSt at 40 C. kind: flow (L/min, at "
                 "20 bar and at the size's maximum pressure), flow_ends (the drawn line's end points), power (kW "
                 "absorbed), torque (Nm). size = catalogue type (cm3/r nominal).\n")
        w = csv.writer(fh)
        w.writerow(["size", "kind", "pressure_bar", "speed_rpm", "value"])
        w.writerows(rows)
    n = {}
    for r in rows:
        n[(r[0], r[1])] = n.get((r[0], r[1]), 0) + 1
    print(f"wrote {OUT}: {len(rows)} rows")
    for size in SIZES:
        print(f"  KP 30.{size}: " + ", ".join(f"{kd} {n.get((size, kd), 0)}" for kd in ("flow", "power", "torque")))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
