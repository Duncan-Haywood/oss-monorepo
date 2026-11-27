# Writes the IGES fixtures in test/fixtures/occt/ with Open CASCADE (OCCT), the kernel FreeCAD,
# CadQuery and build123d export through, so the IGES hole reader is tested on a real exporter's
# files rather than only on files written by test/helpers/iges-writer.ts. The parts are designed
# here, so every hole's diameter and depth is known by construction (see test/iges-holes.test.ts).
#
#   python3 -m venv /tmp/occ && /tmp/occ/bin/pip install cadquery-ocp   # OCP 8.0.1 (OCCT 8.0) used on 2026-11-26
#   /tmp/occ/bin/python scripts/make-iges-fixtures.py test/fixtures/occt && gzip -9 -n test/fixtures/occt/*.igs
#
# Each part is written twice where it matters: trimmed surfaces (write.iges.brep.mode 0, OCCT's
# default: cylinders become 120 surfaces of revolution) and a B-rep solid (mode 1: 186 with 192
# cylinders). block-nurbs-faces converts every face to a B-spline first (128), the way exporters
# that write everything as NURBS do. The file dates in the Global section differ per run.
import math
import sys

from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepBuilderAPI import BRepBuilderAPI_NurbsConvert, BRepBuilderAPI_Transform
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCone, BRepPrimAPI_MakeCylinder
from OCP.GeomAbs import GeomAbs_Line
from OCP.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec
from OCP.IGESControl import IGESControl_Writer
from OCP.Interface import Interface_Static
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS

out = sys.argv[1]


def ax(x, y, z, d=(0, 0, 1)):
    return gp_Ax2(gp_Pnt(x, y, z), gp_Dir(*d))


def cyl(x, y, z, r, h, d=(0, 0, 1)):
    return BRepPrimAPI_MakeCylinder(ax(x, y, z, d), r, h).Shape()


def cone(x, y, z, r1, r2, h, d=(0, 0, 1)):
    return BRepPrimAPI_MakeCone(ax(x, y, z, d), r1, r2, h).Shape()


def cut(a, b):
    return BRepAlgoAPI_Cut(a, b).Shape()


def fuse(a, b):
    return BRepAlgoAPI_Fuse(a, b).Shape()


def write(shape, name, mode, unit="MM"):
    Interface_Static.SetIVal_s("write.iges.brep.mode", mode)
    Interface_Static.SetCVal_s("write.iges.unit", unit)
    w = IGESControl_Writer(unit, mode)
    w.AddShape(shape)
    w.ComputeModel()
    w.Write(f"{out}/{name}.igs")


# bracket: 60 x 40 x 10 plate
s = BRepPrimAPI_MakeBox(60.0, 40.0, 10.0).Shape()
for t in [
    cyl(10, 10, -1, 3.3, 12),  # through Ø6.6
    cyl(50, 10, -1, 3.3, 12),  # through Ø6.6
    cyl(10, 30, -1, 3.3, 12),  # counterbored: Ø6.6 through ...
    cyl(10, 30, 3.5, 5.5, 7),  # ... and Ø11, 6.5 deep
    cyl(50, 30, 2, 2.5, 9),  # blind Ø5, 8 deep, flat bottom
    cyl(-1, 20, 5, 2, 62, (1, 0, 0)),  # cross hole Ø4 along X, through
]:
    s = cut(s, t)
s = fuse(s, cyl(30, 20, 10, 10, 8))  # boss Ø20, 8 high
s = cut(s, cyl(30, 20, 12, 4, 7))  # Ø8 hole in the boss, 6 deep
write(s, "bracket-faces", 0)
write(s, "bracket-brep", 1)

# block: 80 x 50 x 20, vertical edges filleted R5
s = BRepPrimAPI_MakeBox(80.0, 50.0, 20.0).Shape()
f = BRepFilletAPI_MakeFillet(s)
e = TopExp_Explorer(s, TopAbs_EDGE)
while e.More():
    ed = TopoDS.Edge(e.Current())
    c = BRepAdaptor_Curve(ed)
    if c.GetType() == GeomAbs_Line and abs(c.Line().Direction().Z()) > 0.99:
        f.Add(5.0, ed)
    e.Next()
s = f.Shape()
tip = 4.25 / math.tan(math.radians(59))
s = cut(s, fuse(cyl(15, 15, 5, 4.25, 16), cone(15, 15, 5 - tip, 0, 4.25, tip)))  # drilled Ø8.5, 15 deep, 118° point
s = cut(s, fuse(cyl(40, 15, -1, 3.2, 22), cone(40, 15, 17, 3.2, 6.2, 3.0)))  # Ø6.4 through, 90° countersink to Ø12.4
s = cut(s, fuse(cyl(65, 15, -1, 5, 22), cone(65, 15, 19, 5, 6, 1)))  # Ø10 through, 1 x 45° chamfer
s = cut(s, cyl(40, -1, 10, 3.4, 21, (0, 1, 0)))  # Ø6.8 from the front face, 20 deep, crossing the Ø6.4
t = gp_Trsf()
t.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), math.radians(30))
t2 = gp_Trsf()
t2.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0)), math.radians(10))
t3 = gp_Trsf()
t3.SetTranslation(gp_Vec(100, -40, 7))
s = BRepBuilderAPI_Transform(s, t3.Multiplied(t2.Multiplied(t)), True).Shape()  # placed at an angle
write(s, "block-faces", 0)
write(s, "block-brep", 1)
write(s, "block-faces-in", 0, "IN")
write(BRepBuilderAPI_NurbsConvert(s, True).Shape(), "block-nurbs-faces", 0)

# shaft along X: Ø30 x 40, Ø20 x 30, Ø12 x 20; Ø8 bore 25 deep; Ø6 cross hole through the Ø20
s = fuse(fuse(cyl(0, 0, 0, 15, 40, (1, 0, 0)), cyl(40, 0, 0, 10, 30, (1, 0, 0))), cyl(70, 0, 0, 6, 20, (1, 0, 0)))
s = cut(s, cyl(-1, 0, 0, 4, 26, (1, 0, 0)))
s = cut(s, cyl(55, 0, -11, 3, 22))
write(s, "shaft-faces", 0)
