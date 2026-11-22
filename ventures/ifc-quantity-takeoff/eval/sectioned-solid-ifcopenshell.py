# World boxes (and mesh volumes) of IfcSectionedSolidHorizontal elements from IfcOpenShell 0.8, for eval/sectioned-solid.mjs --boxes.
#   v/bin/python eval/sectioned-solid-ifcopenshell.py model.ifc ios.json
import sys, json, ifcopenshell, ifcopenshell.geom, numpy as np
f = ifcopenshell.open(sys.argv[1]); s = ifcopenshell.geom.settings(); s.set("use-world-coords", True)
out = {}
for el in f.by_type("IfcProduct"):
    rep = el.Representation
    if not rep: continue
    if not any(it.is_a("IfcSectionedSolidHorizontal") for r in rep.Representations for it in r.Items): continue
    try:
        sh = ifcopenshell.geom.create_shape(s, el)
        v = np.array(sh.geometry.verts).reshape(-1,3); fc = np.array(sh.geometry.faces).reshape(-1,3)
        a, b, c = v[fc[:,0]], v[fc[:,1]], v[fc[:,2]]
        vol = np.einsum('ij,ij->i', a, np.cross(b, c)).sum()/6
        out[el.id()] = [abs(vol), *v.min(0), *v.max(0)]
    except Exception as e:
        out[el.id()] = str(e)[:100]
json.dump(out, open(sys.argv[2], "w"))
print(len(out), sum(isinstance(x, str) for x in out.values()))
