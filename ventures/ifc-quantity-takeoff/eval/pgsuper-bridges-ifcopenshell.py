"""IfcOpenShell's volume and world box for every element of one model, each in its own process.

    python3 eval/pgsuper-bridges-ifcopenshell.py model.ifc out.json

Like eval/bsi-samples-ifcopenshell.py, but IfcOpenShell 0.9.0 crashes the
whole interpreter (a segmentation fault) on some IfcSectionedSolidHorizontal
decks of the PGSuper bridges (eval/pgsuper-bridges-2026-11-24.md), so each
element is built in a forked child with a 120 s limit; one that crashes or
times out is written as {"error": ...} instead of ending the run.
The volume is summed about the box centre (get_volume about the world
origin is kept as "get_volume"), with the count of mesh edges not shared
by exactly two triangles ("open_edges"; IfcOpenShell welds by vertex index).
Writes {GlobalId: {"class", "volume", "get_volume", "open_edges", "box": [xmin, ymin, zmin, xmax, ymax, zmax]}}.
"""
import json
import multiprocessing as mp
import sys

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.shape

PATH = sys.argv[1]
MODEL = ifcopenshell.open(PATH)


def build(gid, q):
    s = ifcopenshell.geom.settings()
    s.set("use-world-coords", True)
    s.set("mesher-linear-deflection", 0.0005)
    s.set("mesher-angular-deflection", 0.05)
    try:
        shape = ifcopenshell.geom.create_shape(s, MODEL.by_guid(gid))
        v = shape.geometry.verts
        xs, ys, zs = v[0::3], v[1::3], v[2::3]
        box = [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)]
        # signed volume about the box centre, not the world origin: these
        # bridges sit 400 km from it, where get_volume's sum loses the figure
        c = [(box[i] + box[i + 3]) / 2 for i in range(3)]
        P = [(xs[i] - c[0], ys[i] - c[1], zs[i] - c[2]) for i in range(len(xs))]
        f = shape.geometry.faces
        vol = 0.0
        edges = {}
        for i in range(0, len(f), 3):
            a, b, d = P[f[i]], P[f[i + 1]], P[f[i + 2]]
            vol += (a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0])) / 6
            for u, w in ((f[i], f[i + 1]), (f[i + 1], f[i + 2]), (f[i + 2], f[i])):
                k = (min(u, w), max(u, w))
                edges[k] = edges.get(k, 0) + 1
        open_edges = sum(1 for n in edges.values() if n != 2)
        q.put({"volume": abs(vol), "get_volume": abs(ifcopenshell.util.shape.get_volume(shape.geometry)), "open_edges": open_edges, "box": box})
    except Exception as err:  # noqa: BLE001
        q.put({"error": str(err)[:200]})


def main():
    out = {}
    ctx = mp.get_context("fork")
    for el in MODEL.by_type("IfcElement"):
        if el.is_a("IfcOpeningElement") or not el.Representation:
            continue
        q = ctx.Queue()
        p = ctx.Process(target=build, args=(el.GlobalId, q))
        p.start()
        p.join(120)
        if p.is_alive():
            p.kill()
            res = {"error": "timed out after 120 s"}
        elif p.exitcode != 0:
            res = {"error": f"crashed (exit code {p.exitcode})"}
        else:
            res = q.get()
        res["class"] = el.is_a()
        out[el.GlobalId] = res
        print(el.is_a(), el.GlobalId, res.get("volume", res.get("error")), file=sys.stderr, flush=True)
    with open(sys.argv[2], "w") as fh:
        json.dump(out, fh, indent=0, sort_keys=True)


if __name__ == "__main__":
    main()
