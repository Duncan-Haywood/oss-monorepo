"""Milestone 7a: read the AZPF gear-pump characteristic curves out of Bosch Rexroth's data sheet RE 10089 and write
data/rexroth_azpf_curves.csv, in the schema of data/rexroth_azpg_curves.csv (6w), so measured.gear_pump_point
reads it.

Source: Bosch Rexroth AG, "External gear pump High Performance AZPF", data sheet RE 10089/2021-11-24, page 9
(table of values) and pages 18 to 20 ("Diagrams/characteristic curves"). "Characteristic curves measured at
nu = 32 mm2/s and t = 50 C." Page 18 has one flow chart, flow qV (L/min) against speed (0 to 4000 r/min) for the ten
sizes 4 to 28, each drawn twice: solid at p = 20 bar and dashed at p2 ("maximum intermittend"). Then one power
diagram per size (page 18: sizes 4 and 5; page 19: 8, 11, 14, 16; page 20: 19, 22, 25, 28): drive power P (kW,
solid, left axis) against speed at four to six pressure differences labelled 50 bar up to the size's p2 (280 bar to
size 16; 230 and 210 bar for 19 and 22, the series 1x values of page 9; 225 and 200 bar for 25 and 28), and drive
torque (dashed, right axis; not read here). The dashed flow lines are taken at the same p2. The digitised numbers
are facts read from a manufacturer's published curves, credited here and in the README. Copy fetched 2026-11-16
from the distributor mirror in URL (sha256 in SHA256; Rexroth's own store serves the same RE number).

The charts are vector art (pdftocairo -svg: 408, 459 and 418 paths and no images on pages 18 to 20), read with 6w's
helpers (digitise_rexroth_azpg) but a reader of its own, because this sheet differs from the AZPG, AZPN and AZPU
sheets in five ways: (1) every speed axis runs 0 to 4000 r/min with grey grid lines at 1000, 2000 and 3000, so
speed is a least-squares line through those three and the frame edges are only checked against 0 and 4000
(printed); (2) every chart sits inside an outer box, so the plot frames are the frames that lie inside another;
(3) the curves are dark grey strokes of width 0.96 to 1.2 (thick and thin pressures differ), several drawn twice on
top of each other at two widths, so a curve is any undashed stroke of width at least 0.9 inside the plot frame,
deduplicated by its points; (4) the flow lines are drawn as unbroken polylines (dashed ones too), sampled as
polylines as 6y does; (5) the power diagrams' horizontal grid lines can fall every half label step, which 6y's
axes already handle. Within a chart, power curves are ranked by height and matched to the pressures printed on
them (PRESS, read from the page images); flow lines are ranked by slope and matched to the sizes.

Usage: python3 digitise_rexroth_azpf.py [RE10089.pdf]   (default: fetch into ~/.cache/heavy-hydraulics-rexroth)
Needs pdftocairo and pdftotext (poppler-utils) and the standard library.
"""
import csv
import hashlib
import os
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import digitise_rexroth_azpg as rx  # noqa: E402
from digitise_casappa_kappa30 import page_svg, interp_y  # noqa: E402

URL = "https://cdn.dzwigi.net.pl/b/v2/0510225006/Document/AZPF.pdf"
SHA256 = "0afa668bdc13323118e521ae8af7a61fc73f8988b5191facffca77a258ea5690"
OUT = os.path.join(HERE, "data", "rexroth_azpf_curves.csv")
NAME = "AZPF"
INK = "rgb(13.729858%, 12.159729%, 12.548828%)"                # curves and frames
GREY = "rgb(82"                                                 # grid lines, 82.7% grey
N_TOP = 4000.0                                                  # speed axis end, r/min
GRID_N = (1000.0, 2000.0, 3000.0)
PERF_MAX_WIDTH = 175.0                                          # power plot frames are narrower (flow frame 188 pt)

SIZES = (4, 5, 8, 11, 14, 16, 19, 22, 25, 28)                   # nominal size
DISPLACEMENT = {4: 4.0, 5: 5.5, 8: 8.0, 11: 11.0, 14: 14.0, 16: 16.0, 19: 19.0, 22: 22.5, 25: 25.0,
                28: 28.0}                                       # cm3/r, page 9
P2 = {4: 280, 5: 280, 8: 280, 11: 280, 14: 280, 16: 280, 19: 230, 22: 210, 25: 225, 28: 200}   # bar, chart labels
FLOW_PAGE = 18
POWER_PAGES = {18: (4, 5), 19: (8, 11, 14, 16), 20: (19, 22, 25, 28)}   # charts in reading order
P6 = (280, 250, 200, 150, 100, 50)
PRESS = {s: P6 for s in (4, 5, 8, 11, 14, 16)}                  # labels on the power curves, top to bottom
PRESS.update({19: (230, 200, 150, 100, 50), 22: (210, 150, 100, 50), 25: (225, 200, 150, 100, 50),
              28: (200, 150, 100, 50)})


