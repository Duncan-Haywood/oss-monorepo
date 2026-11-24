# Independent check of a boolean body's surface area (eval/coped-coating-2026-11-24.md).
#   venv: pip install ifcopenshell numpy
#   TOL=1e-5 python3 eval/coped-crofton.py model.ifc id1,id2 [lines]
# Surface area of an element's boolean body by the Cauchy-Crofton formula:
# isotropic uniform random lines meeting a box K cross a surface of area A on
# average 2A/S_K times. Crossings of the boolean result are counted where the
# membership (base inside and no cutter inside, by ray parity on each
# operand's own triangles, IfcOpenShell tessellating each operand alone)
# changes along the line. Independent of the takeoff's geometry code.
import sys, numpy as np, ifcopenshell, ifcopenshell.geom
f = ifcopenshell.open(sys.argv[1]); s = ifcopenshell.geom.settings()
rng = np.random.default_rng(7)
def tris(item):
    sh = ifcopenshell.geom.create_shape(s, item)
    return np.array(sh.verts).reshape(-1,3)[np.array(sh.faces).reshape(-1,3)]
def leaves(item, sign=1, out=None):
    out = [] if out is None else out
    if item.is_a('IfcBooleanResult'):
        leaves(item.FirstOperand, sign, out); leaves(item.SecondOperand, -1, out)
    else: out.append((sign, item))
    return out
def lines(lo, hi, N):
    # uniform isotropic lines hitting the box: a point on its surface by area,
    # a cosine-weighted inward direction
    d = hi - lo; areas = np.array([d[1]*d[2], d[1]*d[2], d[0]*d[2], d[0]*d[2], d[0]*d[1], d[0]*d[1]])
    face = rng.choice(6, N, p=areas/areas.sum()); P = lo + rng.random((N,3))*d
    ax = face//2; side = face%2
    P[np.arange(N), ax] = np.where(side==1, hi[ax], lo[ax])
    r1, r2 = rng.random(N), rng.random(N); ct = np.sqrt(1-r1); st = np.sqrt(r1); ph = 2*np.pi*r2
    loc = np.stack([st*np.cos(ph), st*np.sin(ph), ct], 1)  # z = inward normal component
    D = np.zeros((N,3))
    for a in range(3):
        m = ax==a; o1, o2 = (a+1)%3, (a+2)%3; inward = np.where(side[m]==1, -1.0, 1.0)
        D[m, a] = loc[m,2]*inward; D[m, o1] = loc[m,0]; D[m, o2] = loc[m,1]
    return P, D, areas.sum()
def hits(T, P, D):
    out_l, out_t = [], []
    for a,b,c in T:
        e1, e2 = b-a, c-a; h = np.cross(D, e2); det = h@e1
        ok = np.abs(det) > 1e-14; det = np.where(ok, det, 1)
        sv = P - a; u = np.einsum('ij,ij->i', sv, h)/det; q = np.cross(sv, e1); w = np.einsum('ij,ij->i', D, q)/det; t = (q@e2)/det
        m = ok & (u>=0) & (w>=0) & (u+w<=1)
        out_l.append(np.nonzero(m)[0]); out_t.append(t[m])
    return np.concatenate(out_l), np.concatenate(out_t)
import os
TOL = float(os.environ.get("TOL", "1e-7"))
N = int(sys.argv[3]) if len(sys.argv)>3 else 200000
for gid in sys.argv[2].split(','):
    e = f.by_id(int(gid)); root = [r for r in e.Representation.Representations if r.RepresentationIdentifier=='Body'][0].Items[0]
    L = leaves(root)
    if len(sys.argv)>4: L = L[:int(sys.argv[4])]
    T = [tris(it) for _, it in L]
    allv = np.concatenate([t.reshape(-1,3) for t in T]); lo, hi = allv.min(0)-1e-3, allv.max(0)+1e-3
    P, D, SK = lines(lo, hi, N)
    li, ti, oi = [], [], []
    for k, Tk in enumerate(T):
        l, t = hits(Tk, P, D); li.append(l); ti.append(t); oi.append(np.full(len(l), k))
    li, ti, oi = map(np.concatenate, (li, ti, oi))
    order = np.lexsort((ti, li)); li, ti, oi = li[order], ti[order], oi[order]
    # parity per operand along each line, from -inf (outside everything)
    K = len(T); par = np.zeros((N, K), dtype=bool); crossings = 0
    state = np.zeros(N, dtype=bool)
    # hits at one point (a cutter's face flush with the beam's) are taken
    # together: only the membership before and after the group counts
    j = 0; n = len(li)
    while j < n:
        l = li[j]; k = j
        while k < n and li[k] == l and ti[k] - ti[j] <= TOL: par[l, oi[k]] ^= True; k += 1
        new = par[l,0] and not par[l,1:].any()
        if new != state[l]: crossings += 1; state[l] = new
        j = k
    A = SK * crossings / N / 2
    print(gid, e.Name, 'Crofton area', round(A, 4), '+-', round(A/np.sqrt(max(crossings,1)), 4), 'lines', N, 'crossings', crossings)
