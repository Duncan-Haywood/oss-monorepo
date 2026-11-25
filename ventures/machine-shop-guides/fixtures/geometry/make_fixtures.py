"""Build test parts with OpenCascade (OCP) and record the kernel's own answers.

Run: PYTHONPATH=<dir with cadquery-ocp> python3 make_fixtures.py <outdir> [--random N]

For each part it writes <name>.step (AP214), <name>.stl (binary, fine mesh) and
one line in truth.json: the exact bounding box (BRepBndLib.AddOptimal, no
shape tolerance), the volume (GProp), and for each world axis the radial
envelope measured on a 0.002 mm mesh (a lower bound on the true value).
Lengths in truth.json are millimetres even when the STEP file is in inches.
Not part of the page: it only makes the files the tests compare against.
"""
import json, math, random, sys, os

from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeSphere, BRepPrimAPI_MakeRevol
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet, BRepFilletAPI_MakeChamfer
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform, BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire, BRepBuilderAPI_MakeFace
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.StlAPI import StlAPI_Writer
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static
from OCP.gp import gp_Pnt, gp_Ax2, gp_Ax1, gp_Dir, gp_Trsf, gp_Vec
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE
from OCP.TopoDS import TopoDS
from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.TopLoc import TopLoc_Location
from OCP.Geom import Geom_BSplineCurve
from OCP.OCP.collections import Array1_gp_Pnt as TColgp_Array1OfPnt, Array1_double as TColStd_Array1OfReal, Array1_int as TColStd_Array1OfInteger


def box(x, y, z, dx, dy, dz):
    return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()


def cyl(p, d, r, h):
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*p), gp_Dir(*d)), r, h).Shape()


def cut(a, b):
    return BRepAlgoAPI_Cut(a, b).Shape()


def fuse(a, b):
    return BRepAlgoAPI_Fuse(a, b).Shape()


def edges(s):
    e = TopExp_Explorer(s, TopAbs_EDGE)
    while e.More():
        yield TopoDS.Edge(e.Current())
        e.Next()


def fillet_all(s, r, pick=lambda e: True):
    f = BRepFilletAPI_MakeFillet(s)
    for e in edges(s):
        if pick(e):
            f.Add(r, e)
    try:
        return f.Shape()
    except Exception:  # the kernel cannot fillet this combination: keep the sharp part
        return s


def edge_dir_z(e):
    c = BRepAdaptor_Curve(e)
    p, q = c.Value(c.FirstParameter()), c.Value(c.LastParameter())
    return abs(p.X() - q.X()) < 1e-6 and abs(p.Y() - q.Y()) < 1e-6 and abs(p.Z() - q.Z()) > 1e-6


def chamfer_all(s, d, pick=lambda e: True):
    f = BRepFilletAPI_MakeChamfer(s)
    for e in edges(s):
        if pick(e):
            f.Add(d, e)
    return f.Shape()


def rotate(s, axis, deg, origin=(0, 0, 0)):
    t = gp_Trsf()
    t.SetRotation(gp_Ax1(gp_Pnt(*origin), gp_Dir(*axis)), math.radians(deg))
    return BRepBuilderAPI_Transform(s, t, True).Shape()


def move(s, v):
    t = gp_Trsf()
    t.SetTranslation(gp_Vec(*v))
    return BRepBuilderAPI_Transform(s, t, True).Shape()


def shaft(segments, axis=(1, 0, 0)):
    """Stepped shaft along +X from (length, radius) segments."""
    x, s = 0.0, None
    for L, r in segments:
        c = cyl((x, 0, 0), (1, 0, 0), r, L)
        s = c if s is None else fuse(s, c)
        x += L
    return s


