import { test } from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { exampleDesk, emptyDesk, leadFromForm, scoreLead, buildSite } from "./engine.mjs";
import { handler } from "./server.mjs";
import * as P from "./print.mjs";

const desk = () => {
  const d = exampleDesk("2026-11-02");
  d.profile.siteUrl = "https://grace.example/";
  return d;
};

test("referral codes are stable, readable and unique per family", () => {
  const d = desk();
  const [a, b] = d.families;
  assert.match(P.referralCode(a), /^RIVERA-[2-9A-HJKMNP-Z]{3}$/);
  assert.match(P.referralCode(b), /^CHEN-[2-9A-HJKMNP-Z]{3}$/);
  assert.equal(P.referralCode(a), P.referralCode({ ...a }));
  assert.notEqual(P.referralCode(a), P.referralCode({ ...a, id: "fam_other" }));
  assert.equal(P.referralCode({ ...a, referralCode: "grace1" }), "GRACE1");
  assert.equal(P.referralCode({ id: "x", name: "" }).split("-")[0], "FAMILY");
  assert.equal(P.referralCode({ id: "x", name: "Núñez family" }).split("-")[0], "NUNEZ");
});

test("the inquiry form's source credits the family by code or exact name", () => {
  const d = desk();
  const code = P.referralCode(d.families[0]);
  for (const s of [code, code.toLowerCase(), code.replace("-", " "), `my friend gave me a card, ${code}`, "Mention the Rivera family", "the rivera family told us"]) {
    assert.equal(P.findReferrer(s, d.families)?.family.id, "fam_a", s);
  }
  for (const s of ["", "church", "Rivera", "Nextdoor", "the Smith family"]) assert.equal(P.findReferrer(s, d.families), null, s);
  // two families with one surname: a name is ambiguous, a code is not
  const twins = [...d.families, { id: "fam_c", name: "Rivera family" }];
  assert.equal(P.findReferrer("the Rivera family", twins), null);
  assert.equal(P.findReferrer(P.referralCode(twins[2]), twins).family.id, "fam_c");
});

test("a credited lead scores the referral bonus and shows in source stats", () => {
  const d = desk();
  const code = P.referralCode(d.families[0]);
  const plain = leadFromForm({ name: "Pat Doe", contact: "pat@example.com", kids: "5", schedule: "Fri 18-22", source: code }, "2026-11-02", "lead_x");
  const before = scoreLead(plain, d.profile).score;
  const lead = P.creditReferral(structuredClone(plain), d);
  assert.equal(lead.referredBy, "fam_a");
  assert.equal(lead.referralCode, code);
  assert.equal(lead.source, `referral from Rivera family (${code})`);
  const after = scoreLead(lead, d.profile);
  assert.equal(after.score - before, 10);
  assert.ok(after.reasons.some((r) => /referral from Rivera family/.test(r)));
  // a lead that is already credited is left alone; an unknown source too
  assert.equal(P.creditReferral(lead, d).source, lead.source);
  assert.equal(P.creditReferral({ source: "Nextdoor" }, d).referredBy, undefined);

  d.leads.push(lead, { ...lead, id: "lead_y", status: "booked" }, leadFromForm({ name: "Q", source: "flyer at the library" }, "2026-11-02", "lead_z"));
  const st = P.sourceStats(d);
  assert.equal(st.total, 5);
  const row = (s) => st.sources.find((r) => r.source === s);
  assert.deepEqual(row("referral"), { source: "referral", leads: 3, booked: 1 }); // church friend + two credited
  assert.deepEqual(row("print"), { source: "print", leads: 1, booked: 0 });
  assert.deepEqual(row("Nextdoor"), { source: "Nextdoor", leads: 1, booked: 0 });
  assert.deepEqual(st.referrers, [{ familyId: "fam_a", family: "Rivera family", code, leads: 2, booked: 1 }]);
});

test("source buckets", () => {
  const b = (source) => P.sourceBucket({ source });
  assert.equal(b("church bulletin"), "church");
  assert.equal(b("PTA newsletter"), "school");
  assert.equal(b("door hanger"), "print");
  assert.equal(b("saw your card at the coffee shop"), "print");
  assert.equal(b("Google"), "website");
  assert.equal(b("Facebook group"), "Facebook");
  assert.equal(b("my sister"), "other");
  assert.equal(b(""), "unknown");
});

test("QR links carry the piece or referral code, and the site fills the source field from ?ref=", () => {
  assert.equal(P.withRef("https://grace.example/", "RIVERA-7KQ"), "https://grace.example/?ref=RIVERA-7KQ");
  assert.equal(P.withRef("https://grace.example/?x=1#form", "door hanger"), "https://grace.example/?x=1&ref=door%20hanger#form");
  assert.equal(P.withRef("", "flyer"), "");
  const site = buildSite(desk());
  assert.match(site, /URLSearchParams\(location\.search\)\.get\("ref"\)/);
  assert.match(site, /getElementById\("h"\)/);
  assert.match(site, /<input id="h" name="source">/);
});

