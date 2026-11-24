# IfcOpenShell 0.9 area and volume of elements, from its own boolean (eval/coped-coating-2026-11-24.md).
#   python3 eval/coped-ifcopenshell.py model.ifc id1,id2
import sys, numpy as np, ifcopenshell, ifcopenshell.geom
f = ifcopenshell.open(sys.argv[1])
s = ifcopenshell.geom.settings()
for gid in sys.argv[2].split(","):
    e = f.by_id(int(gid))
    sh = ifcopenshell.geom.create_shape(s, e)
    v = np.array(sh.geometry.verts).reshape(-1,3); t = np.array(sh.geometry.faces).reshape(-1,3)
    a,b,c = v[t[:,0]],v[t[:,1]],v[t[:,2]]
    area = 0.5*np.linalg.norm(np.cross(b-a,c-a),axis=1).sum()
    vol = np.einsum('ij,ij->i',a,np.cross(b,c)).sum()/6
    print(gid, e.Name, round(area,5), round(vol,6))
