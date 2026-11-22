# IfcLinearPlacement origins and x axes from alignment.mjs (eval/linear-placement.mjs --points) against IfcOpenShell 0.8.
#   python3 -m venv v && v/bin/pip install ifcopenshell numpy
#   node eval/linear-placement.mjs model.ifc --points pts.json
#   v/bin/python eval/linear-placement-vs-ifcopenshell.py model.ifc pts.json model.ifc-basename
import sys, json, ifcopenshell, ifcopenshell.geom, numpy as np
f = ifcopenshell.open(sys.argv[1]); s = ifcopenshell.geom.settings()
mine = {r[0]: r for r in json.load(open(sys.argv[2]))[sys.argv[3]]}
ang3=[]; d=[]; ang=[]; dz=[]; dh=[]
for lp in f.by_type("IfcLinearPlacement"):
    M = np.array(ifcopenshell.geom.create_shape(s, lp).matrix).reshape(4,4).T  # column-major -> row
    if abs(M[3,3]-1)>1e-9 or np.abs(M[3,:3]).max()>1e-9: M = M.T
    o = M[:3,3]; x = M[:3,0]
    r = mine[lp.id()]
    p = np.array(r[1:4]); mx = np.array(r[4:7])
    d.append(np.linalg.norm(p-o)); dh.append(np.linalg.norm((p-o)[:2])); dz.append(abs(p[2]-o[2]))
    hx = x[:2]/np.linalg.norm(x[:2]); hm = mx[:2]/np.linalg.norm(mx[:2])
    ang.append(np.degrees(np.arccos(np.clip(hx@hm,-1,1)))); ang3.append(np.degrees(np.arccos(np.clip((x/np.linalg.norm(x))@(mx/np.linalg.norm(mx)),-1,1))))
d=np.array(d); dh=np.array(dh); dz=np.array(dz); ang=np.array(ang)
print(f"n={len(d)} origin distance: median {np.median(d):.3e} p95 {np.percentile(d,95):.3e} max {d.max():.3e} m; horizontal max {dh.max():.3e}; vertical max {dz.max():.3e}; within 1 mm {int((d<1e-3).sum())}; heading difference max {ang.max():.3e} deg; 3D x-axis difference max {max(ang3):.3e} deg")
bad = np.argsort(-d)[:5]
lps=f.by_type("IfcLinearPlacement")
for i in bad: print(" ", lps[i].id(), f"{d[i]:.4f} m (h {dh[i]:.4f}, v {dz[i]:.4f})", lps[i].RelativePlacement.Location.BasisCurve.id(), lps[i].RelativePlacement.Location.DistanceAlong.wrappedValue)
