// A brep's volume by counting random points inside its mesh (ray parity),
// against the divergence-theorem volume the tool reports. Agreement means
// the shell is closed and its faces turned consistently; it does not check
// the faces against their surfaces.
//
//   node eval/ray-parity.mjs model.ifc <brep step id> [points, default 20000]
//
// Planar faces are fanned from their first point (right for the convex caps
// these checks were run on; a concave planar face would need ear clipping).
import { readFileSync } from "node:fs";
import { parseStep } from "../step.mjs";
import { Geometry, solidVolume } from "../geom.mjs";
const [file, id, N = 20000] = process.argv.slice(2);
const model = parseStep(readFileSync(file)); const geo = new Geometry(model);
const e = model.entities.get(+id);
const faces = geo.advancedShellLoops(e.args[0]);
const tris = [];
for (const f of faces) for (const l of f) for (let i = 1; i + 1 < l.length; i++) tris.push([l[0], l[i], l[i + 1]]);
let lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9]; for (const t of tris) for (const p of t){lo=lo.map((x,k)=>Math.min(x,p[k]));hi=hi.map((x,k)=>Math.max(x,p[k]));}
const d=[0.5773,0.5774,0.5774+0.0123]; 
const sb=(a,b)=>a.map((x,k)=>x-b[k]), cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], dt=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
let inside=0; let seed=1; const rnd=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
for (let s=0;s<N;s++){ const o=lo.map((x,k)=>x+(hi[k]-x)*rnd()); let c=0;
  for (const [a,b,cc] of tris){ const e1=sb(b,a),e2=sb(cc,a),p=cr(d,e2),det=dt(e1,p); if(Math.abs(det)<1e-30) continue; const t0=sb(o,a); const u=dt(t0,p)/det; if(u<0||u>1) continue; const q=cr(t0,e1); const v=dt(d,q)/det; if(v<0||u+v>1) continue; if(dt(e2,q)/det>0) c++; }
  if(c%2) inside++; }
const box=(hi[0]-lo[0])*(hi[1]-lo[1])*(hi[2]-lo[2]);
console.log("MC volume", inside/N*box, "box", box, "divergence", solidVolume(geo.item(+id)));
