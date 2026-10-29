import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { buildInstructions, instructionsMarkdown } from './instructions.mjs';
import { fmtIn } from './lumber.mjs';

const make = (d) => { const s = buildShed(d); return { s, sections: buildInstructions(s, estimate(s)) }; };

test('instructions run in build order and carry this design\'s numbers', () => {
  const { s, sections } = make(defaultDesign());
  const titles = sections.map((x) => x.title);
  const order = ['Before you start', 'Ground under each block', 'Skids', 'Floor frame', 'Subfloor', 'Tie the walls together', 'Ridge beam and posts', 'Rafters', 'Gable ends', 'Roof sheathing and roofing', 'Siding', 'Final checks'];
  let last = -1;
  for (const t of order) { const i = titles.indexOf(t); assert.ok(i > last, t); last = i; }
  const md = instructionsMarkdown(sections, s.design.name);
  assert.match(md, /Cut 12 full studs at 82"/); // 86-1/2" wall less three plates
  assert.match(md, /diagonals must read 14' 5-1\/16"/); // floor frame: hypot(144, 96)
  assert.ok(md.includes(`read ${s.design.pitch} on the COMMON scale`));
  assert.ok(md.includes(`Cut length from a square end: ${fmtIn(s.dims.rafterCut)}`));
  assert.match(md, /a jack each side at 76-1\/2"/); // 78" door less the 1-1/2" plate
  assert.ok(!/undefined|NaN/.test(md));
});

test('every part mark the instructions name is a real mark', () => {
  for (const make2 of [defaultDesign, PRESETS['8x12 classic'], PRESETS['12x16']]) {
    const s = buildShed(make2());
    const est = estimate(s);
    const known = new Set(est.parts.map((p) => p.mark));
    const md = instructionsMarkdown(buildInstructions(s, est), 'x');
    for (const m of md.matchAll(/\(marks? ([A-Z, ]+)[,)]/g)) for (const mk of m[1].split(/,\s*/)) if (mk) assert.ok(known.has(mk), `${mk} in ${m[0]}`);
  }
});

test('a ridge-board shed gets ridge-board and rafter-tie steps instead of beam steps', () => {
  const { sections } = make(PRESETS['8x12 classic']());
  const md = instructionsMarkdown(sections, 'x');
  assert.match(md, /## \d+\. Ridge board/);
  assert.match(md, /rafter tie/);
  assert.ok(!/Ridge beam and posts/.test(md));
});
