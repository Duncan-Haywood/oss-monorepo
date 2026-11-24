"""An IfcSectionedSolidHorizontal's volume by an integral independent of alignment.mjs.

    python3 eval/loft-integral.py model.ifc

For every sectioned solid on a gradient curve: Simpson's rule on each pair of
stations (the cross-section's area at both ends and at the middle, its points
interpolated linearly as the loft does), times sqrt(1 + g^2) with the grade g
taken from the file's semantic IfcAlignmentVerticalSegment rows (constant
gradient or parabola), not from the geometric curve, and times (1 - y k) for
plan curvature (Pappus: a section whose centroid sits y to the left of the
alignment, profile x, sweeps 1 - y k as much on a curve of curvature k, left
turns positive), k from the semantic IfcAlignmentHorizontalSegment rows (line
0, arc 1/R, clothoid linear in distance between its end curvatures; IFC's
negative radius turns right). Prints each solid's integral both ways; compare
with the takeoff's volume (node cli.mjs model.ifc --rows).
Plain Python, no dependencies; reads the STEP text directly.
"""
import math
import re
import sys

text = open(sys.argv[1], encoding="utf8", errors="replace").read()
E = {int(m.group(1)): m.group(2) for m in re.finditer(r"^#(\d+)=(.*);\s*$", text, re.M)}
refs = lambda s: [int(x) for x in re.findall(r"#(\d+)", s)]


def pts_of(profile):
    curve = E[refs(profile)[-1]]
    p = [tuple(float(v) for v in re.search(r"\(\(([^)]*)\)", E[r]).group(1).split(",")) for r in refs(curve)]
    if len(p) > 1 and p[0] == p[-1]:
        p.pop()
    return p


def area(p):
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2


# semantic vertical: [(x0, L, g0, g1, type)]
vert = []
for v in E.values():
    if v.startswith("IFCALIGNMENTVERTICALSEGMENT("):
        a = v[len("IFCALIGNMENTVERTICALSEGMENT("):-1].split(",")
        x0, L, z0, g0, g1 = (float(a[i]) for i in (2, 3, 4, 5, 6))
        if L > 0:
            vert.append((x0, L, g0, g1, a[8].strip(". )")))


# semantic horizontal, in nesting order: [(start, L, k0, k1)]
horiz = []
for v in E.values():
    if v.startswith("IFCRELNESTS(") and "horizontal" in v.lower():
        for r in refs(v.split(",(")[-1]):
            seg = E.get(r, "")
            if not seg.startswith("IFCALIGNMENTSEGMENT("):
                continue
            d = E[refs(seg)[-1]]
            if not d.startswith("IFCALIGNMENTHORIZONTALSEGMENT("):
                continue
            a = d[len("IFCALIGNMENTHORIZONTALSEGMENT("):-1].split(",")
            r0, r1, L = float(a[4]), float(a[5]), float(a[6])
            kind = a[8].strip(". )")
            k = lambda R: 0.0 if R == 0 else 1 / R
            horiz.append([0, L, k(r0) if kind != "LINE" else 0.0, (k(r1) if kind != "LINE" else 0.0) if kind == "CLOTHOID" else (k(r0) if kind != "LINE" else 0.0)])
start = 0.0
for h in horiz:
    h[0] = start
    start += h[1]


def curvature(x):
    for x0, L, k0, k1 in horiz:
        if x0 - 1e-9 <= x <= x0 + L + 1e-9 and L > 0:
            return k0 + (k1 - k0) * (x - x0) / L
    return 0.0


def centroid_x(p):
    a = c = 0.0
    for i in range(len(p)):
        q, r = p[i], p[(i + 1) % len(p)]
        w = q[0] * r[1] - r[0] * q[1]
        a += w
        c += (q[0] + r[0]) * w
    return c / (3 * a) if a else 0.0


def grade(x):
    for x0, L, g0, g1, kind in vert:
        if x0 - 1e-9 <= x <= x0 + L + 1e-9:
            return g0 + (g1 - g0) * (x - x0) / L if kind == "PARABOLICARC" else g0
    return 0.0


for k, v in sorted(E.items()):
    if not v.startswith("IFCSECTIONEDSOLIDHORIZONTAL("):
        continue
    m = re.match(r"IFCSECTIONEDSOLIDHORIZONTAL\(#(\d+),\(([^)]*)\),\(([^)]*)\)\)", v)
    if not E[int(m.group(1))].startswith("IFCGRADIENTCURVE"):
        continue
    secs = [pts_of(E[r]) for r in refs(m.group(2))]
    st = [float(re.search(r"IFCLENGTHMEASURE\(([^)]*)\)", E[refs(E[r])[0]]).group(1)) for r in refs(m.group(3))]
    vol = curved = 0.0
    for i in range(len(secs) - 1):
        a, b = secs[i], secs[i + 1]
        if len(a) != len(b):
            print(f"#{k}: sections {i} and {i + 1} differ in point count")
            break
        h = st[i + 1] - st[i]
        n = 8  # Simpson on 8 sub-pieces: the grade varies along a parabola
        for j in range(n):
            t0, t1 = j / n, (j + 1) / n
            for t, w in ((t0, 1), ((t0 + t1) / 2, 4), (t1, 1)):
                p = [(a[q][0] + t * (b[q][0] - a[q][0]), a[q][1] + t * (b[q][1] - a[q][1])) for q in range(len(a))]
                g = grade(st[i] + t * h)
                piece = w * area(p) * math.sqrt(1 + g * g) * h / n / 6
                vol += piece
                curved += piece * (1 - centroid_x(p) * curvature(st[i] + t * h))
    print(f"#{k} on #{m.group(1)}: {len(secs)} sections, stations {st[0]:.3f} to {st[-1]:.3f}: {vol:.6f} m3 plan-straight, {curved:.6f} m3 with plan curvature")
