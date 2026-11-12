#!/usr/bin/env node
// Command line: cut and fill between existing-ground shots and a design.
//
//   node cli.mjs existing.csv --pad 105.5 [--slope-x 1] [--slope-y -0.5] [--at E,N]
//   node cli.mjs existing.csv --balance [--slope-x 1] ...      pad elevation that balances
//   node cli.mjs existing.csv --proposed finished.csv            two surfaces
//        [--boundary pad.csv] [--units ft|m] [--format auto|PNEZD|PENZD|NEZ|ENZ]
//        [--strip 0.5] [--shrink 15] [--swell 25] [--truck 12] [--max-edge 100]
//        [--json] [--csv out.csv]
//   node cli.mjs --example --balance --shrink 15
//
// Not engineering advice: a TIN is only as good as its shots.
import { readFileSync, writeFileSync } from 'node:fs';
import { run as compute, toCsv, exampleCsv, EXAMPLE_BOUNDARY } from './earthwork.mjs';

export function parseArgs(argv) {
  const a = { file: null, proposed: null, boundary: null, units: 'ft', format: 'auto', pad: {}, json: false, csv: null, example: false, balance: false };
  const num = { '--strip': 'strip', '--shrink': 'shrink', '--swell': 'swell', '--truck': 'truck', '--max-edge': 'maxEdge' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k in num) a[num[k]] = Number(argv[++i]);
    else if (k === '--pad') a.pad.elevation = Number(argv[++i]);
    else if (k === '--slope-x') a.pad.slopeX = Number(argv[++i]);
    else if (k === '--slope-y') a.pad.slopeY = Number(argv[++i]);
    else if (k === '--at') { const [x, y] = argv[++i].split(',').map(Number); a.pad.x0 = x; a.pad.y0 = y; }
    else if (k === '--proposed') a.proposed = argv[++i];
    else if (k === '--boundary') a.boundary = argv[++i];
    else if (k === '--units') a.units = argv[++i];
    else if (k === '--format') a.format = argv[++i];
    else if (k === '--csv') a.csv = argv[++i];
    else if (k === '--json') a.json = true;
    else if (k === '--balance') a.balance = true;
    else if (k === '--example') a.example = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else a.file = k;
  }
  return a;
}

export function run(a, read = p => readFileSync(p, 'utf8')) {
  return compute({
    existingText: a.example ? exampleCsv() : read(a.file),
    designText: a.proposed ? read(a.proposed) : null,
    boundaryText: a.boundary ? read(a.boundary) : (a.example ? EXAMPLE_BOUNDARY : null),
    format: a.format, units: a.units, pad: a.pad, balance: a.balance,
    strip: a.strip, shrink: a.shrink, swell: a.swell, truck: a.truck, maxEdge: a.maxEdge,
  });
}

const fmt = (x, d = 0) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function report(r) {
  const u = r.units; const v = r.volumes; const s = r.sheet;
  const L = [];
  L.push(`Existing ground: ${r.existing.points} points (${r.existing.format}), ${r.existing.triangles} triangles, elevations ${fmt(r.existing.zmin, 2)} to ${fmt(r.existing.zmax, 2)} ${u.length}`);
  if (r.design.type === 'plane') {
    L.push(`Design: ${r.design.balanced ? 'balanced ' : ''}pad at ${fmt(r.design.elevation, 3)} ${u.length} at E ${fmt(r.design.x0, 2)}, N ${fmt(r.design.y0, 2)}; slope ${r.design.slopeX}% east, ${r.design.slopeY}% north`);
  } else L.push(`Design: proposed-grade TIN, ${r.design.points} points, ${r.design.triangles} triangles`);
  L.push(`Area: ${fmt(v.area)} ${u.area}${r.boundary ? ` inside a ${r.boundary.length}-vertex boundary` : ''} (cut ${fmt(v.cutArea)}, fill ${fmt(v.fillArea)})`);
  L.push(`Cut:  ${fmt(v.cut, 1)} ${u.volume} bank (deepest ${fmt(v.maxCut, 2)} ${u.length})`);
  L.push(`Fill: ${fmt(v.fill, 1)} ${u.volume} compacted (deepest ${fmt(v.maxFill, 2)} ${u.length})`);
  if (v.strip > 0) L.push(`Topsoil strip: ${fmt(v.strip, 1)} ${u.volume} (not counted as fill)`);
  if (s.kind === 'balanced') L.push('Balanced: no export or import.');
  else L.push(`${s.kind === 'export' ? 'Export' : 'Import'}: ${fmt(s.bank, 1)} ${u.volume} bank, ${fmt(s.loose, 1)} loose at ${s.swell}% swell${s.trucks !== null ? `, about ${s.trucks} truckloads` : ''} (shrink ${s.shrink}%)`);
  for (const w of r.warnings) L.push(`! ${w}`);
  L.push('\nAn estimate between two triangulated surfaces, not engineering advice: check it against the engineer\'s grading plan and your own takeoff before you bid or move dirt.');
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || (!a.example && !a.file)) {
    console.log('usage: node cli.mjs existing.csv (--pad ELEV | --balance | --proposed finished.csv) [--boundary b.csv] [--units ft|m] [--shrink %] [--swell %] [--truck CY] [--json] [--csv out.csv]\n       node cli.mjs --example --balance --shrink 15');
    process.exit(a.help ? 0 : 2);
  }
  const r = run(a);
  if (r.error) { console.error(r.error); process.exit(1); }
  if (a.csv) writeFileSync(a.csv, toCsv(r));
  if (a.json) {
    const { cells, surface, ...rest } = r;
    console.log(JSON.stringify(rest, null, 2));
  } else console.log(report(r));
}
