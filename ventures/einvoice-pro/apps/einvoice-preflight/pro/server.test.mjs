// The paid HTTP API end to end on a real socket: accounts, keys, metering, workspace, history,
// and tenant isolation. Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { FakeLlm } from "./fake-llm.mjs";
import { createProHandler } from "./server.mjs";
import { FileStore, MemoryStore } from "./store.mjs";

const UBL = readFileSync(new URL("../examples/ubl-invoice.xml", import.meta.url), "utf8");
const DOTTED = UBL.replace("<cbc:IssueDate>2026-08-24", "<cbc:IssueDate>24.08.2026");
const DEFECTS = readFileSync(new URL("../examples/ubl-invoice-with-defects.xml", import.meta.url), "utf8");
const ADMIN = "admin-test-token";

let server;
let base;
let store;
let llm;

before(async () => {
  store = new MemoryStore({ now: () => new Date("2026-11-24T10:00:00Z") });
  llm = new FakeLlm();
  server = createServer(createProHandler({ store, llm, env: { ADMIN_TOKEN: ADMIN }, now: () => new Date("2026-11-24T10:00:00Z") }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, { key, body, raw, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

async function newAccount(name, plan) {
  const r = await call("POST", "/v1/admin/accounts", { key: ADMIN, body: { name, plan } });
  assert.equal(r.status, 201);
  assert.match(r.json.apiKey, /^epk_/);
  return { id: r.json.account.id, key: r.json.apiKey };
}

test("admin token is required to create accounts", async () => {
  assert.equal((await call("POST", "/v1/admin/accounts", { body: { name: "x" } })).status, 401);
  assert.equal((await call("POST", "/v1/admin/accounts", { key: "wrong", body: { name: "x" } })).status, 401);
});

test("API key auth: missing, unknown and revoked keys get 401", async () => {
  assert.equal((await call("GET", "/v1/account")).status, 401);
  assert.equal((await call("GET", "/v1/account", { key: "epk_nope" })).status, 401);
  const a = await newAccount("Kanzlei Revoke");
  const extra = await call("POST", "/v1/keys", { key: a.key, body: { name: "ci" } });
  assert.equal(extra.status, 201);
  assert.equal(extra.json.hash, undefined, "the hash is never returned");
  assert.equal((await call("GET", "/v1/account", { key: extra.json.apiKey })).status, 200);
  assert.equal((await call("DELETE", `/v1/keys/${extra.json.id}`, { key: a.key })).status, 204);
  assert.equal((await call("GET", "/v1/account", { key: extra.json.apiKey })).status, 401);
  // The store keeps only the hash.
  assert.ok(!JSON.stringify(store.data.apiKeys).includes(extra.json.apiKey));
});

test("POST /v1/check explains in German, proposes fixes and meters one document", async () => {
  const a = await newAccount("Steuerbüro Check");
  const r = await call("POST", "/v1/check?lang=de&fix=1&name=rechnung.xml", { key: a.key, raw: DOTTED, headers: { "content-type": "application/xml" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "fail");
  const inv003 = r.json.findings.find((f) => f.rule === "INV-003");
  assert.equal(inv003.explanation.lang, "de");
  assert.equal(inv003.explanation.source, "template");
  assert.equal(r.json.fixes.applied[0].id, "date-format");
  assert.equal(r.json.fixes.revalidation.status, "pass");
  assert.match(r.json.fixes.diff, /\+  <cbc:IssueDate>2026-08-24/);
  assert.equal(r.headers.get("x-usage-documents-used"), "1");
  assert.equal(r.headers.get("x-usage-documents-limit"), "100");
  const acct = await call("GET", "/v1/account", { key: a.key });
  assert.equal(acct.json.usage.documents, 1);
  assert.equal(acct.json.billing.available, false, "paid path is dark");
  assert.equal(acct.json.subscription, null);
  assert.deepEqual(acct.json.billing.plans.map((p) => p.key), ["starter", "standard", "plus", "api"]);
  const buy = await call("POST", "/v1/billing/checkout", { key: a.key, body: { plan: "starter", email: "a@example.com" } });
  assert.equal(buy.status, 503);
  assert.equal(buy.json.error.code, "billing_unavailable");
});

test("quota: a batch that would exceed the plan is refused with 429 and nothing is consumed", async () => {
  const a = await newAccount("Quota");
  store.usageRow(a.id, "2026-11").documents = 99;
  const client = (await call("POST", "/v1/clients", { key: a.key, body: { name: "Bäckerei Schmidt" } })).json;
  const docs = [{ name: "a.xml", content: UBL }, { name: "b.xml", content: DOTTED }];
  const r = await call("POST", `/v1/clients/${client.id}/batches`, { key: a.key, body: { documents: docs } });
  assert.equal(r.status, 429);
  assert.equal(r.json.error.code, "quota_exceeded");
  assert.equal((await call("GET", "/v1/account", { key: a.key })).json.usage.documents, 99);
  const one = await call("POST", "/v1/check", { key: a.key, raw: UBL });
  assert.equal(one.status, 200);
  assert.equal(one.headers.get("x-usage-documents-charged"), "1");
  assert.equal((await call("POST", "/v1/check", { key: a.key, raw: DOTTED })).status, 429, "a new invoice past the limit");
  const again = await call("POST", "/v1/check", { key: a.key, raw: UBL });
  assert.equal(again.status, 200, "an invoice already checked this month is free to re-check, even at the limit");
  assert.equal(again.headers.get("x-usage-documents-charged"), "0");
});

test("metering: an invoice counts once a month however often it is re-checked", async () => {
  const a = await newAccount("Once a month");
  const client = (await call("POST", "/v1/clients", { key: a.key, body: { name: "Metzgerei Huber" } })).json;
  const first = await call("POST", "/v1/check?fix=1", { key: a.key, raw: DOTTED });
  assert.equal(first.headers.get("x-usage-documents-used"), "1");
  // The same bytes again, alone and inside a batch twice over with one new invoice: one more unit.
  assert.equal((await call("POST", "/v1/check?lang=fr", { key: a.key, raw: DOTTED })).headers.get("x-usage-documents-charged"), "0");
  const docs = [{ name: "a.xml", content: DOTTED }, { name: "a-copy.xml", content: DOTTED }, { name: "b.xml", content: DEFECTS }];
  const b = await call("POST", `/v1/clients/${client.id}/batches`, { key: a.key, body: { documents: docs } });
  assert.equal(b.status, 201);
  assert.equal(b.headers.get("x-usage-documents-charged"), "1");
  assert.equal(b.json.run.files.length, 3, "history still lists every file uploaded");
  assert.equal((await call("GET", "/v1/account", { key: a.key })).json.usage.documents, 2);
  // Base64 of the same bytes is the same invoice.
  const b64 = [{ name: "a.xml", content: Buffer.from(DOTTED).toString("base64"), encoding: "base64" }];
  assert.equal((await call("POST", `/v1/clients/${client.id}/batches`, { key: a.key, body: { documents: b64 } })).headers.get("x-usage-documents-charged"), "0");
  // Another account checking the same file pays for it once on its own meter.
  const other = await newAccount("Other firm");
  assert.equal((await call("POST", "/v1/check", { key: other.key, raw: DOTTED })).headers.get("x-usage-documents-charged"), "1");
  assert.equal((await call("GET", "/v1/account", { key: a.key })).json.usage.documents, 2);
});

test("workspace: clients, batch upload, per-client history and run detail", async () => {
  const a = await newAccount("Cabinet Martin", "starter");
  const c = await call("POST", "/v1/clients", { key: a.key, body: { name: "Boulangerie Dupont", country: "fr", vatId: "FR40303265045" } });
  assert.equal(c.status, 201);
  assert.equal(c.json.country, "FR");
  const batch = await call("POST", `/v1/clients/${c.json.id}/batches?lang=fr&fix=1`, {
    key: a.key,
    body: {
      documents: [
        { name: "ok.xml", content: UBL },
        { name: "date.xml", content: DOTTED },
        { name: "bad.xml", content: DEFECTS },
        { name: "cn.pdf", content: readFileSync(new URL("../examples/factur-x-credit-note.pdf", import.meta.url)).toString("base64"), encoding: "base64" },
      ],
    },
  });
  assert.equal(batch.status, 201, JSON.stringify(batch.json));
  const { run, results } = batch.json;
  assert.equal(results.length, 4);
  assert.deepEqual(run.totals, { files: 4, passed: 2, failed: 2, fixable: 1 });
  const date = run.files.find((f) => f.file === "date.xml");
  assert.deepEqual(date.fixesApplied, ["date-format"]);
  assert.equal(date.fixedStatus, "pass");
  assert.match(date.sha256, /^[0-9a-f]{64}$/);
  assert.ok(results.find((r) => r.file === "bad.xml").findings.every((f) => f.explanation.lang === "fr"));
  // Invoice content is never stored, only hashes and rule ids.
  assert.ok(!JSON.stringify(store.data.runs).includes("INV-2026-0042"));

  const second = await call("POST", `/v1/clients/${c.json.id}/batches`, { key: a.key, body: { documents: [{ name: "ok2.xml", content: UBL }] } });
  assert.equal(second.status, 201);
  const hist = await call("GET", `/v1/clients/${c.json.id}/history`, { key: a.key });
  assert.equal(hist.status, 200);
  assert.equal(hist.json.items.length, 2);
  const detail = await call("GET", `/v1/clients/${c.json.id}/runs/${run.id}`, { key: a.key });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.files.length, 4);
  const list = await call("GET", "/v1/clients", { key: a.key });
  assert.deepEqual(list.json.items.map((x) => x.name), ["Boulangerie Dupont"]);
});

test("cross-tenant: another account sees none of this account's clients, runs or keys", async () => {
  const a = await newAccount("Tenant A");
  const b = await newAccount("Tenant B");
  const client = (await call("POST", "/v1/clients", { key: a.key, body: { name: "A's client" } })).json;
  const run = (await call("POST", `/v1/clients/${client.id}/batches`, { key: a.key, body: { documents: [{ name: "x.xml", content: UBL }] } })).json.run;
  const aKeys = (await call("GET", "/v1/keys", { key: a.key })).json.items;

  assert.equal((await call("GET", `/v1/clients/${client.id}`, { key: b.key })).status, 404);
  assert.equal((await call("GET", `/v1/clients/${client.id}/history`, { key: b.key })).status, 404);
  assert.equal((await call("GET", `/v1/clients/${client.id}/runs/${run.id}`, { key: b.key })).status, 404);
  assert.equal((await call("POST", `/v1/clients/${client.id}/batches`, { key: b.key, body: { documents: [{ name: "x.xml", content: UBL }] } })).status, 404);
  assert.equal((await call("DELETE", `/v1/clients/${client.id}`, { key: b.key })).status, 404);
  assert.equal((await call("DELETE", `/v1/keys/${aKeys[0].id}`, { key: b.key })).status, 404);
  assert.deepEqual((await call("GET", "/v1/clients", { key: b.key })).json.items, []);
  assert.ok(!(await call("GET", "/v1/keys", { key: b.key })).json.items.some((k) => k.accountId === a.id));
  // B was never charged for the refused batch, and A's data is intact.
  assert.equal((await call("GET", "/v1/account", { key: b.key })).json.usage.documents, 0);
  assert.equal((await call("GET", `/v1/clients/${client.id}/history`, { key: a.key })).json.items.length, 1);
});

test("plan limits: clients per plan", async () => {
  const a = await newAccount("Small");
  for (let i = 0; i < 3; i++) assert.equal((await call("POST", "/v1/clients", { key: a.key, body: { name: `c${i}` } })).status, 201);
  const r = await call("POST", "/v1/clients", { key: a.key, body: { name: "one too many" } });
  assert.equal(r.status, 403);
});

test("deleting a client deletes its history", async () => {
  const a = await newAccount("Delete");
  const c = (await call("POST", "/v1/clients", { key: a.key, body: { name: "gone" } })).json;
  await call("POST", `/v1/clients/${c.id}/batches`, { key: a.key, body: { documents: [{ name: "x.xml", content: UBL }] } });
  assert.equal((await call("DELETE", `/v1/clients/${c.id}`, { key: a.key })).status, 204);
  assert.equal(store.data.runs.filter((r) => r.clientId === c.id).length, 0);
});

test("model explanations are capped by the plan's monthly budget", async () => {
  const a = await newAccount("LLM budget");
  store.usageRow(a.id, "2026-11").llmExplanations = 50; // trial cap reached
  const before = llm.calls.length;
  // A file the checker cannot read yields rule READ, which has no template: the long tail.
  const r = await call("POST", "/v1/check?lang=de", { key: a.key, raw: "<not-an-invoice/>" });
  assert.equal(r.status, 200);
  const f = r.json.findings.find((x) => x.rule === "READ");
  assert.ok(f, JSON.stringify(r.json));
  assert.equal(f.explanation.source, "checker");
  assert.equal(llm.calls.length, before, "no model call past the budget");

  const b = await newAccount("LLM ok");
  const r2 = await call("POST", "/v1/check?lang=de", { key: b.key, raw: "<not-an-invoice/>" });
  assert.equal(r2.json.findings.find((x) => x.rule === "READ").explanation.source, "llm");
  assert.equal((await call("GET", "/v1/account", { key: b.key })).json.usage.llmExplanations, 1);
  const again = await call("POST", "/v1/check?lang=de", { key: b.key, raw: "<not-an-invoice/>" });
  assert.equal(again.headers.get("x-usage-explained-used"), "1", "a re-checked invoice is not explained twice");
  assert.equal(again.headers.get("x-usage-explained-limit"), "50");
});

test("input validation", async () => {
  const a = await newAccount("Validation");
  assert.equal((await call("POST", "/v1/check", { key: a.key, raw: "" })).status, 400);
  const c = (await call("POST", "/v1/clients", { key: a.key, body: { name: "v" } })).json;
  assert.equal((await call("POST", `/v1/clients/${c.id}/batches`, { key: a.key, body: { documents: [] } })).status, 400);
  assert.equal((await call("POST", `/v1/clients/${c.id}/batches`, { key: a.key, raw: "{", headers: { "content-type": "application/json" } })).status, 400);
  assert.equal((await call("POST", "/v1/clients", { key: a.key, body: { name: "" } })).status, 400);
  assert.equal((await call("GET", "/v1/nope", { key: a.key })).status, 404);
});

test("FileStore persists accounts, clients, runs and usage across restarts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "einv-pro-"));
  try {
    const file = join(dir, "store.json");
    const s1 = new FileStore(file);
    const acct = await s1.createAccount({ name: "Persist" });
    const cli = await s1.createClient(acct.id, { name: "P client" });
    await s1.addRun(acct.id, { clientId: cli.id, lang: "de", profile: "", totals: { files: 0, passed: 0, failed: 0, fixable: 0 }, files: [] });
    await s1.tryConsume(acct.id, "2026-11", "documents", 3, 100);
    const s2 = new FileStore(file);
    assert.equal((await s2.getClient(acct.id, cli.id)).name, "P client");
    assert.equal((await s2.listRuns(acct.id, cli.id)).items.length, 1);
    assert.equal((await s2.getUsage(acct.id, "2026-11")).documents, 3);
    assert.equal(await s2.getClient("acct_other", cli.id), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("profile=auto and schematron=1 as the workspace sends them: the result says which rules ran", async () => {
  const a = await newAccount("Kanzlei Auto");
  const xr = readFileSync(new URL("../examples/xrechnung-cii-invoice.xml", import.meta.url), "utf8");
  const r = await call("POST", "/v1/check?profile=auto&schematron=1&name=x.xml", { key: a.key, raw: xr, headers: { "content-type": "application/xml" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.profile, "xrechnung");
  assert.equal(r.json.profileDetected, true);
  // "ok" where the compiled Schematron is installed (the hosted image), otherwise "unavailable".
  assert.ok(["ok", "unavailable"].includes(r.json.schematron), r.json.schematron);
  const c = await call("POST", "/v1/clients", { key: a.key, body: { name: "GmbH" } });
  const min = xr.replace(/<ram:ID>urn:cen\.eu:en16931:2017[^<]*<\/ram:ID>/, "<ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>");
  assert.notEqual(min, xr);
  const b = await call("POST", `/v1/clients/${c.json.id}/batches?profile=auto`, { key: a.key, body: { documents: [{ name: "min.xml", content: min }] } });
  assert.equal(b.status, 201, JSON.stringify(b.json));
  assert.ok(b.json.results[0].findings.some((f) => f.rule === "PRO-DE-001"));
});
