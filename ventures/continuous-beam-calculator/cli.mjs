#!/usr/bin/env node
// Continuous beam calculator, command line.
//   node cli.mjs --spans 14,14,10 --supports pin,pin,pin,free --E 1600000 --section 1.5x11.25x3 \
//     --udl D:150 --udl L:400 --point D:900@38 --Fb 1350 --Fv 170
//   node cli.mjs --json beam.json        (the same object run() takes)
//   node cli.mjs --example
// Loads: --udl CASE:w[@x1-x2] or CASE:w1..w2@x1-x2 (down per length), --point CASE:P@x, --moment CASE:M@x (clockwise).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { run as solve, EXAMPLE, fmt, parseLoad } from './beam.mjs';
export { parseLoad };

export function parseArgs(argv) {
  const o = { loads: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => { const x = argv[++i]; if (x == null) throw new Error(`${k} needs a value.`); return x; };
    if (k === '--example') o.example = true;
    else if (k === '--json') o.json = v();
    else if (k === '--units') o.units = v();
    else if (k === '--spans') o.spans = v().split(',').map(Number);
    else if (k === '--supports') o.supports = v().split(',');
    else if (k === '--E') o.E = Number(v());
    else if (k === '--I') o.I = Number(v());
    else if (k === '--S') o.S = Number(v());
    else if (k === '--A') o.A = Number(v());
    else if (k === '--section') { const p = v().split('x').map(Number); o.section = { b: p[0], d: p[1], plies: p[2] ?? 1 }; }
    else if (k === '--Fb') o.Fb = Number(v());
    else if (k === '--Fv') o.Fv = Number(v());
    else if (k === '--live-limit') o.liveLimit = Number(v());
    else if (k === '--total-limit') o.totalLimit = Number(v());
    else if (k === '--factors') { const [D, L] = v().split(',').map(Number); o.factors = { D, L }; }
    else if (k === '--no-pattern') o.pattern = false;
    else if (k === '--udl' || k === '--point' || k === '--moment') o.loads.push(parseLoad(k.slice(2), v()));
    else if (k === '--help' || k === '-h') o.help = true;
    else throw new Error(`Unknown option ${k}.`);
  }
  return o;
}

export function run(opts, read = p => readFileSync(p, 'utf8')) {
  try {
    const input = opts.example ? EXAMPLE : opts.json ? JSON.parse(read(opts.json)) : opts;
    return solve(input);
  } catch (e) { return { error: e.message }; }
}

const n2 = v => fmt(v, 2), n0 = v => fmt(v, 0);
const dir = (v, u) => `${n2(Math.abs(v) * u.deflScale)} ${u.defl} ${v < 0 ? 'up' : 'down'}`;
export function report(r) {
  if (r.error) return `Error: ${r.error}`;
  const u = r.u, res = r.result, out = [];
  const total = res.model.total;
  out.push(`Beam: ${res.model.spans.map(s => `${s} ${u.len}`).join(' + ')} = ${total} ${u.len}; supports ${res.model.supports.join(', ')}; EI ${n0(r.EI)} ${u.force}·${u.len}²`);
  out.push(`Loads: dead ${n0(res.totals.dead)} ${u.force}, live ${n0(res.totals.live)} ${u.force}${res.patterned ? ', live patterned span by span' : ''}${res.factors.D !== 1 || res.factors.L !== 1 ? `; strength uses ${res.factors.D}D + ${res.factors.L}L` : ''}`);
  out.push('');
  out.push('Reactions (up +):');
  for (const s of res.reactions) {
    if (s.type === 'free') continue;
    out.push(`  Support ${s.support} (${s.type}, x = ${s.x} ${u.len}): dead ${n0(s.dead)}, max ${n0(s.max)}, min ${n0(s.min)} ${u.force}${s.type === 'fixed' ? `; moment ${n0(s.momentMin)} to ${n0(s.momentMax)} ${u.moment}` : ''}`);
  }
  out.push('');
  res.spans.forEach((s, i) => {
    const c = r.checks[i];
    out.push(`Span ${s.span} (${s.length} ${u.len}${s.cantilever ? ', cantilever' : ''}):`);
    if (s.Mpos.value <= 1e-9 * Math.max(1, Math.abs(s.Mneg.value))) out.push('  +M none (the span only hogs)');
    else out.push(`  +M ${n0(s.Mpos.value)} ${u.moment} at x = ${n2(s.Mpos.at)} ${u.len}${s.Mpos.liveOn ? ` (live on span${s.Mpos.liveOn.length === 1 ? '' : 's'} ${s.Mpos.liveOn.join(', ') || 'none'})` : ''}`);
    if (s.Mneg.value >= -1e-9 * Math.max(1, Math.abs(s.Mpos.value))) out.push('  -M none (the span only sags)');
    else out.push(`  -M ${n0(s.Mneg.value)} ${u.moment} at x = ${n2(s.Mneg.at)} ${u.len}${s.Mneg.liveOn ? ` (live on span${s.Mneg.liveOn.length === 1 ? '' : 's'} ${s.Mneg.liveOn.join(', ') || 'none'})` : ''}`);
    out.push(`  |V| ${n0(s.Vmax)} ${u.force}`);
    out.push(`  Deflection: live ${dir(s.defl.live, u)} (L/${n0(c.liveRatio)}, limit ${n2(c.liveAllowed * u.deflScale)}) ${c.liveOk ? 'ok' : 'OVER'}; total ${dir(s.defl.total, u)} (L/${n0(c.totalRatio)}, limit ${n2(c.totalAllowed * u.deflScale)}) ${c.totalOk ? 'ok' : 'OVER'}${s.cantilever ? '; judged on twice the overhang' : ''}`);
    if (c.fb != null) out.push(`  Bending stress ${n0(c.fb)} ${u.stress}${c.fbRatio != null ? ` = ${n2(c.fbRatio)} of Fb ${c.fbOk ? 'ok' : 'OVER'}` : ''}`);
    if (c.fv != null) out.push(`  Shear stress (1.5V/A) ${n0(c.fv)} ${u.stress}${c.fvRatio != null ? ` = ${n2(c.fvRatio)} of Fv ${c.fvOk ? 'ok' : 'OVER'}` : ''}`);
  });
  for (const n of r.notes) out.push(`Note: ${n}`);
  out.push('');
  out.push(r.ok ? 'Passes every check you gave it.' : 'FAILS at least one check above.');
  out.push('An elastic analysis of your typed figures, not engineering advice. Allowables are taken as typed (adjust them for duration, size, repetitive use and so on yourself); lateral-torsional buckling, bearing and connections are not checked. Have a licensed engineer check anything that carries people.');
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help || process.argv.length <= 2) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 8).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
    const r = run(o); console.log(report(r)); process.exit(r.error ? 2 : 0);
  } catch (e) { console.error(`Error: ${e.message}`); process.exit(2); }
}
