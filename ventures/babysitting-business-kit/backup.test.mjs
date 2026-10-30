import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sigv4, signingKey, s3Config, s3Put, snapshot, listSnapshots, loadDesk, atomicWrite, dailyBackup, integrations, status, KEEP } from "./backup.mjs";
import { handler } from "./server.mjs";
import { exampleDesk, emptyDesk } from "./engine.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "bbk-backup-"));
const quiet = () => {};

// AWS's published SigV4 test suite (aws-sig-v4-test-suite, as vendored in botocore's
// tests/unit/auth/aws4_testsuite): credentials, region, service and date are the suite's.
const SUITE = { region: "us-east-1", service: "service", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", amzDate: "20150830T123600Z" };

test("SigV4 matches AWS's test suite: get-vanilla", () => {
  const s = sigv4({ ...SUITE, method: "GET", url: "https://example.amazonaws.com/" });
  assert.equal(s.authorization, "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
  assert.equal(s.headers.host, undefined, "host is signed but left for fetch to set");
});

test("SigV4 matches AWS's test suite: query order and a form POST", () => {
  const q = sigv4({ ...SUITE, url: "https://example.amazonaws.com/?Param2=value2&Param1=value1" });
  assert.equal(q.signature, "b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500");
  const p = sigv4({ ...SUITE, method: "POST", url: "https://example.amazonaws.com/", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "Param1=value1" });
  assert.equal(p.signature, "ff11897932ad3f4e8b18135d722051e5ac45fc38421b1da7b9d196a0fe09473a");
  assert.match(p.authorization, /SignedHeaders=content-type;host;x-amz-date,/);
});

test("SigV4 signing key matches the AWS documentation example", () => {
  // docs.aws.amazon.com, "Signature Version 4 signing process" example (IAM, 20150830)
  assert.equal(signingKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20150830", "us-east-1", "iam").toString("hex"), "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9");
});

test("S3 signing sends the payload hash and encodes the key once", () => {
  const s = sigv4({ method: "PUT", url: "https://s3.us-east-1.amazonaws.com/my-bucket/babysitting-desk/desk%202026.json", body: "{}", region: "us-east-1", service: "s3", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "x", amzDate: "20261030T070000Z" });
  assert.equal(s.headers["x-amz-content-sha256"], "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  assert.match(s.canonicalRequest, /^PUT\n\/my-bucket\/babysitting-desk\/desk%202026\.json\n\n/);
  assert.match(s.authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date,/);
});

test("off-site backup is off until bucket and both keys are set, and https only", () => {
  assert.equal(s3Config({}), null);
  assert.equal(s3Config({ BACKUP_S3_BUCKET: "b", BACKUP_S3_ACCESS_KEY_ID: "a" }), null);
  const full = { BACKUP_S3_BUCKET: "b", BACKUP_S3_ACCESS_KEY_ID: "a", BACKUP_S3_SECRET_ACCESS_KEY: "s" };
  assert.equal(s3Config(full).endpoint, "https://s3.us-east-1.amazonaws.com");
  assert.equal(s3Config({ ...full, BACKUP_S3_ENDPOINT: "http://evil.example" }), null);
  assert.equal(s3Config({ ...full, BACKUP_S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com/", BACKUP_S3_REGION: "auto" }).endpoint, "https://acct.r2.cloudflarestorage.com");
});

test("s3Put PUTs a signed object to the sitter's bucket", async () => {
  const calls = [];
  const cfg = s3Config({ BACKUP_S3_BUCKET: "grace-backups", BACKUP_S3_ACCESS_KEY_ID: "AKID", BACKUP_S3_SECRET_ACCESS_KEY: "secret", BACKUP_S3_ENDPOINT: "https://s3.example.com" });
  const url = await s3Put(cfg, "babysitting-desk/desk-2026-10-30.json", "{}", async (u, init) => { calls.push({ u, init }); return { ok: true }; }, () => Date.parse("2026-10-30T07:00:00Z"));
  assert.equal(url, "https://s3.example.com/grace-backups/babysitting-desk/desk-2026-10-30.json");
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(calls[0].init.headers["x-amz-date"], "20261030T070000Z");
  assert.match(calls[0].init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKID\/20261030\/us-east-1\/s3\/aws4_request/);
  await assert.rejects(s3Put(cfg, "k", "{}", async () => ({ ok: false, status: 403 })), /HTTP 403/);
});

test("daily snapshots keep the newest 14", () => {
  const dir = tmp();
  for (let d = 1; d <= 20; d++) snapshot({ n: d }, dir, `2026-10-${String(d).padStart(2, "0")}`);
  const names = listSnapshots(dir).map((s) => s.name);
  assert.equal(KEEP, 14);
  assert.equal(names.length, 14);
  assert.equal(names[0], "desk-2026-10-20.json");
  assert.equal(names.at(-1), "desk-2026-10-07.json");
  snapshot({ n: 21 }, dir, "2026-10-20");
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "desk-2026-10-20.json"), "utf8")), { n: 21 }, "the same day overwrites");
});

test("a corrupt state file is moved aside, never overwritten, and the newest good snapshot is loaded", () => {
  const dir = tmp();
  const path = join(dir, "desk.json");
  const backups = join(dir, "backups");
  const good = exampleDesk();
  snapshot(good, backups, "2026-10-28");
  writeFileSync(join(backups, "desk-2026-10-29.json"), "{broken");
  writeFileSync(path, '{"leads": [ {"name": "half a fi');
  const logs = [];
  const { desk, recovered } = loadDesk(path, { dir: backups, log: (m) => logs.push(m), now: () => Date.parse("2026-10-30T08:00:00Z") });
  assert.equal(existsSync(path), false);
  assert.equal(readFileSync(recovered.movedTo, "utf8"), '{"leads": [ {"name": "half a fi');
  assert.match(recovered.movedTo, /desk\.json\.corrupt-2026-10-30T08-00-00-000Z$/);
  assert.equal(recovered.from, "desk-2026-10-28.json");
  assert.equal(desk.leads.length, good.leads.length);
  assert.match(logs[0], /moved it to/);
});

test("a JSON array or a missing file is handled; no snapshot means an empty desk", () => {
  const dir = tmp();
  const path = join(dir, "desk.json");
  assert.deepEqual(loadDesk(path, { log: quiet }).desk, emptyDesk());
  writeFileSync(path, "[]");
  const r = loadDesk(path, { log: quiet });
  assert.equal(r.recovered.from, null);
  assert.deepEqual(r.desk, emptyDesk());
  atomicWrite(path, JSON.stringify(exampleDesk()));
  assert.equal(loadDesk(path, { log: quiet }).recovered, null);
  assert.ok(!readdirSync(dir).some((n) => n.endsWith(".tmp")));
});

test("dailyBackup snapshots and copies off-site only when configured", async () => {
  const dir = tmp();
  const state = { desk: exampleDesk() };
  const calls = [];
  const f = async (u) => { calls.push(u); return { ok: true }; };
  await dailyBackup(state, { STATE: join(dir, "desk.json") }, "2026-10-30", { fetchImpl: f, log: quiet });
  assert.equal(state.backupInfo.lastSnapshot, "desk-2026-10-30.json");
  assert.equal(calls.length, 0);
  await dailyBackup(state, { STATE: join(dir, "desk.json"), BACKUP_S3_BUCKET: "b", BACKUP_S3_ACCESS_KEY_ID: "a", BACKUP_S3_SECRET_ACCESS_KEY: "s" }, "2026-10-30", { fetchImpl: f, log: quiet, now: () => 0 });
  assert.deepEqual(calls, ["https://s3.us-east-1.amazonaws.com/b/babysitting-desk/desk-2026-10-30.json"]);
  assert.equal(state.backupInfo.lastOffsite, "1970-01-01T00:00:00.000Z");
});

test("integrations list names only, never values", () => {
  const env = { ADMIN_KEY: "super-secret-admin", RESEND_API_KEY: "re_secret", FROM_EMAIL: "a@b.co", NOTIFY_WEBHOOK_URL: "https://ntfy.sh/secret-topic" };
  const list = integrations(env);
  const text = JSON.stringify(list) + JSON.stringify(status({ desk: emptyDesk() }, env));
  for (const v of Object.values(env)) assert.ok(!text.includes(v), `leaked ${v}`);
  assert.deepEqual(list.filter((i) => i.configured).map((i) => i.name), ["admin key", "webhook alerts", "email (Resend)"]);
});

async function serve(env) {
  const state = { desk: exampleDesk(), lastDigest: "2026-11-02" };
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, env, () => Date.parse("2026-11-02T15:00:00Z"), async () => ({ ok: true })));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const auth = { authorization: `Bearer ${env.ADMIN_KEY}` };
  return { state, base, auth, saves: () => saves, close: () => new Promise((r) => srv.close(r)) };
}

test("admin API: status, backup download and restore, all behind the admin key", async () => {
  const dir = tmp();
  const env = { ADMIN_KEY: "k".repeat(32), STATE: join(dir, "desk.json"), RESEND_API_KEY: "re_live_value" };
  const s = await serve(env);
  try {
    assert.equal((await fetch(`${s.base}/api/status`)).status, 401);
    assert.equal((await fetch(`${s.base}/api/backup`)).status, 401);
    assert.equal((await fetch(`${s.base}/api/restore`, { method: "POST", body: "{}" })).status, 401);
    const admin = await fetch(`${s.base}/admin`);
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /Server status/);

    const st = await (await fetch(`${s.base}/api/status`, { headers: s.auth })).json();
    assert.equal(st.counts.leads, s.state.desk.leads.length);
    assert.equal(st.lastDigest, "2026-11-02");
    assert.ok(!JSON.stringify(st).includes("re_live_value"));
    assert.equal(typeof st.disk.snapshots, "number");

    const dl = await fetch(`${s.base}/api/backup`, { headers: s.auth });
    assert.equal(dl.headers.get("content-disposition"), 'attachment; filename="babysitting-desk-2026-11-02.json"');
    const backup = await dl.json();
    assert.deepEqual(backup, s.state.desk);

    s.state.desk = emptyDesk();
    assert.equal((await fetch(`${s.base}/api/restore`, { method: "POST", headers: s.auth, body: "[1,2]" })).status, 422);
    assert.equal((await fetch(`${s.base}/api/restore`, { method: "POST", headers: s.auth, body: "nope" })).status, 400);
    const r = await (await fetch(`${s.base}/api/restore`, { method: "POST", headers: s.auth, body: JSON.stringify(backup) })).json();
    assert.equal(r.savedFirst, "desk-2026-11-02-pre-restore-150000.json");
    assert.equal(s.state.desk.leads.length, backup.leads.length);
    assert.equal(s.saves(), 1);

    const list = await (await fetch(`${s.base}/api/backups`, { headers: s.auth })).json();
    assert.deepEqual(list.map((x) => x.name), ["desk-2026-11-02-pre-restore-150000.json"]);
    const r2 = await fetch(`${s.base}/api/restore`, { method: "POST", headers: s.auth, body: JSON.stringify({ snapshot: "desk-2026-11-02-pre-restore-150000.json" }) });
    assert.equal(r2.status, 200);
    assert.equal(s.state.desk.leads.length, 0, "restored the empty desk saved before the first restore");
    assert.equal((await fetch(`${s.base}/api/backup?snapshot=../desk.json`, { headers: s.auth })).status, 404);
    assert.equal((await fetch(`${s.base}/api/restore`, { method: "POST", headers: s.auth, body: JSON.stringify({ snapshot: "../../etc/passwd" }) })).status, 404);
  } finally { await s.close(); }
});
