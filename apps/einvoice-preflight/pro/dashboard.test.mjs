// The accountant's cross-client dashboard: pure summaries, the store paging, the CSV, and the
// route end to end (tenant isolation included). Proprietary (see ../LICENSE).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { buildDashboard, csvCell, dashboardCsv, dashboardDays, runsSince, summarizeClient } from "./dashboard.mjs";
import { createProHandler } from "./server.mjs";
import { MemoryStore } from "./store.mjs";

const client = (id, name) => ({ id, accountId: "a", name, country: "DE", vatId: "", reference: "", createdAt: "2026-01-01T00:00:00Z" });
const file = (sha, status, extra = {}) => ({ file: `${sha}.xml`, sha256: sha, bytes: 10, status, rules: status === "pass" ? [] : ["BR-01"], blocking: status === "pass" ? 0 : 1, fixesApplied: [], fixedSha256: null, fixedStatus: null, ...extra });
const run = (id, at, files) => ({ id, accountId: "a", clientId: "c", createdAt: at, lang: "de", profile: "", totals: { files: files.length, passed: 0, failed: 0, fixable: 0 }, files });

test("dashboardDays: default, floor, cap and junk", () => {
  assert.equal(dashboardDays(undefined), 30);
  assert.equal(dashboardDays("7"), 7);
  assert.equal(dashboardDays("7.9"), 7);
  assert.equal(dashboardDays("0"), 30);
  assert.equal(dashboardDays("-3"), 30);
  assert.equal(dashboardDays("abc"), 30);
  assert.equal(dashboardDays("9999"), 366);
});

test("a file counts once per content, at its latest check", () => {
  const s = summarizeClient(client("c", "A"), [run("r1", "2026-11-01T00:00:00Z", [file("x", "fail")]), run("r2", "2026-11-02T00:00:00Z", [file("x", "fail"), file("y", "pass")])], "2026-11-02T00:00:00Z");
  assert.equal(s.files, 2);
  assert.equal(s.passed, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.open, 1);
  assert.equal(s.status, "attention");
  assert.deepEqual(s.topRules, [{ rule: "BR-01", files: 1 }]);
  assert.equal(s.openFiles[0].checkedAt, "2026-11-02T00:00:00Z");
  assert.equal(s.passRate, 0.5);
});

test("a failure closed by a passing fix, or by its fixed copy passing later, is not open", () => {
  const fixedInPlace = summarizeClient(client("c", "A"), [run("r1", "2026-11-01T00:00:00Z", [file("x", "fail", { fixesApplied: ["F1"], fixedSha256: "x2", fixedStatus: "pass" })])], "2026-11-01T00:00:00Z");
  assert.equal(fixedInPlace.open, 0);
  assert.equal(fixedInPlace.fixedToPass, 1);
  assert.equal(fixedInPlace.status, "ok");
  assert.equal(fixedInPlace.passRate, 1);

  // the fix needed a person: the fixed copy, corrected and re-uploaded, passes a later check
  const later = summarizeClient(
    client("c", "A"),
    [run("r1", "2026-11-01T00:00:00Z", [file("x", "fail", { fixesApplied: ["F1"], fixedSha256: "x2", fixedStatus: "fail" })]), run("r2", "2026-11-03T00:00:00Z", [file("x2", "pass")])],
    "2026-11-03T00:00:00Z",
  );
  assert.equal(later.open, 0);
  // a fixed copy that still fails keeps the original open
  const still = summarizeClient(client("c", "A"), [run("r1", "2026-11-01T00:00:00Z", [file("x", "fail", { fixedSha256: "x2", fixedStatus: "fail" })])], "2026-11-01T00:00:00Z");
  assert.equal(still.open, 1);
});

test("status: never, idle, ok, attention; attention first, then idle oldest first, then never, then ok", () => {
  const clients = [client("ok", "Ok GmbH"), client("never", "Never SA"), client("att", "Att KG"), client("idle1", "Idle B"), client("idle2", "Idle A")];
  const runsByClient = new Map([
    ["ok", [run("r", "2026-11-20T00:00:00Z", [file("p", "pass")])]],
    ["att", [run("r", "2026-11-20T00:00:00Z", [file("f", "fail")])]],
  ]);
  const lastByClient = new Map([
    ["ok", "2026-11-20T00:00:00Z"],
    ["att", "2026-11-20T00:00:00Z"],
    ["idle1", "2026-09-01T00:00:00Z"],
    ["idle2", "2026-10-01T00:00:00Z"],
  ]);
  const d = buildDashboard({ clients, runsByClient, lastByClient, now: new Date("2026-11-26T00:00:00Z"), days: 30 });
  assert.deepEqual(
    d.clients.map((c) => [c.id, c.status]),
    [
      ["att", "attention"],
      ["idle1", "idle"],
      ["idle2", "idle"],
      ["never", "never"],
      ["ok", "ok"],
    ],
  );
  assert.equal(d.since, "2026-10-27T00:00:00.000Z");
  assert.deepEqual(
    { ...d.totals },
    { clients: 5, attention: 1, ok: 1, idle: 2, never: 1, runs: 2, files: 2, passed: 1, failed: 1, fixedToPass: 0, open: 1, passRate: 0.5 },
  );
  assert.deepEqual(d.topRules, [{ rule: "BR-01", files: 1 }]);
});

