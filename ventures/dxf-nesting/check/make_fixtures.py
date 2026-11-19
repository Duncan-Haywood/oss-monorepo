"""Write DXF fixtures with ezdxf (an independent DXF library, MIT) and record
each closed outline's area as ezdxf computes it, so the nester's own reader is
checked against another implementation, not against itself.

    python3 -m pip install ezdxf==1.4.5
    python3 check/make_fixtures.py      # writes check/fixtures/*.dxf and check/fixtures/areas.json
"""
import json, math, os
import ezdxf
from ezdxf import path as ezpath
from ezdxf.math import area as poly_area

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
os.makedirs(HERE, exist_ok=True)
out = {}

def outline_area(entity):
    p = ezpath.make_path(entity)
    pts = list(p.flattening(0.0005))
    return abs(poly_area(pts))

def save(doc, name, areas, units):
    doc.units = units
    doc.saveas(os.path.join(HERE, name))
    out[name] = {"areas": sorted(areas, reverse=True), "version": doc.dxfversion, "units": units}

# 1. R2010 bracket: LWPOLYLINE with bulges (rounded corners and a notch arc), a hole of ellipse, a slot polyline
doc = ezdxf.new("R2010"); msp = doc.modelspace()
b = math.tan(math.radians(90) / 4)
outer = msp.add_lwpolyline([(10, 0, 0, 0, 0), (190, 0, 0, 0, b), (200, 10, 0, 0, 0), (200, 90, 0, 0, b), (190, 100, 0, 0, 0),
                            (120, 100, 0, 0, -1), (80, 100, 0, 0, 0), (10, 100, 0, 0, b), (0, 90, 0, 0, 0), (0, 10, 0, 0, b)],
                           format="xyseb", close=True)
hole = msp.add_ellipse(center=(50, 50), major_axis=(20, 10), ratio=0.5)
slot = msp.add_lwpolyline([(130, 40, 0, 0, 1), (130, 20, 0, 0, 0), (170, 20, 0, 0, 1), (170, 40, 0, 0, 0)], format="xyseb", close=True)
save(doc, "bracket_r2010.dxf", [outline_area(outer) - outline_area(hole) - outline_area(slot)], 4)

# 2. A plate drawn as a 2D POLYLINE/VERTEX with a circle hole, and a SPLINE outline as a second part (R2000)
doc = ezdxf.new("R2000"); msp = doc.modelspace()
plate = msp.add_polyline2d([(0, 0), (120, 0), (120, 60), (0, 60)], close=True)
c = msp.add_circle((30, 30), 12)
# a clamped cubic spline from (200, 0) round to (190, 40), closed by a straight LINE.
# (ezdxf's periodic `set_closed` spline is not used: ezdxf's own flattening of it
# runs outside the valid knot range and returns a curve far outside its control hull.)
spl = msp.add_open_spline([(200, 0), (260, -10), (300, 30), (270, 80), (210, 70), (190, 40)], degree=3)
msp.add_line((190, 40), (200, 0))
spl_area = abs(poly_area(list(ezpath.make_path(spl).flattening(0.0005))))  # the polygon closes along the line
save(doc, "plate_and_spline_r2000.dxf", [outline_area(plate) - math.pi * 144, spl_area], 4)

# 3. Blocks: a gusset block inserted three times, rotated, scaled and mirrored (negative x scale), in inches
doc = ezdxf.new("R2010"); msp = doc.modelspace()
blk = doc.blocks.new("GUSSET", base_point=(5, 5))
blk.add_lwpolyline([(5, 5), (15, 5), (15, 7), (7, 15), (5, 15)], close=True)
blk.add_circle((8, 8), 1)
areas = []
for ins in [dict(insert=(0, 0), rotation=0), dict(insert=(30, 0), rotation=30, xscale=1.5, yscale=1.5), dict(insert=(60, 0), rotation=0, xscale=-1, yscale=1)]:
    ref = msp.add_blockref("GUSSET", ins.pop("insert"), dxfattribs={"rotation": ins.get("rotation", 0), "xscale": ins.get("xscale", 1), "yscale": ins.get("yscale", 1)})
    v = list(ref.virtual_entities())  # ezdxf's own block expansion
    areas.append(outline_area(v[0]) - outline_area(v[1]))
save(doc, "gussets_blocks_r2010.dxf", areas, 1)

with open(os.path.join(HERE, "areas.json"), "w") as f:
    json.dump({"ezdxf": ezdxf.__version__, "files": out}, f, indent=1, sort_keys=True)
print(json.dumps(out, indent=1))
