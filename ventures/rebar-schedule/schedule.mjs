// Read a bar bending schedule, work out every cut length and weight, and plan
// the cutting from stock bars for each bar size.

import { SHAPES, cutLength, massPerMetre, MIN_RADIUS } from './shapes.mjs';
import { planCutting } from './stock.mjs';

const HEADERS = {
  mark: ['mark', 'bar mark', 'barmark', 'ref'],
  dia: ['dia', 'diameter', 'size', 'bar size', 'type and size'],
  shape: ['shape', 'shape code', 'code'],
  members: ['members', 'no of members', 'no. of members', 'no mbrs', 'mbrs'],
  each: ['each', 'no in each', 'no. in each', 'bars each', 'per member'],
  A: ['a'], B: ['b'], C: ['c'], D: ['d', 'd dim', 'dim d'], E: ['e'], F: ['f'], R: ['r', 'radius'],
};
// Positional layout when there is no header row.
const POSITIONAL = ['mark', 'dia', 'shape', 'members', 'each', 'A', 'B', 'C', 'D', 'E', 'F'];

function splitLine(line) {
  const sep = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',';
  return line.split(sep).map(s => s.trim().replace(/^"|"$/g, ''));
}

function headerMap(cells) {
  const map = {};
  const low = cells.map(c => c.toLowerCase().replace(/\s+/g, ' ').trim());
  for (const [key, names] of Object.entries(HEADERS)) {
    const i = names.map(n => low.indexOf(n)).find(j => j >= 0) ?? -1;
    if (i >= 0 && !Object.values(map).includes(i)) map[key] = i;
  }
  return map.mark != null && map.dia != null && map.shape != null ? map : null;
}

// "H16", "B500B 16", "T16", "16" -> 16
export function parseDia(s) {
  const m = /(\d+(?:\.\d+)?)\s*(?:mm)?\s*$/i.exec(String(s).trim());
  return m ? Number(m[1]) : NaN;
}

export function parseSchedule(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (!lines.length) return { rows: [], errors: ['The schedule is empty.'] };
  let map = headerMap(splitLine(lines[0]));
  const body = map ? lines.slice(1) : lines;
  if (!map) map = Object.fromEntries(POSITIONAL.map((k, i) => [k, i]));
  const rows = [];
  const errors = [];
  body.forEach((line, n) => {
    const cells = splitLine(line);
    const get = k => (map[k] != null ? cells[map[k]] : undefined);
    const num = k => { const v = get(k); return v === undefined || v === '' ? NaN : Number(v); };
    const where = `Line ${n + (map === null ? 1 : 2)} (${get('mark') || '?'})`;
    const shapeRaw = String(get('shape') ?? '').toUpperCase().replace(/^SC/, '');
    const shape = /^\d$/.test(shapeRaw) ? `0${shapeRaw}` : shapeRaw;
    const row = {
      mark: get('mark') || `#${n + 1}`,
      dia: parseDia(get('dia')),
      shape,
      members: Number.isFinite(num('members')) ? num('members') : 1,
      each: Number.isFinite(num('each')) ? num('each') : 1,
      dims: {},
      radius: num('R'),
    };
    for (const k of ['A', 'B', 'C', 'D', 'E', 'F']) { const v = num(k); if (Number.isFinite(v)) row.dims[k] = v; }
    if (!Number.isFinite(row.dia) || row.dia <= 0) { errors.push(`${where}: no bar size.`); return; }
    if (!SHAPES[shape]) { errors.push(`${where}: shape code "${get('shape')}" is not supported (00, 11, 21, 51 or R).`); return; }
    if (!(row.members > 0 && row.each > 0 && Number.isInteger(row.members) && Number.isInteger(row.each))) { errors.push(`${where}: members and bars each must be whole numbers.`); return; }
    if (MIN_RADIUS[row.dia] == null && !(row.radius > 0)) { errors.push(`${where}: ${row.dia} mm is not a standard size; give the radius in an R column.`); return; }
    rows.push(row);
  });
  return { rows, errors };
}

