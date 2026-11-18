// Grid against tree: the same heads and pipes, with and without the far
// cross main and the branch-line ends that tie into it. Four branch lines of
// n heads at 12 ft spacing on 1-1/4 in schedule 40, 2-1/2 in schedule 10
// cross mains, all heads open at 0.15 gpm/sq ft over 130 sq ft (K 5.6).
// Prints one row per n: demand psi and gpm for the grid and the tree, and for
// a building of 10 lines where only the 4 far lines are in the design area
// (heads on lines 5 to 10 stay shut but their pipe still carries water).
import { analyze } from '../hydraulics.mjs';
import { pathToFileURL } from 'node:url';

export function ladder(n, grid, lines = 4) {
  const nodes = [{ id: 'S', elevationFt: 0 }, { id: 'R', elevationFt: 12 }];
  const pipes = [
    { id: 'feed', from: 'S', to: 'R', lengthFt: 40, fittingsFt: 30, size: '4', schedule: 'sch40', c: 120 },
    { id: 'in', from: 'R', to: `W${lines}`, lengthFt: 10, fittingsFt: 12, size: '2-1/2', schedule: 'sch10', c: 120 },
  ];
  for (let r = 1; r <= lines; r++) {
    nodes.push({ id: `W${r}`, elevationFt: 12 });
    if (grid) nodes.push({ id: `E${r}`, elevationFt: 12 });
    if (r > 1) {
      pipes.push({ id: `W${r - 1}-${r}`, from: `W${r - 1}`, to: `W${r}`, lengthFt: 12, size: '2-1/2', schedule: 'sch10', c: 120 });
      if (grid) pipes.push({ id: `E${r - 1}-${r}`, from: `E${r - 1}`, to: `E${r}`, lengthFt: 12, size: '2-1/2', schedule: 'sch10', c: 120 });
    }
    let prev = `W${r}`;
    for (let c = 1; c <= n; c++) {
      nodes.push({ id: `H${r}_${c}`, elevationFt: 12, ...(r <= 4 ? { k: 5.6 } : {}) });
      pipes.push({ id: `L${r}_${c}`, from: prev, to: `H${r}_${c}`, lengthFt: c === 1 ? 7 : 12, fittingsFt: c === 1 ? 6 : 0, size: '1-1/4', schedule: 'sch40', c: 120 });
      prev = `H${r}_${c}`;
    }
    if (grid) pipes.push({ id: `L${r}_end`, from: prev, to: `E${r}`, lengthFt: 7, size: '1-1/4', schedule: 'sch40', c: 120 });
  }
  return { source: 'S', nodes, pipes, design: { densityGpmFt2: 0.15, areaPerHeadFt2: 130, minPsi: 7 } };
}

export function table() {
  return [2, 3, 4, 5, 6, 7, 8].map(n => {
    const g = analyze(ladder(n, true)).demand;
    const t = analyze(ladder(n, false)).demand;
    const g10 = analyze(ladder(n, true, 10)).demand;
    const t10 = analyze(ladder(n, false, 10)).demand;
    return { heads: n, gridPsi: g.psi, gridGpm: g.sprinklerGpm, treePsi: t.psi, treeGpm: t.sprinklerGpm, grid10Psi: g10.psi, tree10Psi: t10.psi };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('                 4 lines, all open                       10 lines, far 4 open');
  console.log('heads/line  grid psi  grid gpm  tree psi  tree gpm  saved   grid psi  tree psi  saved');
  for (const r of table()) console.log(`${String(r.heads).padStart(10)}${r.gridPsi.toFixed(1).padStart(10)}${r.gridGpm.toFixed(0).padStart(10)}${r.treePsi.toFixed(1).padStart(10)}${r.treeGpm.toFixed(0).padStart(10)}${(r.treePsi - r.gridPsi).toFixed(1).padStart(7)}${r.grid10Psi.toFixed(1).padStart(11)}${r.tree10Psi.toFixed(1).padStart(10)}${(r.tree10Psi - r.grid10Psi).toFixed(1).padStart(7)}`);
}
