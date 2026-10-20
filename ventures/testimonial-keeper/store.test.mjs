import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, createForm, submit, setStatus, remove, publicWall, stats, toCsv, LIMITS } from "./store.mjs";

const T = Date.UTC(2026, 9, 15, 12);
const good = { name: "Ada", text: "This saved our team a whole week every month.", consent: "on" };
const mk = () => { const s = newState(); const f = createForm(s, { slug: "main" }, T).form; return { s, f }; };
const sub = (s, f, input = good, o = {}) => submit(s, f, input, { ipKey: "ip1", now: T, id: `id${s.items.length}`, ...o });

test("forms: slug rules and uniqueness", () => {
  const s = newState();
  assert.match(createForm(s, { slug: "A B" }, T).error, /slug/);
  assert.ok(createForm(s, { slug: "Main" }, T).form);
  assert.match(createForm(s, { slug: "main" }, T).error, /taken/);
});

test("a valid submission lands pending, with consent recorded", () => {
  const { s, f } = mk();
  const r = sub(s, f);
  assert.equal(r.item.status, "pending"); assert.equal(r.item.consent, true);
  assert.deepEqual(publicWall(s, "main"), [], "pending is never public");
});

test("validation: name, length, consent, rating, email", () => {
  const { s, f } = mk();
  assert.match(sub(s, f, { ...good, name: "  " }).error, /name/);
  assert.match(sub(s, f, { ...good, text: "short" }).error, /at least/);
  assert.match(sub(s, f, { ...good, consent: "" }).error, /box/);
  assert.match(sub(s, f, { ...good, rating: "9" }).error, /Rating/);
  assert.match(sub(s, f, { ...good, rating: "4.5" }).error, /Rating/);
  assert.match(sub(s, f, { ...good, email: "nope" }).error, /email/);
  assert.equal(s.items.length, 0);
});

test("bots: a filled honeypot and a double submit are silent no-ops", () => {
  const { s, f } = mk();
  assert.equal(sub(s, f, { ...good, website: "http://spam" }).silent, true);
  sub(s, f); 
  assert.equal(sub(s, f).silent, true);
  assert.equal(s.items.length, 1);
});

test("rate limit: five a day per visitor key, resets the next day", () => {
  const { s, f } = mk();
  for (let i = 0; i < LIMITS.perIpPerDay; i++) assert.ok(sub(s, f, { ...good, text: `${good.text} number ${i}` }).item);
  assert.match(sub(s, f, { ...good, text: `${good.text} extra` }).error, /Too many/);
  assert.ok(submit(s, f, { ...good, text: `${good.text} tomorrow` }, { ipKey: "ip1", now: T + 86400000, id: "n" }).item);
  assert.ok(sub(s, f, { ...good, text: `${good.text} other` }, { ipKey: "ip2" }).item);
});

test("control and bidi characters are stripped; text is length-capped", () => {
  const { s, f } = mk();
  const r = sub(s, f, { ...good, name: "Ev‮il\u0000", text: good.text + " " + "x".repeat(900) });
  assert.equal(r.item.name, "Evil"); assert.equal(r.item.text.length, LIMITS.text);
});

test("approval makes it public, without the email; hide removes it again", () => {
  const { s, f } = mk();
  const { item } = sub(s, f, { ...good, email: "ada@example.com", rating: "5", company: "Acme" });
  assert.equal(setStatus(s, item.id, "approved").item.status, "approved");
  const wall = publicWall(s, "main");
  assert.equal(wall.length, 1); assert.equal(wall[0].rating, 5); assert.ok(!("email" in wall[0]));
  assert.equal(publicWall(s, "other").length, 0);
  setStatus(s, item.id, "hidden"); assert.equal(publicWall(s, "main").length, 0);
  assert.match(setStatus(s, item.id, "bogus").error, /status/); assert.match(setStatus(s, "zz", "hidden").error, /no such/);
});

test("stats average only approved, rated testimonials", () => {
  const { s, f } = mk();
  const a = sub(s, f, { ...good, rating: "5" }).item, b = sub(s, f, { ...good, text: good.text + " b", rating: "3" }).item, c = sub(s, f, { ...good, text: good.text + " c", rating: "1" }).item;
  setStatus(s, a.id, "approved"); setStatus(s, b.id, "approved");
  const st = stats(s);
  assert.equal(st.averageRating, 4); assert.equal(st.rated, 2); assert.equal(st.pending, 1); assert.equal(st.approved, 2);
  assert.equal(remove(s, c.id).ok, true); assert.equal(s.items.length, 2); assert.match(remove(s, "nope").error, /no such/);
});

test("csv neutralises formulas and quotes commas", () => {
  const { s, f } = mk();
  sub(s, f, { ...good, name: "=cmd()", text: "Great, truly great product for our whole team." });
  const lines = toCsv(s.items).trim().split("\n");
  assert.match(lines[1], /,'=cmd\(\),/); assert.match(lines[1], /"Great, truly/);
});
