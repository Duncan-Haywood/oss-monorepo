import assert from "node:assert/strict";
import { test } from "node:test";
import { CONSENT_VERSION } from "../content/format.mjs";
import worker, {
  deleteToken,
  LIMITS,
  parseSignup,
  purge,
  sameOrigin,
  sha256,
  verifyDeleteToken,
} from "../worker.mjs";
import { fakeD1 } from "./d1.mjs";

const SITE = "https://einvoice.test";

function setup() {
  const sent = [];
  const pending = [];
  const env = {
    DB: fakeD1(),
    SIGNING_SECRET: "test-secret-not-real",
    SITE_URL: SITE,
    EMAIL_FROM: "E-Invoice Preflight <no-reply@einvoice.test>",
    EMAIL: { send: async (m) => sent.push(m) },
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const ctx = { waitUntil: (p) => pending.push(p) };
  const flush = () => Promise.all(pending.splice(0));
  const rows = () => env.DB.raw.prepare("SELECT * FROM early_access").all();
  return { env, ctx, sent, flush, rows };
}

const form = (fields) => {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    for (const x of [].concat(v)) f.append(k, x);
  }
  return f;
};
const good = (over = {}) => ({
  email: "  Anna@Kanzlei.de ",
  lang: "de",
  role: "accountant",
  countries: ["fr", "de"],
  consent: "yes",
  consentVersion: CONSENT_VERSION,
  website: "",
  ...over,
});
const post = (path, body, headers = { Origin: SITE }) =>
  new Request(`${SITE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: body.toString(),
  });
const tokenFrom = (mail) => /confirm\?token=([^&\s]+)/.exec(mail.text)[1];
const deleteFrom = (mail) => decodeURIComponent(/delete\?token=([^&\s]+)/.exec(mail.text)[1]);

test("parseSignup: normalises and rejects anything unexpected", () => {
  const ok = parseSignup(form(good()));
  assert.deepEqual(ok, {
    ok: true,
    value: { email: "anna@kanzlei.de", lang: "de", role: "accountant", countries: "de,fr" },
  });
  const bad = {
    email: "not-an-email",
    lang: "es",
    role: "admin",
    countries: ["it"],
    consent: "",
    consentVersion: "2020-01-01",
  };
  for (const [k, v] of Object.entries(bad)) {
    assert.equal(parseSignup(form(good({ [k]: v }))).ok, false, k);
  }
  assert.equal(parseSignup(form(good({ countries: ["de", "de"] }))).ok, false);
  assert.equal(parseSignup(form(good({ email: `${"a".repeat(250)}@x.de` }))).ok, false);
  assert.equal(parseSignup(form(good({ website: "spam" }))).reason, "honeypot");
});

test("sameOrigin: Origin must match; else Sec-Fetch-Site same-origin", () => {
  const r = (h) => new Request(`${SITE}/api/early-access`, { method: "POST", headers: h });
  assert.equal(sameOrigin(r({ Origin: SITE }), SITE), true);
  assert.equal(sameOrigin(r({ Origin: "https://evil.test" }), SITE), false);
  assert.equal(sameOrigin(r({ "Sec-Fetch-Site": "same-origin" }), SITE), true);
  assert.equal(sameOrigin(r({ "Sec-Fetch-Site": "cross-site" }), SITE), false);
  assert.equal(sameOrigin(r({}), SITE), false);
});

test("signup -> pending row with only the listed fields, token stored hashed, email sent", async () => {
  const { env, ctx, sent, flush, rows } = setup();
  const res = await worker.fetch(post("/api/early-access", form(good())), env, ctx);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("Location"), `${SITE}/de/fruehzugang/postfach/`);
  await flush();
  const [row] = rows();
  assert.equal(row.email, "anna@kanzlei.de");
  assert.equal(row.status, "pending");
  assert.equal(row.countries, "de,fr");
  assert.equal(row.consent_version, CONSENT_VERSION);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["anna@kanzlei.de"]);
  assert.match(sent[0].subject, /Frühzugang/);
  const token = tokenFrom(sent[0]);
  assert.equal(row.token_hash, await sha256(token));
  assert.ok(!JSON.stringify(row).includes(token), "raw token never stored");
  assert.equal(sent[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("same answer for a confirmed address, and no second email", async () => {
  const { env, ctx, sent, flush } = setup();
  await worker.fetch(post("/api/early-access", form(good())), env, ctx);
  await flush();
  const token = tokenFrom(sent[0]);
  await worker.fetch(post("/api/early-access/confirm", form({ token, lang: "de" })), env, ctx);
  const res = await worker.fetch(post("/api/early-access", form(good())), env, ctx);
  await flush();
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("Location"), `${SITE}/de/fruehzugang/postfach/`);
  assert.equal(sent.length, 1);
});

test("GET confirm only shows a button; POST confirms and clears the token", async () => {
  const { env, ctx, sent, flush, rows } = setup();
  await worker.fetch(post("/api/early-access", form(good({ lang: "fr" }))), env, ctx);
  await flush();
  const token = tokenFrom(sent[0]);
  const page = await worker.fetch(
    new Request(`${SITE}/api/early-access/confirm?token=${token}&lang=fr`),
    env,
    ctx,
  );
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<button type="submit">Confirmer<\/button>/);
  assert.equal(rows()[0].status, "pending", "a link scanner's GET does not confirm");
  const res = await worker.fetch(
    post("/api/early-access/confirm", form({ token, lang: "fr" })),
    env,
    ctx,
  );
  assert.equal(res.headers.get("Location"), `${SITE}/fr/acces-anticipe/confirme/`);
  const [row] = rows();
  assert.equal(row.status, "confirmed");
  assert.equal(row.token_hash, null);
  // a used token does not work twice
  const again = await worker.fetch(
    post("/api/early-access/confirm", form({ token, lang: "fr" })),
    env,
    ctx,
  );
  assert.equal(again.headers.get("Location"), `${SITE}/fr/acces-anticipe/erreur/`);
});

test("expired confirmation token is refused", async () => {
  const { env, ctx, sent, flush } = setup();
  await worker.fetch(post("/api/early-access", form(good())), env, ctx);
  await flush();
  const token = tokenFrom(sent[0]);
  env.DB.raw.prepare("UPDATE early_access SET token_expires_at = 1").run();
  const res = await worker.fetch(post("/api/early-access/confirm", form({ token })), env, ctx);
  assert.equal(res.headers.get("Location"), `${SITE}/en/early-access/error/`);
});

test("cross-site form posts are refused (CSRF)", async () => {
  const { env, ctx, rows, flush } = setup();
  const res = await worker.fetch(
    post("/api/early-access", form(good()), { Origin: "https://evil.test" }),
    env,
    ctx,
  );
  await flush();
  assert.equal(res.status, 403);
  assert.equal(rows().length, 0);
});

test("honeypot: success answer, nothing stored, nothing sent", async () => {
  const { env, ctx, sent, flush, rows } = setup();
  const res = await worker.fetch(post("/api/early-access", form(good({ website: "x" }))), env, ctx);
  await flush();
  assert.equal(res.headers.get("Location"), `${SITE}/de/fruehzugang/postfach/`);
  assert.equal(rows().length, 0);
  assert.equal(sent.length, 0);
});

test("resend limits: one email per 10 minutes, at most 5 per day", async () => {
  const { env, ctx, sent, flush } = setup();
  const { handleSignup } = await import("../worker.mjs");
  let now = Date.UTC(2026, 10, 24, 9);
  const go = async () => {
    await handleSignup(post("/api/early-access", form(good())), env, ctx, now);
    await flush();
  };
  await go();
  await go(); // within 10 minutes
  assert.equal(sent.length, 1);
  for (let i = 0; i < 6; i++) {
    now += LIMITS.resendGapMs + 1;
    await go();
  }
  assert.equal(sent.length, LIMITS.maxSendsPerDay);
  now += 24 * 3600_000;
  await go();
  assert.equal(sent.length, LIMITS.maxSendsPerDay + 1, "window resets after a day");
});

test("delete: signed token only; page button; one-click POST without Origin works", async () => {
  const { env, ctx, sent, flush, rows } = setup();
  await worker.fetch(post("/api/early-access", form(good({ lang: "en" }))), env, ctx);
  await flush();
  const del = deleteFrom(sent[0]);
  assert.ok(await verifyDeleteToken(env.SIGNING_SECRET, del));
  assert.equal(await verifyDeleteToken("other-secret", del), null);
  const forged = await deleteToken("other-secret", rows()[0].id);
  const bad = await worker.fetch(
    post("/api/early-access/delete", form({ token: forged }), {}),
    env,
    ctx,
  );
  assert.equal(bad.headers.get("Location"), `${SITE}/en/early-access/error/`);
  assert.equal(rows().length, 1);
  const page = await worker.fetch(
    new Request(`${SITE}/api/early-access/delete?token=${encodeURIComponent(del)}&lang=en`),
    env,
    ctx,
  );
  assert.match(await page.text(), /Delete my data/);
  assert.equal(rows().length, 1, "GET does not delete");
  // RFC 8058 one-click: token in the URL, fixed body, no Origin header
  const oneClick = new Request(
    `${SITE}/api/early-access/delete?token=${encodeURIComponent(del)}&lang=en`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    },
  );
  const res = await worker.fetch(oneClick, env, ctx);
  assert.equal(res.headers.get("Location"), `${SITE}/en/early-access/deleted/`);
  assert.equal(rows().length, 0, "whole row removed");
});

test("purge: unconfirmed after 7 days, confirmed after 24 months", async () => {
  const { env, rows } = setup();
  const now = Date.UTC(2026, 10, 24);
  const ins = env.DB.raw.prepare(
    `INSERT INTO early_access (id, email, lang, role, consent_version, consent_at, status,
       confirmed_at, created_at) VALUES (?, ?, 'en', 'other', 'v', ?, ?, ?, ?)`,
  );
  const day = 86_400_000;
  ins.run("p_old", "a@x.de", now - 8 * day, "pending", null, now - 8 * day);
  ins.run("p_new", "b@x.de", now - 6 * day, "pending", null, now - 20 * day); // re-requested
  ins.run("c_old", "c@x.de", now - 800 * day, "confirmed", now - 731 * day, now - 800 * day);
  ins.run("c_new", "d@x.de", now - 400 * day, "confirmed", now - 400 * day, now - 400 * day);
  await purge(env, now);
  assert.deepEqual(
    rows()
      .map((r) => r.id)
      .sort(),
    ["c_new", "p_new"],
  );
});

test("static paths go to assets; API needs SIGNING_SECRET", async () => {
  const { env, ctx } = setup();
  const r = await worker.fetch(new Request(`${SITE}/de/`), env, ctx);
  assert.equal(await r.text(), "asset");
  const r2 = await worker.fetch(
    post("/api/early-access", form(good())),
    { ...env, SIGNING_SECRET: "" },
    ctx,
  );
  assert.equal(r2.status, 503);
  const r3 = await worker.fetch(new Request(`${SITE}/api/nope`), env, ctx);
  assert.equal(r3.status, 404);
});
