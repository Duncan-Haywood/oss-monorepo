import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";

const H = 3_600_000, T = Date.UTC(2026, 0, 5, 9);
const seqs = () => E.validateSequences([{ id: "onboard", name: "Onboarding", trigger: "signed_up", exitOn: ["upgraded"], steps: [
  { waitHours: 0, subject: "Welcome {{name|there}}", text: "Hi {{name|there}}.\n\nStart: https://x.io/go?a=1&b=2" },
  { waitHours: 48, subject: "Tip", text: "A tip.", skipIf: "created_project" },
  { waitHours: 72, subject: "Last", text: "Bye." }] }]);
const fresh = () => { const s = E.newState(); s.sequences = seqs(); return s; };
const drain = (s, now) => { const { items } = E.collectDue(s, now); for (const it of items) E.markSent(s, it, now); return items; };

test("validateSequences rejects bad shapes with a message", () => {
  assert.throws(() => E.validateSequences([{ id: "A b", trigger: "x", steps: [] }]), /id must be/);
  assert.throws(() => E.validateSequences([{ id: "a", trigger: "x", steps: [] }]), /needs 1-30 steps/);
  assert.throws(() => E.validateSequences([{ id: "a", trigger: "x", steps: [{ subject: "s", text: "t", waitHours: -1 }] }]), /waitHours/);
  assert.throws(() => E.validateSequences([{ id: "a", trigger: "x", sendHoursUTC: [5, 5], steps: [{ subject: "s", text: "t" }] }]), /sendHoursUTC/);
  const ok = { id: "a", trigger: "x", steps: [{ subject: "s", text: "t" }] };
  assert.throws(() => E.validateSequences([ok, ok]), /duplicate/);
});

test("an event enrolls once; the schedule is cumulative from enrollment", () => {
  const s = fresh();
  assert.deepEqual(E.track(s, { email: "A@x.io", event: "signed_up", at: T }).enrolled, ["onboard"]);
  assert.deepEqual(E.track(s, { email: "a@x.io", event: "signed_up", at: T + H }).enrolled, [], "no double enrollment");
  assert.equal(drain(s, T).length, 1);
  assert.equal(drain(s, T + 47 * H).length, 0);
  assert.equal(drain(s, T + 48 * H).length, 1);
  assert.equal(drain(s, T + 119 * H).length, 0);
  assert.equal(drain(s, T + 120 * H).length, 1);
  assert.equal(s.contacts["a@x.io"].en.onboard.end.why, "completed");
  assert.equal(drain(s, T + 999 * H).length, 0);
});

test("the goal event ends the sequence so nothing more is sent", () => {
  const s = fresh();
  E.track(s, { email: "a@x.io", event: "signed_up", at: T }); drain(s, T);
  assert.deepEqual(E.track(s, { email: "a@x.io", event: "upgraded", at: T + H }).exited, ["onboard"]);
  assert.equal(drain(s, T + 500 * H).length, 0);
  const st = E.stats(s).sequences.onboard;
  assert.equal(st.exits.upgraded, 1); assert.equal(st.steps[0].exitedAfter, 1);
});

test("skipIf skips a step the person already did and moves on", () => {
  const s = fresh();
  E.track(s, { email: "a@x.io", event: "signed_up", at: T }); drain(s, T);
  E.track(s, { email: "a@x.io", event: "created_project", at: T + 5 * H });
  const got = drain(s, T + 48 * H);
  assert.equal(got.length, 0, "tip skipped, last not due yet");
  assert.equal(drain(s, T + 120 * H)[0].step, 2);
  assert.equal(E.stats(s).sequences.onboard.steps[1].skipped, 1);
});

test("an event from before enrollment does not trigger skipIf", () => {
  const s = fresh();
  E.track(s, { email: "a@x.io", event: "created_project", at: T - 10 * H });
  E.track(s, { email: "a@x.io", event: "signed_up", at: T }); drain(s, T);
  assert.equal(drain(s, T + 48 * H).length, 1);
});

test("after an outage only one email goes out per pass, spaced by the minimum gap", () => {
  const s = fresh();
  E.track(s, { email: "a@x.io", event: "signed_up", at: T });
  assert.equal(drain(s, T + 1000 * H).length, 1);
  assert.equal(drain(s, T + 1000 * H + 1).length, 0, "gap not elapsed");
  assert.equal(drain(s, T + 1001 * H).length, 1);
});

test("unsubscribe and suppression stop sends and block re-enrollment", () => {
  const s = fresh();
  E.track(s, { email: "a@x.io", event: "signed_up", at: T });
  assert.ok(E.unsubscribe(s, "A@x.io", T + 1));
  assert.equal(drain(s, T + 999 * H).length, 0);
  assert.deepEqual(E.track(s, { email: "a@x.io", event: "signed_up", at: T + 2 }).enrolled, []);
  E.track(s, { email: "b@x.io", event: "signed_up", at: T }); E.unsubscribe(s, "b@x.io", T, "bounce");
  assert.equal(drain(s, T + 999 * H).length, 0);
  assert.equal(E.stats(s).suppressed, 1);
});