def configure():
    rx.BLACK = INK
    rx.GREY = GREY


def plot_frames(paths):
    """Frames that lie inside another frame (the outer boxes hold a chart, its labels and its legend)."""
    frs = rx.frames_of(paths)
    inside = lambda a, b: a != b and b[0] <= a[0] and a[1] <= b[1] and a[2] <= b[2] and b[3] <= a[3]  # noqa: E731
    return [f for f in frs if any(inside(f, g) for g in frs)]


def axes(ws, svg, fr, what):
    """Speed: least-squares line through the 1000, 2000 and 3000 r/min grid lines (frame edges checked against 0
    and 4000). Value: 0 at the frame bottom, top label at the top, refined through the horizontal grid lines, whose
    spacing is the label step or half of it (6y)."""
    fx0, fx1, fyb, fyt = fr
    left = sorted(w[6] for w in ws if fx0 - 14 <= w[3] <= fx0 - 0.5 and fyt - 8 <= w[1] <= fyb + 8)
    if len(left) < 3 or left[0] != 0:
        raise SystemExit(f"{what}: y labels {left}")
    top, step = left[-1], left[1] - left[0]
    if any(abs(b - a - step) > 1e-9 for a, b in zip(left, left[1:])):
        raise SystemExit(f"{what}: uneven y labels {left}")
    vx, hy = rx.grid(svg, fr)
    vx = sorted(vx)
    if len(vx) != len(GRID_N):
        raise SystemExit(f"{what}: {len(vx)} vertical grid lines, expected {len(GRID_N)}")
    k = len(GRID_N)
    mn_, mx_ = sum(GRID_N) / k, sum(vx) / k
    dx = sum((n - mn_) * (x - mx_) for n, x in zip(GRID_N, vx)) / sum((n - mn_) ** 2 for n in GRID_N)
    x0 = mx_ - dx * mn_
    to_n = lambda x: (x - x0) / dx  # noqa: E731
    miss_grid = max(abs(to_n(x) - n) for n, x in zip(GRID_N, vx))
    miss_n = max(abs(to_n(fx0)), abs(to_n(fx1) - N_TOP), miss_grid)
    est = lambda y: top * (fyb - y) / (fyb - fyt)  # noqa: E731
    gs = min((step, step / 2.0), key=lambda g: max([abs(est(y) - g * round(est(y) / g)) for y in hy] or [0.0]))
    pts = [(fyb, 0.0), (fyt, float(top))] + [(y, gs * round(est(y) / gs)) for y in hy]
    n = len(pts)
    my, mv = sum(y for y, _ in pts) / n, sum(v for _, v in pts) / n
    b = sum((y - my) * (v - mv) for y, v in pts) / sum((y - my) ** 2 for y, _ in pts)
    a = mv - b * my
    to_v = lambda y: a + b * y  # noqa: E731
    miss_v = max(abs(to_v(y) - v) for y, v in pts)
    return to_n, to_v, top, step, len(vx), len(hy), miss_n, miss_v


