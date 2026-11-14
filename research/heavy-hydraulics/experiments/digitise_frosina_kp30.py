"""Milestone 6p: read the bench-measured torque and flow of a Casappa KP30 (44 cm3/r) out of Frosina, Senatore
and Rigosi (2017) and write data/frosina2017_kp30_bench.csv.

Source: E. Frosina, A. Senatore, M. Rigosi, "Study of a High-Pressure External Gear Pump with a Computational
Fluid Dynamic Modeling Approach", Energies 10(8):1113, 2017, doi:10.3390/en10081113, CC BY 4.0 (one author at
Casappa S.p.A.). The PDF was fetched from https://pdfs.semanticscholar.org/c46b/0fa82983d1e3a9213e3f09c6fe4f67532909.pdf
(mdpi.com answers 403 at this session's proxy). Table 1: nominal displacement 44 cm3, inlet 0.7 to 3 bar,
continuous pressure 250 bar, 350 to 3000 r/min. Section 3: tested on Casappa's bench at 1000, 1500 and 2500 r/min,
50 and 80 C, 50, 150 and 250 bar; the shaft torque is from a torque meter ("the absorbed torque by the pump
measured by a torque meter"), the model torque is CFD pressure torque without friction.

The figures are raster images, so they are read by pixel, stdlib only (pdfimages writes PPM; nothing decodes PNG):
  Figure 11 (PDF page 11, two images stacked = panels a, b, c at 1000, 1500, 2500 r/min): torque (Nm) against
    delivery pressure, measured as a solid line, model as a dotted line, each through points at 50, 150, 250 bar.
    Axes from the light-grey gridlines (x 70..230 bar step 20, y 50..170 Nm step 20), fitted by least squares.
    Each series is read as two straight segments (Excel lines between the three points): in every plot column
    away from gridlines and markers the dark runs are found; columns with exactly two runs give the upper
    (measured) and lower (model) line; each segment is a least-squares line, and the value at 150 bar is the
    mean of the two segments' ends (their difference is printed as a reading check).
  Figure 12 (PDF page 11): measured minus model torque against pressure, three series by grey level
    (1000 r/min light, 1500 mid, 2500 black). Marker centres at 50, 150, 250 bar from the densest 15x15 box
    of each grey class near the x gridline.
  Figure 13 (PDF page 12, two images stacked): delivery pressure against "normalized flow-rate" at 50 C (left)
    and 80 C (right); the measured series are black. At each pressure gridline (50, 150, 250 bar) the black
    pixels of each line are averaged over +-3 rows. Only the 50 C panel is read: on the 80 C panel the grey model
    squares cover the black measured markers at 50 bar (and the 2500 r/min one at 250 bar), so no black pixel is
    left to read there.

Usage: python3 digitise_frosina_kp30.py [paper.pdf]   (default: fetch into ~/.cache/heavy-hydraulics-frosina)
Needs pdfimages (poppler-utils) and the standard library.
"""
import csv
import glob
import os
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://pdfs.semanticscholar.org/c46b/0fa82983d1e3a9213e3f09c6fe4f67532909.pdf"
OUT = os.path.join(HERE, "data", "frosina2017_kp30_bench.csv")
PRESSURES = (50.0, 150.0, 250.0)


