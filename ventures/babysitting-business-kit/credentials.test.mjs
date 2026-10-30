import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KINDS, expiryDay, normalizeCredential, credentialFromForm, credentialStatus, credentialReminders, dismissReminder, siteCertLines, syncSiteCerts, readiness, normalizeBusiness } from "./credentials.mjs";
import { emptyDesk, normalizeDesk } from "./engine.mjs";
import { buildSiteFiles, siteData } from "./site.mjs";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const deskWith = (credentials, business = {}) => ({ ...emptyDesk(), credentials, business });
const cpr = (expires, extra = {}) => ({ id: "c1", kind: "cpr", provider: "Red Cross", issued: "2024-11-15", expires, ...extra });

test("expiry: a month means its last day, a date is kept, junk is empty", () => {
  assert.equal(expiryDay("2028-02"), "2028-02-29");
  assert.equal(expiryDay("2027-11"), "2027-11-30");
  assert.equal(expiryDay("2027-11-15"), "2027-11-15");
  assert.equal(expiryDay("soon"), "");
});

test("normalizeCredential fills the name from the kind and the website default from KINDS", () => {
  const c = normalizeCredential({ kind: "cpr", issued: "2026-01-02", expires: "bad" }, "x");
  assert.equal(c.name, "CPR and First Aid");
  assert.equal(c.onSite, true);
  assert.equal(c.expires, "");
  assert.equal(normalizeCredential({ kind: "liability" }).onSite, false);
  assert.equal(normalizeCredential({ kind: "nope" }).kind, "other");
  assert.equal(credentialFromForm({ kind: "background", issued: "2026-05-01" }, "b").onSite, false, "an unticked box means no");
  assert.equal(credentialFromForm({ kind: "background", onSite: "on" }, "b").onSite, true);
  for (const k of Object.keys(KINDS)) assert.ok(KINDS[k].label);
});

