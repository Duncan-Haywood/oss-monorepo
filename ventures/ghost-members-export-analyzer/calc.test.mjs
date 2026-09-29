import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeRows, analyze, sampleCsv } from "./calc.mjs";

const HEAD = "email,subscribed_to_emails,complimentary_plan,stripe_customer_id,created_at,deleted_at,labels,tiers,email_count,email_opened_count,email_open_rate\n";
const load = (body, head = HEAD) => normalizeRows(parseCsv(head + body));
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
// member(id, {sub, comp, stripe, created, deleted, labels, tiers, sent, opened})
const m = (n, o = {}) => `${n}@x.invalid,${o.sub ?? "true"},${o.comp ?? "false"},${o.stripe ?? ""},${o.created ?? "2026-01-01"},${o.deleted ?? ""},${o.labels ?? ""},${o.tiers ?? ""},${o.sent ?? ""},${o.opened ?? ""},\n`;
const AS_OF = Date.UTC(2026, 8, 1);

test("no recognisable header gives a plain error; empty file too", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2\n")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("paid, free and comp are told apart, and emails are not kept", () => {
  const n = load(m("a", { stripe: "cus_1" }) + m("b") + m("c", { comp: "true", tiers: "Supporter" }) + m("d", { tiers: "Supporter" }));
  assert.equal(n.error, undefined);
  assert.ok(!JSON.stringify(n.members).includes("x.invalid"));
  assert.deepEqual(n.members.map((x) => [x.paid, x.comp]), [[true, false], [false, false], [false, true], [true, false]]);
});

test("counts reconcile and removed members are left out of the live base", () => {
  const n = load(m("a", { stripe: "c" }) + m("b") + m("c", { comp: "true" }) + m("d", { deleted: "2026-05-01" }));
  const r = analyze(n.members, { asOf: AS_OF });
  const c = r.summary.counts;
  assert.equal(c.paid + c.free + c.comp, c.total);
  assert.equal(c.total, 3);
  assert.equal(c.removed, 1);
});

test("revenue is paid members times the typed price and net reconciles", () => {
  const n = load(m("a", { stripe: "c" }) + m("b", { stripe: "c" }) + m("c"));
  const r = analyze(n.members, { monthlyPrice: 10, asOf: AS_OF });
  near(r.summary.mrr, 20);
  near(r.summary.processing, 20 * 0.029 + 0.3 * 2);
  near(r.summary.net, r.summary.mrr - r.summary.processing);
  near(r.summary.conversion, 2 / 3);
});

test("engagement prefers counts, falls back to the rate column, and skips members sent too little", () => {
  const n = load(m("a", { sent: 20, opened: 20 }) + m("b", { sent: 20, opened: 0 }) + m("c", { sent: 3, opened: 0 }) + "d@x.invalid,true,false,,2026-01-01,,,,,,45\n");
  const r = analyze(n.members, { asOf: AS_OF, minSends: 10 });
  assert.equal(r.summary.judged, 3);
  const b = Object.fromEntries(r.bands.map((x) => [x.key, x.count]));
  assert.deepEqual(b, { never: 1, low: 0, mid: 1, high: 1 });
});

test("quiet members are free, subscribed, judged, unopened and old enough; paid, comp and recent are never listed", () => {
  const body = m("q", { sent: 20, opened: 0, created: "2026-01-01" })
    + m("paid", { sent: 20, opened: 0, stripe: "c" })
    + m("comp", { sent: 20, opened: 0, comp: "true" })
    + m("new", { sent: 20, opened: 0, created: "2026-08-20" })
    + m("few", { sent: 2, opened: 0 })
    + m("unsub", { sent: 20, opened: 0, sub: "false" });
  const r = analyze(load(body).members, { asOf: AS_OF, minSends: 10, quietDays: 90 });
  assert.equal(r.summary.quiet, 1);
  assert.equal(r.summary.unsubFree, 1);
  assert.equal(r.summary.prune, 2);
});

test("savings use the typed sending cost and plan cost, and are zero when plan cost is skipped", () => {
  let body = "";
  for (let i = 0; i < 10; i++) body += m("q" + i, { sent: 20, opened: 0 });
  const members = load(body).members;
  const r = analyze(members, { asOf: AS_OF, sendsPerMonth: 5, costPer1000Emails: 2, planCostPerMonth: 100, planMemberLimit: 1000 });
  near(r.summary.emailSavings, 10 * 5 / 1000 * 2);
  near(r.summary.planSavings, 10 * 0.1);
  near(analyze(members, { asOf: AS_OF }).summary.planSavings, 0);
});

test("labels report conversion and never-opened share, and small groups are marked", () => {
  let body = "";
  for (let i = 0; i < 6; i++) body += m("a" + i, { labels: "twitter", stripe: i < 3 ? "c" : "", sent: 20, opened: i < 3 ? 15 : 0 });
  body += m("z", { labels: "rare", sent: 20, opened: 0 });
  const r = analyze(load(body).members, { asOf: AS_OF });
  const t = r.byLabel.find((g) => g.label === "twitter");
  assert.equal(t.members, 6);
  near(t.conversion, 0.5);
  near(t.neverShare, 0.5);
  assert.equal(t.enough, true);
  assert.equal(r.byLabel.find((g) => g.label === "rare").enough, false);
});

test("a file with no engagement columns says so instead of inventing a clean list", () => {
  const r = analyze(normalizeRows(parseCsv("email,created_at,stripe_customer_id\na@x.invalid,2026-01-01,\n")).members, { asOf: AS_OF });
  assert.equal(r.summary.hasEngagement, false);
  assert.equal(r.summary.quiet, 0);
  assert.match(r.findings[0].title, /no email open data/);
});

test("growth counts signups, paid signups and removals by month", () => {
  const body = m("a", { created: "2026-05-01", stripe: "c" }) + m("b", { created: "2026-05-20" }) + m("c", { created: "2026-06-02", deleted: "2026-07-03" });
  const r = analyze(load(body).members, { asOf: AS_OF });
  assert.deepEqual(r.growth.map((g) => [g.month, g.joined, g.paid, g.removed]), [["2026-05", 2, 1, 0], ["2026-06", 1, 0, 0], ["2026-07", 0, 0, 1]]);
});

test("invalid assumptions are refused", () => {
  const r = load(m("a"));
  assert.ok(analyze(r.members, { monthlyPrice: -1 }).invalid);
  assert.ok(analyze(r.members, { processingPct: 100 }).invalid);
});

test("the built-in example parses and produces every table without warnings", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.skipped.length, 0);
  const r = analyze(n.members);
  const c = r.summary.counts;
  assert.equal(c.total, 500);
  assert.equal(c.paid + c.free + c.comp, 500);
  assert.ok(r.summary.mrr > 0 && r.growth.length > 0 && r.byLabel.length > 0 && r.summary.quiet > 0 && r.findings.length > 0);
});
