# Independent Monte Carlo volume of a boolean body (eval/coped-coating-2026-11-24.md).
#   venv: pip install ifcopenshell numpy; python3 eval/coped-mc-volume.py model.ifc id1,id2 [points]
# Monte Carlo volume of extrusion − cutters, membership by ray parity on the
# IFC's own faces (IfcOpenShell only to tessellate each operand on its own).
import sys, numpy as np, ifcopenshell, ifcopenshell.geom
f = ifcopenshell.open(sys.argv[1]); s = ifcopenshell.geom.settings()
rng = np.random.default_rng(1)
def tris(item):
    sh = ifcopenshell.geom.create_shape(s, item)
    v = np.array(sh.verts).reshape(-1,3); t = np.array(sh.faces).reshape(-1,3)
    return v[t]
def inside(T, P):
    # ray along a skewed direction; Moller-Trumbore, count parity
    d = np.array([0.5773, 0.5779, 0.5767]); d/=np.linalg.norm(d)
    cnt = np.zeros(len(P), dtype=int)
    for a,b,c in T:
        e1, e2 = b-a, c-a; h = np.cross(d, e2); det = e1@h
        if abs(det) < 1e-15: continue
        sv = P - a; u = (sv@h)/det; q = np.cross(sv, e1); w = (q@d)/det; tt = (q@e2)/det
        cnt += ((u>=0)&(w>=0)&(u+w<=1)&(tt>0)).astype(int)
    return cnt % 2 == 1
def leaves(item, sign=1, out=None):
    out = [] if out is None else out
    if item.is_a('IfcBooleanResult'):
        leaves(item.FirstOperand, sign, out); leaves(item.SecondOperand, -1, out)
    else: out.append((sign, item))
    return out
N = int(sys.argv[3]) if len(sys.argv)>3 else 400000
for gid in sys.argv[2].split(','):
    e = f.by_id(int(gid)); root = [r for r in e.Representation.Representations if r.RepresentationIdentifier=='Body'][0].Items[0]
    L = leaves(root); base = tris(L[0][1]); lo, hi = base.reshape(-1,3).min(0), base.reshape(-1,3).max(0)
    P = lo + rng.random((N,3))*(hi-lo); box = np.prod(hi-lo)
    keep = inside(base, P)
    for sg, it in L[1:]: keep &= ~inside(tris(it), P)
    p = keep.mean(); print(gid, e.Name, 'MC volume', round(p*box, 6), '+-', round(box*np.sqrt(p*(1-p)/N), 6))
