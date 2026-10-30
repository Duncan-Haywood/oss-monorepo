// The invariants every shed design must keep, whatever a person types, drags,
// saves or pastes into a link. The fuzz sweep (fuzz.test.mjs) and the
// cross-feature matrix (crossfeature.test.mjs) both run them.
import { buildShed } from './model.mjs';
import { estimate, examplePrices } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { integrity } from './integrity.mjs';
import { buildSheets, sheetSvg, sheetsDxf } from './drawings.mjs';
import { buildInstructions } from './instructions.mjs';
import { solidsOf } from './render3d.mjs';
import { utilisation, marginReport, heatById } from './utilisation.mjs';
import { heatSheets, heatSheetSvg } from './utilisation-sheets.mjs';

/** What a strict R12 reader would reject: code/value pairs, integer codes, ASCII values, numeric coordinates, balanced sections, EOF. */
export function dxfProblems(dxf) {
  const out = [];
  const lines = dxf.split('\n');
  if (lines.pop() !== '') out.push('dxf does not end in a newline');
  if (lines.length % 2) out.push('dxf has an odd number of lines');
  let open = 0;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const [code, val] = [lines[i], lines[i + 1]];
    if (!/^\d+$/.test(code)) { out.push(`dxf group code ${JSON.stringify(code)}`); break; }
    if (/[^\x20-\x7e]/.test(val) || val.length > 255) { out.push(`dxf value not short ASCII: ${val.slice(0, 40)}`); break; }
    if (/^(10|20|30|11|21|31|40|50)$/.test(code) && !Number.isFinite(Number(val))) { out.push(`dxf number ${code}=${val}`); break; }
    if (code === '0' && val === 'SECTION') open++;
    if (code === '0' && val === 'ENDSEC') open--;
  }
  if (open) out.push('dxf sections unbalanced');
  if (lines.at(-1) !== 'EOF') out.push('dxf does not end with EOF');
  return out;
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/** Every invariant one design must keep; returns the list of broken ones. */
export function invariants(input, prices = examplePrices()) {
  const bad = [];
  const shed = buildShed(input);
  for (const m of [...shed.members, ...(shed.doorParts || [])]) {
    if (!finite(m.length) || m.length <= 0) bad.push(`member ${m.id} ${m.kind} length ${m.length}`);
  }
  for (const g of [...shed.members, ...shed.panels, ...shed.fixtures].map((x) => x.geom).filter(Boolean)) {
    if (![...g.origin, ...g.profile.flat(), g.thickness].every(finite)) { bad.push('non-finite geometry'); break; }
  }
  for (const [k, v] of Object.entries(shed.dims)) if (typeof v === 'number' && !finite(v)) bad.push(`dims.${k} = ${v}`);
  const est = estimate(shed, prices);
  if (!finite(est.total) || est.total <= 0) bad.push(`total ${est.total}`);
  for (const r of est.shopping) if (!finite(r.qty) || r.qty <= 0 || !finite(r.price) || r.price < 0 || !finite(r.total)) bad.push(`shopping ${r.name} qty ${r.qty} price ${r.price}`);
  const integ = integrity(shed);
  if (integ.floating.length) bad.push(`floating: ${integ.floating.slice(0, 3).join(', ')}`);
  // A ridge too low to clear the ties or plates is a design the tool warns about, not a modelling bug.
  if (integ.clashes.length && !shed.warnings.some((w) => w.startsWith('The ridge sits too low'))) bad.push(`clashes: ${integ.clashes.slice(0, 3).join(', ')}`);
  const sc = structuralChecks(shed);
  for (const row of sc.rows) if (!finite(row.ratio) || row.ratio < 0) bad.push(`check ${row.member} ratio ${row.ratio}`);
  // The utilisation report and the heat-map plan sheets print every ratio as text.
  const uses = utilisation(shed, sc);
  const words = JSON.stringify(marginReport(shed, 0.7, uses)) + heatSheets(shed, heatById(uses)).map((s) => heatSheetSvg(s)).join('');
  if (/Infinity|NaN|undefined/.test(words)) bad.push(`utilisation text: ${words.match(/.{0,40}(Infinity|NaN|undefined).{0,10}/)?.[0]}`);
  for (const n of [shed.dims.floorless ? 'Perimeter timbers on the gravel' : 'Floor joists', shed.design.style === 'gambrel' ? 'Lower chords' : 'Rafters', 'Wall studs']) if (!sc.rows.some((x) => x.member === n || x.member.startsWith(`${n}, `))) bad.push(`check missing: ${n}`);
  const cc = connectionChecks(shed);
  for (const row of cc.rows) if (!row.ok) bad.push(`connection: ${row.check}: ${row.detail.slice(0, 120)}`);
  const sheets = buildSheets(shed);
  for (const s of sheets) {
    const svg = sheetSvg(s, { name: shed.design.name });
    if (/NaN|undefined|Infinity/.test(svg)) bad.push(`svg ${s.id} has NaN/undefined`);
    // Well-formed enough for an XML parser: no stray < or & in text, every element closed.
    const body = svg.replace(/<style>[\s\S]*?<\/style>/, '');
    if (/>[^<]*[&](?!amp;|lt;|gt;|quot;|#\d+;)/.test(body) || /<[^>]*</.test(body)) bad.push(`svg ${s.id} has unescaped text`);
    const open = (body.match(/<[a-z]+[^>]*[^/]>/g) || []).length;
    const close = (body.match(/<\/[a-z]+>/g) || []).length;
    if (open !== close) bad.push(`svg ${s.id}: ${open} open tags, ${close} closed`);
  }
  bad.push(...dxfProblems(sheetsDxf(sheets)));
  const ins = buildInstructions(shed, est);
  if (/NaN|undefined/.test(JSON.stringify(ins))) bad.push('instructions have NaN/undefined');
  solidsOf(shed);
  return bad;
}
