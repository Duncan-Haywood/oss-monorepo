// Independent check of the below-grade closed forms in load.mjs: solve 2-D
// steady conduction in the soil around a basement by finite volumes and
// compare the wall's and floor's heat loss with belowGradeWallU and
// basementFloorU.
//
// Model (the closed forms' own assumptions, so the comparison tests the
// circular-path approximation, not a different physics): a long basement of
// width W, floor D below grade, cut into a uniform soil of conductivity k.
// The ground surface is held at 0, the room at 1 (°F above the ground surface
// design temperature). The wall's inside face loses through its own R
// (concrete + film) into the soil, the floor likewise. Symmetry at the
// basement's centreline; the far side and the bottom of a large soil block are
// insulated, so all heat leaves through the ground surface. With deepT set,
// the bottom of the block is instead held at deepT: the deep ground at the
// annual mean, warmer than the surface on a winter design day, which the
// closed forms leave out.
//
//   node eval/basement-fd.mjs            # table for the README
import { pathToFileURL } from 'node:url';
import { belowGradeWallU, basementFloorU, basementWallOtherR, basementFloorOtherR } from '../load.mjs';

export function solve({ W, D, k = 0.8, Rwall, Rfloor, h = 0.25, far = 40, deep = 40, deepT = null }) {
  const half = W / 2;
  const nx = Math.round((half + far) / h), ny = Math.round(deep / h);
  const ix0 = Math.round(half / h); // cells with i < ix0 lie under/inside the basement
  const jD = Math.round(D / h);     // rows j < jD are above the floor
  const soil = (i, j) => i >= 0 && i < nx && j >= 0 && j < ny && !(i < ix0 && j < jD);
  const id = new Int32Array(nx * ny).fill(-1);
  let n = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (soil(i, j)) id[j * nx + i] = n++;
  // Matrix rows as neighbour lists; b holds conductance to the room (T = 1).
  const diag = new Float64Array(n), b = new Float64Array(n), nb = Array.from({ length: n }, () => []);
  const gWall = h / (h / (2 * k) + Rwall), gFloor = h / (h / (2 * k) + Rfloor), gSurf = 2 * k;
  const wallCells = [], floorCells = [], surfCells = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = id[j * nx + i]; if (p < 0) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (soil(ii, jj)) { diag[p] += k; nb[p].push([id[jj * nx + ii], k]); continue; }
      if (jj < 0) { diag[p] += gSurf; surfCells.push(p); }                       // ground surface, T = 0
      else if (jj >= ny && deepT != null) { diag[p] += gSurf; b[p] += gSurf * deepT; } // deep ground held at deepT
      else if (ii === ix0 - 1 && jj < jD) { diag[p] += gWall; b[p] += gWall; wallCells.push(p); }   // wall face
      else if (jj === jD - 1 && ii < ix0) { diag[p] += gFloor; b[p] += gFloor; floorCells.push(p); } // floor face
      // otherwise symmetry or far boundary: insulated
    }
  }
  // Jacobi-preconditioned conjugate gradients.
  const T = new Float64Array(n), r = Float64Array.from(b), z = new Float64Array(n), q = new Float64Array(n);
  for (let p = 0; p < n; p++) z[p] = r[p] / diag[p];
  const d = Float64Array.from(z);
  let rz = 0; for (let p = 0; p < n; p++) rz += r[p] * z[p];
  const bnorm = Math.sqrt(b.reduce((a, v) => a + v * v, 0));
  for (let it = 0; it < 20000; it++) {
    for (let p = 0; p < n; p++) { let s = diag[p] * d[p]; for (const [o, g] of nb[p]) s -= g * d[o]; q[p] = s; }
    let dq = 0; for (let p = 0; p < n; p++) dq += d[p] * q[p];
    const a = rz / dq; let rr = 0;
    for (let p = 0; p < n; p++) { T[p] += a * d[p]; r[p] -= a * q[p]; rr += r[p] * r[p]; }
    if (Math.sqrt(rr) < 1e-10 * bnorm) break;
    let rz2 = 0; for (let p = 0; p < n; p++) { z[p] = r[p] / diag[p]; rz2 += r[p] * z[p]; }
    const beta = rz2 / rz; rz = rz2;
    for (let p = 0; p < n; p++) d[p] = z[p] + beta * d[p];
  }
  const qWall = wallCells.reduce((a, p) => a + gWall * (1 - T[p]), 0);   // per ft of wall length, per °F
  const qFloor = floorCells.reduce((a, p) => a + gFloor * (1 - T[p]), 0); // per ft of length, half floor
  const qSurf = surfCells.reduce((a, p) => a + gSurf * T[p], 0);
  return { wallU: qWall / D, floorU: qFloor / half, balance: deepT == null ? (qWall + qFloor) / qSurf : null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Two soil blocks: (a) insulated far side and bottom 80 ft out, the closed
  // forms' own model; (b) the bottom 30 ft down held at the annual mean, with
  // the example climate (indoor 70, annual mean 55, amplitude 20: deep ground
  // at (55 - 35) / (70 - 35) = 0.571 of the room's excess).
  const k = 0.8, h = Number(process.env.FD_H || 0.25);
  const pct = (a, c) => `${((c / a - 1) * 100).toFixed(0)}%`;
  console.log(`grid ${h} ft, soil k ${k} Btu/h·ft·°F; U in Btu/h·ft²·°F of wall or floor area per °F below the room`);
  console.log('| W ft | D ft | wall R | floor R | wall U closed | FD (a) | closed vs (a) | FD (b) | floor U closed | FD (a) | closed vs (a) | FD (b) |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [W, D, wR, fR] of [[24, 7, 0, 0], [24, 4, 0, 0], [24, 2, 0, 0], [16, 7, 0, 0], [24, 7, 10, 0], [24, 7, 0, 10], [32, 7, 10, 10]]) {
    const Rw = basementWallOtherR(wR), Rf = basementFloorOtherR(fR);
    const a = solve({ W, D, k, Rwall: Rw, Rfloor: Rf, h, far: 80, deep: 80 });
    const b = solve({ W, D, k, Rwall: Rw, Rfloor: Rf, h, far: 80, deep: 30, deepT: 20 / 35 });
    const cw = belowGradeWallU({ z1Ft: 0, z2Ft: D, soilK: k, otherR: Rw });
    const cf = basementFloorU({ widthFt: W, depthFt: D, soilK: k, otherR: Rf });
    console.log(`| ${[W, D, wR, fR, cw.toFixed(3), a.wallU.toFixed(3), pct(a.wallU, cw), b.wallU.toFixed(3), cf.toFixed(4), a.floorU.toFixed(4), pct(a.floorU, cf), b.floorU.toFixed(4)].join(' | ')} |`);
  }
}
