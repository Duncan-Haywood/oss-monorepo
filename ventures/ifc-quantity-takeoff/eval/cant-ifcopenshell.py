"""IfcOpenShell's reading of a segmented reference curve (cant), for eval/cant.mjs.

    python3 -m venv v && v/bin/pip install ifcopenshell numpy   # 0.9.0 used
    v/bin/python eval/cant-ifcopenshell.py model.ifc CURVE_ID LENGTH STEP out.json

For every STEP metres from 0 to LENGTH along the curve, places two
IfcLinearPlacements on it (no offset, and 0.75 m to the left) in memory and
writes IfcOpenShell's world origins as {"d": [origin, origin_left]}. The left
point's drop gives IfcOpenShell's roll; the plain one its elevation.
"""
import json
import sys

import ifcopenshell
import ifcopenshell.geom
import numpy as np

f = ifcopenshell.open(sys.argv[1])
curve = f.by_id(int(sys.argv[2]))
length, step, dest = float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
s = ifcopenshell.geom.settings()


def origin(d, lat):
    pe = f.createIfcPointByDistanceExpression(f.createIfcLengthMeasure(d), lat, 0.0, 0.0, curve)
    lp = f.createIfcLinearPlacement(None, f.createIfcAxis2PlacementLinear(pe, None, None), None)
    M = np.array(ifcopenshell.geom.create_shape(s, lp).matrix).reshape(4, 4).T
    if abs(M[3, 3] - 1) > 1e-9 or np.abs(M[3, :3]).max() > 1e-9:
        M = M.T
    return [float(v) for v in M[:3, 3]]


out = {}
# IfcOpenShell 0.9 prints its cant frames to stdout, so the result goes to a file
n = int(round(length / step))
for k in range(n + 1):
    d = k * step
    try:
        out[f"{d:g}"] = [origin(d, 0.0), origin(d, 0.75)]
    except Exception as err:  # noqa: BLE001 - recorded, not fatal
        out[f"{d:g}"] = str(err)
with open(dest, "w") as fh:
    json.dump(out, fh)