def read_ppm(path):
    """Grey levels (0..255) of a binary PPM/PGM as (w, h, list)."""
    d = open(path, "rb").read()
    toks, i = [], 0
    while len(toks) < 4:
        while d[i:i + 1].isspace():
            i += 1
        if d[i:i + 1] == b"#":
            while d[i:i + 1] != b"\n":
                i += 1
            continue
        j = i
        while not d[j:j + 1].isspace():
            j += 1
        toks.append(d[i:j])
        i = j
    i += 1
    magic, w, h = toks[0], int(toks[1]), int(toks[2])
    data = d[i:]
    if magic == b"P6":
        g = [(data[3 * k] + data[3 * k + 1] + data[3 * k + 2]) // 3 for k in range(w * h)]
    else:
        g = list(data[:w * h])
    return w, h, g


def stack(paths):
    w, h, g = read_ppm(paths[0])
    for p in paths[1:]:
        w2, h2, g2 = read_ppm(p)
        assert w2 == w
        h += h2
        g = g + g2
    return w, h, g


class Img:
    def __init__(self, w, h, g):
        self.w, self.h, self.g = w, h, g

    def __call__(self, x, y):
        return self.g[y * self.w + x]


def lines(img, axis, lo, hi, band, min_count):
    """Centres of gridlines: rows (axis='y') or columns ('x') with at least min_count pixels in grey band."""
    found = []
    n = img.h if axis == "y" else img.w
    for k in range(n):
        if axis == "y":
            c = sum(1 for x in range(lo, hi) if band[0] <= img(x, k) <= band[1])
        else:
            c = sum(1 for y in range(lo, hi) if band[0] <= img(k, y) <= band[1])
        if c >= min_count:
            found.append(k)
    merged = []
    for k in found:
        if merged and k - merged[-1][-1] <= 2:
            merged[-1].append(k)
        else:
            merged.append([k])
    return [sum(m) / len(m) for m in merged]


def fit(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    a = my - b * mx
    res = max(abs(a + b * x - y) for x, y in zip(xs, ys))
    return a, b, res


def evenly_spaced_runs(centres, step, tol, count):
    """Chains of at least `count` centres, each the next one's predecessor by step +- tol (other centres, such
    as a legend box edge between two gridlines, are skipped); chains do not share centres."""
    runs, used = [], set()
    for i, c in enumerate(centres):
        if c in used:
            continue
        cur = [c]
        for d in centres[i + 1:]:
            if abs(d - cur[-1] - step) <= tol:
                cur.append(d)
        if len(cur) >= count:
            runs.append(cur)
            used.update(cur)
    return runs


def figure11(img):
    """Measured and model torque at 50/150/250 bar for the three panels (1000, 1500, 2500 r/min)."""
    xcols = lines(img, "x", 0, img.h, (228, 243), 300)
    xg = [c for c in xcols if 200 < c < 950]
    xg = evenly_spaced_runs(xg, 82.7, 3.0, 9)[0][:9]               # 70, 90, ..., 230 bar
    bx = [70.0 + 20.0 * k for k in range(9)]
    ax, bxs, rx = fit(bx, xg)
    rows = lines(img, "y", 200, 950, (228, 243), 500)
    panels = evenly_spaced_runs(rows, 63.2, 3.0, 7)
    assert len(panels) == 3, panels
    out, checks = {}, []
    for speed, run in zip((1000, 1500, 2500), panels):
        run = run[:7]                                              # 170, 150, ..., 50 Nm
        ay, by, ry = fit([170.0 - 20.0 * k for k in range(7)], run)
        checks.append((speed, rx, ry))
        top, bot = int(ay + by * 195.0), int(ay + by * 31.5)       # plot rows (y grows downward, by < 0)

        def xpix(p):
            return ax + bxs * p

        def val(y):
            return (y - ay) / by

        segs = {}
        for name in ("measured", "model"):
            segs[name] = {0: ([], []), 1: ([], [])}
        for x in range(int(xpix(52.0)), int(xpix(248.0))):
            p = (x - ax) / bxs
            if any(abs(x - c) <= 3 for c in xg) or any(abs(p - q) <= 6.0 for q in PRESSURES):
                continue
            runs, cur = [], []
            for y in range(min(top, bot), max(top, bot)):
                if img(x, y) < 228:
                    cur.append(y)
                elif cur:
                    runs.append(cur)
                    cur = []
            if cur:
                runs.append(cur)
            if len(runs) != 2:
                continue
            k = 0 if p < 150.0 else 1
            for name, r in zip(("measured", "model"), runs):     # upper run (smaller y) is the solid line
                segs[name][k][0].append(p)
                segs[name][k][1].append(val(sum(r) / len(r)))
        for name in ("measured", "model"):
            (p0, t0), (p1, t1) = segs[name][0], segs[name][1]
            a0, b0, r0 = fit(p0, t0)
            a1, b1, r1 = fit(p1, t1)
            l150, r150 = a0 + b0 * 150.0, a1 + b1 * 150.0
            out[(speed, name)] = {50.0: a0 + b0 * 50.0, 150.0: 0.5 * (l150 + r150), 250.0: a1 + b1 * 250.0,
                                  "join": r150 - l150, "cols": (len(p0), len(p1)), "res": max(r0, r1)}
    return out, checks


def figure12(img):
    """Measured minus model torque at 50/150/250 bar, by grey class."""
    xcols = lines(img, "x", 0, img.h, (200, 245), 250)
    ax, bxs, rx = fit([100.0, 150.0, 200.0, 250.0], xcols[-4:])
    rows = lines(img, "y", 0, img.w, (200, 245), 400)
    run = evenly_spaced_runs(rows, 55.5, 2.0, 8)[0][:8]           # 11, 10, ..., 4 N m
    ay, by, ry = fit([11.0 - k for k in range(8)], run)
    classes = {2500: (0, 80), 1500: (120, 185), 1000: (195, 232)}
    out = {}
    for speed, (lo, hi) in classes.items():
        for p in PRESSURES:
            xc = int(round(ax + bxs * p))
            best = None
            for y0 in range(10, img.h - 100):
                c = sum(1 for y in range(y0, y0 + 15) for x in range(xc - 7, xc + 8)
                        if 0 <= x < img.w and lo <= img(x, y) <= hi)
                if best is None or c > best[0]:
                    best = (c, y0)
            y0 = best[1]
            pts = [(x, y) for y in range(y0 - 4, y0 + 19) for x in range(xc - 12, xc + 13)
                   if 0 <= x < img.w and lo <= img(x, y) <= hi]
            yc = sum(y for _, y in pts) / len(pts)
            out[(speed, p)] = (yc - ay) / by
    return out, (rx, ry)


def figure13(img):
    """Measured normalised flow at 50/150/250 bar, 1500 and 2500 r/min, 50 C."""
    rows = lines(img, "y", 0, img.w, (200, 245), 500)
    run = evenly_spaced_runs(rows, 85.0, 2.0, 5)[0][:5]           # 250, 200, 150, 100, 50 bar
    ay, by, ry = fit([250.0, 200.0, 150.0, 100.0, 50.0], run)
    cols = lines(img, "x", 0, img.h, (200, 245), 250)
    fits = {}
    for temp in (50,):
        cs = [c for c in cols if (c < 800) == (temp == 50) and 50 < c < 1700]
        cs = evenly_spaced_runs(cs, 149.0, 4.5, 5)[0][:5]          # frame edge 0.5, then 0.6 .. 0.9
        fits[temp] = fit([0.5, 0.6, 0.7, 0.8, 0.9], cs)
    out = {}
    for temp, (ax, bxs, rx) in fits.items():
        x_lo, x_hi = int(ax + bxs * 0.52), int(ax + bxs * 0.995 + 6)
        for p in PRESSURES:
            yc = int(round(ay + by * p))
            xs = [x for y in range(yc - 3, yc + 4) for x in range(x_lo, x_hi) if img(x, y) < 120]
            groups = []
            for x in sorted(xs):
                if groups and x - groups[-1][-1] <= 25:
                    groups[-1].append(x)
                else:
                    groups.append([x])
            groups = [gr for gr in groups if len(gr) >= 4]
            assert len(groups) == 2, (temp, p, [(min(gr), max(gr), len(gr)) for gr in groups])
            for speed, gr in zip((1500, 2500), groups):
                out[(temp, speed, p)] = (sum(gr) / len(gr) - ax) / bxs
        fits[temp] = rx
    return out, (ry, fits)


def main(pdf=None):
    if pdf is None:
        cache = os.path.expanduser("~/.cache/heavy-hydraulics-frosina")
        os.makedirs(cache, exist_ok=True)
        pdf = os.path.join(cache, "frosina2017.pdf")
        if not os.path.exists(pdf):
            req = urllib.request.Request(URL, headers={"User-Agent": "research-digitiser"})
            with urllib.request.urlopen(req, timeout=120) as r, open(pdf, "wb") as fh:
                fh.write(r.read())
    tmp = tempfile.mkdtemp()
    subprocess.run(["pdfimages", "-f", "11", "-l", "12", pdf, os.path.join(tmp, "i")], check=True)
    ims = sorted(glob.glob(os.path.join(tmp, "i-*")))
    names = [os.path.basename(p) for p in ims]
    # page 11: figure 11 (two halves), figure 12; page 12 repeats them (overlay), then figure 13 halves, figure 14
    f11 = Img(*stack(ims[0:2]))
    f12 = Img(*read_ppm(ims[2]))
    f13 = Img(*stack(ims[6:8]))
    assert (f11.w, f11.h, f12.w, f12.h, f13.w, f13.h) == (1017, 1991, 906, 559, 1773, 647), names
    t11, c11 = figure11(f11)
    d12, c12 = figure12(f12)
    q13, c13 = figure13(f13)
    rows = []
    for speed in (1000, 1500, 2500):
        for name in ("measured", "model"):
            r = t11[(speed, name)]
            for p in PRESSURES:
                rows.append(("fig11_torque_Nm", name, 50, speed, p, round(r[p], 3)))
    for (speed, p), v in sorted(d12.items()):
        rows.append(("fig12_delta_torque_Nm", "measured_minus_model", 50, speed, p, round(v, 3)))
    for (temp, speed, p), v in sorted(q13.items()):
        rows.append(("fig13_normalised_flow", "measured", temp, speed, p, round(v, 4)))
    with open(OUT, "w", newline="") as fh:
        fh.write("# Frosina, Senatore, Rigosi (2017) Energies 10(8):1113, doi:10.3390/en10081113, CC BY 4.0: Casappa KP30, "
                 "44 cm3/r, Casappa test bench; read by pixel from Figures 11 to 13 by digitise_frosina_kp30.py.\n")
        fh.write("# Figure 11 states no oil temperature (Figure 13 is at 50 and 80 C; 50 is written here). "
                 "Figure 13's flow is 'normalized' with no stated base.\n")
        w = csv.writer(fh)
        w.writerow(["quantity", "series", "oil_C", "speed_rpm", "pressure_bar", "value"])
        w.writerows(rows)
    print("figure 11 axis fits: largest gridline residual (px) per panel:",
          ", ".join(f"{s}: x {rx:.2f}, y {ry:.2f}" for s, rx, ry in c11))
    for speed in (1000, 1500, 2500):
        for name in ("measured", "model"):
            r = t11[(speed, name)]
            print(f"  {speed} r/min {name:8s} 50 {r[50.0]:7.2f}  150 {r[150.0]:7.2f}  250 {r[250.0]:7.2f} Nm;"
                  f" segment join at 150 bar {r['join']:+.2f} Nm; columns {r['cols']}; worst point off its segment"
                  f" {r['res']:.2f} Nm")
    print(f"figure 12 axis fit residuals (px): x {c12[0]:.2f}, y {c12[1]:.2f}")
    for (speed, p), v in sorted(d12.items()):
        print(f"  {speed} r/min {p:.0f} bar: {v:.2f} Nm")
    print(f"figure 13 axis fit residuals (px): y {c13[0]:.2f}, x " +
          ", ".join(f"{t} C {r:.2f}" for t, r in c13[1].items()))
    for (temp, speed, p), v in sorted(q13.items()):
        print(f"  {temp} C {speed} r/min {p:.0f} bar: {v:.4f}")
    print("wrote", os.path.relpath(OUT, HERE))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
