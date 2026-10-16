import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTls, checkDomain, rdapExpiry } from "./certs.mjs";
import { recordExpiry, newState } from "./monitor.mjs";
import { tick, parseMonitors } from "./server.mjs";
import { statusJson, statusPage } from "./render.mjs";

const DAY = 86_400_000, T0 = Date.UTC(2026, 0, 10, 12);
const def = { id: "c", type: "tls", host: "example.com", timeoutMs: 100, warnDays: [30, 14, 7, 3, 1] };

test("checkTls: valid, expired, untrusted, lenient and unreachable", async () => {
  const conn = (o) => async () => ({ authorized: true, authError: null, ...o });
  assert.deepEqual((await checkTls(def, conn({ validTo: T0 + 5 * DAY }), T0)).ok, true);
  const exp = await checkTls(def, conn({ validTo: T0 - DAY }), T0);
  assert.equal(exp.ok, false); assert.match(exp.error, /expired 2026-01-09/);
  const bad = await checkTls(def, conn({ validTo: T0 + DAY, authorized: false, authError: "ERR_TLS_CERT_ALTNAME_INVALID" }), T0);
  assert.match(bad.error, /not trusted: ERR_TLS_CERT_ALTNAME_INVALID/);
  assert.equal((await checkTls({ ...def, strict: false }, conn({ validTo: T0 + DAY, authorized: false }), T0)).ok, true);
  assert.equal((await checkTls(def, conn({ validTo: NaN }), T0)).ok, false);
  assert.match((await checkTls(def, async () => { throw Object.assign(new Error("x"), { code: "ECONNREFUSED" }); }, T0)).error, /ECONNREFUSED/);
});

test("checkDomain reads the RDAP expiration event", async () => {
  const body = (events) => async () => ({ ok: true, status: 200, json: async () => ({ events }) });
  const d = { domain: "example.com", timeoutMs: 100 };
  const ok = await checkDomain(d, body([{ eventAction: "registration", eventDate: "2000-01-01T00:00:00Z" }, { eventAction: "expiration", eventDate: "2026-03-01T00:00:00Z" }]), T0);
  assert.equal(ok.ok, true); assert.equal(ok.expiresAt, Date.parse("2026-03-01T00:00:00Z"));
  assert.match((await checkDomain(d, body([{ eventAction: "expiration", eventDate: "2025-01-01T00:00:00Z" }]), T0)).error, /registration expired/);
  assert.match((await checkDomain(d, body([]), T0)).error, /no expiration/);
  assert.match((await checkDomain(d, async () => ({ ok: false, status: 404 }), T0)).error, /not found/);
  assert.match((await checkDomain(d, async () => ({ ok: false, status: 503 }), T0)).error, /HTTP 503/);
  assert.equal(rdapExpiry({}), null);
});

test("recordExpiry warns once per threshold, never repeats, and announces a renewal", () => {
  const s = newState(), exp = T0 + 40 * DAY;
  assert.deepEqual(recordExpiry(s, def, exp, T0), []);
  assert.deepEqual(recordExpiry(s, def, exp, T0 + 10 * DAY).map((e) => e.threshold), [30]);
  assert.deepEqual(recordExpiry(s, def, exp, T0 + 11 * DAY), []);
  assert.deepEqual(recordExpiry(s, def, exp, T0 + 26 * DAY).map((e) => e.threshold), [14]);
  assert.deepEqual(recordExpiry(s, def, exp, T0 + 39 * DAY + DAY / 2).map((e) => e.threshold), [1]);
  const next = exp + 90 * DAY;
  assert.deepEqual(recordExpiry(s, def, next, T0 + 40 * DAY).map((e) => e.type), ["renewed"]);
  assert.deepEqual(recordExpiry(s, def, next, T0 + 41 * DAY), []);
  assert.deepEqual(recordExpiry(s, def, next, T0 + 100 * DAY).map((e) => e.threshold), [30]);
});

test("a first sighting already inside the window alerts at the tightest threshold only", () => {
  const ev = recordExpiry(newState(), def, T0 + 2 * DAY, T0);
  assert.deepEqual(ev.map((e) => e.threshold), [3]);
});