def spline_revolve(rng):
    """A turned part whose profile is a B-spline: revolve a closed profile about X."""
    L = rng.uniform(30, 80)
    pts = [gp_Pnt(0, 0, 0), gp_Pnt(0, rng.uniform(5, 10), 0)]
    n = 5
    ctrl = TColgp_Array1OfPnt(1, n)
    ys = [pts[1].Y()] + [rng.uniform(4, 14) for _ in range(n - 2)] + [rng.uniform(5, 10)]
    for i in range(n):
        ctrl.SetValue(i + 1, gp_Pnt(L * i / (n - 1), ys[i], 0))
    knots = TColStd_Array1OfReal(1, 2); knots.SetValue(1, 0); knots.SetValue(2, 1)
    mults = TColStd_Array1OfInteger(1, 2); mults.SetValue(1, n); mults.SetValue(2, n)
    bs = Geom_BSplineCurve(ctrl, knots, mults, n - 1)
    e1 = BRepBuilderAPI_MakeEdge(gp_Pnt(0, 0, 0), gp_Pnt(0, ys[0], 0)).Edge()
    e2 = BRepBuilderAPI_MakeEdge(bs).Edge()
    e3 = BRepBuilderAPI_MakeEdge(gp_Pnt(L, ys[-1], 0), gp_Pnt(L, 0, 0)).Edge()
    e4 = BRepBuilderAPI_MakeEdge(gp_Pnt(L, 0, 0), gp_Pnt(0, 0, 0)).Edge()
    w = BRepBuilderAPI_MakeWire(e1, e2, e3, e4).Wire()
    f = BRepBuilderAPI_MakeFace(w).Face()
    return BRepPrimAPI_MakeRevol(f, gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0)), 2 * math.pi).Shape()


def fixed_parts():
    rng = random.Random(7)
    p = {}
    # 1. Plate, 4 through holes, a pocket.
    s = box(0, 0, 0, 120, 80, 12)
    for (x, y) in [(10, 10), (110, 10), (10, 70), (110, 70)]:
        s = cut(s, cyl((x, y, -1), (0, 0, 1), 3.3, 14))
    s = cut(s, box(30, 20, 6, 60, 40, 7))
    p["plate-holes-pocket"] = (s, "MM")
    # 2. Block with filleted vertical edges and chamfered top.
    s = box(-25, -15, 0, 50, 30, 20)
    s = fillet_all(s, 6, edge_dir_z)
    p["block-fillets"] = (s, "MM")
    # 3. Stepped shaft with a ball end (sphere face).
    s = shaft([(20, 8), (40, 12.5), (15, 6)])
    s = fuse(s, BRepPrimAPI_MakeSphere(gp_Pnt(75, 0, 0), 6).Shape())
    p["shaft-ball-end"] = (s, "MM")
    # 4. Scallop: concave arc cut into the top whose centre is above the part.
    s = box(0, 0, 0, 60, 30, 20)
    s = cut(s, cyl((30, -1, 45), (0, 1, 0), 30, 32))
    p["scallop-concave-arc"] = (s, "MM")
    # 5. Bracket rotated 30 degrees about Z, with a hole (not axis-aligned).
    s = fuse(box(0, 0, 0, 50, 10, 40), box(0, 0, 0, 50, 35, 8))
    s = cut(s, cyl((25, -1, 25), (0, 1, 0), 6, 12))
    p["bracket-rotated"] = (rotate(s, (0, 0, 1), 30), "MM")
    # 6. Every edge filleted (tori and sphere corners).
    s = fillet_all(box(0, 0, 0, 40, 25, 15), 3)
    p["all-edges-filleted"] = (s, "MM")
    # 7. Inch file: 4 x 2 x 0.75 in plate with a 1 in bore.
    s = box(0, 0, 0, 101.6, 50.8, 19.05)
    s = cut(s, cyl((50.8, 25.4, -1), (0, 0, 1), 12.7, 22))
    p["plate-inch"] = (s, "INCH")
    # 8. Spline-profile turned part.
    p["spline-revolve"] = (spline_revolve(rng), "MM")
    # 9. Flange: disc with bolt circle, axis along Z, off origin.
    s = cyl((5, -7, 0), (0, 0, 1), 40, 10)
    s = fuse(s, cyl((5, -7, 0), (0, 0, 1), 20, 30))
    for k in range(6):
        a = k * math.pi / 3
        s = cut(s, cyl((5 + 30 * math.cos(a), -7 + 30 * math.sin(a), -1), (0, 0, 1), 4, 12))
    s = cut(s, cyl((5, -7, -1), (0, 0, 1), 10, 32))
    p["flange-bolt-circle"] = (s, "MM")
    return p


