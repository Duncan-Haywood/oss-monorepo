#!/usr/bin/env node
// Command line: design lateral pressure of fresh concrete on wall or column
// forms, by the ACI 347R equations.
//
//   node cli.mjs --wall|--column --height 10 --rate 5 --temp 70
//                [--weight 150] [--chemistry plain|plainRetarded|blend|blendRetarded|highScm]
//                [--hydrostatic] [--tie 3000 [--tie-across 2]] [--rated 1000] [--si] [--json]
//
// --hydrostatic: the concrete is outside the equations' conditions (SCC,
// slump over 7 in, pumped from the base, external vibration). --si reads
// m, m/h, °C, kg/m³ and prints kPa. Not engineering advice: the formwork
// designer and the engineer of record decide the design pressure.
import { pathToFileURL } from 'node:url';
import { designPressure, tieLayout, maxRate, fromSI, toSI, CHEMISTRY, EXAMPLE, PSF_TO_KPA, FT, LBF_TO_KN } from './pressure.mjs';

export const HELP = `Usage: node cli.mjs --wall|--column --height H --rate R --temp T [options]

  --height H        placement height (ft, or m with --si)
  --rate R          rate of placement, vertical rise per hour (ft/h, or m/h)
  --temp T          concrete temperature at placement (°F, or °C)
  --weight W        unit weight (lb/ft³, default 150; kg/m³ with --si, default 2400)
  --chemistry C     ${Object.keys(CHEMISTRY).join(' | ')} (default plain)
  --hydrostatic     SCC, slump over 7 in, pumped from the base or externally vibrated
  --tie SWL         tie safe working load (lb, or kN) to size tie spacing
  --tie-across S    horizontal tie spacing (ft, or m) for the vertical spacing
  --rated P         form rated pressure (psf, or kPa): fastest allowed pour rate
  --si              metric inputs and outputs
  --json            machine-readable output
  --example         10 ft wall, 5 ft/h, 70 °F, Type I cement

Not engineering advice. The formwork designer and the engineer of record decide the design pressure.`;

export function parseArgs(argv) {
  const a = { element: null, si: false, json: false, hydrostatic: false, chemistry: 'plain' };
  const num = { '--height': 'height', '--rate': 'rate', '--temp': 'temp', '--weight': 'unitWeight', '--tie': 'tie', '--tie-across': 'tieAcross', '--rated': 'rated' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k in num) a[num[k]] = argv[++i];
    else if (k === '--wall') a.element = 'wall';
    else if (k === '--column') a.element = 'column';
    else if (k === '--chemistry') a.chemistry = argv[++i];
    else if (k === '--hydrostatic') a.hydrostatic = true;
    else if (k === '--si') a.si = true;
    else if (k === '--json') a.json = true;
    else if (k === '--example') a.example = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else a.unknown = k;
  }
  return a;
}

export function run(a) {
  if (a.unknown) return { error: `Unknown argument: ${a.unknown}` };
  let input = a.example ? { ...EXAMPLE } : {
    element: a.element, height: a.height, rate: a.rate, temp: a.temp,
    unitWeight: a.unitWeight ?? (a.si ? 2400 : 150), chemistry: a.chemistry, conditionsMet: !a.hydrostatic,
  };
  if (a.si && !a.example) input = fromSI(input);
  try {
    const us = designPressure(input);
    const out = { us, si: a.si && !a.example };
    if (a.tie !== undefined) {
      const swl = a.si ? Number(a.tie) / LBF_TO_KN : Number(a.tie);
      const across = a.tieAcross === undefined ? undefined : (a.si ? Number(a.tieAcross) / FT : Number(a.tieAcross));
      out.ties = tieLayout(us.pressure, swl, across);
    }
    if (a.rated !== undefined) {
      const rated = a.si ? Number(a.rated) / PSF_TO_KPA : Number(a.rated);
      out.maxRate = maxRate(input, rated);
    }
    return out;
  } catch (e) {
    return { error: e.message };
  }
}

const f = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

export function report(r) {
  if (r.error) return `Error: ${r.error}`;
  const si = r.si;
  const v = si ? toSI(r.us) : r.us;
  const P = si ? 'kPa' : 'psf', L = si ? 'm' : 'ft', pd = si ? 1 : 0;
  const lines = [];
  lines.push(`${v.element === 'wall' ? 'Wall' : 'Column'}: ${f(v.height, 2)} ${L} lift at ${f(v.rate, 2)} ${L}/h, concrete ${f(v.temp, 1)} °${si ? 'C' : 'F'}, ${f(v.unitWeight)} ${si ? 'kg/m³' : 'lb/ft³'}`);
  lines.push(`  Cw ${f(v.Cw, 3)}, Cc ${f(v.Cc, 1)}`);
  lines.push(`  ${v.reason}`);
  lines.push(`Design lateral pressure: ${f(v.pressure, pd)} ${P}  (${v.governs === 'formula' ? 'equation governs' : v.governs === 'minimum' ? 'the 600·Cw minimum governs' : 'full liquid head w·h governs'})`);
  if (v.formula !== null) lines.push(`  equation ${f(v.formula, pd)} ${P}; minimum ${f(v.minimum, pd)} ${P}; liquid head ${f(v.hydrostatic, pd)} ${P}`);
  lines.push(`  reached ${f(v.headDepth, 2)} ${L} below the top; constant below that`);
  lines.push(`  resultant ${f(v.forcePerFoot, si ? 1 : 0)} ${si ? 'kN/m' : 'lb/ft'} of form width, ${f(v.resultantAboveBase, 2)} ${L} above the base`);
  if (r.ties) {
    const area = si ? r.ties.areaPerTie * FT * FT : r.ties.areaPerTie;
    lines.push(`Ties: each may carry ${f(area, 2)} ${L}² of form at the design pressure`);
    if (r.ties.maxVerticalSpacing !== undefined) lines.push(`  at ${f(si ? r.ties.horizontalSpacing * FT : r.ties.horizontalSpacing, 2)} ${L} across, at most ${f(si ? r.ties.maxVerticalSpacing * FT : r.ties.maxVerticalSpacing, 2)} ${L} up`);
  }
  if (r.maxRate) {
    const m = r.maxRate;
    const rate = m.rate === Infinity ? 'no limit' : `${f(si ? m.rate * FT : m.rate, 2)} ${L}/h`;
    lines.push(`Fastest pour for the form rating: ${rate}. ${m.limitedBy}`);
  }
  for (const w of v.warnings) lines.push(`! ${w}`);
  lines.push('\nNot engineering advice: the formwork designer and the engineer of record decide the design pressure.');
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || process.argv.length <= 2) { console.log(HELP); process.exit(a.help ? 0 : 2); }
  const r = run(a);
  if (a.json && !r.error) console.log(JSON.stringify(r, null, 2));
  else console.log(report(r));
  process.exit(r.error ? 1 : 0);
}
