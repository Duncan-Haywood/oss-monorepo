"""Reference volumes and world boxes from IfcOpenShell for a folder of models.

    python3 eval/bsi-samples-ifcopenshell.py models/ out.json

Walks every .ifc under the folder (buildingSMART's IFC4.3.x-sample-models,
`models/`) and writes {relative path: {GlobalId: {"volume": m3, "box":
[xmin, ymin, zmin, xmax, ymax, zmax] in metres}}} for every IfcElement with
a body, openings subtracted, in world coordinates (for
eval/bsi-samples.mjs). An element IfcOpenShell cannot build is left out.
Needs `pip install ifcopenshell` (0.8 or later).
"""
import json
import os
import sys

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.shape
import ifcopenshell.util.unit


def read(path):
    model = ifcopenshell.open(path)
    s = ifcopenshell.geom.settings()
    s.set("use-world-coords", True)
    s.set("mesher-linear-deflection", 0.0005)
    s.set("mesher-angular-deflection", 0.05)
    out = {}
    for el in model.by_type("IfcElement"):
        if el.is_a("IfcOpeningElement") or not el.Representation:
            continue
        try:
            shape = ifcopenshell.geom.create_shape(s, el)
        except Exception:  # noqa: BLE001 - a shape IfcOpenShell cannot build is left out
            continue
        v = shape.geometry.verts
        if not v:
            continue
        xs, ys, zs = v[0::3], v[1::3], v[2::3]
        out[el.GlobalId] = {
            "volume": abs(ifcopenshell.util.shape.get_volume(shape.geometry)),
            "box": [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)],
        }
    return out


def main():
    root, dest = sys.argv[1], sys.argv[2]
    res = {}
    for d, _, files in os.walk(root):
        for f in sorted(files):
            if f.endswith(".ifc"):
                p = os.path.join(d, f)
                res[os.path.relpath(p, root)] = read(p)
                print(os.path.relpath(p, root), len(res[os.path.relpath(p, root)]), flush=True)
    with open(dest, "w") as fh:
        json.dump(res, fh, indent=0, sort_keys=True)
    print(f"{len(res)} models, {sum(len(v) for v in res.values())} elements")


if __name__ == "__main__":
    main()
