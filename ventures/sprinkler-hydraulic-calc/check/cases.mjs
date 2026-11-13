// Seeded test networks for the EPANET comparison: the example plus random
// grids (ladders of branch lines between two cross mains) with uneven
// elevations, sizes and K factors, and random trees.
import { EXAMPLE, PIPE_ID } from '../hydraulics.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function grid(seed) {
  const r = rng(seed);
  const pick = a => a[Math.floor(r() * a.length)];
  const lines = 2 + Math.floor(r() * 6);
  const heads = 1 + Math.floor(r() * 6);
  const nodes = [{ id: 'S', elevationFt: 0 }];
  const pipes = [];
  const z = () => 8 + Math.round(r() * 120) / 10;
  for (let i = 1; i <= lines; i++) {
    nodes.push({ id: `A${i}`, elevationFt: z() }, { id: `B${i}`, elevationFt: z() });
    const k = pick([2.8, 4.2, 5.6, 8.0, 11.2]);
    let prev = `A${i}`;
    for (let j = 1; j <= heads; j++) {
      nodes.push({ id: `H${i}_${j}`, elevationFt: z(), k });
      pipes.push({ id: `L${i}_${j}`, from: prev, to: `H${i}_${j}`, lengthFt: 6 + Math.round(r() * 80) / 10, fittingsFt: Math.round(r() * 6), size: pick(['1', '1-1/4', '1-1/2']), schedule: pick(['sch10', 'sch40']), c: pick([100, 120, 150]) });
      prev = `H${i}_${j}`;
    }
    if (r() < 0.8) pipes.push({ id: `L${i}_end`, from: prev, to: `B${i}`, lengthFt: 6 + Math.round(r() * 80) / 10, fittingsFt: 0, size: pick(['1', '1-1/4']), schedule: 'sch40', c: 120 });
    else pipes.push({ id: `L${i}_end`, from: `A${i}`, to: `B${i}`, lengthFt: 40, fittingsFt: 0, size: '1', schedule: 'sch40', c: 120 });
    if (i > 1) {
      pipes.push({ id: `MA${i}`, from: `A${i - 1}`, to: `A${i}`, lengthFt: 10 + Math.round(r() * 40) / 10, fittingsFt: 0, size: pick(['2', '2-1/2', '3']), schedule: 'sch10', c: 120 });
      pipes.push({ id: `MB${i}`, from: `B${i - 1}`, to: `B${i}`, lengthFt: 10 + Math.round(r() * 40) / 10, fittingsFt: 0, size: pick(['2', '2-1/2', '3']), schedule: 'sch10', c: 120 });
    }
  }
  pipes.push({ id: 'feed', from: 'S', to: `A${1 + Math.floor(r() * lines)}`, lengthFt: 30 + Math.round(r() * 100), fittingsFt: 20, size: pick(['3', '4', '6']), schedule: 'sch40', c: 120 });
  if (r() < 0.5) pipes.push({ id: 'feed2', from: 'S', to: `B${1 + Math.floor(r() * lines)}`, lengthFt: 60 + Math.round(r() * 100), fittingsFt: 20, size: pick(['2-1/2', '3', '4']), schedule: 'sch40', c: 120 });
  return { source: 'S', nodes, pipes, sourcePsi: 40 + Math.round(r() * 60) };
}

export function tree(seed) {
  const r = rng(seed);
  const pick = a => a[Math.floor(r() * a.length)];
  const nodes = [{ id: 'S', elevationFt: 0 }];
  const pipes = [];
  const n = 3 + Math.floor(r() * 25);
  for (let i = 1; i <= n; i++) {
    const parent = nodes[Math.floor(r() * nodes.length)].id;
    const id = `N${i}`;
    nodes.push({ id, elevationFt: Math.round(r() * 200) / 10, ...(r() < 0.6 ? { k: pick([4.2, 5.6, 8.0]) } : {}) });
    pipes.push({ id: `P${i}`, from: parent, to: id, lengthFt: 5 + Math.round(r() * 200) / 10, fittingsFt: Math.round(r() * 10), size: pick(Object.keys(PIPE_ID.sch40).slice(0, 6)), schedule: pick(['sch10', 'sch40']), c: pick([100, 120, 150]) });
  }
  // Leaves without a sprinkler would be dead ends; give every leaf a head.
  const hasChild = new Set(pipes.map(p => p.from));
  for (const nd of nodes) if (nd.id !== 'S' && !hasChild.has(nd.id) && !nd.k) nd.k = 5.6;
  if (!nodes.some(nd => nd.k)) nodes[1].k = 5.6;
  return { source: 'S', nodes, pipes, sourcePsi: 30 + Math.round(r() * 70) };
}

export function cases() {
  const out = [{ name: 'example', ...EXAMPLE, sourcePsi: 50 }];
  for (let s = 1; s <= 30; s++) out.push({ name: `grid-${s}`, ...grid(s) });
  for (let s = 1; s <= 30; s++) out.push({ name: `tree-${s}`, ...tree(1000 + s) });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(cases().map(c => ({ ...c, pipes: c.pipes.map(p => ({ ...p })) }))));
