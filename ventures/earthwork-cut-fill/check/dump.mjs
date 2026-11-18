// Writes random survey sets and this engine's triangles and volumes as JSON
// for differential.py to check against scipy (Qhull) and a closed form.
import { makeSurface, computeVolumes, designPlane } from '../earthwork.mjs';
const sets = [];
for (const seed of [3, 5, 8, 13, 21]) {
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pts = [];
  for (let i = 0; i < 800; i++) { const x = 612400 + r() * 300, y = 2087150 + r() * 200; pts.push({ id: String(i), x, y, z: 100 + 0.02 * (x - 612400) + 2 * Math.sin((y - 2087150) / 30) + r() * 0.3 }); }
  const surf = makeSurface(pts);
  const plane = { elevation: 103, x0: 612550, y0: 2087250, slopeX: 1, slopeY: -0.5 };
  const v = computeVolumes(surf, designPlane(plane));
  sets.push({ seed, pts: surf.pts.map(p => [p.x, p.y, p.z]), tris: surf.tris, plane, cut: v.cut, fill: v.fill });
}
process.stdout.write(JSON.stringify(sets));
