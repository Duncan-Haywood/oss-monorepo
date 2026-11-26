#!/usr/bin/env node
// Command line: FF / FL floor flatness and levelness numbers from survey readings.
//
//   node cli.mjs readings.txt [--format lines|grid|xyz] [--unit in|mm|ft|m|cm]
//                [--edge 2] [--radius 3] [--area 2500]
//                [--ff 35 --fl 25 --ff-local 24 --fl-local 17]
//                [--straightedge 10] [--gap 0.25] [--grind 40] [--json]
//   node cli.mjs --example [...]
//
// lines: one sample line per row, readings 12 in apart ("A1: 0.12 0.10 - 0.08";
//        "## Bay 3, area 2400" starts a section).
// grid:  a CSV of elevations on a 12-in lattice; lines run along rows and columns.
// xyz:   a point cloud as text (x y z per row), resampled onto a 12-in lattice.
//
// Not engineering advice, and not a substitute for a test to ASTM E1155 by a
// qualified tester: check the method against your copy of the standard.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  parseLines, parseGrid, parseXyz, latticeFromPoints, gridSurvey, analyseSection, overall,
  checkSpec, grindEstimate, exampleGrid, UNITS,
} from './flatness.mjs';

export function parseArgs(argv) {
  const a = { file: null, format: null, unit: 'in', edge: 0, radius: 3, area: null, straightedge: 10, gap: null, grind: null, json: false, example: false, spec: {} };
  const spec = { '--ff': 'ffOverall', '--fl': 'flOverall', '--ff-local': 'ffLocal', '--fl-local': 'flLocal' };
  const num = { '--edge': 'edge', '--radius': 'radius', '--area': 'area', '--straightedge': 'straightedge', '--gap': 'gap', '--grind': 'grind' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k in spec || k in num) {
      const v = argv[++i];
      const n = v === undefined || v.trim() === '' ? NaN : Number(v);
      if (!Number.isFinite(n) || n < 0) a.badValue = `${k} needs a number of 0 or more (got ${v ?? 'nothing'})`;
      else if (k in spec) a.spec[spec[k]] = n;
      else a[num[k]] = n;
    }
    else if (k === '--format') a.format = argv[++i];
    else if (k === '--unit') a.unit = argv[++i];
    else if (k === '--json') a.json = true;
    else if (k === '--example') a.example = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else if (!k.startsWith('--') && !a.file) a.file = k;
    else a.bad = k;
  }
  return a;
}

function guessFormat(text) {
  const rows = text.split(/\r?\n/).map(r => r.trim()).filter(r => r && !r.startsWith('#') || r.startsWith('##'));
  if (rows.some(r => r.startsWith('##') || /^[^,;\t\d\s.+-][^:]{0,39}:/.test(r))) return 'lines';
  const widths = rows.slice(0, 50).map(r => r.split(/[\s,;\t]+/).filter(Boolean).length);
  if (widths.length > 20 && widths.every(w => w === 3)) return 'xyz';
  return 'grid';
}

