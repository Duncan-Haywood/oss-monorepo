import test from "node:test";
import assert from "node:assert/strict";
import { buildDigest, renderDigest } from "./digest.mjs";
import { newState, tick } from "./engine.mjs";

const DAY = 86400000, NOW = Date.UTC(2026, 9, 18);
const mk = (o) => ({ currency: "usd", amountMinor: 1000, t0: NOW - 10 * DAY, status: "open", steps: [], log: [], ...o });

test("counts only cases closed or opened inside the window", () => {
  const s = newState();
  s.cases = {
    a: mk({ status: "recovered", closedAt: NOW - DAY, amountMinor: 2500 }),
    b: mk({ status: "recovered", closedAt: NOW - 9 * DAY }),
    c: mk({ status: "lost", closedAt: NOW - 2 * DAY, amountMinor: 700 }),
    d: mk({ status: "open", t0: NOW - 3 * DAY, amountMinor: 400 }),
    e: mk({ status: "voided", closedAt: NOW - DAY }),
  };
  const d = buildDigest(s, NOW);
  assert.equal(d.recovered, 1); assert.deepEqual(d.recoveredMinor, { usd: 2500 });
  assert.equal(d.lost, 1); assert.equal(d.voided, 1);
  assert.equal(d.opened, 1); assert.equal(d.open, 1); assert.deepEqual(d.atRiskMinor, { usd: 400 });
  assert.equal(d.rate, 0.5);
});

test("holdout cases are kept out of the recovery figures", () => {
  const s = newState();
  s.cases = { h: mk({ arm: "holdout", status: "lost", closedAt: NOW - DAY }), r: mk({ status: "recovered", closedAt: NOW - DAY }) };
  const d = buildDigest(s, NOW);
  assert.equal(d.lost, 0); assert.equal(d.holdout, 1); assert.equal(d.rate, 1);
  assert.match(renderDigest(d).text, /Holdout, left alone:  1/);
});

test("no finished cases gives no rate and says so; currencies stay apart", () => {
  const s = newState();
  s.cases = { a: mk({ currency: "eur", amountMinor: 500 }), b: mk({ currency: "usd", amountMinor: 900 }) };
  const d = buildDigest(s, NOW);
  assert.equal(d.rate, null);
  const m = renderDigest(d, { company: "Acme", dryRun: true });
  assert.match(m.text, /no recovery rate yet/);
  assert.match(m.text, /DRY RUN/);
  assert.match(m.text, /€5\.00 \+ \$9\.00|\$9\.00 \+ €5\.00|5\.00 EUR|EUR/);
  assert.match(m.subject, /^Acme: 0 recovered, 2 open/);
});

test("tick sends the digest once a week to DIGEST_TO, and not before", async () => {
  const s = newState(); s.cases = { a: mk({ status: "recovered", closedAt: NOW - DAY }) };
  const sent = [];
  const deps = { policy: {}, dryRun: false, digestTo: "me@x.test", company: "Acme", sendEmail: async (m) => sent.push(m), updateUrl: () => "" };
  const log1 = await tick(s, NOW, deps);
  assert.equal(sent.length, 0, "first run only starts the clock");
  await tick(s, NOW + 7 * DAY + 1, deps);
  assert.equal(sent.length, 1); assert.equal(sent[0].to, "me@x.test");
  await tick(s, NOW + 8 * DAY, deps);
  assert.equal(sent.length, 1);
  assert.ok(Array.isArray(log1));
});

test("dry run logs the digest instead of mailing it; unset DIGEST_TO sends nothing", async () => {
  const s = newState(); const sent = [];
  const base = { policy: {}, sendEmail: async (m) => sent.push(m), updateUrl: () => "" };
  await tick(s, NOW, { ...base, dryRun: true, digestTo: "me@x.test" });
  const log = await tick(s, NOW + 8 * DAY, { ...base, dryRun: true, digestTo: "me@x.test" });
  assert.equal(sent.length, 0); assert.ok(log.some((l) => /digest: dry run/.test(l)));
  const s2 = newState();
  await tick(s2, NOW, { ...base, dryRun: false });
  await tick(s2, NOW + 8 * DAY, { ...base, dryRun: false });
  assert.equal(sent.length, 0); assert.equal(s2.digest, undefined);
});
