"""Reference volumes from IfcOpenShell, an independent geometry kernel.

    python3 eval/ifcopenshell-volumes.py model.ifc out.json
    python3 eval/ifcopenshell-volumes.py model.ifc out.json --breps

Writes {GlobalId: {"gross": m3, "net": m3}} for every element with a body:
gross with opening subtraction off, net with it on (for
eval/elements-vs-ifcopenshell.mjs). With --breps, {step id: volume} of every
IfcAdvancedBrep on its own, tessellated finely (0.05 mm, 0.02 rad: at the
default the circles of a 40 mm rosette came out 1% light), in the model's
own units (for eval/breps-vs-ifcopenshell.mjs). Needs `pip install
ifcopenshell` (0.8 or later).
"""
import json
import sys

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.shape


def volumes(model, subtract):
    s = ifcopenshell.geom.settings()
    s.set("disable-opening-subtractions", not subtract)
    s.set("use-world-coords", True)
    out = {}
    for el in model.by_type("IfcElement"):
        if el.is_a("IfcOpeningElement") or not el.Representation:
            continue
        try:
            shape = ifcopenshell.geom.create_shape(s, el)
        except Exception:  # noqa: BLE001 - a shape IfcOpenShell cannot build is left out
            continue
        out[el.GlobalId] = abs(ifcopenshell.util.shape.get_volume(shape.geometry))
    return out


def brep_volumes(model):
    s = ifcopenshell.geom.settings()
    s.set("mesher-linear-deflection", 0.00005)
    s.set("mesher-angular-deflection", 0.02)
    out = {}
    for b in model.by_type("IfcAdvancedBrep"):
        try:
            out[b.id()] = ifcopenshell.util.shape.get_volume(ifcopenshell.geom.create_shape(s, b))
        except Exception:  # noqa: BLE001 - left out, as above
            continue
    return out


def main():
    model = ifcopenshell.open(sys.argv[1])
    if "--breps" in sys.argv:
        res = brep_volumes(model)
        with open(sys.argv[2], "w") as fh:
            json.dump(res, fh, indent=0, sort_keys=True)
        print(f"{len(res)} advanced breps")
        return
    gross = volumes(model, False)
    net = volumes(model, True)
    res = {g: {"gross": v, "net": net.get(g)} for g, v in gross.items()}
    with open(sys.argv[2], "w") as fh:
        json.dump(res, fh, indent=0, sort_keys=True)
    print(f"{len(res)} elements")


if __name__ == "__main__":
    main()
