import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, projectAlive, requiredGrowth, buildEmail, subjectLine, aliveLine, monthLabel, normalize, resultCsv, serializeState, parseState, sampleInput, money, moneyShort, pct, signedPct } from "./calc.mjs";

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test("worked example, by hand", () => {
  const R = analyze(sampleInput());
  assert.ok(R.ok);
  near(R.growth, 42900 / 38200 - 1);
  assert.equal(R.netNew, 4700);
});

test("burn, runway, burn multiple and growth match the hand calculation", () => {
  const R = analyze(sampleInput());
  // The last three monthly burns are 23,000 + 26,000 + 30,000 across months 2-4 of a 4-month history.
  near(R.avgBurn, 79000 / 3);
  near(R.runway, 441000 / (79000 / 3));
  near(R.burnMultiple, 30000 / (4700 * 12));
  near(R.cmgr, Math.pow(42900 / 31000, 1 / 3) - 1);
  near(R.quickRatio, (5100 + 900) / (300 + 1000));
  near(R.churnRate, 1300 / 38200);
  near(R.arpa, 42900 / 83);
  assert.equal(R.label, "Sep 2026");
  assert.equal(R.cashOutLabel, "Jan 2028");
  assert.equal(R.burnClass, "amazing");
  assert.deepEqual(R.notes, []);
});

test("month labels roll across years in both directions", () => {
  assert.equal(monthLabel("2026-01", 1), "Dec 2025");
  assert.equal(monthLabel("2026-11", -3), "Feb 2027");
  assert.equal(monthLabel("2026-09"), "Sep 2026");
  assert.equal(monthLabel("nonsense"), "");
  assert.equal(monthLabel("2026-13"), "");
});

test("money raised is excluded from the burn", () => {
  const input = sampleInput();
  input.months[3] = { mrr: 42900, customers: 83, cash: 1441000, raised: 1000000 };
  const R = analyze(input);
  near(R.lastBurn, 471000 - 1441000 + 1000000);
  assert.ok(R.notes.some((n) => /excludes/.test(n)));
});

test("cash that is not falling means no runway limit", () => {
  const input = sampleInput();
  input.months = input.months.map((m, i) => ({ ...m, cash: 100000 + i * 5000 }));
  const R = analyze(input);
  assert.ok(R.avgBurn < 0);
  assert.equal(R.runway, null);
  assert.equal(R.burnMultiple, null);
  assert.match(aliveLine(R), /Cash flow positive/);
  assert.match(buildEmail(R), /not falling/);
});

test("a shrinking, burning company is default dead and told what growth would save it", () => {
  const input = sampleInput();
  input.months = [{ mrr: 20000, customers: 40, cash: 300000 }, { mrr: 19000, customers: 38, cash: 250000 }, { mrr: 18000, customers: 37, cash: 195000 }];
  input.newMrr = input.expansionMrr = input.contractionMrr = input.churnedMrr = "";
  const R = analyze(input);
  assert.equal(R.alive.alive, false);
  assert.match(aliveLine(R), /Default dead/);
  assert.ok(R.flags.some((f) => /fell/.test(f)));
  assert.ok(R.flags.some((f) => /under 6 months/.test(f)));
  assert.ok(R.requiredGrowth === null || R.requiredGrowth > 0);
});

test("MRR movements that do not add up are flagged", () => {
  const input = sampleInput();
  input.newMrr = 9000;
  const R = analyze(input);
  assert.ok(R.notes.some((n) => /Check for a missed/.test(n)));
});

test("validation names what is wrong", () => {
  const out = analyze({ company: "", latest: "", months: [{ mrr: 1, customers: 1, cash: 1 }] });
  assert.equal(out.ok, false);
  assert.ok(out.errors.some((e) => /at least 2 months/.test(e)));
  assert.ok(out.errors.some((e) => /Pick the month/.test(e)));
  const bad = analyze({ ...sampleInput(), months: [{ mrr: -5, customers: 1, cash: 10 }, { mrr: "", customers: 1, cash: 10 }] });
  assert.ok(bad.errors.some((e) => /Month 1: MRR/.test(e)));
  assert.ok(bad.errors.some((e) => /Month 2: MRR/.test(e)));
});

