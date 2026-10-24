import test from "node:test";
import assert from "node:assert/strict";
import { createMailer, mailProblems, PROVIDERS } from "./mail.mjs";

const msg = { to: "pat@example.com", subject: "Update your card", text: "Hi" };
const capture = (status = 200) => { const calls = []; return { calls, fetch: async (url, init) => { calls.push({ url, ...init }); return { ok: status < 400, status }; } }; };

test("resend is the default and sends a JSON body", async () => {
  const c = capture();
  await createMailer({ RESEND_API_KEY: "re_1", MAIL_FROM: "Billing <b@x.com>" }, c.fetch)(msg);
  assert.equal(c.calls[0].url, "https://api.resend.com/emails");
  assert.equal(JSON.parse(c.calls[0].body).to[0], "pat@example.com");
});

test("postmark uses its server-token header", async () => {
  const c = capture();
  await createMailer({ MAIL_PROVIDER: "postmark", POSTMARK_SERVER_TOKEN: "tok", MAIL_FROM: "b@x.com" }, c.fetch)(msg);
  assert.equal(c.calls[0].headers["x-postmark-server-token"], "tok");
  assert.equal(JSON.parse(c.calls[0].body).MessageStream, "outbound");
});

test("sendgrid splits 'Name <addr>' into name and email", async () => {
  const c = capture();
  await createMailer({ MAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "SG.x", MAIL_FROM: 'Acme Billing <b@x.com>' }, c.fetch)(msg);
  const b = JSON.parse(c.calls[0].body);
  assert.deepEqual(b.from, { email: "b@x.com", name: "Acme Billing" });
  assert.equal(b.personalizations[0].to[0].email, "pat@example.com");
});

test("mailgun posts form data to the domain, with EU region support", async () => {
  const c = capture();
  const env = { MAIL_PROVIDER: "Mailgun", MAILGUN_API_KEY: "k", MAILGUN_DOMAIN: "mg.x.com", MAILGUN_REGION: "eu", MAIL_FROM: "b@x.com" };
  await createMailer(env, c.fetch)(msg);
  assert.equal(c.calls[0].url, "https://api.eu.mailgun.net/v3/mg.x.com/messages");
  assert.equal(c.calls[0].headers.authorization, `Basic ${Buffer.from("api:k").toString("base64")}`);
  assert.equal(new URLSearchParams(c.calls[0].body).get("to"), "pat@example.com");
});

test("a non-2xx answer throws with the provider name and status", async () => {
  await assert.rejects(createMailer({ RESEND_API_KEY: "re_1", MAIL_FROM: "b@x.com" }, capture(422).fetch)(msg), /resend 422/);
});

test("mailProblems names missing variables and unknown providers", () => {
  assert.deepEqual(mailProblems({}), ["RESEND_API_KEY", "MAIL_FROM"]);
  assert.deepEqual(mailProblems({ MAIL_PROVIDER: "mailgun", MAIL_FROM: "a@b.c", MAILGUN_API_KEY: "k" }), ["MAILGUN_DOMAIN"]);
  assert.match(mailProblems({ MAIL_PROVIDER: "smtp" })[0], /not one of/);
  assert.deepEqual(mailProblems({ MAIL_PROVIDER: "postmark", POSTMARK_SERVER_TOKEN: "t", MAIL_FROM: "a@b.c" }), []);
  assert.equal(Object.keys(PROVIDERS).length, 4);
});