test("status windows: 61 days is current, then 60, 30 and 7, then expired", () => {
  const t = "2026-10-30";
  const at = (days) => credentialStatus(cpr(new Date(Date.parse(`${t}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10)), t);
  assert.deepEqual(at(61), { state: "current", days: 61, step: null });
  assert.deepEqual(at(60), { state: "expiring", days: 60, step: 60 });
  assert.equal(at(31).step, 60);
  assert.equal(at(30).step, 30);
  assert.equal(at(8).step, 30);
  assert.equal(at(7).step, 7);
  assert.equal(at(0).step, 7);
  assert.deepEqual(at(-1), { state: "expired", days: -1, step: 0 });
  assert.equal(credentialStatus({ expires: "" }, t).state, "no-date");
});

test("Today reminders appear at 60, 30 and 7 days, hide once marked done, and come back at the next step", () => {
  const desk = deskWith([cpr("2026-12-20")]);
  let r = credentialReminders(desk, "2026-10-30");
  assert.equal(r.length, 1);
  assert.equal(r[0].step, 60);
  assert.equal(r[0].priority, 3);
  assert.match(r[0].title, /CPR and First Aid expires in 51 days \(December 20, 2026\)/);
  assert.match(r[0].message, /Renew with Red Cross/);
  dismissReminder(desk, "c1", 60);
  assert.equal(credentialReminders(desk, "2026-10-30").length, 0);
  assert.equal(credentialReminders(desk, "2026-11-19").length, 0, "still in the 60-day window");
  r = credentialReminders(desk, "2026-11-20");
  assert.equal(r[0].step, 30);
  assert.equal(r[0].priority, 2);
  r = credentialReminders(desk, "2026-12-14");
  assert.equal(r[0].step, 7);
  assert.equal(r[0].priority, 1);
  r = credentialReminders(desk, "2026-12-21");
  assert.match(r[0].title, /expired on December 20, 2026: it is off your website/);
});

test("renewing (new dates) starts the reminders afresh even after an expired one was dismissed", () => {
  const desk = deskWith([cpr("2026-10-01")]);
  dismissReminder(desk, "c1", 0);
  assert.equal(credentialReminders(desk, "2026-10-30").length, 0);
  desk.credentials[0].expires = "2028-10-01";
  assert.equal(credentialReminders(desk, "2026-10-30").length, 0);
  assert.equal(credentialReminders(desk, "2028-08-15").length, 1);
});

test("driving credentials only remind when the sitter drives kids", () => {
  const creds = [{ id: "d", kind: "driver", expires: "2026-11-10" }, { id: "a", kind: "auto", expires: "2026-11-10" }];
  assert.equal(credentialReminders(deskWith(creds), "2026-10-30").length, 0);
  assert.equal(credentialReminders(deskWith(creds, { drivesKids: true }), "2026-10-30").length, 2);
});

test("syncSiteCerts writes tracked items into the site's certs text, keeps hand-typed lines, and is idempotent", () => {
  const desk = deskWith([cpr("2028-03-31"), { id: "b", kind: "background", issued: "2026-01-10", expires: "", onSite: true }, { id: "l", kind: "liability", expires: "2027-06-30" }]);
  desk.profile.site = { certs: "Water safety | 2025-06 | 2027-06\nCPR and First Aid | 2020-01 | 2022-01" };
  syncSiteCerts(desk);
  assert.equal(desk.profile.site.certs, "Water safety | 2025-06 | 2027-06\nCPR and First Aid | 2024-11-15 | 2028-03-31\nBackground check | 2026-01-10");
  const once = desk.profile.site.certs;
  syncSiteCerts(desk);
  assert.equal(desk.profile.site.certs, once);
  assert.deepEqual(siteCertLines(desk).length, 2, "liability is not shown by default");
  desk.credentials[0].onSite = false;
  syncSiteCerts(desk);
  assert.doesNotMatch(desk.profile.site.certs, /CPR/);
  assert.equal(syncSiteCerts(deskWith([])).profile.site, undefined, "nothing tracked: the site text is left alone");
});

test("the website shows a tracked certification until its expiry day and hides it the day after", () => {
  const desk = syncSiteCerts(deskWith([cpr("2026-12-20", { name: "Pediatric CPR (Red Cross)" })]));
  const on = (today) => siteData(desk, { today }).certs.map((c) => c.name);
  assert.deepEqual(on("2026-12-20"), ["Pediatric CPR (Red Cross)"]);
  assert.deepEqual(on("2026-12-21"), []);
  assert.match(buildSiteFiles(desk, { today: "2026-12-01" })["about.html"], /Pediatric CPR \(Red Cross\)/);
  assert.doesNotMatch(buildSiteFiles(desk, { today: "2026-12-21" })["about.html"], /Pediatric CPR/);
});

test("readiness counts what is done and lists what is missing, from ticks and the tracker only", () => {
  const empty = readiness(deskWith([]), "2026-10-30");
  assert.equal(empty.done, 0);
  assert.equal(empty.total, 8);
  assert.ok(empty.missing.includes("CPR and First Aid current"));
  const desk = deskWith([cpr("2027-10-01"), { id: "x", kind: "background", issued: "2026-01-01" }, { id: "y", kind: "liability", expires: "2026-09-01" }], { structure: "sole", ein: true, bank: true, records: true, drivesKids: true });
  const r = readiness(desk, "2026-10-30");
  assert.equal(r.total, 10);
  assert.deepEqual(r.missing, ["Liability insurance", "Driver's license current", "Car insurance current (and it covers driving children for pay)", "Local licensing checked"]);
  assert.match(r.items.find((x) => x.id === "liability").detail, /Expired/);
  assert.match(r.items.find((x) => x.id === "background").detail, /no expiry date/);
  assert.equal(readiness({ ...desk, business: { ...desk.business, licenseChecked: true } }, "2026-10-30").done, 7);
  assert.equal(readiness({ ...deskWith([]), profile: { ...emptyDesk().profile, taxId: "on file" } }, "2026-10-30").items.find((x) => x.id === "ein").done, true);
});

test("normalizeDesk keeps credentials and business; normalizeBusiness keeps only ticks", () => {
  const d = normalizeDesk({ credentials: [cpr("2027-01-01"), null, 3], business: { structure: "llc", ein: 1, ssn: "123-45-6789" } });
  assert.equal(d.credentials.length, 1);
  assert.equal(d.business.structure, "llc");
  assert.deepEqual(normalizeBusiness(d.business), { structure: "llc", ein: true, bank: false, records: false, drivesKids: false, licenseChecked: false });
  assert.deepEqual(normalizeBusiness({ structure: "corp" }).structure, "");
});

test("the setup guide carries the clauses, FAQ JSON-LD answered on the page, sources, and is listed everywhere", () => {
  const g = "babysitting-business-setup.html";
  const html = read(g);
  assert.match(html, /No warranty\./);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/babysitting-business-setup\.html">/);
  assert.doesNotMatch(html, /href="\/(?!\/)/, "never link to the site root");
  assert.doesNotMatch(html, /<script[^>]+src=/);
  for (const id of ["structure", "ein", "insurance", "bank", "records", "licensing", "credentials"]) assert.match(html, new RegExp(`<h2 id="${id}">`), id);
  for (const src of ["irs.gov/pub/irs-pdf/fw10.pdf", "irs.gov/publications/p503", "sba.gov/business-guide", "childcare.gov/consumer-education/informal-in-home-child-care", "childcare.gov/consumer-education/family-child-care-homes"]) assert.ok(html.includes(src), src);
  assert.match(html, /check your state's child care licensing office/i);
  const faq = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 5);
  const text = html.replace(/&amp;/g, "&");
  for (const q of faq.mainEntity) {
    assert.ok(text.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(text.includes(`<p>${q.acceptedAnswer.text}</p>`), `answer: ${q.name}`);
  }
  assert.ok(read("sitemap.xml").includes(`<loc>./${g}</loc>`));
  assert.ok(read("llms.txt").includes(`/babysitting-business-kit/${g}`));
  const index = read("index.html");
  assert.ok(index.slice(index.indexOf("<header>"), index.indexOf("</header>")).includes(`href="${g}"`));
  assert.match(read("Dockerfile"), /credentials\.mjs credentials-ui\.mjs babysitting-business-setup\.html/);
});