// Cut lengths, totals and weights per mark and per bar size.
export function takeoff(rows, { round = 25 } = {}) {
  const lines = [];
  const errors = [];
  for (const row of rows) {
    try {
      const { exact, cut, r } = cutLength(row.shape, row.dims, row.dia, { radius: row.radius, round });
      const count = row.members * row.each;
      const kgm = massPerMetre(row.dia);
      lines.push({ ...row, r, exact, cut, count, totalLength: cut * count, kg: cut * count / 1000 * kgm });
    } catch (e) { errors.push(`${row.mark}: ${e.message}`); }
  }
  const bySize = new Map();
  for (const l of lines) {
    const s = bySize.get(l.dia) || { dia: l.dia, bars: 0, length: 0, kg: 0, marks: 0 };
    s.bars += l.count; s.length += l.totalLength; s.kg += l.kg; s.marks++;
    bySize.set(l.dia, s);
  }
  const sizes = [...bySize.values()].sort((a, b) => a.dia - b.dia);
  return { lines, sizes, totalKg: sizes.reduce((s, x) => s + x.kg, 0), errors };
}

// Cutting plan per bar size, from the stock lengths given (mm).
export function cuttingPlans(lines, stockLengths, { kerf = 0 } = {}) {
  const plans = [];
  const sizes = [...new Set(lines.map(l => l.dia))].sort((a, b) => a - b);
  for (const dia of sizes) {
    const pieces = lines.filter(l => l.dia === dia).map(l => ({ length: l.cut, count: l.count }));
    try {
      const plan = planCutting(pieces, stockLengths.map(length => ({ length })), { kerf });
      const kgm = massPerMetre(dia);
      plans.push({ dia, ...plan, boughtKg: plan.bought / 1000 * kgm, wasteKg: plan.waste / 1000 * kgm, marksByLength: marksFor(lines, dia) });
    } catch (e) { plans.push({ dia, error: e.message }); }
  }
  return plans;
}

function marksFor(lines, dia) {
  const m = new Map();
  for (const l of lines.filter(x => x.dia === dia)) m.set(l.cut, [...(m.get(l.cut) || []), l.mark]);
  return Object.fromEntries(m);
}

export function run(text, { round = 25, stock = [12000], kerf = 0 } = {}) {
  const parsed = parseSchedule(text);
  const t = takeoff(parsed.rows, { round });
  const plans = cuttingPlans(t.lines, stock, { kerf });
  return { ...t, plans, errors: [...parsed.errors, ...t.errors] };
}

export function scheduleCsv(result) {
  const rows = [['mark', 'size_mm', 'shape', 'A', 'B', 'C', 'D', 'E', 'members', 'each', 'total_bars', 'cut_length_mm', 'total_length_m', 'weight_kg']];
  for (const l of result.lines) rows.push([l.mark, l.dia, l.shape, ...['A', 'B', 'C', 'D', 'E'].map(k => l.dims[k] ?? ''), l.members, l.each, l.count, l.cut, (l.totalLength / 1000).toFixed(3), l.kg.toFixed(2)]);
  return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function cuttingCsv(result) {
  const rows = [['size_mm', 'stock_mm', 'bars', 'cuts', 'offcut_mm']];
  for (const p of result.plans) {
    if (p.error) continue;
    for (const pat of p.patterns) rows.push([p.dia, pat.stock, pat.times, pat.cuts.map(c => `${c.count} x ${c.length}`).join(' + '), pat.offcut]);
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}

// A cell a spreadsheet would run as a formula is quoted with a leading apostrophe.
function csvCell(v) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const EXAMPLE = `mark,dia,shape,members,each,A,B,C
01,H12,00,4,12,5400,,
02,H12,11,4,8,1800,450,
03,H16,00,2,10,7200,,
04,H16,21,2,6,900,2400,900
05,H10,51,6,22,350,550,100
06,H10,00,6,4,3650,,
07,H20,11,3,6,3100,600,
08,H20,00,3,4,8150,,
09,H12,00,4,4,2100,,
`;
