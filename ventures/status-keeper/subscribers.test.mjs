import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribe, confirm, unsubscribe, validEmail, activeCount, confirmationMail, noticeMail, notifyAll, prune, PENDING_TTL_MS, CONFIRM_MAILS_PER_HOUR, MAX_SUBSCRIBERS } from "./subscribers.mjs";

const T = 1_000_000_000_000;
const meta = { title: "Acme", publicUrl: "https://s.example/" };

test("validEmail rejects obvious junk and header-injection characters", () => {
  assert.ok(validEmail("a@b.co"));
  for (const bad of ["", "a", "a@b", "a b@c.com", "a@b.com,c@d.com", "a@b.com\nBcc: x@y.com", "<a>@b.com", 5, null]) assert.equal(validEmail(bad), false, String(bad));
});

test("double opt-in: pending gets nothing until confirmed; the mail links the token", () => {
  const st = {};
  const r = subscribe(st, " Ann@Example.COM ", T, "tok1");
  assert.equal(r.action, "confirm");
  assert.equal(r.sub.email, "ann@example.com");
  assert.equal(activeCount(st), 0);
  assert.match(confirmationMail(r.sub, meta).text, /https:\/\/s\.example\/confirm\?t=tok1/);
  assert.equal(confirm(st, "wrong", T), null);
  assert.equal(confirm(st, "tok1", T + 1000).status, "active");
  assert.equal(activeCount(st), 1);
  assert.equal(subscribe(st, "ann@example.com", T + 2000).action, "already");
});

test("an unconfirmed request expires after 48 hours and cannot be confirmed late", () => {
  const st = {};
  subscribe(st, "a@b.co", T, "t");
  assert.equal(confirm(st, "t", T + PENDING_TTL_MS), null);
  prune(st, T + PENDING_TTL_MS);
  assert.equal(st.subscribers.length, 0);
});

test("re-requesting inside the cooldown does not send another confirmation", () => {
  const st = {};
  subscribe(st, "a@b.co", T, "t");
  assert.equal(subscribe(st, "a@b.co", T + 60_000).action, "cooldown");
  assert.equal(subscribe(st, "a@b.co", T + 3600_000 + 1).action, "confirm");
});

test("a bot cannot make the server email unlimited strangers, and the list is capped", () => {
  const st = {};
  for (let i = 0; i < CONFIRM_MAILS_PER_HOUR; i++) assert.equal(subscribe(st, `u${i}@x.co`, T).action, "confirm");
  assert.equal(subscribe(st, "extra@x.co", T).action, "rate");
  assert.equal(subscribe(st, "extra@x.co", T + 3600_001).action, "confirm");
  const full = { subscribers: Array.from({ length: MAX_SUBSCRIBERS }, (_, i) => ({ email: `e${i}@x.co`, status: "active", token: `t${i}`, createdAt: T })) };
  assert.equal(subscribe(full, "new@x.co", T).action, "full");
});

test("unsubscribe removes by token and a bad or empty token removes nothing", () => {
  const st = {};
  subscribe(st, "a@b.co", T, "t"); confirm(st, "t", T);
  assert.equal(unsubscribe(st, ""), null);
  assert.equal(unsubscribe(st, "nope"), null);
  assert.equal(unsubscribe(st, "t").email, "a@b.co");
  assert.equal(activeCount(st), 0);
});

test("notices carry status, message, a live link and one-click unsubscribe headers", () => {
  const sub = { email: "a@b.co", token: "t 1" };
  const inc = { title: "API down", status: "investigating", updates: [{ at: T, status: "investigating", message: "Looking" }] };
  const m = noticeMail({ kind: "incident", incident: inc }, sub, meta);
  assert.equal(m.subject, "[Acme] Incident: API down");
  assert.match(m.text, /Looking/);
  assert.match(m.text, /Unsubscribe: https:\/\/s\.example\/unsubscribe\?t=t%201/);
  assert.match(m.headers["List-Unsubscribe"], /unsubscribe\?t=t%201>/);
  assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  inc.status = "resolved"; inc.updates.push({ at: T, status: "resolved", message: "Fixed" });
  assert.equal(noticeMail({ kind: "resolved", incident: inc }, sub, meta).subject, "[Acme] Resolved: API down");
  const mm = noticeMail({ kind: "maintenance", maintenance: { title: "DB", startsAt: T, endsAt: T + 3600_000 } }, sub, meta);
  assert.match(mm.text, /do not count against uptime/);
});

test("notifyAll mails only active subscribers and survives a failing send", async () => {
  const st = {};
  for (const [e, t] of [["a@b.co", "1"], ["c@d.co", "2"], ["p@q.co", "3"]]) subscribe(st, e, T, t);
  confirm(st, "1", T); confirm(st, "2", T);
  const got = [];
  const inc = { title: "x", status: "investigating", updates: [{ at: T, status: "investigating", message: "m" }] };
  const r = await notifyAll(st, { kind: "incident", incident: inc }, meta, async (mail) => { if (mail.to === "a@b.co") throw new Error("boom"); got.push(mail.to); });
  assert.deepEqual(got, ["c@d.co"]);
  assert.deepEqual(r, { sent: 1, failed: 1 });
});
