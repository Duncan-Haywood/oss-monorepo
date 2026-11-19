"""Read the computed curves of Figs. 1 to 3 and the measured points of Fig. 1 of Kashiwagi (2022) (milestone 7ze).

    pdftocairo -svg -f 9 -l 9 JSR_66_1_1.pdf p9.svg
    pdftocairo -svg -f 10 -l 10 JSR_66_1_1.pdf p10.svg
    python3 experiments/digitise_kashiwagi2022_curves.py p9.svg p10.svg > experiments/data/kashiwagi2022_curves_fn020.csv

Source: M. Kashiwagi, "Enhanced unified theory with forward-speed effect taken into account in the inner
free-surface condition", Journal of Ship Research 66(1), 1-14, 2022, doi:10.5957/JOSR.04200028; open copy at
https://hdl.handle.net/11094/87663 (PDF pages 9 and 10 = journal pp. 8 and 9). The PDF is not committed (SNAME
copyright). Milestone 7zd's `digitise_kashiwagi2022.py` read the measured heave, pitch and added resistance;
this script reads what that one left out:

* Fig. 1, the measured heave-pitch cross-coupling coefficients of the slender modified Wigley at Fn 0.2 from
  forced-oscillation tests (Kashiwagi et al. 2000): A53, A35 over rho V L and B53, B35 over rho V L sqrt(g/L),
  against KL with K = omega_e^2 / g (the text: tau = Fn sqrt(KL) = 0.25 at KL 1.56).
* Figs. 1 to 3, the paper's four computed curves, as its legend and text name them: "EUT" (enhanced unified
  theory, thin solid), "NSM" (the paper's New Strip Method, thin dotted or dash-dot), "modified EUT" (thick
  solid) and "modified NSM" (thick dashed; "essentially the same as the RST", the rational strip theory). The
  "modified" variants add the linear forward-speed term from the inner free-surface condition.

Solid curves are single polylines in the PDF; their vertices are the points. Dashed and dotted curves are many
two-point strokes; each stroke's midpoint is a point (tick marks on the frame, strokes within 3.2 pt of an
experiment marker, and the legend's sample lines are dropped by position). Axes are calibrated on the gridlines of the same page:
Fig. 1 left column x = 81.85 + 8.09 KL (grid at KL 5..20: 122.3, 162.7, 203.2, 243.6), right column
x = 346.85 + 8.09 KL (387.3 .. 508.6); A53 y = 519.0 - 102.75 A (grid 0 .. 0.8), A35 y = 437.2 - 102.75 A
(grid 0 .. -0.8), B53 y = 578.5 - 144.2 B (grid 0 .. -0.6), B35 y = 679.8 - 164.6 B (grid 0.1 .. 0.6).
Figs. 2 and 3 use 7zd's calibration (frames and grid of page 10).
"""
import re
import sys

STROKE_W = {  # per figure: (thin, thick) stroke widths in pt after the path transform
    "fig1": (0.496, 0.869), "fig2": (0.377, 0.659), "fig3": (0.553, 0.968)}

# panel: (svg, figure, x0_pt, pt per x-unit, y0_pt, pt per y-unit (up), frame box (x0, x1, ytop, ybottom), legend box in data units)
PANELS = {
    "A53": ("p9", "fig1", 81.85, 8.09, 519.0, 102.75, (81.85, 284.1, 416.25, 539.55), (12.0, 25.5, 0.5, 1.0)),
    "A35": ("p9", "fig1", 346.85, 8.09, 437.2, 102.75, (346.85, 549.1, 416.65, 539.95), (11.0, 25.5, -1.0, -0.5)),
    "B53": ("p9", "fig1", 81.85, 8.09, 578.5, 144.2, (81.85, 284.1, 564.08, 679.44), (12.0, 25.5, -0.7, -0.35)),
    "B35": ("p9", "fig1", 346.85, 8.09, 679.8, 164.6, (346.85, 549.1, 564.6, 679.8), (11.0, 25.5, 0.25, 0.62)),
    "heave": ("p10", "fig2", 249.0, (391.26 - 249.0) / 3, 187.82, (187.82 - 71.84) / 2, (249.0, 391.26, 71.84, 187.82), (1.15, 3.1, 0.0, 0.92)),
    "pitch": ("p10", "fig2", 416.69, (558.95 - 416.69) / 3, 188.22, (188.22 - 72.25) / 2, (416.69, 558.95, 72.25, 188.22), (1.2, 3.1, 0.0, 0.92)),
    "raw": ("p10", "fig3", 72.42, (291.97 - 72.42) / 2, 667.45, (667.45 - 477.71) / 15, (72.42, 291.97, 477.71, 667.45), (0.0, 0.8, 4.8, 16.0)),
}