test("parseMonitors validates tls and domain monitors and applies slow defaults", () => {
  const [t, d] = parseMonitors('[{"id":"c","type":"tls","host":"example.com"},{"id":"d","type":"domain","domain":"example.com","warnDays":[60,30]}]');
  assert.equal(t.intervalSec, 21_600); assert.equal(t.failAfter, 1); assert.deepEqual(d.warnDays, [60, 30]);
  assert.throws(() => parseMonitors('[{"id":"c","type":"tls","host":"localhost"}]'), /DNS name/);
  assert.throws(() => parseMonitors('[{"id":"c","type":"tls","host":"a b.com"}]'), /DNS name/);
  assert.throws(() => parseMonitors('[{"id":"c","type":"domain","domain":"example.com","warnDays":[0]}]'), /warnDays/);
  assert.throws(() => parseMonitors('[{"id":"c","type":"tls","host":"example.com","port":99999}]'), /port/);
  assert.throws(() => parseMonitors('[{"id":"c","type":"ftp","host":"example.com"}]'), /type must be/);
});

test("tick alerts on expiry without opening an incident or touching uptime, and the page shows days left", async () => {
  const state = newState(), alerts = [];
  const defs = parseMonitors('[{"id":"c","name":"Site cert","type":"tls","host":"example.com"}]');
  const connect = async () => ({ validTo: T0 + 6 * DAY, authorized: true });
  assert.equal(await tick(state, defs, T0, { connect, alert: async (t) => alerts.push(t) }), true);
  assert.equal(alerts.length, 1); assert.match(alerts[0], /Site cert certificate expires in 6 day\(s\) \(2026-01-16\)/);
  assert.equal(state.incidents.length, 0); assert.equal(state.monitors.c.status, "up");
  await tick(state, defs, T0 + 7 * 3600_000, { connect, alert: async (t) => alerts.push(t) });
  assert.equal(alerts.length, 1, "same threshold is not re-alerted");
  const json = statusJson(state, defs, { title: "T" }, T0);
  assert.equal(json.components[0].daysLeft, 6);
  assert.match(statusPage(state, defs, { title: "T", publicUrl: "/" }, T0), /Certificate valid until 2026-01-16.*6 days left/);
});

test("an expired certificate opens an incident that names the certificate", async () => {
  const state = newState();
  const defs = parseMonitors('[{"id":"c","name":"Site","type":"tls","host":"example.com"}]');
  await tick(state, defs, T0, { connect: async () => ({ validTo: T0 - DAY, authorized: false }) });
  assert.equal(state.monitors.c.status, "down");
  assert.match(state.incidents[0].title, /Site certificate is invalid or unreachable/);
});

test("connectTls reads the real certificate a local TLS server presents", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tlsMod = await import("node:tls");
  const { connectTls } = await import("./certs.mjs");
  const dir = mkdtempSync(`${tmpdir()}/sk-`);
  try { execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${dir}/k.pem`, "-out", `${dir}/c.pem`, "-days", "20", "-subj", "/CN=localhost"], { stdio: "ignore" }); }
  catch { return; } // no openssl on this machine: the injected-connector tests above still cover the logic
  const server = tlsMod.createServer({ key: readFileSync(`${dir}/k.pem`), cert: readFileSync(`${dir}/c.pem`) }, (s) => s.end());
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const r = await checkTls({ host: "127.0.0.1", port: server.address().port, timeoutMs: 2000 }, connectTls);
    assert.equal(r.ok, false, "self-signed is not trusted");
    assert.match(r.error, /not trusted/);
    const lenient = await checkTls({ host: "127.0.0.1", port: server.address().port, timeoutMs: 2000, strict: false }, connectTls);
    assert.equal(lenient.ok, true);
    const days = (lenient.expiresAt - Date.now()) / 86_400_000;
    assert.ok(days > 19 && days < 21, `expected about 20 days, got ${days}`);
  } finally { server.close(); }
});
