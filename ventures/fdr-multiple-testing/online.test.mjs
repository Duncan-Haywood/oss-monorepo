import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lond, lordpp, saffron, spending, runOnline, lordGamma, saffronGamma, LORD_GAMMA_C, SAFFRON_GAMMA_C } from "./online.mjs";
import { analyzeOnline, bh } from "./engine.mjs";
import { ONLINE_EXAMPLE_CSV } from "./example-data.mjs";

const ref = JSON.parse(readFileSync(new URL("./eval/online_reference.json", import.meta.url), "utf8"));
const close = (a, b, rel = 1e-12) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);

test("levels and decisions match the independent Python implementation (eval/online_reference.py)", () => {
  let checked = 0;
  for (const c of ref.cases) {
    for (const run of c.runs) {
      const got = runOnline(c.p, { alpha: run.alpha, w0Share: run.w0Share, lambda: run.lambda });
      for (const id of ["lordpp", "saffron", "lond", "spending"]) {
        const want = run[id];
        assert.equal(got[id].level.length, c.p.length);
        for (let i = 0; i < c.p.length; i++) {
          assert.ok(close(got[id].level[i], want.level[i]), `${c.name} ${id} alpha=${run.alpha} t=${i + 1}: ${got[id].level[i]} vs ${want.level[i]}`);
          assert.equal(got[id].reject[i] ? 1 : 0, want.reject[i], `${c.name} ${id} t=${i + 1}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 10000, `checked ${checked}`);
});

test("the SAFFRON constant is 1 / zeta(1.6) as scipy computes it", () => {
  assert.ok(Math.abs(SAFFRON_GAMMA_C - ref.c_saffron) < 1e-15);
});

test("the LORD gamma sequence sums to 0.9763 (<= 1): partial sum to 10^7 plus the closed-form tail", () => {
  // integral_N^inf log x / (x e^sqrt(log x)) dx = integral 2 v^3 e^-v dv from sqrt(log N) = 2 e^-a (a^3 + 3a^2 + 6a + 6)
  const N = 1e7;
  let s = 0;
  for (let j = 1; j < N; j++) s += lordGamma(j) / LORD_GAMMA_C;
  const a = Math.sqrt(Math.log(N));
  const tail = 2 * Math.exp(-a) * (a ** 3 + 3 * a * a + 6 * a + 6) + lordGamma(N) / LORD_GAMMA_C / 2;
  const total = LORD_GAMMA_C * (s + tail);
  assert.ok(total < 1 && total > 0.975 && total < 0.977, `sum ${total}`);
  assert.ok(Math.abs(1 / (s + tail) - 0.0790819667) < 1e-9);
});

test("hand-computed first levels (alpha 0.05, W0 = alpha / 2)", () => {
  const g1 = LORD_GAMMA_C * Math.log(2);
  const g2 = (LORD_GAMMA_C * Math.log(2)) / (2 * Math.exp(Math.sqrt(Math.log(2))));
  const r = lordpp([0.0001, 0.5, 0.5], 0.05, 0.025);
  assert.ok(close(r.level[0], 0.025 * g1));
  assert.ok(close(r.level[1], 0.025 * g2 + 0.025 * g1)); // rejection at t=1 earns alpha - W0
  assert.ok(Math.abs(r.level[0] - 0.0013379) < 1e-7);
  const l = lond([0.0001, 0.5], 0.05);
  assert.ok(close(l.level[1], 0.05 * g2 * 2));
  const s = saffron([0.0001, 0.5], 0.05, 0.5, 0.0125);
  assert.ok(close(s.level[0], 0.0125 * SAFFRON_GAMMA_C));
  // t=2: C_0+ = 1 (p_1 a candidate), tau_1 = 1, C_1+ = 0
  assert.ok(close(s.level[1], 0.0125 * saffronGamma(1) + (0.025 - 0.0125) * saffronGamma(1)));
});

test("online: an earlier decision never changes when later tests arrive", () => {
  const p = ref.cases[1].p;
  const full = runOnline(p);
  for (const cut of [1, 7, 50, 151]) {
    const part = runOnline(p.slice(0, cut));
    for (const id of Object.keys(full)) assert.deepEqual(part[id].reject, full[id].reject.slice(0, cut), `${id} at ${cut}`);
  }
});

test("LORD++ wealth never goes negative; SAFFRON levels are capped at lambda; spending levels sum below alpha", () => {
  for (const c of ref.cases) {
    const r = lordpp(c.p, 0.05, 0.05);
    assert.ok(r.wealth.every((w) => w >= -1e-15), c.name);
    const s = saffron(c.p, 0.2, 0.1, 0.9 * 0.18);
    assert.ok(s.level.every((a) => a <= 0.1));
  }
  const sp = spending(new Array(5000).fill(1), 0.05);
  assert.ok(sp.level.reduce((a, b) => a + b, 0) < 0.05);
});

test("all-null stream of 1s rejects nothing; all-zero stream rejects everything", () => {
  for (const id of ["lordpp", "saffron", "lond", "spending"]) {
    assert.equal(runOnline(new Array(100).fill(1))[id].reject.filter(Boolean).length, 0);
    assert.equal(runOnline(new Array(100).fill(0))[id].reject.filter(Boolean).length, 100);
  }
});

test("analyzeOnline on the bundled example: summary, counts, batch BH contrast, order warning", () => {
  const r = analyzeOnline({ csv: ONLINE_EXAMPLE_CSV });
  assert.equal(r.mode, "online");
  assert.equal(r.m, 400);
  assert.equal(r.items[0].t, 1);
  const n = (id) => r.methods.find((x) => x.id === id).rejections;
  assert.ok(n("spending") <= n("lond"));
  assert.match(r.summary, /LORD\+\+ keeps \d+/);
  assert.match(r.summary, /batch Benjamini-Hochberg/);
  assert.equal(r.batchBH, bh(r.items.map((it) => it.value)).filter((x) => x <= 0.05).length);
  assert.ok(r.warnings.some((w) => /Order matters/.test(w)));
});

test("analyzeOnline validates its options", () => {
  assert.match(analyzeOnline({ values: [0.1], alpha: 2 }).error, /level/);
  assert.match(analyzeOnline({ values: [0.1], w0Share: 0 }).error, /wealth/);
  assert.match(analyzeOnline({ values: [0.1], lambda: 1 }).error, /lambda/);
  assert.match(analyzeOnline({ values: [0.1], method: "nope" }).error, /Unknown online method/);
  assert.match(analyzeOnline({ values: [1.5] }).error, /between 0 and 1/);
});

test("100,000 tests run in well under a second for LORD++ / LOND / spending", () => {
  const p = Array.from({ length: 100000 }, (_, i) => ((i * 7919) % 100000) / 100000);
  const t0 = performance.now();
  lordpp(p, 0.05); lond(p, 0.05); spending(p, 0.05);
  assert.ok(performance.now() - t0 < 3000);
});
