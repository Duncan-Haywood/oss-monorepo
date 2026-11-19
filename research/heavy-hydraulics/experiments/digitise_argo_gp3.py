"""Milestone 7za: read the Argo-Hytos GP3 gear-pump input-power lines out of its datasheet and write
data/argo_gp3_curves.csv (same schema as data/casappa_kp30_curves.csv, so measured.gear_pump_point reads it).

Source: ARGO-HYTOS, "Gear Pump - High Performance Version GP3", datasheet GP3_8001_1en_11/2015 (PDF created
2017-09-27), copy served by a distributor at https://hydraulicsonline.com/wp-content/uploads/2020/04/
Datasheet_GP3_ha8001_EN.pdf (fetched 2026-11-19, sha256 05289a72...0ae4; Argo-Hytos's own site serves only the
2024 edition, 22.5 to 60 ccm, which this container could not fetch). Page 1: the technical-data table
(displacement, nominal flow at 1500 r/min and the maximum continuous pressure p2n, maximum flow at n_max and
p2max, mechanical efficiency 85%). Pages 3 and 4: "Characteristics measured at v = 32 mm2/s"; per size, input
power P (kW, solid) and torque M (Nm, dashed) against speed, one straight line per pressure from n_min to n_max.
The digitised numbers are facts read from a manufacturer's published lines, credited here and in the README.

The datasheet draws NO flow curves. The two flow lines the shared schema needs (at 20 bar and at p2n) are built
from the page-1 table as Q(p, n) = V n / 1000 - L p, with L = (V * 1.5 - Q_n) / p2n from the nominal flow (leak
proportional to pressure and independent of speed, the same leakage shape gear_pump_point assumes between its
two drawn lines). This is stated as a construction, not a reading; `check()` compares it with the table's
maximum flow at (n_max, p2max), a point it was not fitted to.

Each chart is vector art: a grey grid path whose vertical lines fall every 500 r/min from 0 plus two at n_min
and n_max (checked), grey horizontal grid lines, one black solid path of 0.35-0.361 pt whose sub-paths are the
power lines, and one dashed path (torque, not read). Speed comes from the vertical grid, power from the
horizontal grid and the axis tick labels (pdftotext -bbox), which also give each chart's pressures: the
"<p> bar" words inside the frame. Lines are matched to pressures by height at n_max.

Usage: python3 digitise_argo_gp3.py [datasheet.pdf]   (default: fetch into ~/.cache/heavy-hydraulics-argo)
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
URL = "https://hydraulicsonline.com/wp-content/uploads/2020/04/Datasheet_GP3_ha8001_EN.pdf"
SHA256 = "05289a722f0d1c1f9d4ba2eef526050e0602f60b3c64dc70468f19bf9cc40ae4"
OUT = os.path.join(HERE, "data", "argo_gp3_curves.csv")
NUM = r"-?\d*\.?\d+(?:[eE][-+]?\d+)?"

# page-1 table: nominal size -> (V cm3/r, n_min, n_max r/min, p2n bar, p2max bar, Q_n L/min at 1500 r/min and p2n,
# Q_max L/min at n_max and p2max)
# The table prints n_min and n_max once per group of columns ("400 ... 350"; "3200 3000 2500 2000 1800"); the
# groups are assigned here so that every Q_max is reachable (Q_max <= V n_max), and the charts' own line spans
# (read, printed by check()) are what the model uses.
TABLE = {
    10: (10.14, 400, 3200, 270, 290, 14.1, 31.9),
    13: (13.76, 400, 3200, 290, 310, 19.2, 43.4),     # nominal size 13,5
    17: (17.39, 350, 3200, 290, 310, 24.2, 54.8),
    22: (22.46, 350, 3200, 290, 310, 31.3, 70.8),     # nominal size 22,5
    27: (27.53, 350, 3200, 290, 310, 38.4, 86.8),
    34: (34.05, 350, 3000, 290, 310, 47.5, 100.6),
    43: (43.47, 350, 3000, 280, 300, 60.6, 119.9),
    51: (51.44, 350, 3000, 270, 290, 71.8, 131.7),
    61: (61.59, 350, 2500, 250, 270, 85.9, 145.6),
    71: (71.01, 350, 2500, 230, 250, 99.0, 153.9),
    82: (81.87, 350, 2000, 200, 220, 114.2, 161.3),
    100: (99.98, 350, 1800, 180, 200, 139.5, 177.3),
}
SIZES = tuple(TABLE)
ETA_M = 0.85                                         # page 1, "Mechanical efficiency 85 %"
# charts in reading order: (PDF page, size); the frame of each is found from its grid path
CHARTS = [(3, 10), (3, 13), (3, 17), (3, 22), (3, 27), (3, 34), (3, 43), (3, 51), (3, 61),
          (4, 71), (4, 82), (4, 100)]


def fetch(cache):
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, "Datasheet_GP3_ha8001_EN.pdf")
    if not os.path.exists(path):
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as fh:
            fh.write(r.read())
    with open(path, "rb") as fh:
        if hashlib.sha256(fh.read()).hexdigest() != SHA256:
            raise SystemExit(f"{path}: not the datasheet read on 2026-11-19 (sha256 differs)")
    return path


def paths(svg):
    """Stroked paths of a pdftocairo SVG page: dicts with width, dashed, grey and sub-paths in page points."""
    body = svg[svg.find("</defs>"):]
    out = []
    for a in re.findall(r"<path ([^>]*)/>", body):
        sw = re.search(r'stroke-width="([^"]*)"', a)
        if not sw:
            continue
        m = [float(v) for v in re.search(r'transform="matrix\(([^)]*)\)"', a).group(1).split(",")]
        col = re.search(r'stroke="([^"]*)"', a)
        toks = re.findall(r"[MLCZ]|" + NUM, re.search(r' d="([^"]*)"', a).group(1))
        subs, pts, i = [], [], 0
        while i < len(toks):
            if toks[i] == "M":
                if pts:
                    subs.append(pts)
                pts, i = [(float(toks[i + 1]), float(toks[i + 2]))], i + 3
            elif toks[i] == "L":
                pts.append((float(toks[i + 1]), float(toks[i + 2])))
                i += 3
            elif toks[i] == "C":
                raise ValueError("curved path: the GP3 lines were expected straight")
            else:
                i += 1
        if pts:
            subs.append(pts)
        out.append({"sw": float(sw.group(1)), "dash": "stroke-dasharray" in a,
                    "grey": bool(col and "56.86" in col.group(1)),
                    "subs": [[(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]) for x, y in sp]
                             for sp in subs]})
    return out


def words(pdf, page):
    html = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), pdf, "-"],
                          check=True, capture_output=True, text=True).stdout
    return [(float(a), float(b), float(c), float(d), t) for a, b, c, d, t in
            re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<', html)]


def charts_on_page(pdf, page, tmp):
    svgp = os.path.join(tmp, f"p{page}.svg")
    subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), pdf, svgp], check=True)
    with open(svgp) as fh:
        ps = paths(fh.read())
    wd = words(pdf, page)
    vert = [s for p in ps if p["grey"] and p["sw"] < 0.2 for s in p["subs"]
            if abs(s[0][0] - s[-1][0]) < 0.01 and abs(s[0][1] - s[-1][1]) > 100]
    horiz = [s for p in ps if p["grey"] and p["sw"] < 0.2 for s in p["subs"]
             if abs(s[0][1] - s[-1][1]) < 0.01 and abs(s[0][0] - s[-1][0]) > 50]
    power = [p for p in ps if 0.3 < p["sw"] < 0.4 and not p["dash"] and not p["grey"]]
    out = []
    for pw in power:
        x0 = min(min(x for x, _ in s) for s in pw["subs"])
        yb = max(max(y for _, y in s) for s in pw["subs"])
        # this chart's verticals: those within 160 pt to the right of the frame's left edge and spanning yb
        vs = sorted({round(s[0][0], 2) for s in vert if x0 - 25 < s[0][0] < x0 + 140
                     and min(y for _, y in s) - 1 < yb < max(y for _, y in s) + 3})
        edge = [s for s in vert if abs(s[0][0] - vs[0]) < 0.01 and min(y for _, y in s) - 1 < yb]
        lo, hi = min(min(y for _, y in s) for s in edge), max(max(y for _, y in s) for s in edge)
        hs = sorted({round(s[0][1], 2) for s in horiz if abs(min(x for x, _ in s) - vs[0]) < 1.5
                     and lo - 1 < s[0][1] < hi + 1})
        out.append({"lines": pw["subs"], "vx": vs, "hy": hs, "x0": vs[0], "words": wd})
    return out


def read(pdf):
    rows, info = [], {}
    with tempfile.TemporaryDirectory() as tmp:
        found = {3: charts_on_page(pdf, 3, tmp), 4: charts_on_page(pdf, 4, tmp)}
    for page in (3, 4):
        found[page].sort(key=lambda c: (round(min(c["hy"]) / 50), c["x0"]))
    order = found[3] + found[4]
    if len(order) != len(CHARTS):
        raise ValueError(f"found {len(order)} charts, expected {len(CHARTS)}")
    for (page, size), ch in zip(CHARTS, order):
        V, nmin, nmax, p2n, p2max, qn, qmax = TABLE[size]
        hy, vx = ch["hy"], ch["vx"]
        ybot, ytop = max(hy), min(hy)
        # vertical grid: main lines every 500 r/min from the frame's left edge plus n_min and n_max
        xs0 = vx[0]
        step = max(b - a for a, b in zip(vx, vx[1:]))           # a 500 r/min gap (the extras split gaps)
        pt_per_rpm = step / 500.0
        # power axis: tick labels (numbers left of the frame) give kW per point; the grid gives its spacing
        ticks = [(0.5 * (w[1] + w[3]), float(w[4])) for w in ch["words"]
                 if xs0 - 16 < w[2] <= xs0 + 0.5 and ytop - 8 < w[1] and w[3] < ybot + 8
                 and re.fullmatch(r"\d+", w[4])]
        ticks.sort()
        top_label = min(ticks)[1]
        body = [t for t in ticks if t[1] != top_label]
        n = len(body)
        mx = sum(t[0] for t in body) / n
        my = sum(t[1] for t in body) / n
        slope = sum((t[0] - mx) * (t[1] - my) for t in body) / sum((t[0] - mx) ** 2 for t in body)
        gap = (ybot - ytop) / (len(hy) - 1)
        kw_per_grid = -slope * gap
        nice = min((1, 2, 5, 10), key=lambda v: abs(v - kw_per_grid))
        if abs(kw_per_grid - nice) > 0.06 * nice:
            raise ValueError(f"GP3 {size}: grid step {kw_per_grid:.3f} kW is not a round number")
        ptop = nice * (len(hy) - 1)
        # pressures: "<p> bar" words inside the frame (horizontal labels), one per line
        x1 = max(vx)
        inner = [w for w in ch["words"] if xs0 < w[0] < x1 + 5 and ytop < w[1] < ybot]
        press = sorted({int(a[4]) for a, b in zip(inner, inner[1:]) if re.fullmatch(r"\d{2,3}", a[4])
                        and b[4] == "bar" and abs(a[1] - b[1]) < 2})
        # the top line's label is set along the line (rotated text, split by pdftotext); on the charts whose
        # top label is horizontal it is p2n, and the rotated fragments read "27 0b" / "29 0b" = p2n
        if p2n not in press:
            press = sorted(press + [p2n])
        if max(press) != p2n:
            raise ValueError(f"GP3 {size}: highest labelled pressure {max(press)} is not p2n {p2n}")
        if len(press) != len(ch["lines"]):
            raise ValueError(f"GP3 {size}: {len(press)} pressure labels {press} for {len(ch['lines'])} lines")

        def to_n(x):
            return (x - xs0) / pt_per_rpm

        def to_p(y):
            return (ybot - y) / (ybot - ytop) * ptop

        lines = []
        for s in ch["lines"]:
            (xa, ya), (xb, yb) = sorted([s[0], s[-1]])
            lines.append(((to_n(xa), to_p(ya)), (to_n(xb), to_p(yb))))
        lines.sort(key=lambda ln: ln[1][1])                          # by power at the right end
        info[size] = {"grid_kw": nice, "ptop": ptop, "nh": len(hy) - 1, "press": press, "lines": {}}
        for pr, ((na, pa), (nb, pb)) in zip(press, lines):
            info[size]["lines"][pr] = (na, pa, nb, pb)
            k = (pb - pa) / (nb - na)
            for sp in range(int(-(-na // 100)) * 100, int(nb) + 1, 100):
                rows.append((size, "power", pr, sp, round(pa + k * (sp - na), 4)))
        # flow lines built from the table (no flow curves drawn)
        L = (V * 1.5 - qn) / p2n
        for pr in (20, p2n):
            for sp in range(300, max(nmax, 3200) + 1, 100):
                rows.append((size, "flow", pr, sp, round(V * sp / 1000.0 - L * pr, 4)))
        info[size]["leak"] = L
    return rows, info


def check(info):
    """Lines printed for the results file: the axis read, n range, and the flow construction against Q_max."""
    out = []
    for s, d in info.items():
        V, nmin, nmax, p2n, p2max, qn, qmax = TABLE[s]
        na = min(v[0] for v in d["lines"].values())
        nb = max(v[2] for v in d["lines"].values())
        qm = V * nmax / 1000.0 - d["leak"] * p2max
        out.append(f"GP3 {s:3d}: axis {d['nh']} x {d['grid_kw']} = {d['ptop']} kW; pressures {d['press']}; lines "
                   f"from {na:.0f} to {nb:.0f} r/min (table {nmin} to {nmax}); leak {d['leak']:.4f} L/min/bar; "
                   f"Q(n_max, p2max) built {qm:.1f} vs table {qmax:.1f} ({100 * (qm / qmax - 1):+.1f}%)")
    return out


def write(rows):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="") as fh:
        fh.write("# ARGO-HYTOS GP3 datasheet GP3_8001_1en_11/2015, pages 1, 3 and 4, read from the PDF's vector "
                 "paths by digitise_argo_gp3.py.\n")
        fh.write("# 32 mm2/s. kind: power (kW input, drawn lines); flow (L/min, NOT drawn: built from the page-1 "
                 "table as V n/1000 - L p, at 20 bar and p2n). size = nominal size (13 = 13,5; 22 = 22,5).\n")
        w = csv.writer(fh)
        w.writerow(["size", "kind", "pressure_bar", "speed_rpm", "value"])
        w.writerows(rows)


def main():
    pdf = sys.argv[1] if len(sys.argv) > 1 else fetch(os.path.expanduser("~/.cache/heavy-hydraulics-argo"))
    rows, info = read(pdf)
    write(rows)
    print("\n".join(check(info)))
    print(f"wrote {len(rows)} rows to {os.path.relpath(OUT, HERE)}")


if __name__ == "__main__":
    main()