export function run(a, read = p => readFileSync(p, 'utf8')) {
  if (a.help) return { help: true };
  if (a.bad) return { error: `Unknown option ${a.bad}` };
  if (a.badValue) return { error: a.badValue };
  if (!UNITS.includes(a.unit)) return { error: `--unit must be one of ${UNITS.join(', ')}` };
  let sections, errors = [], format = a.format;
  try {
    if (a.example) {
      format = 'grid';
      sections = [{ name: 'Example bay (made up)', areaSqFt: 40 * 30, survey: gridSurvey(exampleGrid(), { edgeFt: a.edge }) }];
    } else {
      if (!a.file) return { error: 'Give a readings file, or --example.' };
      const text = read(a.file);
      format = format || guessFormat(text);
      if (format === 'lines') ({ sections, errors } = parseLines(text, a.unit));
      else if (format === 'grid') {
        const g = parseGrid(text, a.unit); errors = g.errors;
        sections = [{ name: 'Section 1', areaSqFt: a.area, survey: gridSurvey(g.grid, { edgeFt: a.edge }) }];
      } else if (format === 'xyz') {
        const p = parseXyz(text, a.unit === 'in' ? 'm' : a.unit); errors = p.errors;
        const { grid } = latticeFromPoints(p.points, { radiusIn: a.radius });
        sections = [{ name: 'Section 1', areaSqFt: a.area, survey: gridSurvey(grid, { edgeFt: a.edge }) }];
      } else return { error: `--format must be lines, grid or xyz` };
    }
  } catch (e) { return { error: e.message }; }
  if (errors.length) return { error: errors.slice(0, 5).join('\n') };
  if (!sections.length || !sections.some(s => s.survey.lines.length)) return { error: 'No sample line with 3 or more readings found.' };
  for (const s of sections) {
    if (s.areaSqFt == null) s.areaSqFt = a.area ?? 1;
    s.result = analyseSection(s.survey, { straightedgeFt: a.straightedge });
  }
  const total = overall(sections);
  const spec = checkSpec(sections, total, a.spec);
  let grind = null;
  if (a.grind > 0) {
    if (sections.length > 1) return { error: '--grind works on one section at a time.' };
    grind = grindEstimate(sections[0].survey, { targetFF: a.grind });
  }
  return { result: { format, sections, total, spec, grind, gapLimit: a.gap, straightedgeFt: a.straightedge } };
}

const f1 = v => (v == null ? '-' : !Number.isFinite(v) ? 'inf' : v.toFixed(1));

export function report({ result: r }) {
  const out = [];
  for (const s of r.sections) {
    const x = s.result;
    out.push(`${s.name}${r.sections.length > 1 ? ` (${s.areaSqFt} sq ft)` : ''}: FF ${f1(x.ff.F)} (${x.ff.n} curvatures), FL ${f1(x.fl.F)} (${x.fl.n} 10-ft differences), ${x.lines.length} line${x.lines.length === 1 ? '' : 's'}`);
    const worst = x.lines.filter(l => l.worstGap).sort((p, q) => q.worstGap.gap - p.worstGap.gap)[0];
    if (worst) {
      const over = r.gapLimit != null ? x.lines.filter(l => l.worstGap && l.worstGap.gap > r.gapLimit).length : null;
      out.push(`  Largest gap under a ${r.straightedgeFt} ft straightedge: ${worst.worstGap.gap.toFixed(3)} in on ${worst.name} at reading ${worst.worstGap.atReading + 1}${over != null ? `; ${over} line(s) over ${r.gapLimit} in` : ''}`);
    }
    for (const w of x.warnings.slice(0, 5)) out.push(`  Note: ${w}`);
  }
  if (r.sections.length > 1) out.push(`Overall (area-weighted): FF ${f1(r.total.ff)}, FL ${f1(r.total.fl)}`);
  for (const c of r.spec) out.push(`${c.pass ? 'PASS' : 'FAIL'} ${c.what}: ${f1(c.got)} against ${c.limit}`);
  if (r.grind) {
    const g = r.grind;
    out.push(`Grind estimate to FF ${g.targetFF}: ${g.reached ? 'reached' : 'not reached'} at FF ${f1(g.endFF)} by lowering ${g.points} readings (deepest ${g.maxDepthIn.toFixed(3)} in, about ${g.volumeCuFt.toFixed(2)} cu ft); FL ${f1(g.startFL)} -> ${f1(g.endFL)}. A rough lower bound on a 12-in lattice, not a grind plan.`);
  }
  out.push('Method after ASTM E1155 (inch-pound); constants from secondary sources. Not engineering advice.');
  return out.join('\n');
}

const HELP = readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 17).map(l => l.replace(/^\/\/ ?/, '')).join('\n');

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const r = run(parseArgs(process.argv.slice(2)));
  if (r.help) console.log(HELP);
  else if (r.error) { console.error(r.error); process.exitCode = 1; }
  else if (parseArgs(process.argv.slice(2)).json) {
    const strip = JSON.parse(JSON.stringify(r.result, (k, v) => (k === 'q' || k === 'd' || k === 'z' || k === 'id' ? undefined : v)));
    console.log(JSON.stringify(strip, null, 2));
  } else console.log(report(r));
}
