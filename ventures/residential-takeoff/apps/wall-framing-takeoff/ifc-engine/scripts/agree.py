"""Compare ifc-engine's plan JSON with IfcOpenShell, an independent IFC geometry kernel.
usage: python agree.py model.ifc engine.json   (needs: pip install ifcopenshell numpy)"""
import sys, json, math
import numpy as np
import ifcopenshell, ifcopenshell.geom, ifcopenshell.util.placement as up
f = ifcopenshell.open(sys.argv[1]); E = json.load(open(sys.argv[2]))
import ifcopenshell.util.unit as uu
K = uu.calculate_unit_scale(f)
st = ifcopenshell.geom.settings(); st.set("use-world-coords", True)
try: st.set("disable-opening-subtractions", True)
except Exception: pass
def verts(el):
    try: s = ifcopenshell.geom.create_shape(st, el)
    except Exception: return None
    v = np.array(s.geometry.verts).reshape(-1, 3)
    return v if len(v) else None
walls = {w["id"]: w for w in E["walls"]}
# 1. wall centre lines: resolved ends must lie on the authored axis line (joins slide along it)
perp = []; body_h = []; base_d = []
for wid, w in walls.items():
    if w["parts"]: continue  # merged runs: their parts are checked through openings below
    el = f.by_id(wid)
    M = up.get_local_placement(el.ObjectPlacement)
    ax = None
    for r in el.Representation.Representations:
        if r.RepresentationIdentifier == "Axis":
            for it in r.Items:
                if it.is_a("IfcPolyline"):
                    p = [list(c.Coordinates) + [0] * (3 - len(c.Coordinates)) for c in it.Points]
                    ax = [(M @ np.array([*p[0], 1]))[:2] * K, (M @ np.array([*p[-1], 1]))[:2] * K]
    v = verts(el)
    if v is not None:
        body_h.append(abs((v[:, 2].max() - v[:, 2].min()) - (w["height"] or 0)))
        base_d.append(abs(v[:, 2].min() - w["base"]))
    if ax is None or w["layers"] == []: continue
    a, b = ax; u = (b - a) / np.linalg.norm(b - a); n = np.array([-u[1], u[0]])
    # offset of centre from the authored axis is allowed (layer set usage); report it separately
    for p in (w["start"], w["end"]):
        perp.append(abs(float(np.dot(np.array(p) - a, n))))
print(f"walls compared: {len(walls)}; body height |diff| max {max(body_h):.4f} m, base |diff| max {max(base_d):.4f} m (n={len(body_h)})")
print(f"centre line ends off the authored axis line: max {max(perp):.4f} m, median {float(np.median(perp)):.4f} m (non-zero only where the layer set offsets the centre)")
# 2. openings: IfcOpenShell's opening geometry projected on our centre line
dfrom = []; dto = []; dsill = []; dh = []; n = 0; bad = []
host_of = {}
for rel in f.by_type("IfcRelVoidsElement"):
    host_of[rel.RelatedOpeningElement.id()] = rel.RelatingBuildingElement.id()
fill_of = {rel.RelatedBuildingElement.id(): rel.RelatingOpeningElement.id() for rel in f.by_type("IfcRelFillsElement")}
for wid, w in walls.items():
    s = np.array(w["start"]); e = np.array(w["end"]); L = np.linalg.norm(e - s)
    if L == 0: continue
    u = (e - s) / L
    for o in w["openings"]:
        if o["hostedBy"] == "proximity": continue
        op = fill_of.get(o["id"], o["id"])
        if host_of.get(op) not in (w["parts"] or [wid]): bad.append(o["id"]); continue
        v = verts(f.by_id(op))
        if v is None: continue
        al = (v[:, :2] - s) @ u
        lo, hi = max(al.min(), 0), min(al.max(), L)
        dfrom.append(abs(lo - o["from"])); dto.append(abs(hi - o["to"]))
        dsill.append(abs((v[:, 2].min() - w["base"]) - o["sill"])); dh.append(abs((v[:, 2].max() - v[:, 2].min()) - o["height"]))
        n += 1
if n:
    print(f"openings compared: {n}; |from| max {max(dfrom):.4f} m, |to| max {max(dto):.4f} m, |sill| max {max(dsill):.4f} m, |height| max {max(dh):.4f} m; host mismatches {len(bad)}")
# 3. proximity-hosted doors and windows: is the unit's own mesh centre inside the host wall's mesh,
#    in the frame of our centre line, and do our extents match its mesh?
OUT = []; inside = 0; total = 0; pd = []; outside = []
for wid, w in walls.items():
    pro = [o for o in w["openings"] if o["hostedBy"] == "proximity"]
    if not pro: continue
    vs = [verts(f.by_id(p)) for p in (w["parts"] or [wid])]
    vs = [v for v in vs if v is not None]
    if not vs: continue
    wv = np.vstack(vs)
    s = np.array(w["start"]); e = np.array(w["end"]); L = np.linalg.norm(e - s); u = (e - s) / L; n = np.array([-u[1], u[0]])
    wa = (wv[:, :2] - s) @ u; wn = (wv[:, :2] - s) @ n
    for o in pro:
        dv = verts(f.by_id(o["id"]))
        if dv is None: continue
        total += 1
        c = dv[:, :2].mean(axis=0); ca = (c - s) @ u; cn = (c - s) @ n
        ok = wa.min() - 0.01 <= ca <= wa.max() + 0.01 and wn.min() - 0.05 <= cn <= wn.max() + 0.05
        inside += ok
        if not ok: outside.append(o["id"]); OUT.append((f.by_id(o["id"]).Name, w["name"]))
        al = (dv[:, :2] - s) @ u
        pd.append(max(abs(max(al.min(), 0) - o["from"]), abs(min(al.max(), L) - o["to"])))
if total:
    print(f"proximity-hosted units checked: {total}; centre inside host wall mesh: {inside}; extent |diff| max {max(pd):.4f} m; outside: {outside[:10]}")
import collections; print(collections.Counter(OUT).most_common(12))