test("reenroll lets a finished sequence start again; otherwise it does not", () => {
  const s = fresh(); s.sequences[0].reenroll = true;
  E.track(s, { email: "a@x.io", event: "signed_up", at: T });
  assert.deepEqual(E.track(s, { email: "a@x.io", event: "signed_up", at: T }).enrolled, [], "still active");
  E.track(s, { email: "a@x.io", event: "upgraded", at: T });
  assert.deepEqual(E.track(s, { email: "a@x.io", event: "signed_up", at: T + H }).enrolled, ["onboard"]);
});

test("send window holds a due email until the hour is allowed", () => {
  const s = fresh(); s.sequences[0].sendHoursUTC = [13, 17];
  E.track(s, { email: "a@x.io", event: "signed_up", at: T });
  assert.equal(drain(s, T).length, 0, "09:00 UTC is outside");
  assert.equal(drain(s, T + 4 * H).length, 1, "13:00 UTC");
  s.sequences[0].sendHoursUTC = [22, 6];
  assert.equal(drain(s, T + 48 * H + 14 * H).length, 1, "wraps midnight: 23:00");
});

test("failed sends retry with backoff then give up without blocking the sequence", () => {
  const s = fresh(); E.track(s, { email: "a@x.io", event: "signed_up", at: T });
  let now = T, results = [];
  for (let n = 0; n < 4; n++) { const { items } = E.collectDue(s, now); assert.equal(items.length, 1); results.push(E.markFailed(s, items[0], now)); now += 24 * H; }
  assert.deepEqual(results, ["retry", "retry", "retry", "gave-up"]);
  assert.equal(E.stats(s).sequences.onboard.steps[0].failed, 1);
  assert.equal(s.contacts["a@x.io"].en.onboard.i, 1);
});

test("render fills props, falls back to defaults, and never executes anything", () => {
  const ctx = { email: "a@x.io", props: { name: "Ada", plan: "pro" }, unsubscribe_url: "https://u" };
  assert.equal(E.render("Hi {{name|there}} {{ props.plan }} {{missing|x}}{{nope}}", ctx), "Hi Ada pro x");
  assert.equal(E.render("Hi {{name|there}}", { props: {} }), "Hi there");
  assert.equal(E.render("{{unsubscribe_url}}", ctx), "https://u");
});

test("compose escapes HTML, links https URLs, strips header injection, adds the footer", () => {
  const s = fresh(); E.track(s, { email: "a@x.io", event: "signed_up", props: { name: "<b>Eve</b>\r\nBcc: z@z" }, at: T });
  s.sequences[0].steps[0].text = "Hi {{name}}\n\nStart: https://x.io/go?a=1&b=2.";
  const m = E.compose(s, { email: "a@x.io", seq: "onboard", step: 0 }, { unsubUrl: "https://u/x", address: "1 Main St", product: "Acme" });
  assert.doesNotMatch(m.subject, /[\r\n]/);
  assert.match(m.html, /&lt;b&gt;Eve/); assert.doesNotMatch(m.html, /<b>Eve/);
  assert.match(m.html, /<a href="https:\/\/x\.io\/go\?a=1&amp;b=2">/);
  assert.match(m.text, /Unsubscribe: https:\/\/u\/x/); assert.match(m.text, /1 Main St/); assert.match(m.html, /Unsubscribe<\/a>/);
});

test("props and events are bounded; bad emails and event names are refused", () => {
  const s = fresh();
  const props = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`k${i}`, "v"]));
  E.track(s, { email: "a@x.io", event: "signed_up", props: { ...props, ok: { nested: 1 } }, at: T });
  assert.equal(Object.keys(s.contacts["a@x.io"].props).length, 30);
  assert.throws(() => E.track(s, { email: "nope", event: "signed_up", at: T }), /valid email/);
  assert.throws(() => E.track(s, { email: "a@x.io", event: "bad name!", at: T }), /event/);
});

test("csv export neutralises spreadsheet formulas", () => {
  const s = fresh(); E.track(s, { email: "a@x.io", event: "signed_up", at: T });
  s.contacts["a@x.io"].sup = "=HYPERLINK(1)";
  assert.match(E.toCsv(s), /'=HYPERLINK/);
});

test("erase removes a contact entirely", () => {
  const s = fresh(); E.track(s, { email: "a@x.io", event: "signed_up", at: T });
  assert.ok(E.erase(s, "a@x.io")); assert.equal(E.stats(s).contacts, 0);
});

test("simulate walks the real engine and shows what a goal event cancels", () => {
  const tl = E.simulate(seqs(), [{ atHours: 0, event: "signed_up", props: { name: "Ada" } }, { atHours: 60, event: "upgraded" }], { days: 10 });
  const mails = tl.filter((x) => x.kind === "email");
  assert.deepEqual(mails.map((m) => [m.atHours, m.step]), [[0, 1], [48, 2]]);
  assert.match(mails[0].subject, /Welcome Ada/);
  assert.ok(tl.find((x) => x.kind === "event" && x.event === "upgraded").exited.includes("onboard"));
});
