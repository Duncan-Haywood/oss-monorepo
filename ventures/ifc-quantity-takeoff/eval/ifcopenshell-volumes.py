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

With --breps each brep's mesh is also checked for faces turned the wrong
way (eval/pole-faces-2026-11-22.md: IfcOpenShell 0.9 turns some curved faces
inside out, and a closed mesh's signed volume is then wrong by twice their
share). A brep whose directed edges all pair with their reverse is written as
its volume, as before. One with unpaired edges is written as {"volume": as
built, "turned": what the same triangles enclose once every triangle agrees
with its neighbours, "unpaired": directed edges without a reverse, "pieces":
connected pieces}, so the comparison can name the cause. The check needs
numpy; without it every brep is written as its volume.
"""
import json
import sys

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.shape

try:
    import numpy as np
except ImportError:  # the orientation check is skipped
    np = None


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


def turned(verts, faces):
    """Orientation of a mesh: None when every directed edge pairs with its
    reverse, else (unpaired, pieces, volume once turned to agree)."""
    v = np.asarray(verts, dtype=float).reshape(-1, 3)
    f = np.asarray(faces, dtype=np.int64).reshape(-1, 3)
    if not len(f):
        return None
    # weld coincident vertices: the mesher writes each face's own
    _, remap = np.unique(np.round(v, 9), axis=0, return_inverse=True)
    remap = remap.reshape(-1)
    f = remap[f]
    f = f[(f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])]
    V = np.zeros((remap.max() + 1, 3))
    V[remap] = v
    n = len(V)
    a = f.reshape(-1)
    b = f[:, [1, 2, 0]].reshape(-1)
    fwd = a * n + b
    keys, counts = np.unique(fwd, return_counts=True)
    rev_ok = np.isin(b * n + a, keys)
    cnt = dict(zip(keys.tolist(), counts.tolist()))
    once = np.array([cnt[k] == 1 for k in fwd.tolist()])
    bad = ~(once & rev_ok)
    unpaired = len(np.unique(fwd[bad]))
    if not unpaired:
        return None
    # breadth-first over shared edges, turning each neighbour to agree
    from collections import defaultdict, deque
    ue = defaultdict(list)
    for ti, t in enumerate(f.tolist()):
        for i in range(3):
            x, y = t[i], t[(i + 1) % 3]
            ue[(x, y) if x < y else (y, x)].append(ti)
    F = f.tolist()
    seen = [False] * len(F)
    pieces, total = 0, 0.0
    for s0 in range(len(F)):
        if seen[s0]:
            continue
        pieces += 1
        seen[s0] = True
        q, members = deque([s0]), [s0]
        while q:
            ti = q.popleft()
            t = F[ti]
            for i in range(3):
                x, y = t[i], t[(i + 1) % 3]
                for tj in ue[(x, y) if x < y else (y, x)]:
                    if seen[tj]:
                        continue
                    u = F[tj]
                    if any(u[j] == x and u[(j + 1) % 3] == y for j in range(3)):
                        F[tj] = u[::-1]
                    seen[tj] = True
                    q.append(tj)
                    members.append(tj)
        T = np.array([F[i] for i in members])
        # each piece's own enclosed volume: a piece turned inside out as a
        # whole still counts once, the right way out
        total += abs(np.einsum("ij,ij->i", V[T[:, 0]], np.cross(V[T[:, 1]], V[T[:, 2]])).sum() / 6)
    return unpaired, pieces, total


def brep_volumes(model):
    s = ifcopenshell.geom.settings()
    s.set("mesher-linear-deflection", 0.00005)
    s.set("mesher-angular-deflection", 0.02)
    out = {}
    for b in model.by_type("IfcAdvancedBrep"):
        try:
            shape = ifcopenshell.geom.create_shape(s, b)
        except Exception:  # noqa: BLE001 - left out, as above
            continue
        vol = ifcopenshell.util.shape.get_volume(shape)
        t = turned(shape.verts, shape.faces) if np is not None else None
        if t is None:
            out[b.id()] = vol
        else:
            out[b.id()] = {"volume": vol, "turned": t[2], "unpaired": t[0], "pieces": t[1]}
    return out


def main():
    model = ifcopenshell.open(sys.argv[1])
    if "--breps" in sys.argv:
        res = brep_volumes(model)
        with open(sys.argv[2], "w") as fh:
            json.dump(res, fh, indent=0, sort_keys=True)
        nt = sum(isinstance(x, dict) for x in res.values())
        print(f"{len(res)} advanced breps, {nt} with faces turned the wrong way")
        return
    gross = volumes(model, False)
    net = volumes(model, True)
    res = {g: {"gross": v, "net": net.get(g)} for g, v in gross.items()}
    with open(sys.argv[2], "w") as fh:
        json.dump(res, fh, indent=0, sort_keys=True)
    print(f"{len(res)} elements")


if __name__ == "__main__":
    main()
