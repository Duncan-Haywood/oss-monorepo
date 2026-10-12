import test from "node:test";
import assert from "node:assert/strict";
import { compare, normalizeOptions, baselineParts, parseProjects, history, summarizeCompare, summarizeHistory, money, pct, MODELS } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const byId = (c, id) => c.models.find((m) => m.id === id);

test("defaults by hand: 81 baseline hours, 101.25 expected, $10,125 needed", () => {
  const c = compare({});
  assert.deepEqual(baselineParts(c.options), { design: 40, siteVisits: 10, procurement: 25, meetings: 6 });
  close(c.baseline, 81);
  close(c.expected, 101.25);
  close(c.minimumFee, 10125);
  close(c.walkAway, 101.25 * 75);
  assert.equal(c.models.length, MODELS.length);
});

test("each model bills what its basis says", () => {
  const c = compare({});
  close(byId(c, "hourly").fee, 125 * 101.25 * 0.9);
  close(byId(c, "hourly").effective, 112.5);
  close(byId(c, "flat").fee, 8500);
  close(byId(c, "percent").fee, 8000);
  close(byId(c, "sqft").fee, 9000);
  close(byId(c, "margin").fee, 7500);
  close(byId(c, "hybrid").fee, 3500 + 0.18 * 30000);
  close(byId(c, "flat").effective, 8500 / 101.25);
});

test("hourly is immune to overrun; fixed models are not", () => {
  const c = compare({});
  const h = byId(c, "hourly");
  for (const s of h.byOverrun) close(s.effective, 112.5);
  const f = byId(c, "flat");
  assert.ok(f.byOverrun[0].effective > f.byOverrun[1].effective && f.byOverrun[1].effective > f.byOverrun[3].effective);
  close(f.byOverrun[0].effective, 8500 / 81);
  close(f.byOverrun[3].effective, 8500 / 162);
  assert.equal(h.breakEvenOverrunPct, null);
});

test("break-even overrun is where effective hourly equals target", () => {
  const c = compare({});
  for (const id of ["flat", "sqft", "hybrid"]) {
    const m = byId(c, id);
    const o = compare({ overrunPct: m.breakEvenOverrunPct });
    close(byId(o, id).effective, 100, 1e-6);
  }
  assert.ok(byId(c, "percent").breakEvenOverrunPct < 0);
});

test("a blank rate drops that model; hybrid needs both of its inputs", () => {
  const c = compare({ flatFee: "", percentRate: null, hybridMarginPct: "" });
  assert.deepEqual(c.models.map((m) => m.id).sort(), ["hourly", "margin", "sqft"]);
  const none = compare({ hourlyRate: "", flatFee: "", percentRate: "", sqftRate: "", marginPct: "", hybridFlat: "" });
  assert.equal(none.models.length, 0);
  assert.equal(summarizeCompare(none).status, "empty");
});

test("best and sturdiest models", () => {
  const c = compare({});
  assert.equal(c.best.id, "hourly");
  const d = compare({ hourlyRate: "" });
  assert.equal(d.best.id, "sqft");
  assert.equal(d.sturdiest.id, "sqft");
});

test("validation names the field", () => {
  assert.throws(() => normalizeOptions({ designHours: "abc" }), /designHours must be a number/);
  assert.throws(() => normalizeOptions({ targetHourly: 0 }), /targetHourly must be between/);
  assert.throws(() => normalizeOptions({ flatFee: -5 }), /flatFee must be between/);
  assert.throws(() => normalizeOptions({ walkAwayPct: 150 }), /walkAwayPct must be between/);
  assert.equal(normalizeOptions({ designHours: "$1,200" }).designHours, 1200);
});

test("zero baseline hours never divides by zero", () => {
  const c = compare({ designHours: 0, siteVisits: 0, procurementItems: 0, meetings: 0 });
  assert.equal(c.baseline, 0);
  for (const m of c.models) assert.equal(m.effective, null);
  assert.doesNotThrow(() => summarizeCompare(c));
});

test("parseProjects reports line numbers and never throws", () => {
  const p = parseProjects("project,model,fee,hours\nA,flat,5000,50\n# note\nB,flat,x,10\nC,,100,10\nD,flat,100,0\nshort,row");
  assert.equal(p.projects.length, 1);
  assert.equal(p.errors.length, 4);
  assert.match(p.errors[0], /^Line 4: fee/);
  assert.match(p.errors[1], /^Line 5: model is empty/);
  assert.match(p.errors[2], /^Line 6: hours/);
  assert.match(p.errors[3], /^Line 7: expected/);
  assert.deepEqual(parseProjects(null), { projects: [], errors: [] });
});

test("history groups by model, ranks worst first and sizes the shortfall", () => {
  const h = history(parseProjects("A,Flat,5000,50\nB,flat,3000,50\nC,hourly,6000,40"), { targetHourly: 100 });
  assert.equal(h.projects[0].name, "B");
  close(h.projects[0].effective, 60);
  close(h.projects[0].shortfall, 2000);
  assert.equal(h.below, 1);
  assert.equal(h.byModel[0].model, "hourly");
  const flat = h.byModel.find((g) => g.model === "flat");
  assert.equal(flat.count, 2);
  close(flat.effective, 80);
  close(h.shortfall, 2000);
  close(h.blendedHourly, 14000 / 140);
  assert.equal(summarizeHistory(h).status, "below");
  assert.equal(summarizeHistory(history({ projects: [] })).status, "empty");
});

test("money and pct format and tolerate non-numbers", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-3), "-$3.00");
  assert.equal(money(null), "n/a");
  assert.equal(money(Infinity), "n/a");
  assert.equal(pct(0.5, 0), "50%");
});
