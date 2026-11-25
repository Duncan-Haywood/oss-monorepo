// Runs the /admin page's inline script against a tiny fake DOM and a stubbed
// fetch, so what an operator sees (errors, the case table, the holdout
// reading) is checked, not just the HTML string. No browser, no dependencies.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { ADMIN_HTML } from "./admin.mjs";

class El {
  constructor(tag, id) { this.tag = tag; this.id = id; this.children = []; this.text = ""; this.hidden = false; this.listeners = {}; }
  appendChild(c) { this.children.push(c); return c; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.text = String(v); this.children = []; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  querySelector(sel) { return this.find((e) => e.tag === sel); }
  find(pred) { for (const c of this.children) { if (pred(c)) return c; const d = c.find?.(pred); if (d) return d; } return null; }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all?.(pred, out); } return out; }
}
class Text { constructor(t) { this.textContent = String(t); } }

const script = ADMIN_HTML.match(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/i)[1];

function page(routes, { stored = null } = {}) {
  const els = {};
  for (const id of ["f", "k", "e", "b", "s", "x"]) els[id] = new El("div", id);
  els.b.hidden = els.x.hidden = true;
  els.t = new El("table", "t"); els.t.hidden = true; els.t.appendChild(new El("tbody"));
  const store = new Map(stored ? [["dk", stored]] : []);
  const calls = [];
  const ctx = {
    document: { getElementById: (i) => els[i], createElement: (t) => new El(t), createTextNode: (t) => new Text(t) },
    sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
    confirm: () => true,
    fetch: async (p, opts = {}) => {
      calls.push({ p, opts });
      const r = routes[p] ?? { status: 404 };
      return { status: r.status ?? 200, ok: (r.status ?? 200) < 400, json: async () => r.body };
    },
  };
  vm.runInNewContext(script, ctx);
  return {
    els, store, calls,
    async submit(key) {
      els.k.value = key;
      for (const fn of els.f.listeners.submit || []) fn({ preventDefault() {} });
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    },
    rows() { return els.t.querySelector("tbody").children.map((tr) => tr.children.map((c) => c.textContent)); },
  };
}

const SUMMARY = { dryRun: false, open: 1, atRisk: "$4.00", atRiskMinor: { usd: 400 }, recovered: 2 };
const CASES = [{
  invoiceId: "in_1", customer: "cus_1", class: "soft", status: "open",
  steps: [{ kind: "email", at: "2026-11-20T09:00:00.000Z", status: "pending" }, { kind: "retry", at: "2026-11-18T09:00:00.000Z", status: "done" }],
}];

test("a wrong admin key says so and forgets the stored key", async () => {
  const p = page({ "/v1/summary": { status: 401 } });
  await p.submit("bad");
  assert.equal(p.els.e.textContent, "Wrong admin key");
  assert.equal(p.store.has("dk"), false);
  assert.equal(p.els.t.hidden, true);
});

test("a server failure reports its status, not a key error", async () => {
  const p = page({ "/v1/summary": { status: 500 } });
  await p.submit("adm");
  assert.equal(p.els.e.textContent, "Server error 500");
});

test("a good key shows the case table with only pending steps, dated YYYY-MM-DD", async () => {
  const p = page({ "/v1/summary": { body: SUMMARY }, "/v1/cases": { body: CASES } });
  await p.submit("adm");
  assert.equal(p.els.e.textContent, "");
  assert.equal(p.els.t.hidden, false);
  assert.equal(p.els.b.hidden, true, "no dry-run banner when dryRun is false");
  assert.equal(p.store.get("dk"), "adm");
  const [row] = p.rows();
  assert.deepEqual(row.slice(0, 5), ["in_1", "cus_1", "soft", "open", "email 2026-11-20"]);
  assert.equal(row[5], "Stop", "an open case gets a Stop button");
  assert.equal(p.calls[0].opts.headers.authorization, "Bearer adm");
  const cards = p.els.s.children.map((c) => c.textContent);
  assert.deepEqual(cards, ["1open", "$4.00atRisk", "2recovered"], "dryRun is a banner and atRiskMinor an object: neither is a card");
});

test("dry run shows the banner", async () => {
  const p = page({ "/v1/summary": { body: { ...SUMMARY, dryRun: true } }, "/v1/cases": { body: [] } });
  await p.submit("adm");
  assert.equal(p.els.b.hidden, false);
  assert.match(p.els.b.textContent, /DRY RUN/);
});

test("the holdout block rounds the interval ends to whole points", async () => {
  const experiment = {
    treatment: { rate: 0.6, resolved: 10, recovered: 6 }, holdout: { rate: 0.4, resolved: 10, recovered: 4 },
    difference: { diff: 0.2, low: -0.105, high: 0.5 }, verdict: "No clear difference yet.", casesPerArmNeeded: 90,
  };
  const p = page({ "/v1/summary": { body: { ...SUMMARY, experiment } }, "/v1/cases": { body: [] } });
  await p.submit("adm");
  assert.equal(p.els.x.hidden, false);
  const lines = p.els.x.children.map((c) => c.textContent);
  assert.deepEqual(lines, [
    "Holdout experiment",
    "Treated: 60% of 10 resolved (6 paid)",
    "Holdout: 40% of 10 resolved (4 paid)",
    "Difference: 20 points, 95% interval -10 to 50",
    "Reading: No clear difference yet.",
    "At this gap you would need roughly 90 resolved invoices per group to call it.",
  ]);
});

test("a stored key loads the dashboard on open", async () => {
  const p = page({ "/v1/summary": { body: SUMMARY }, "/v1/cases": { body: CASES } }, { stored: "adm" });
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  assert.equal(p.els.t.hidden, false);
  assert.equal(p.els.k.value, "adm");
});
