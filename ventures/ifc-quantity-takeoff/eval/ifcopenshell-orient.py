"""IfcOpenShell's mesh of one or more breps, its orientation checked: directed edges
not paired with their reverse, and the volume after turning every triangle
to agree with its neighbours (breadth-first over shared edges).

    python3 eval/ifcopenshell-orient.py model.ifc <brep step id> [...]

Needs `pip install ifcopenshell numpy` (0.9). Same tessellation as
eval/ifcopenshell-volumes.py --breps (0.05 mm, 0.02 rad). A closed mesh
whose directed edges do not all pair with their reverse has faces turned the
wrong way, and its signed volume is wrong by twice their share; the turned
figure is what the same triangles enclose. Written for
eval/pole-faces-2026-11-22.md.
"""
import sys, ifcopenshell, ifcopenshell.geom, numpy as np
from collections import defaultdict, deque
m=ifcopenshell.open(sys.argv[1])
s=ifcopenshell.geom.settings(); s.set("mesher-linear-deflection",0.00005); s.set("mesher-angular-deflection",0.02)
for sid in sys.argv[2:]:
    sh=ifcopenshell.geom.create_shape(s,m.by_id(int(sid)))
    v=np.array(sh.verts).reshape(-1,3); f=np.array(sh.faces).reshape(-1,3).tolist()
    # weld coincident vertices (the mesher writes each face's own)
    key={}; remap=[]
    for p in v:
        k=tuple(np.round(p,9)); remap.append(key.setdefault(k,len(key)))
    f=[[remap[i] for i in t] for t in f]
    f=[t for t in f if len(set(t))==3]
    V=np.zeros((len(key),3))
    for k,i in key.items(): V[i]=k
    vol=lambda F: sum(np.dot(V[a],np.cross(V[b],V[c])) for a,b,c in F)/6
    d=defaultdict(int); ue=defaultdict(list)
    for ti,t in enumerate(f):
        for i in range(3):
            a,b=t[i],t[(i+1)%3]; d[(a,b)]+=1; ue[(min(a,b),max(a,b))].append(ti)
    unpaired=sum(1 for (a,b),c in d.items() if c!=1 or d.get((b,a),0)!=1)
    # orient: BFS
    F=[list(t) for t in f]; seen=[False]*len(F); comps=0
    for s0 in range(len(F)):
        if seen[s0]: continue
        comps+=1; seen[s0]=True; q=deque([s0])
        while q:
            ti=q.popleft(); t=F[ti]
            for i in range(3):
                a,b=t[i],t[(i+1)%3]
                for tj in ue[(min(a,b),max(a,b))]:
                    if tj==ti or seen[tj]: continue
                    u=F[tj]
                    same=any(u[j]==a and u[(j+1)%3]==b for j in range(3))
                    if same: F[tj]=u[::-1]
                    seen[tj]=True; q.append(tj)
    print(f"#{sid}: IfcOpenShell {abs(vol(f)):.6g}, directed edges unpaired {unpaired} of {len(d)}, pieces {comps}, turned to agree {abs(vol(F)):.6g}")
