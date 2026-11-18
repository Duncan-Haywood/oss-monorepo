import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, createSolver, combine, at, run, checks, liveBySpan, EXAMPLE } from './beam.mjs';

const close = (a, b, rel = 1e-9, msg) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${msg ?? ''} got ${a}, want ${b}`);
const udl = (w, x1, x2, c = 'D') => ({ type: 'udl', x1, x2, w1: w, case: c });

test('simple span, uniform load: wL²/8, 5wL⁴/384EI, wL/2', () => {
  const r = analyse({ spans: [20], supports: ['pin', 'pin'], EI: 1e6, loads: [udl(100, 0, 20)] });
  close(r.spans[0].Mpos.value, 100 * 400 / 8); close(r.spans[0].Mpos.at, 10);
  close(r.spans[0].defl.total, 5 * 100 * 20 ** 4 / (384 * 1e6));
  close(r.reactions[0].dead, 1000); close(r.reactions[1].dead, 1000);
  close(r.spans[0].Vmax, 1000);
});

test('simple span, off-centre point load: Pab/L and the exact max deflection', () => {
  const P = 1000, L = 12, a = 4, b = 8, EI = 2e5;
  const r = analyse({ spans: [L], supports: ['pin', 'pin'], EI, loads: [{ type: 'point', x: a, P }] });
  close(r.spans[0].Mpos.value, P * a * b / L); close(r.spans[0].Mpos.at, a);
  // with a < b the peak is at x = L - sqrt((L² - a²)/3): P a (L²-a²)^1.5 / (9√3 L EI)
  close(r.spans[0].defl.total, P * a * (L * L - a * a) ** 1.5 / (9 * Math.sqrt(3) * L * EI), 1e-9);
  close(r.spans[0].defl.liveAt ?? 0, 0); // no live load
});

test('cantilever with tip load and with uniform load', () => {
  const r1 = analyse({ spans: [8], supports: ['fixed', 'free'], EI: 5e5, loads: [{ type: 'point', x: 8, P: 300 }] });
  close(r1.spans[0].Mneg.value, -2400); close(r1.spans[0].defl.total, 300 * 512 / (3 * 5e5));
  close(r1.reactions[0].dead, 300); close(r1.reactions[0].momentMin, -2400); // clockwise-positive: the wall resists counter-clockwise
  const r2 = analyse({ spans: [8], supports: ['free', 'fixed'], EI: 5e5, loads: [udl(50, 0, 8)] });
  close(r2.spans[0].Mneg.value, -50 * 64 / 2); close(r2.spans[0].defl.total, 50 * 8 ** 4 / (8 * 5e5));
  assert.equal(r2.spans[0].cantilever, true);
});

test('propped cantilever and fixed-fixed, uniform load', () => {
  const w = 10, L = 6, EI = 1e4;
  const p = analyse({ spans: [L], supports: ['fixed', 'pin'], EI, loads: [udl(w, 0, L)] });
  close(p.reactions[1].dead, 3 * w * L / 8); close(p.reactions[0].dead, 5 * w * L / 8);
  close(p.spans[0].Mneg.value, -w * L * L / 8); close(p.spans[0].Mpos.value, 9 * w * L * L / 128);
  close(p.spans[0].defl.total, w * L ** 4 / (185 * EI), 2e-3); // tabulated 1/185 (exact 0.005416)
  const f = analyse({ spans: [L], supports: ['fixed', 'fixed'], EI, loads: [udl(w, 0, L)] });
  close(f.spans[0].Mneg.value, -w * L * L / 12); close(f.spans[0].Mpos.value, w * L * L / 24);
  close(f.spans[0].defl.total, w * L ** 4 / (384 * EI));
});

test('two equal spans, uniform load everywhere: reactions 3/8, 10/8, 3/8 and -wL²/8 over the middle', () => {
  const w = 1, L = 10;
  const r = analyse({ spans: [L, L], supports: ['pin', 'pin', 'pin'], EI: 1, loads: [udl(w, 0, 2 * L)] });
  close(r.reactions[0].dead, 0.375 * w * L); close(r.reactions[1].dead, 1.25 * w * L); close(r.reactions[2].dead, 0.375 * w * L);
  close(r.spans[0].Mneg.value, -w * L * L / 8); close(r.spans[0].Mpos.value, 9 * w * L * L / 128);
});

test('two equal spans, live load patterned: one span loaded gives +0.0957wL² and lifts the far end', () => {
  const w = 1, L = 10;
  const r = analyse({ spans: [L, L], supports: ['pin', 'pin', 'pin'], EI: 1, loads: [udl(w, 0, 2 * L, 'L')] });
  // one span loaded alone: R1 = 7wL/16, Mmax = (7/16)² wL²/2 = 49/512 wL²
  close(r.spans[0].Mpos.value, 49 / 512 * w * L * L); assert.deepEqual(r.spans[0].Mpos.liveOn, [1]);
  close(r.spans[0].Mneg.value, -w * L * L / 8); assert.deepEqual(r.spans[0].Mneg.liveOn, [1, 2]);
  close(r.reactions[0].max, 7 * w * L / 16); close(r.reactions[0].min, -w * L / 16);
  close(r.reactions[1].max, 1.25 * w * L);
});

test('three equal spans: support moment -0.1wL², reactions 0.4 and 1.1 wL, and the patterned end-span peak', () => {
  const w = 1, L = 1;
  const d = analyse({ spans: [L, L, L], supports: ['pin', 'pin', 'pin', 'pin'], EI: 1, loads: [udl(w, 0, 3, 'D')] });
  close(d.reactions[0].dead, 0.4); close(d.reactions[1].dead, 1.1); close(d.spans[0].Mneg.value, -0.1);
  close(d.spans[1].Mpos.value, 0.025); close(d.spans[0].Mpos.value, 0.08);
  const l = analyse({ spans: [L, L, L], supports: ['pin', 'pin', 'pin', 'pin'], EI: 1, loads: [udl(w, 0, 3, 'L')] });
  // spans 1 and 3 loaded: tabulated max positive moment 0.101wL²; middle span with only it loaded: 0.075wL²
  close(l.spans[0].Mpos.value, 0.10125, 1e-9); assert.deepEqual(l.spans[0].Mpos.liveOn, [1, 3]);
  close(l.spans[1].Mpos.value, 0.075, 1e-9); assert.deepEqual(l.spans[1].Mpos.liveOn, [2]);
  close(l.spans[0].Mneg.value, -0.11667, 1e-4); assert.deepEqual(l.spans[0].Mneg.liveOn, [1, 2]); // tabulated -0.117
});

test('unequal stiffness: the three-moment equation for two spans with I1 != I2', () => {
  // M_B (L1/I1 + L2/I2) * 2 = -(w L1³/(4 I1) + w L2³/(4 I2)) for uniform w on both spans (Clapeyron), E constant
  const w = 2, L1 = 6, L2 = 9, I1 = 1, I2 = 3;
  const r = analyse({ spans: [L1, L2], supports: ['pin', 'pin', 'pin'], EI: [I1, I2], loads: [udl(w, 0, L1 + L2)] });
  const MB = -(w * L1 ** 3 / (4 * I1) + w * L2 ** 3 / (4 * I2)) / (2 * (L1 / I1 + L2 / I2));
  close(r.spans[0].Mneg.value, MB); close(r.spans[1].Mneg.value, MB);
});

test('point moment and trapezoidal load satisfy equilibrium, and the solution is continuous between elements', () => {
  const m = { spans: [5, 7, 3], supports: ['fixed', 'pin', 'pin', 'free'], EI: [3e3, 5e3, 2e3], loads: [
    { type: 'udl', x1: 1, x2: 11, w1: 4, w2: 12 }, { type: 'point', x: 6.3, P: 50 }, { type: 'moment', x: 13.5, M: 40 }, { type: 'point', x: 15, P: 20 },
  ] };
  const { mesh, solve, m: nm } = createSolver(m);
  const s = solve(nm.loads);
  const totalP = 0.5 * (4 + 12) * 10 + 50 + 20;
  close(s.R.reduce((a, r) => a + r.force, 0), totalP, 1e-10, 'sum of vertical reactions');
  // moments about x=0, clockwise positive: loads down at x give +P x; reactions up give -R x; applied cw moments +M; reaction moments +Mr
  const momLoads = (4 * 10 * 6) + (0.5 * 8 * 10 * (1 + 10 * 2 / 3)) + 50 * 6.3 + 20 * 15 + 40;
  const momR = s.R.reduce((a, r, k) => a - r.force * mesh.sup[k] + r.moment, 0);
  close(momLoads + momR, 0, 1e-9, 'moment equilibrium');
  for (let e = 0; e + 1 < mesh.elems.length; e++) {
    const end = at(mesh, s, e, mesh.elems[e].L), start = at(mesh, s, e + 1, 0);
    close(end.defl, start.defl, 1e-9, `deflection continuity at ${mesh.elems[e].b}`);
    close(end.slope, start.slope, 1e-9, `slope continuity at ${mesh.elems[e].b}`);
  }
  // free end: zero moment and zero shear just inside it
  const last = mesh.elems.length - 1; const tip = at(mesh, s, last, mesh.elems[last].L);
  close(tip.M, 0, 1e-9); close(tip.V, 20, 1e-9); // dM/dx = V: hogging moment rising to zero
});

test('the superposed envelope equals brute force over every live pattern', () => {
  const m = { spans: [9, 13, 7, 11], supports: ['pin', 'pin', 'pin', 'pin', 'free'], EI: 2e4, loads: [
    udl(30, 0, 40, 'D'), udl(80, 0, 40, 'L'), { type: 'point', x: 16, P: 400, case: 'L' }, { type: 'point', x: 40, P: 150, case: 'L' },
  ] };
  const r = analyse(m);
  const { mesh, solve, m: nm } = createSolver(m);
  const dead = solve(nm.loads.filter(l => l.case === 'D'));
  const groups = liveBySpan(nm, mesh.sup).map(g => solve(g));
  for (let s = 0; s < 4; s++) {
    let best = -Infinity, worst = Infinity, dl = 0;
    for (let p = 0; p < 16; p++) {
      const sol = combine([[1, dead], ...groups.map((g, i) => [(p >> i) & 1, g])]);
      const liveOnly = combine([[0, dead], ...groups.map((g, i) => [(p >> i) & 1, g])]);
      mesh.elems.forEach((el, e) => {
        if (el.span !== s) return;
        for (let i = 0; i <= 400; i++) {
          const x = el.L * i / 400; const a = at(mesh, sol, e, x); const b = at(mesh, liveOnly, e, x);
          best = Math.max(best, a.M); worst = Math.min(worst, a.M); if (Math.abs(b.defl) > Math.abs(dl)) dl = b.defl;
        }
      });
    }
    assert.ok(r.spans[s].Mpos.value >= best - 1e-9 * Math.abs(best), `span ${s + 1} Mpos ${r.spans[s].Mpos.value} vs brute ${best}`);
    close(r.spans[s].Mpos.value, best, 1e-5, `span ${s + 1} Mpos`);
    close(r.spans[s].Mneg.value, worst, 1e-5, `span ${s + 1} Mneg`);
    close(r.spans[s].defl.live, dl, 1e-5, `span ${s + 1} live deflection`);
  }
});

test('an unstable beam is refused, with a reason', () => {
  assert.throws(() => analyse({ spans: [10], supports: ['pin', 'free'], EI: 1, loads: [] }), /unstable/);
  assert.throws(() => analyse({ spans: [10, 5], supports: ['free', 'pin', 'free'], EI: 1, loads: [] }), /unstable/);
  assert.throws(() => analyse({ spans: [10], supports: ['pin'], EI: 1, loads: [] }), /Give 2 supports/);
  assert.throws(() => analyse({ spans: [10], supports: ['pin', 'pin'], EI: 1, loads: [{ type: 'point', x: 12, P: 1 }] }), /on the beam/);
});

test('deflection limits: span ratio, and twice the overhang for a cantilever', () => {
  const r = analyse({ spans: [10, 2], supports: ['pin', 'pin', 'free'], EI: 1e5, loads: [udl(100, 0, 12, 'L')] });
  const c = checks(r, {});
  close(c[0].Lref, 10); close(c[1].Lref, 4); close(c[1].liveAllowed, 4 / 360);
});

test('run(): the deck-beam example in practical units, with stress checks', () => {
  const out = run(EXAMPLE);
  assert.equal(out.units, 'imperial');
  close(out.section.I, 4.5 * 9.25 ** 3 / 12);
  close(out.EI, 1.4e6 * out.section.I / 144);
  assert.equal(out.ok, true);
  // statics of the overhang: w a²/2 at the first post, 300 lb/ft over 1.5 ft
  close(out.result.spans[0].Mneg.value, -300 * 1.5 ** 2 / 2);
  assert.deepEqual(out.result.spans[0].Mneg.liveOn, [1]);
  assert.deepEqual(out.result.spans[3].Mneg.liveOn, [4]);
  // symmetric beam, symmetric answers
  close(out.result.spans[1].Mpos.value, out.result.spans[2].Mpos.value, 1e-9);
  close(out.result.reactions[1].max, out.result.reactions[3].max, 1e-9);
  const total = out.result.reactions.reduce((a, r) => a + r.dead, 0);
  close(total, 60 * 19, 1e-12);
});

test('run(): metric, simple span 6 m, 5 kN/m, E 11 GPa, 100 x 300 mm', () => {
  const out = run({ units: 'metric', spans: [6], supports: ['pin', 'pin'], E: 11, section: { b: 100, d: 300 }, Fb: 12, Fv: 1.2, loads: [udl(5, 0, 6)] });
  const I = 100 * 300 ** 3 / 12; const EI = 11e6 * I * 1e-12; // kN·m²
  close(out.EI, EI);
  close(out.result.spans[0].defl.total, 5 * 5 * 6 ** 4 / (384 * EI), 1e-9); // metres
  close(out.checks[0].fb, 22.5e6 / (100 * 300 * 300 / 6)); // 22.5 kN·m
  close(out.checks[0].fv, 1.5 * 15e3 / 30000);
});