def curves(paths, fr, dashed):
    """Distinct strokes of width >= 0.9 inside a plot frame, dashed or not, as point lists sorted by x."""
    out, seen = [], set()
    for sw, da, p in paths:
        if sw is None or sw < 0.9 or (da is not None) != dashed or len(p) < 2:
            continue
        if not all(fr[0] - 1 <= x <= fr[1] + 1 and fr[3] - 1 <= y <= fr[2] + 1 for x, y in p):
            continue
        c = sorted(p)
        key = tuple((round(x, 1), round(y, 1)) for x, y in c)
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def read(pdf, log=print):
    configure()
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        svg = page_svg(pdf, FLOW_PAGE, tmp)
        paths = rx.strokes(svg)
        ws = rx.words(pdf, FLOW_PAGE, tmp)
        fr = max(plot_frames(paths), key=lambda f: f[1] - f[0])
        to_n, to_q, top, step, nv, nh, mn, mv = axes(ws, svg, fr, "flow chart")
        px = rx.inverse(to_n)
        log(f"  flow chart: frame x {fr[0]:.1f}-{fr[1]:.1f}, y {fr[2]:.1f}-{fr[3]:.1f}; flow 0 to {top:.0f} L/min; "
            f"grid {nv} vertical (speed axis misses the grid or the frame edges' 0 and 4000 by at most {mn:.1f} "
            f"r/min), {nh} horizontal (largest miss {mv:.3f} L/min)")
        # only lines that rise with speed (the legend's sample strokes are outside the plot frame)
        solid = [c for c in curves(paths, fr, False) if c[0][1] - c[-1][1] > 5]
        dashed = [c for c in curves(paths, fr, True) if c[0][1] - c[-1][1] > 5]
        if len(solid) != len(SIZES) or len(dashed) != len(SIZES):
            raise SystemExit(f"flow chart: {len(solid)} solid and {len(dashed)} dashed lines, expected {len(SIZES)}")
        for kind_p, lines in (("lo", solid), ("hi", dashed)):
            lines.sort(key=lambda c: rx.line(c)[1], reverse=True)    # y falls with flow: steepest last
            for size, c in zip(SIZES, lines):
                pr = 20 if kind_p == "lo" else P2[size]
                cc, m = rx.line(c)
                lo_n, hi_n = to_n(c[0][0]), to_n(c[-1][0])
                straight = max(abs(cc + m * x - y) for x, y in c)
                for n in range(int(-(-lo_n // 100) * 100), int(hi_n) + 1, 100):
                    y = interp_y(c, px(n))
                    if y is not None:
                        rows.append((size, "flow", pr, n, round(to_q(y), 3)))
                rows.append((size, "flow_ends", pr, round(lo_n, 1), round(to_q(c[0][1]), 3)))
                rows.append((size, "flow_ends", pr, round(hi_n, 1), round(to_q(c[-1][1]), 3)))
                log(f"  flow {size} at {pr} bar: {lo_n:.0f} to {hi_n:.0f} r/min, polyline, largest departure from a "
                    f"straight line {straight:.2f} pt")
        for pg, sizes in POWER_PAGES.items():
            svg = page_svg(pdf, pg, tmp)
            paths = rx.strokes(svg)
            ws = rx.words(pdf, pg, tmp)
            frs = [f for f in plot_frames(paths) if f[1] - f[0] < PERF_MAX_WIDTH]
            if len(frs) != len(sizes):
                raise SystemExit(f"page {pg}: {len(frs)} power plot frames, expected {len(sizes)}")
            for size, f in zip(sizes, frs):
                to_n, to_p, top, step, nv, nh, mn, mv = axes(ws, svg, f, f"{NAME} {size}")
                px = rx.inverse(to_n)
                cur = [c for c in curves(paths, f, False) if c[0][1] - c[-1][1] > 0.08 * (f[2] - f[3])]
                if len(cur) != len(PRESS[size]):
                    raise SystemExit(f"{NAME} {size}: {len(cur)} power curves, expected {len(PRESS[size])}")
                xm = min(c[-1][0] for c in cur)
                cur.sort(key=lambda c: interp_y(c, xm))                # smallest y = most power = highest p
                log(f"  {NAME} {size}: frame x {f[0]:.1f}-{f[1]:.1f}; power 0 to {top:.0f} kW; grid {nv} vertical "
                    f"(largest speed miss {mn:.1f} r/min), {nh} horizontal (largest miss {mv:.3f} kW); {len(cur)} "
                    f"curves, top one {to_n(cur[0][0][0]):.0f} to {to_n(cur[0][-1][0]):.0f} r/min")
                for pr, c in zip(PRESS[size], cur):
                    for n, v in rx.sample(c, px, to_p, to_n(c[0][0]), to_n(c[-1][0])):
                        rows.append((size, "power", pr, n, round(v, 3)))
    return rows


def fetch(pdf=None):
    if pdf is None:
        cache = os.path.expanduser("~/.cache/heavy-hydraulics-rexroth")
        os.makedirs(cache, exist_ok=True)
        pdf = os.path.join(cache, "rexroth_azpf_RE10089_2021-11-24.pdf")
        if not os.path.exists(pdf):
            req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r, open(pdf, "wb") as fh:
                fh.write(r.read())
    with open(pdf, "rb") as fh:
        h = hashlib.sha256(fh.read()).hexdigest()
    return pdf, h


def main(pdf=None):
    pdf, h = fetch(pdf)
    print(f"source sha256 {h} ({'matches' if h == SHA256 else 'DIFFERS from'} the copy read for 7a)")
    rows = read(pdf)
    with open(OUT, "w", newline="") as fh:
        fh.write("# Bosch Rexroth AZPF external gear pumps, data sheet RE 10089/2021-11-24, pp. 9 and 18 to 20, read "
                 "from the PDF's vector paths by digitise_rexroth_azpf.py.\n# 32 mm2/s at 50 C. kind: flow (L/min, at "
                 "20 bar and at the size's maximum intermittent pressure p2 as the power charts label it), flow_ends "
                 "(the drawn line's end points), power (kW drive power). size = nominal size (cm3/r).\n")
        w = csv.writer(fh)
        w.writerow(["size", "kind", "pressure_bar", "speed_rpm", "value"])
        w.writerows(rows)
    n = {}
    for r in rows:
        n[(r[0], r[1])] = n.get((r[0], r[1]), 0) + 1
    print(f"wrote {OUT}: {len(rows)} rows")
    for size in SIZES:
        print(f"  {NAME} {size}: " + ", ".join(f"{kd} {n.get((size, kd), 0)}" for kd in ("flow", "power")))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
