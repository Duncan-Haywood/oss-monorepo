// TLS paths of the self-host server against real TLS servers (a throwaway self-signed certificate made with openssl):
// implicit TLS for IMAP (993) and SMTP (465), STARTTLS for SMTP (587), and what happens when the certificate is not trusted.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeImap } from "./fake-imap.mjs";
import { fakeSmtp } from "./fake-smtp.mjs";
import { Imap, capsOf } from "./imap.mjs";
import { buildMessage, sendMail } from "./smtp.mjs";

const dir = mkdtempSync(join(tmpdir(), "sa-tls-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
const tlsOpts = { key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) };
const ca = readFileSync(join(dir, "c.pem"));
const msg = () => buildMessage({ from: "me@example.com", to: "pat@x.example", subject: "Hi", body: "Hello" });

test("IMAP over implicit TLS: trusted with the CA, refused without it, and the password never goes out on a refused connection", async () => {
  const f = fakeImap({ tlsOpts, messages: { 1: "From: a@b.co\r\nSubject: x\r\n\r\nhi" } }); const port = await f.listen();
  const c = new Imap({ host: "localhost", port, secure: true, ca });
  await c.connect(); await c.login("me@example.com", "pw"); await c.examine();
  assert.ok(f.log.some((l) => /^A\d+ LOGIN/.test(l)));
  c.sock.destroy();
  f.log.length = 0;
  await assert.rejects(async () => { const u = new Imap({ host: "localhost", port, secure: true }); await u.connect(); await u.login("me@example.com", "pw"); }, /self.signed|unable to verify|certificate/i);
  assert.equal(f.log.length, 0, "no command, so no password, reached a server whose certificate failed");
  await f.close();
});

test("SMTP over implicit TLS delivers with the CA and refuses an untrusted certificate", async () => {
  const smtp = fakeSmtp({ mode: "implicit", tlsOpts }); const port = await smtp.listen();
  await sendMail({ host: "localhost", port, secure: true, user: "me@example.com", pass: "pw", ca }, msg());
  assert.equal(smtp.delivered.length, 1);
  await assert.rejects(sendMail({ host: "localhost", port, secure: true, user: "me@example.com", pass: "pw" }, msg()), /self.signed|unable to verify|certificate/i);
  assert.equal(smtp.delivered.length, 1);
  await smtp.close();
});

test("SMTP STARTTLS: upgrades before AUTH, delivers, and an untrusted certificate stops before the password is sent", async () => {
  const smtp = fakeSmtp({ mode: "starttls", tlsOpts }); const port = await smtp.listen();
  await sendMail({ host: "localhost", port, user: "me@example.com", pass: "pw", ca }, msg());
  assert.equal(smtp.delivered.length, 1);
  const i = smtp.log.indexOf("STARTTLS");
  assert.ok(i > 0 && smtp.log.findIndex((l) => l.startsWith("AUTH")) > i, "AUTH comes after STARTTLS");
  smtp.log.length = 0;
  await assert.rejects(sendMail({ host: "localhost", port, user: "me@example.com", pass: "pw" }, msg()), /self.signed|unable to verify|certificate/i);
  assert.ok(!smtp.log.some((l) => l.startsWith("AUTH")), "no AUTH sent over an untrusted channel");
  await smtp.close();
});

test("List-Unsubscribe: a bare address or a whole <mailto:...> URI both give one clean header", () => {
  for (const u of [undefined, "me@example.com", "<mailto:me@example.com?subject=unsubscribe>", "mailto:me@example.com"]) {
    const raw = buildMessage({ from: "me@example.com", to: "pat@x.example", subject: "Hi", body: "Hello", unsubscribe: u }).raw;
    assert.match(raw, /^List-Unsubscribe: <mailto:me@example\.com\?subject=unsubscribe>\r$/m, String(u));
  }
});

// ---------- IMAP STARTTLS (port 143) ----------
// loopbackIsSafe: false makes the client treat the 127.0.0.1 fake as a remote server, where plain text must never carry a password.
const remote = { host: "localhost", secure: false, loopbackIsSafe: false };
const inbox = { 1: "From: a@b.co\r\nSubject: x\r\n\r\nhi" };

test("IMAP STARTTLS: upgrades before LOGIN, asks for capabilities again over TLS, and reads mail", async () => {
  const f = fakeImap({ tlsOpts, starttls: true, messages: inbox }); const port = await f.listen();
  const c = new Imap({ ...remote, port, ca });
  await c.connect();
  assert.equal(c.encrypted, true);
  assert.ok(!c.caps.includes("STARTTLS") && c.caps.includes("AUTH=PLAIN"), "capabilities are the post-TLS ones: " + c.caps);
  await c.login("me@example.com", "pw"); await c.examine();
  assert.deepEqual(await c.search("ALL"), [1]);
  const st = f.log.findIndex((l) => / STARTTLS$/.test(l)), lg = f.log.findIndex((l) => / LOGIN /.test(l));
  assert.ok(st >= 0 && lg > st, "LOGIN only after STARTTLS: " + f.log.join(" | "));
  await c.logout(); await f.close();
});

test("IMAP STARTTLS with an untrusted certificate: refused, and no LOGIN reaches the server", async () => {
  const f = fakeImap({ tlsOpts, starttls: true, messages: inbox }); const port = await f.listen();
  await assert.rejects(async () => { const c = new Imap({ ...remote, port }); await c.connect(); await c.login("me@example.com", "pw"); }, /self.signed|unable to verify|certificate/i);
  assert.ok(!f.log.some((l) => / LOGIN /.test(l)));
  await f.close();
});

test("IMAP plain port with no STARTTLS on a remote host: refused before the password is sent (a stripped STARTTLS looks like this)", async () => {
  const f = fakeImap({ messages: inbox }); const port = await f.listen();
  await assert.rejects(async () => { const c = new Imap({ ...remote, port }); await c.connect(); await c.login("me@example.com", "pw"); }, /offers no STARTTLS/);
  assert.ok(!f.log.some((l) => / LOGIN /.test(l)));
  // starttls: false does not open a way around it
  await assert.rejects(async () => { const c = new Imap({ ...remote, port, starttls: false }); await c.connect(); await c.login("me@example.com", "pw"); }, /plain-text IMAP|without TLS/);
  assert.ok(!f.log.some((l) => / LOGIN /.test(l)));
  // ... while loopback (a test server) still works in plain text, as before
  const c = new Imap({ host: "127.0.0.1", port, secure: false }); await c.connect(); await c.login("me@example.com", "pw"); await c.logout();
  await f.close();
});

test("IMAP STARTTLS: bytes after the server's OK and before the handshake are refused (plaintext injection)", async () => {
  const f = fakeImap({ tlsOpts, starttls: true, messages: inbox, inject: "* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n" }); const port = await f.listen();
  await assert.rejects(async () => { const c = new Imap({ ...remote, port, ca }); await c.connect(); }, /injection/);
  assert.ok(!f.log.some((l) => / LOGIN /.test(l)));
  await f.close();
});

test("IMAP PREAUTH greeting on a plain port to a remote host: refused (STARTTLS can never follow it)", async () => {
  const f = fakeImap({ preauth: true, messages: inbox }); const port = await f.listen();
  await assert.rejects(async () => { const c = new Imap({ ...remote, port }); await c.connect(); }, /PREAUTH/);
  assert.equal(f.log.length, 0, "no command sent");
  await f.close();
});

test("capsOf reads a greeting's CAPABILITY code and an untagged CAPABILITY line", () => {
  assert.deepEqual(capsOf("* OK [CAPABILITY IMAP4rev1 SASL-IR STARTTLS AUTH=PLAIN] Dovecot ready."), ["IMAP4REV1", "SASL-IR", "STARTTLS", "AUTH=PLAIN"]);
  assert.deepEqual(capsOf("* CAPABILITY IMAP4rev1 starttls"), ["IMAP4REV1", "STARTTLS"]);
  assert.deepEqual(capsOf("* OK ready"), []);
});

test("SMTP STARTTLS: bytes after the 220 and before the handshake are refused (plaintext injection), no AUTH sent", async () => {
  const smtp = fakeSmtp({ mode: "starttls", tlsOpts, inject: "250-fake\r\n250 AUTH PLAIN\r\n" }); const port = await smtp.listen();
  await assert.rejects(sendMail({ host: "localhost", port, user: "me@example.com", pass: "pw", ca }, msg()), /injection/);
  assert.ok(!smtp.log.some((l) => l.startsWith("AUTH")));
  assert.equal(smtp.delivered.length, 0);
  await smtp.close();
});