test("every piece renders a printable letter page with the sitter's details and a QR code", () => {
  const d = desk();
  for (const kind of Object.keys(P.PIECES)) {
    const html = P.printPiece(kind, d, { familyId: "fam_a" });
    assert.match(html, /^<!doctype html>/, kind);
    assert.match(html, /@page\{size:letter;margin:0\}/, kind);
    assert.match(html, /Grace Notes Babysitting/, kind);
    assert.match(html, /555-0100/, kind);
    assert.match(html, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]+aria-label="QR code for https:\/\/grace\.example\/\?ref=/, kind);
    assert.doesNotMatch(html, /undefined|NaN|\[object/, kind);
    assert.doesNotMatch(html, /<script/i, kind);
  }
  assert.throws(() => P.printPiece("poster3000", d), /unknown piece/);
  assert.throws(() => P.printPiece("referral", d, { familyId: "nope" }), /choose a family/);
});

test("flyer: ten tear-off tabs, the rate only when asked, the QR tagged as a flyer", () => {
  const d = desk();
  const html = P.flyer(d);
  assert.equal((html.match(/class="tab"/g) || []).length, 10);
  assert.match(html, /\$20\/hour, \+\$3 each extra child/);
  assert.match(html, /Children 6 months and up, up to 3 at a time/);
  assert.match(html, /QR code for https:\/\/grace\.example\/\?ref=flyer"/);
  assert.doesNotMatch(P.flyer(d, { showRate: false }), /\$20\/hour/);
});

test("Avery 8371 sheets: 10 cards of 3.5 x 2 in that exactly fill a letter page", () => {
  const a = P.AVERY_8371;
  assert.equal(a.side * 2 + a.columns * a.cardW, 8.5);
  assert.equal(a.top * 2 + a.rows * a.cardH, 11);
  const d = desk();
  const cards = P.businessCards(d);
  assert.equal((cards.match(/class="card"/g) || []).length, 10);
  assert.match(cards, /grid-template-columns:repeat\(2,3\.5in\);grid-auto-rows:2in/);
  const code = P.referralCode(d.families[0]);
  const ref = P.referralCards(d, "fam_a");
  assert.equal((ref.match(/class="card"/g) || []).length, 10);
  assert.equal((ref.match(/Mention the Rivera family/g) || []).length, 10);
  assert.match(ref, new RegExp(`QR code for https://grace\\.example/\\?ref=${code}"`));
});

test("bulletin ad is four quarter pages; door hanger two to a sheet with a hole guide", () => {
  const d = desk();
  const ad = P.bulletinAd(d);
  assert.equal((ad.match(/class="ad"/g) || []).length, 4);
  assert.match(ad, /grid-template-columns:4\.25in 4\.25in;grid-template-rows:5\.5in 5\.5in/);
  const h = P.doorHanger(d);
  assert.equal((h.match(/class="hanger"/g) || []).length, 2);
  assert.equal((h.match(/class="hole"/g) || []).length, 2);
});

test("faith wording only when the sitter turned it on, and only their own first sentence", () => {
  const d = desk();
  const first = "I'm a Christian, and caring for kids is one way I try to love my neighbors well.";
  assert.equal(P.faithLine(d.profile), first);
  for (const k of ["flyer", "bulletin", "hanger"]) assert.ok(P.printPiece(k, d).includes(first.replace(/'/g, "&#39;")), k);
  d.profile.showFaith = false;
  for (const k of Object.keys(P.PIECES)) assert.doesNotMatch(P.printPiece(k, d, { familyId: "fam_a" }), /Christian|Bible|pray/i, k);
  const fresh = emptyDesk();
  fresh.profile.showFaith = true; // turned on but no statement written: nothing is added for them
  assert.equal(P.faithLine(fresh.profile), "");
  assert.doesNotMatch(P.flyer(fresh), /Christian|Bible|pray/i);
});

test("no link: pieces print without a QR code; text is escaped", () => {
  const d = emptyDesk();
  d.profile.name = "Sam <b>Example</b>";
  d.profile.phone = "555-0199";
  const html = P.flyer(d);
  assert.doesNotMatch(html, /<svg/);
  assert.match(html, /Sam &lt;b&gt;Example&lt;\/b&gt;/);
  assert.match(P.flyer(d, { url: "x".repeat(300) }), /Link too long for a QR code/);
});

test("the server credits a referral from the website form, and serves the print modules", async () => {
  const state = { desk: desk() };
  const code = P.referralCode(state.desk.families[0]);
  const srv = http.createServer(handler(state, () => {}, {}, () => Date.parse("2026-11-02T15:00:00Z"), async () => ({ ok: true })));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await fetch(`${base}/inquiry`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ name: "Pat Doe", contact: "555-0177", kids: "5", source: code.toLowerCase() }) });
    assert.equal(r.status, 200);
    const lead = state.desk.leads.at(-1);
    assert.equal(lead.name, "Pat Doe");
    assert.equal(lead.referredBy, "fam_a");
    assert.match(lead.source, /^referral from Rivera family/);
    for (const f of ["print.mjs", "qr.mjs"]) assert.equal((await fetch(`${base}/${f}`)).status, 200, f);
  } finally { await new Promise((r) => srv.close(r)); }
});
