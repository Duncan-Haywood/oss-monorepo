// PDF to ZUGFeRD, part 3: saving the e-invoice built on the convert screen to a client's history.
// POST /v1/convert/build with clientId records the server's own build and check as a one-file run,
// on the in-memory store and on SQLite. Proprietary (see ../LICENSE).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { buildDashboard } from "./dashboard.mjs";
import { convertRunOf, createProHandler } from "./server.mjs";
import { openSqliteStore } from "./sql-store.mjs";
import { MemoryStore } from "./store.mjs";

const pdf = (name) => new Uint8Array(readFileSync(new URL(`./testdata/${name}`, import.meta.url)));
const now = () => new Date("2026-11-26T10:00:00Z");
const servers = [];
after(() => {
  for (const s of servers) s.close();
});

async function serve(store) {
  const server = createServer(createProHandler({ store, env: { ADMIN_TOKEN: "t" }, now }));
  servers.push(server);
  await new Promise((r) => server.listen(0, r));
  return `http://127.0.0.1:${server.address().port}`;
}

async function account(base, name) {
  const acct = await (await fetch(`${base}/v1/admin/accounts`, { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ name }) })).json();
  return { authorization: `Bearer ${acct.apiKey}`, "content-type": "application/json" };
}

for (const [kind, makeStore] of [
  ["memory", async () => new MemoryStore({ now })],
  ["sqlite", async () => openSqliteStore(":memory:", { now })],
]) {
  test(`convert/build with clientId saves the checked file to the client's history (${kind})`, async () => {
    const base = await serve(await makeStore());
    const auth = await account(base, "Kanzlei Verlauf");
    const client = await (await fetch(`${base}/v1/clients`, { method: "POST", headers: auth, body: JSON.stringify({ name: "Muster Haustechnik", country: "DE" }) })).json();
    const read = await (await fetch(`${base}/v1/convert`, { method: "POST", headers: { authorization: auth.authorization }, body: pdf("rechnung-de.pdf") })).json();
    const draft = { ...read.draft, buyer: { ...read.draft.buyer, endpoint: { scheme: "EM", id: "rechnung@muster-kg.example" } } };
    const post = (body) => fetch(`${base}/v1/convert/build?lang=de`, { method: "POST", headers: auth, body: JSON.stringify(body) });

    // Built and downloaded first, without a client: nothing is saved.
    const first = await post({ draft, format: "facturx", profile: "en16931" });
    const fj = await first.json();
    assert.equal(fj.ok, true);
    assert.equal(fj.run, undefined);
    assert.equal(first.headers.get("x-usage-documents-charged"), "1");
    assert.deepEqual((await (await fetch(`${base}/v1/clients/${client.id}/history`, { headers: auth })).json()).items, []);

    // Then saved: the same XML, so not charged again; the answer carries the run.
    const saved = await post({ draft, format: "facturx", profile: "en16931", clientId: client.id });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get("x-usage-documents-charged"), "0", "building, then saving, costs one unit");
    const sj = await saved.json();
    assert.equal(sj.ok, true);
    assert.equal(sj.check.status, "pass", JSON.stringify(sj.check.findings));
    assert.equal(sj.run.clientId, client.id);
    assert.deepEqual(sj.run.totals, { files: 1, passed: 1, failed: 0, fixable: 0 });
    const [file] = sj.run.files;
    assert.equal(file.file, "2026-0815.pdf");
    assert.equal(file.origin, "convert");
    assert.equal(file.format, "facturx");
    assert.equal(file.status, "pass");
    assert.equal(file.sha256, sj.check.sha256, "the file hash is of the file in this answer, the one the screen downloads");
    assert.match(file.xmlSha256, /^[0-9a-f]{64}$/);
    assert.notEqual(file.xmlSha256, file.sha256);

    // The history and the run read back as saved, hashes only.
    const hist = await (await fetch(`${base}/v1/clients/${client.id}/history`, { headers: auth })).json();
    assert.equal(hist.items.length, 1);
    assert.equal(hist.items[0].id, sj.run.id);
    assert.deepEqual(hist.items[0].files, sj.run.files);
    const one = await (await fetch(`${base}/v1/clients/${client.id}/runs/${sj.run.id}`, { headers: auth })).json();
    assert.equal(one.files[0].xmlSha256, file.xmlSha256);
    assert.ok(!JSON.stringify(hist).includes("Muster KG"), "no invoice content is kept, only hashes and rule ids");

    // The same invoice as UBL: a second run for the client, its format recorded.
    const ubl = await (await post({ draft, format: "ubl", profile: "en16931", clientId: client.id })).json();
    assert.equal(ubl.run.files[0].format, "ubl");
    assert.equal(ubl.run.files[0].file.endsWith(".xml"), true);
    assert.equal((await (await fetch(`${base}/v1/clients/${client.id}/history`, { headers: auth })).json()).items.length, 2);

    // The dashboard counts it like any checked file.
    const dash = await (await fetch(`${base}/v1/dashboard`, { headers: auth })).json();
    assert.equal(dash.clients.find((c) => c.id === client.id)?.files, 2);
  });

  test(`convert/build refuses a client that is not the account's, before building or metering (${kind})`, async () => {
    const base = await serve(await makeStore());
    const a = await account(base, "Kanzlei A");
    const b = await account(base, "Kanzlei B");
    const theirs = await (await fetch(`${base}/v1/clients`, { method: "POST", headers: b, body: JSON.stringify({ name: "Client of B" }) })).json();
    const read = await (await fetch(`${base}/v1/convert`, { method: "POST", headers: { authorization: a.authorization }, body: pdf("rechnung-de.pdf") })).json();
    const draft = { ...read.draft, buyer: { ...read.draft.buyer, endpoint: { scheme: "EM", id: "rechnung@muster-kg.example" } } };
    const post = (body) => fetch(`${base}/v1/convert/build`, { method: "POST", headers: a, body: JSON.stringify(body) });

    const cross = await post({ draft, format: "cii", clientId: theirs.id });
    assert.equal(cross.status, 404);
    assert.equal(cross.headers.get("x-usage-documents-charged"), null);
    assert.equal((await post({ draft, format: "cii", clientId: "no-such-client" })).status, 404);
    assert.equal((await post({ draft, format: "cii", clientId: 42 })).status, 400);
    assert.equal((await post({ draft, format: "cii", clientId: "../x" })).status, 400);
    const acct = await (await fetch(`${base}/v1/account`, { headers: a })).json();
    assert.equal(acct.usage.documents, 0, "nothing was metered");
    // B's client history is untouched.
    assert.deepEqual((await (await fetch(`${base}/v1/clients/${theirs.id}/history`, { headers: b })).json()).items, []);

    // A draft the creator cannot build saves nothing.
    const mine = await (await fetch(`${base}/v1/clients`, { method: "POST", headers: a, body: JSON.stringify({ name: "Mine" }) })).json();
    const broken = await (await post({ draft: { ...draft, number: "" }, format: "cii", clientId: mine.id })).json();
    assert.equal(broken.ok, false);
    assert.equal(broken.run, undefined);
    assert.deepEqual((await (await fetch(`${base}/v1/clients/${mine.id}/history`, { headers: a })).json()).items, []);
  });
}

test("convertRunOf: a failing check is a failed one-file run, with no fixes", () => {
  const run = convertRunOf("cl_1", { file: "x.xml", sha256: "a".repeat(64), bytes: 10, status: "fail", lang: "fr", profile: "en16931", findings: [{ rule: "BR-CO-15", severity: "error" }, { rule: "BR-CO-15", severity: "error" }] }, { format: "cii", xmlSha256: "b".repeat(64) });
  assert.deepEqual(run.totals, { files: 1, passed: 0, failed: 1, fixable: 0 });
  assert.equal(run.lang, "fr");
  assert.deepEqual(run.files[0].rules, ["BR-CO-15"]);
  assert.equal(run.files[0].origin, "convert");
  assert.deepEqual(run.files[0].fixesApplied, []);
  // Dashboard input shape: a client's run with a converted file reads like a batch run.
  const dash = buildDashboard({ clients: [{ id: "cl_1", name: "C" }], runsByClient: new Map([["cl_1", [{ ...run, createdAt: now().toISOString() }]]]), lastByClient: new Map([["cl_1", { ...run, createdAt: now().toISOString() }]]), now: now(), days: 30 });
  assert.ok(dash.clients[0]);
});