def paths(svg):
    body = open(svg).read().split("</defs>", 1)[1]
    for m in re.finditer(r"<path ([^>]*)/>", body):
        a = m.group(1)
        d = re.search(r' d="([^"]*)"', a).group(1)
        t = re.search(r'transform="matrix\(([^)]*)\)"', a)
        mt = [float(v) for v in t.group(1).split(",")] if t else [1, 0, 0, 1, 0, 0]
        nums = [float(v) for v in re.findall(r"-?\d+\.?\d*(?:e-?\d+)?", d)]
        pts = [(mt[0] * x + mt[2] * y + mt[4], mt[1] * x + mt[3] * y + mt[5]) for x, y in zip(nums[0::2], nums[1::2])]
        if not pts:
            continue
        sw = re.search(r'stroke-width="([^"]*)"', a)
        st = re.search(r'stroke="([^"]*)"', a)
        yield dict(pts=pts, sw=round(float(sw.group(1)) * abs(mt[0]), 3) if sw else None,
                   stroked=bool(st) and st.group(1) != "none", cmds="".join(re.findall("[MLCZ]", d)))


def inside(pts, box, pad=1.5):
    return all(box[0] - pad <= x <= box[1] + pad and box[2] - pad <= y <= box[3] + pad for x, y in pts)


def is_marker(p):
    """Any experiment marker: a small curved outline (circles) or a small closed polygon (triangles)."""
    xs, ys = [q[0] for q in p["pts"]], [q[1] for q in p["pts"]]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    return 2.5 < w < 6.5 and 2.5 < h < 6.5 and ("C" in p["cmds"] or "Z" in p["cmds"])


def panel_points(allpaths, name):
    svg, fig, x0, sx, y0, sy, box, leg = PANELS[name]
    thin, thick = STROKE_W[fig]
    to = lambda p: ((p[0] - x0) / sx, (y0 - p[1]) / sy)
    in_leg = lambda u, v: leg[0] <= u <= leg[1] and leg[2] <= v <= leg[3]
    out = []
    marks = []
    for p in allpaths[svg]:
        if inside(p["pts"], box) and is_marker(p):
            xs, ys = [q[0] for q in p["pts"]], [q[1] for q in p["pts"]]
            marks.append(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2))
    for p in allpaths[svg]:
        if not inside(p["pts"], box, pad=8.0 if len(p["pts"]) > 20 else 1.5):   # a solid curve may overshoot the frame
            continue
        xs, ys = [q[0] for q in p["pts"]], [q[1] for q in p["pts"]]
        if fig == "fig1" and p["stroked"] and p["sw"] == thin and "C" in p["cmds"] and abs(max(xs) - min(xs) - 4.7) < 0.2:
            u, v = to(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2))
            if not in_leg(u, v):
                out.append(("experiment", u, v))
            continue
        if not p["stroked"] or "C" in p["cmds"] or p["sw"] not in (thin, thick):
            continue
        if len(p["pts"]) > 20:                     # a solid curve: one polyline
            series = "EUT" if p["sw"] == thin else "modified EUT"
            out.extend((series, *to(q)) for q in p["pts"])
        elif len(p["pts"]) == 2:                   # one dash or dot of a broken curve
            (ax, ay), (bx, by) = p["pts"]
            if min(ax, bx) - box[0] < 2.5 or box[1] - max(ax, bx) < 2.5 or box[3] - max(ay, by) < 2.5 or min(ay, by) - box[2] < 2.5:
                continue                           # tick mark on the frame
            mx, my = (ax + bx) / 2, (ay + by) / 2
            if any((mx - cx) ** 2 + (my - cy) ** 2 < 3.2 ** 2 for cx, cy in marks):
                continue                           # part of an experiment marker (the circled plus, a dot)
            u, v = to(((ax + bx) / 2, (ay + by) / 2))
            if in_leg(u, v):
                continue
            out.append(("NSM" if p["sw"] == thin else "modified NSM", u, v))
    return out


def main(p9, p10):
    allpaths = {"p9": list(paths(p9)), "p10": list(paths(p10))}
    print("panel,series,x,y")
    for name in PANELS:
        rows = sorted(set((s, round(u, 4), round(v, 4)) for s, u, v in panel_points(allpaths, name)))
        for s, u, v in rows:
            print(f"{name},{s},{u},{v}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