def random_part(rng, i):
    kind = rng.choice(["plate", "shaft", "block", "rotated"])
    if kind == "plate":
        L, W, T = rng.uniform(30, 200), rng.uniform(20, 120), rng.uniform(4, 30)
        s = box(0, 0, 0, L, W, T)
        for _ in range(rng.randint(0, 6)):
            r = rng.uniform(1, min(L, W) / 8)
            s = cut(s, cyl((rng.uniform(r, L - r), rng.uniform(r, W - r), -1), (0, 0, 1), r, T + 2))
        if rng.random() < 0.6:
            s = fillet_all(s, rng.uniform(0.5, min(L, W) / 10), edge_dir_z) if rng.random() < 0.5 else s
    elif kind == "shaft":
        segs = [(rng.uniform(5, 40), rng.uniform(3, 25)) for _ in range(rng.randint(2, 5))]
        s = shaft(segs)
        if rng.random() < 0.5:
            x = sum(L for L, _ in segs)
            s = fuse(s, BRepPrimAPI_MakeSphere(gp_Pnt(x, 0, 0), segs[-1][1]).Shape())
    elif kind == "block":
        L, W, H = rng.uniform(20, 100), rng.uniform(20, 100), rng.uniform(10, 60)
        s = box(0, 0, 0, L, W, H)
        r = rng.uniform(5, 40)
        s = cut(s, cyl((rng.uniform(0, L), -1, H + rng.uniform(-r * 0.8, r * 0.8)), (0, 1, 0), r, W + 2))
        if rng.random() < 0.5:
            s = fillet_all(s, rng.uniform(0.5, 2))
    else:
        s = fuse(box(0, 0, 0, 40, 8, 30), box(0, 0, 0, 40, 25, 8))
        s = rotate(s, rng.choice([(0, 0, 1), (1, 0, 0), (0, 1, 0), (1, 1, 0)]), rng.uniform(5, 85))
    s = move(s, (rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(-50, 50)))
    return s, rng.choice(["MM", "MM", "MM", "INCH"])


def truth(shape):
    b = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape, b, False, False)
    lo, hi = b.CornerMin(), b.CornerMax()
    x0, y0, z0, x1, y1, z1 = lo.X(), lo.Y(), lo.Z(), hi.X(), hi.Y(), hi.Z()
    g = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, g)
    return {"min": [x0, y0, z0], "max": [x1, y1, z1], "volume": g.Mass()}


def mesh_points(shape):
    pts = []
    f = TopExp_Explorer(shape, TopAbs_FACE)
    while f.More():
        face = TopoDS.Face(f.Current())
        loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, loc)
        if tri is not None:
            tr = loc.Transformation()
            for k in range(1, tri.NbNodes() + 1):
                q = tri.Node(k).Transformed(tr)
                pts.append((q.X(), q.Y(), q.Z()))
        f.Next()
    return pts


def envelopes(pts, mn, mx):
    """Max radial distance from an axis through the box centre, per world axis."""
    c = [(a + b) / 2 for a, b in zip(mn, mx)]
    out = []
    for ax in range(3):
        o = [i for i in range(3) if i != ax]
        out.append(2 * max(math.hypot(p[o[0]] - c[o[0]], p[o[1]] - c[o[1]]) for p in pts))
    return out


def write(shape, unit, out, name, mesh_tol):
    Interface_Static.SetCVal_s("write.step.schema", "AP214IS")
    Interface_Static.SetCVal_s("write.step.unit", unit)
    w = STEPControl_Writer()
    w.Transfer(shape, STEPControl_AsIs)
    w.Write(os.path.join(out, name + ".step"))
    BRepMesh_IncrementalMesh(shape, mesh_tol, False, 0.05, True)
    st = StlAPI_Writer()
    st.ASCIIMode = False
    st.Write(shape, os.path.join(out, name + ".stl"))
    t = truth(shape)
    t["unit"] = unit
    t["envelopeMeshLowerBound"] = envelopes(mesh_points(shape), t["min"], t["max"])
    t["meshTolerance"] = mesh_tol
    return t


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    n = int(sys.argv[sys.argv.index("--random") + 1]) if "--random" in sys.argv else 0
    res = {}
    if n == 0:
        for name, (s, unit) in fixed_parts().items():
            res[name] = write(s, unit, out, name, 0.01)
    else:
        rng = random.Random(20261125)
        for i in range(n):
            s, unit = random_part(rng, i)
            try:
                res[f"r{i:03d}"] = write(s, unit, out, f"r{i:03d}", 0.02)
            except Exception as e:  # a boolean left nothing (a cut removed the whole block)
                print(f"skipped r{i:03d}: {e}", file=sys.stderr)
                for ext in (".step", ".stl"):
                    if os.path.exists(os.path.join(out, f"r{i:03d}" + ext)):
                        os.remove(os.path.join(out, f"r{i:03d}" + ext))
    with open(os.path.join(out, "truth.json"), "w") as f:
        json.dump(res, f, indent=1)


if __name__ == "__main__":
    main()
