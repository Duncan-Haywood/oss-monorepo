"""Read the measured points of Figs. 2 and 3 of Kashiwagi (2022) from the PDF's vector markers (milestone 7zd).

    pdftocairo -svg -f 10 -l 10 JSR_66_1_1.pdf p10.svg
    python3 experiments/digitise_kashiwagi2022.py p10.svg > experiments/data/kashiwagi2022_slender_wigley_fn020.csv

Source: M. Kashiwagi, "Enhanced unified theory with forward-speed effect taken into account in the inner
free-surface condition", Journal of Ship Research 66(1), 1-14, 2022, doi:10.5957/JOSR.04200028; open copy at
https://hdl.handle.net/11094/87663 (Osaka University repository, page 10 of that PDF = journal p. 9). The PDF
is not committed (SNAME copyright); the measured values are facts, read here so anyone can re-derive them.

The figures are vector drawings, so each experiment marker is a path whose bounding-box centre is the data
point to the drawing's precision (far finer than reading a raster). Axes are calibrated on the plot frames and
the dashed grid of the same page: Fig. 3 x 72.42-291.97 pt for lambda/L 0-2, y 667.45-477.71 pt for 0-15;
Fig. 2 heave x 249.0-391.26 pt for 0-3, y 187.82-71.84 pt for 0-2; pitch x 416.69-558.95, y 188.22-72.25.
Legend markers (inside each legend box) are dropped. Marker series in Fig. 3, as its legend names them:
  filled circle  dynamometer, Amax 2.5 cm
  open circle    dynamometer, Amax 1.0 cm
  triangle       with measured wave, Amax 1.0 cm
  circled plus   with superposed wave, Amax 1.0 cm
Fig. 3's caption reads "in the motion-free condition", but the text (p. 9) says the added resistance is computed
"with these complex motion amplitudes" and the measured peak sits at the heave/pitch resonance (lambda/L about
1.1), so the model was free to heave and pitch; the caption wording is taken as a typesetting slip.
"""
import re
import sys


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
        fill = re.search(r'fill="([^"]*)"', a)
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        yield dict(x0=min(xs), x1=max(xs), y0=min(ys), y1=max(ys), cmds="".join(re.findall("[MLCZ]", d)),
                   fill=fill.group(1) if fill else "")


def classify(p):
    w, h, f, c = p["x1"] - p["x0"], p["y1"] - p["y0"], p["fill"], p["cmds"]
    white, dark = f.startswith("rgb(100"), f.startswith("rgb(13")
    if abs(w - 3.9) < 0.15 and abs(h - 3.9) < 0.15 and white and c.startswith("MCCCC") and "Z" not in c:
        return "dyn_1p0cm"
    if abs(w - 3.6) < 0.15 and abs(h - 3.6) < 0.15 and dark and "Z" not in c:
        return "dyn_2p5cm"
    if abs(w - 4.8) < 0.15 and 4.0 < h < 4.3 and white:
        return "measured_wave_1p0cm"
    if abs(w - 5.5) < 0.15 and abs(h - 5.5) < 0.15:
        return "superposed_wave_1p0cm"
    return None


def main(svg):
    ps = list(paths(svg))
    print("figure,series,lambda_over_L,value,quantity")
    rows = []
    x0, x1, y0, y1 = 72.42, 291.97, 667.45, 477.71
    for p in ps:
        if not (70 < p["x0"] and p["x1"] < 295 and 470 < p["y0"] and p["y1"] < 670):
            continue
        if p["x0"] < 178 and p["y1"] < 522:                  # legend box
            continue
        s = classify(p)
        if s:
            cx, cy = 0.5 * (p["x0"] + p["x1"]), 0.5 * (p["y0"] + p["y1"])
            rows.append(("fig3", s, 2.0 * (cx - x0) / (x1 - x0), 15.0 * (y0 - cy) / (y0 - y1), "R_aw/(rho g zeta_a^2 B^2/L)"))
    for name, (xa, xb, yt, yb), legend in (("heave", (249.0, 391.26, 71.84, 187.82), (317, 387, 147, 182)),
                                           ("pitch", (416.69, 558.95, 72.25, 188.22), (485, 555, 147, 182))):
        for p in ps:
            w, h = p["x1"] - p["x0"], p["y1"] - p["y0"]
            if not (xa < p["x0"] and p["x1"] < xb + 2 and yt < p["y0"] and p["y1"] < yb):
                continue
            if abs(w - h) < 0.1 and 2.5 < w < 4.5 and p["fill"].startswith("rgb(100") and p["cmds"].startswith("MCCCC"):
                cx, cy = 0.5 * (p["x0"] + p["x1"]), 0.5 * (p["y0"] + p["y1"])
                if legend[0] < cx < legend[1] and legend[2] < cy < legend[3]:
                    continue
                q = "heave/zeta_a" if name == "heave" else "pitch/(k zeta_a)"
                rows.append(("fig2", name, 3.0 * (cx - xa) / (xb - xa), 2.0 * (yb - cy) / (yb - yt), q))
    for r in sorted(rows, key=lambda r: (r[0], r[1], r[2], r[3])):
        print(f"{r[0]},{r[1]},{r[2]:.4f},{r[3]:.4f},{r[4]}")


if __name__ == "__main__":
    main(sys.argv[1])
