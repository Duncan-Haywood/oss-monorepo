import test from "node:test";
import assert from "node:assert/strict";
import { presend, regime } from "./presend.mjs";

const good = {
  subject: "Quick question about Acme's onboarding",
  body: "Hi Dana,\n\nI'm Sam at Brightline. Your team hires a lot of field staff, and I wondered how you track their onboarding paperwork?\n\nIf this is not for you, reply stop and I won't write again.\n\nSam Lee, Brightline Ltd, 221 Baker Street, Springfield 62704",
  country: "US", fromName: "Sam Lee"
};
const rules = (r) => [...r.errors, ...r.warnings].map((x) => x.rule);

test("a clean first touch to the US passes with no errors", () => {
  const r = presend(good);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.regime.code, "US");
});
test("missing opt-out and address are errors for the US", () => {
  const r = presend({ ...good, body: "Hi Dana, do you want to buy our software? You will love it." });
  assert.ok(rules(r).includes("opt-out") && r.errors.some((x) => x.rule === "postal-address"));
  assert.equal(r.ok, false);
});
test("address is only a warning outside the US", () => {
  const r = presend({ ...good, country: "GB", body: good.body.replace("221 Baker Street, Springfield 62704", "Brightline") });
  assert.ok(r.warnings.some((x) => x.rule === "postal-address"));
});
test("a fake Re: on a first touch is deceptive, a real reply is fine", () => {
  assert.ok(presend({ ...good, subject: "Re: your invoice" }).errors.some((x) => x.rule === "fake-re"));
  assert.ok(!presend({ ...good, subject: "Re: your question", isReply: true }).errors.some((x) => x.rule === "fake-re"));
});
test("placeholders and spam phrases block", () => {
  const r = presend({ ...good, body: good.body + "\nGuaranteed results for [Company name]" });
  assert.ok(rules(r).includes("placeholder") && rules(r).includes("spam-phrase"));
});
test("Germany and Austria warn about consent; unknown countries say so", () => {
  assert.ok(presend({ ...good, country: "DE" }).warnings.some((x) => x.rule === "consent"));
  assert.equal(regime("UK").code, "GB");
  assert.equal(regime("ZZ").kind, "unknown");
  assert.equal(regime("").kind, "unknown");
});
test("signals: shouting, shortener, many links, generic greeting, no question", () => {
  const r = presend({ ...good, subject: "HUGE SAVINGS INSIDE!!", body: "Hello,\n\nSee https://bit.ly/x and https://a.com and https://b.com. Reply stop to opt out. 1 Main St" });
  for (const k of ["shouting", "shortener", "links", "generic-greeting", "ask"]) assert.ok(rules(r).includes(k), k);
});
test("numbers are checked only against facts the caller supplies", () => {
  const b = { ...good, body: good.body.replace("lot of", "lot of, 40%") };
  assert.ok(!presend(b).errors.some((x) => x.rule === "claim"));
  assert.ok(presend({ ...b, facts: "no figures here" }).errors.some((x) => x.rule === "claim"));
});
test("empty input fails cleanly", () => {
  const r = presend({});
  assert.equal(r.ok, false);
  assert.ok(r.score >= 0);
});
test("the word 'short' is not a link shortener", () => {
  assert.ok(!presend({ ...good, body: good.body + " Short note." }).warnings.some((x) => x.rule === "shortener"));
});
test("Australia, New Zealand and Switzerland hold for consent; France is a notice; text says from memory", () => {
  for (const c of ["AU", "NZ", "CH"]) { assert.equal(regime(c).kind, "consent", c); assert.ok(presend({ ...good, country: c }).warnings.some((x) => x.rule === "consent"), c); }
  assert.equal(regime("fr").kind, "notice");
  assert.ok(presend({ ...good, country: "FR" }).warnings.some((x) => x.rule === "regime"));
  for (const c of ["AU", "NZ", "FR", "CH"]) assert.match(regime(c).text, /from memory/);
});

test("a bare five-digit number is not a postal address (quality audit 2026-11-07-c)", () => {
  const body = "Hi Dana, we help 20000 firms track onboarding. If this is not for you, reply stop.";
  assert.ok(presend({ ...good, body }).errors.some((x) => x.rule === "postal-address"));
  const withZip = body + " Brightline, Austin, TX 78701";
  assert.ok(!presend({ ...good, body: withZip }).errors.some((x) => x.rule === "postal-address"));
});

test("country names and aliases map to the same regime as the code (2026-11-09)", async () => {
  const { regime } = await import("./presend.mjs");
  for (const [name, code] of [["Germany", "DE"], ["united states", "US"], ["USA", "US"], ["Deutschland", "DE"], ["United Kingdom.", "GB"], ["the Netherlands", "NL"], ["Switzerland", "CH"], ["Canada", "CA"]]) {
    assert.equal(regime(name).code, code, name);
  }
  assert.equal(regime("Germany").kind, "consent");
  assert.equal(regime("Narnia").kind, "unknown");
});

test("opt-out phrased as an offer to remove, quoted stop, or in German/French/Spanish counts (2026-11-09)", () => {
  const strip = (t) => presend({ ...good, body: good.body.replace("reply stop and I won't write again", t) });
  for (const t of ["just let me know and I'll remove you from my list", "reply 'stop' and that's it", "tell me to stop and I will", "antworten Sie \"Abmelden\"", "répondez pour vous désinscrire", "responda para darse de baja"]) {
    assert.ok(!rules(strip(t)).includes("opt-out"), t);
  }
  assert.ok(rules(strip("have a great week")).includes("opt-out"));
});
test("a German street-then-number address and a postcode-city line are found", () => {
  const body = (addr) => good.body.replace("221 Baker Street, Springfield 62704", addr);
  for (const a of ["Musterstr. 1, Berlin", "Hauptstraße 12", "Brightline GmbH, 10115 Berlin"]) {
    assert.ok(!presend({ ...good, country: "DE", body: body(a) }).warnings.concat(presend({ ...good, country: "DE", body: body(a) }).errors).some((x) => x.rule === "postal-address"), a);
  }
  assert.ok(presend({ ...good, country: "US", body: body("Brightline") }).errors.some((x) => x.rule === "postal-address"));
});
