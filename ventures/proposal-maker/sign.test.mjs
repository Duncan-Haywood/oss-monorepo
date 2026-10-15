import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "./sign.mjs";

const HTML = "<!doctype html><html><head><title>PROP-1 Website &amp; SEO</title></head><body>hi</body></html>";
const mk = (over = {}) => { const st = S.newState(); const d = S.publish(st, { html: HTML, ...over }, { id: "aaaa1111", token: "t".repeat(48), now: 1000 }); return { st, d }; };

test("publish takes the title from the file and fingerprints the exact bytes", () => {
  const { st, d } = mk();
  assert.equal(d.title, "PROP-1 Website & SEO");
  assert.equal(d.sha256, S.sha256(HTML));
  assert.equal(S.byToken(st, "t".repeat(48)), d);
});

test("publish rejects non-HTML, bad email, bad date and oversize files", () => {
  const st = S.newState(), ctx = { id: "x", token: "y", now: 1 };
  assert.throws(() => S.publish(st, { html: "hello" }, ctx), { status: 400 });
  assert.throws(() => S.publish(st, { html: HTML, clientEmail: "nope" }, ctx), { status: 400 });
  assert.throws(() => S.publish(st, { html: HTML, expires: "2026-13-40" }, ctx), { status: 400 });
  assert.throws(() => S.publish(st, { html: "<html>" + "x".repeat(S.MAX_HTML) }, ctx), { status: 413 });
});

test("accept needs a name and the box, records the hash, and locks the document", () => {
  const { d } = mk({ clientEmail: "Ann@Example.com" });
  assert.throws(() => S.accept(d, { name: "A", agree: "1" }, 2000), { status: 400 });
  assert.throws(() => S.accept(d, { name: "Ann Lee" }, 2000), { status: 400 });
  S.accept(d, { name: "  Ann   Lee ", agree: "1", viewer: "v1", userAgent: "UA" }, 2000);
  assert.equal(d.status, "accepted");
  assert.equal(d.signature.name, "Ann Lee");
  assert.equal(d.signature.email, "ann@example.com");
  assert.equal(d.signature.docSha256, d.sha256);
  assert.throws(() => S.accept(d, { name: "Bob Roe", agree: "1" }, 3000), { status: 409 });
  assert.throws(() => S.decline(d, {}, 3000), { status: 409 });
});

test("an expired link cannot be signed, and the expiry day itself still can", () => {
  const { d } = mk({ expires: "2026-10-20" });
  const endOfDay = Date.parse("2026-10-20T23:59:59Z"), nextDay = Date.parse("2026-10-21T00:00:00Z");
  assert.equal(S.isExpired(d, endOfDay), false);
  assert.equal(S.isExpired(d, nextDay), true);
  assert.throws(() => S.accept(d, { name: "Ann Lee", agree: "1" }, nextDay), { status: 410 });
  S.accept(d, { name: "Ann Lee", agree: "1" }, endOfDay);
  assert.equal(S.effectiveStatus(d, nextDay), "accepted");
});

test("views are deduplicated per viewer per hour and stop once decided", () => {
  const { d } = mk();
  assert.equal(S.recordView(d, { viewer: "a", now: 10 }), true);
  assert.equal(S.recordView(d, { viewer: "a", now: 20 }), false);
  assert.equal(S.recordView(d, { viewer: "b", now: 30 }), true);
  assert.equal(S.recordView(d, { viewer: "a", now: 10 + 3_600_000 }), true);
  S.decline(d, { reason: " too pricey " }, 5);
  assert.equal(d.decline.reason, "too pricey");
  assert.equal(S.recordView(d, { viewer: "z", now: 99_999_999 }), false);
});

test("stats count the funnel and the win rate; CSV neutralises formulas", () => {
  const st = S.newState();
  const add = (id, title) => S.publish(st, { html: HTML, title }, { id, token: id.repeat(6), now: 1 });
  const a = add("aaaa0001", "=HYPERLINK(1)"), b = add("aaaa0002", "B"), c = add("aaaa0003", "C"); add("aaaa0004", "D");
  S.recordView(c, { viewer: "v", now: 2 });
  S.accept(a, { name: "Ann Lee", agree: "1" }, 3); S.decline(b, {}, 3);
  const s = S.stats(st, 4);
  assert.deepEqual([s.total, s.open, s.accepted, s.declined, s.unopened, s.winRate], [4, 2, 1, 1, 1, 50]);
  const csv = S.toCsv(st, 4);
  assert.match(csv, /"'=HYPERLINK\(1\)"/);
  assert.equal(csv.split("\n").length, 6);
});

test("remove drops the link as well as the document", () => {
  const { st, d } = mk();
  assert.equal(S.remove(st, d.id), true);
  assert.equal(S.byToken(st, d.token), null);
  assert.equal(S.remove(st, d.id), false);
});