test("property: 300 random histories satisfy every identity", () => {
  const r = rng(11);
  let tested = 0;
  for (let n = 0; n < 300; n++) {
    const len = 2 + Math.floor(r() * 10);
    let mrr = 2000 + r() * 80000, cash = 100000 + r() * 3e6;
    const months = [];
    for (let i = 0; i < len; i++) {
      mrr = mrr * (0.95 + r() * 0.2);
      cash = Math.max(1000, cash - (r() * 80000 - 5000));
      months.push({ mrr: Math.round(mrr), customers: 10 + i * 3, cash: Math.round(cash), raised: "" });
    }
    const R = analyze({ company: "X", latest: "2026-06", months, highlights: "", lowlights: "", asks: "", hiring: "" });
    if (!R.ok) continue;
    tested++;
    assert.equal(R.series.length, len);
    if (R.runway !== null) near(R.runway * R.avgBurn, R.cash, 1e-9);
    near(R.arr, R.mrr * 12);
    assert.match(buildEmail(R), /Key metrics|KEY METRICS/);
    if (R.avgBurn > 0) {
      const g = R.cmgr ?? 0;
      // monotone in growth: if alive at g, alive at any higher g
      if (R.alive.alive) assert.ok(projectAlive(R.mrr, R.cash, R.avgBurn, g + 0.05).alive);
      const need = requiredGrowth(R.mrr, R.cash, R.avgBurn);
      if (need !== null && need > 0) {
        assert.ok(projectAlive(R.mrr, R.cash, R.avgBurn, need + 1e-6).alive);
        assert.ok(!projectAlive(R.mrr, R.cash, R.avgBurn, Math.max(0, need - 1e-3)).alive);
      }
    }
  }
  assert.ok(tested >= 280, "tested " + tested);
});

test("email: text and markdown carry every section the user filled in", () => {
  const R = analyze(sampleInput());
  for (const fmt of ["text", "md"]) {
    const e = buildEmail(R, fmt);
    for (const s of ["Acme Analytics", "Closed our first", "Two small customers", "Intros to heads of data", "senior full-stack"]) assert.ok(e.includes(s), fmt + ": " + s);
  }
  assert.match(buildEmail(R, "md"), /\| Metric \| Value \| Note \|/);
  assert.match(subjectLine(R), /Acme Analytics update, Sep 2026, MRR \+12\.3% to \$42\.9K/);
});

test("empty narrative sections are left out", () => {
  const input = sampleInput();
  input.highlights = input.lowlights = input.asks = input.hiring = "";
  const e = buildEmail(analyze(input));
  assert.doesNotMatch(e, /HIGHLIGHTS|LOWLIGHTS|ASKS|HIRING/);
});

test("bullets and blank lines in the narrative boxes are cleaned", () => {
  const { input } = normalize({ ...sampleInput(), highlights: "- one\n\n* two\n  \n• three" });
  assert.deepEqual(input.highlights, ["one", "two", "three"]);
});

test("save and load round-trip; foreign files are refused", () => {
  const s = sampleInput();
  assert.deepEqual(parseState(serializeState(s)).state, s);
  assert.ok(parseState("{").error);
  assert.ok(parseState(JSON.stringify({ kind: "other" })).error);
});

test("csv has one row per month", () => {
  const R = analyze(sampleInput());
  assert.equal(resultCsv(R).trim().split("\n").length, 5);
});

test("formatters", () => {
  assert.equal(money(1234.5), "$1,235");
  assert.equal(moneyShort(2500000), "$2.5M");
  assert.equal(moneyShort(42900), "$42.9K");
  assert.equal(moneyShort(517), "$517");
  assert.equal(pct(0.1234), "12.3%");
  assert.equal(signedPct(-0.05), "-5.0%");
});
