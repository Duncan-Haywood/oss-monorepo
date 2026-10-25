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
import { Imap } from "./imap.mjs";
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