test("runsSince pages the store's history and stops at the window", async () => {
  let t = Date.parse("2026-11-01T00:00:00Z");
  const store = new MemoryStore({ now: () => new Date(t) });
  for (let i = 0; i < 250; i++) {
    await store.addRun("a", { clientId: "c", lang: "en", profile: "", totals: { files: 0, passed: 0, failed: 0, fixable: 0 }, files: [] });
    t += 3_600_000; // hourly
  }
  const { runs, last } = await runsSince(store, "a", "c", "2026-11-03T00:00:00.000Z");
  assert.equal(runs.length, 250 - 48);
  assert.equal(last, new Date(Date.parse("2026-11-01T00:00:00Z") + 249 * 3_600_000).toISOString());
  const none = await runsSince(store, "a", "nobody", "2026-01-01T00:00:00Z");
  assert.deepEqual(none, { runs: [], last: null });
  // the page bound holds
  const bounded = await runsSince(store, "a", "c", "2000-01-01T00:00:00Z", 1);
  assert.equal(bounded.runs.length, 100);
});

test("CSV: formula cells neutralised, quotes escaped, BOM, localised headers", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
  assert.equal(csvCell("+1"), `"'+1"`);
  assert.equal(csvCell("@x"), `"'@x"`);
  assert.equal(csvCell('Müller "&" Söhne'), '"Müller ""&"" Söhne"');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(42), "42");
  const d = buildDashboard({
    clients: [{ ...client("c", "=cmd|' /C calc'!A0"), reference: "K-1" }],
    runsByClient: new Map([["c", [run("r", "2026-11-20T00:00:00Z", [file("f", "fail"), file("p", "pass")])]]]),
    lastByClient: new Map([["c", "2026-11-20T00:00:00Z"]]),
    now: new Date("2026-11-26T00:00:00Z"),
    days: 30,
  });
  const csv = dashboardCsv(d, "de");
  assert.ok(csv.startsWith("\ufeffMandant,Land,"));
  const [, row] = csv.slice(1).trim().split("\r\n");
  assert.ok(row.startsWith(`"'=cmd|`), row);
  assert.match(row, /,Handlungsbedarf,2026-11-20,1,2,1,1,0,1,50,BR-01 \(1\)$/);
  assert.ok(dashboardCsv(d, "fr").includes("Taux de conformité %"));
});

// ---------- the route, on a real socket ----------

const UBL = readFileSync(new URL("../examples/ubl-invoice.xml", import.meta.url), "utf8");
const DEFECTS = readFileSync(new URL("../examples/ubl-invoice-with-defects.xml", import.meta.url), "utf8");
const ADMIN = "admin-test-token";
let server;
let base;

before(async () => {
  const now = () => new Date("2026-11-24T10:00:00Z");
  server = createServer(createProHandler({ store: new MemoryStore({ now }), env: { ADMIN_TOKEN: ADMIN }, now }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, { key, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: res.headers.get("content-type")?.includes("json") && text ? JSON.parse(text) : null };
}

async function account(name) {
  const r = await call("POST", "/v1/admin/accounts", { key: ADMIN, body: { name, plan: "standard" } });
  assert.equal(r.status, 201, r.text);
  return r.json.apiKey;
}

test("GET /v1/dashboard: needs a key, lists only the caller's clients, costs no units", async () => {
  assert.equal((await call("GET", "/v1/dashboard")).status, 401);
  const key = await account("Kanzlei Dash");
  const other = await account("Kanzlei Other");
  const a = (await call("POST", "/v1/clients", { key, body: { name: "Bäckerei Schmidt", country: "de" } })).json;
  const b = (await call("POST", "/v1/clients", { key, body: { name: "Atelier Dupont", country: "fr" } })).json;
  await call("POST", "/v1/clients", { key: other, body: { name: "Not yours" } });
  const batch = await call("POST", `/v1/clients/${a.id}/batches?lang=de`, {
    key,
    body: { documents: [{ name: "gut.xml", content: UBL }, { name: "fehler.xml", content: DEFECTS }] },
  });
  assert.equal(batch.status, 201, batch.text);
  const usedBefore = (await call("GET", "/v1/account", { key })).json.usage;

  const d = await call("GET", "/v1/dashboard?days=7", { key });
  assert.equal(d.status, 200, d.text);
  assert.equal(d.json.days, 7);
  assert.deepEqual(
    d.json.clients.map((c) => [c.name, c.status]),
    [
      ["Bäckerei Schmidt", "attention"],
      ["Atelier Dupont", "never"],
    ],
  );
  const s = d.json.clients[0];
  assert.equal(s.files, 2);
  assert.equal(s.passed, 1);
  assert.equal(s.open, 1);
  assert.equal(s.openFiles[0].file, "fehler.xml");
  assert.ok(s.topRules.length > 0);
  assert.equal(d.json.totals.clients, 2);
  assert.ok(!JSON.stringify(d.json).includes("Not yours"));
  assert.equal(d.json.clients[1].id, b.id);
  assert.deepEqual((await call("GET", "/v1/account", { key })).json.usage, usedBefore, "the dashboard is not metered");

  const csv = await call("GET", "/v1/dashboard?format=csv&lang=fr", { key });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type") ?? "", /^text\/csv/);
  assert.match(csv.headers.get("content-disposition") ?? "", /^attachment; filename="clients-2026-11-24\.csv"$/);
  const lines = csv.text.replace(/^\ufeff/, "").trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("Client,Pays,"));
  assert.ok(lines[1].startsWith("Bäckerei Schmidt,DE,"));
});
