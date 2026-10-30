import { test } from "node:test";
import assert from "node:assert/strict";
import { runResearch, csvAccounts, csvLeftOutResearch, normalizeRow } from "./research.mjs";
import { SAMPLE_OFFER } from "./engine.mjs";

// HubSpot-style export headers (and one Pipedrive-style column) on purpose: the aliases are what is under test.
const CRM = `First Name,Last Name,Email,Company name,Job Title,Industry,Number of Employees,Country/Region,Lifecycle Stage,Last Activity Date,Unsubscribed from all emails
Dana,Reyes,dana@brightline.example,Brightline Logistics,Director of Operations,Logistics,120,United States,Lead,,
Ken,Ito,ken@brightline.example,Brightline Logistics,Dispatcher,Logistics,120,United States,Lead,,
Omar,Khan,omar@harbor.example,Harbor Freight Co,Founder,Logistics,45,US,Marketing Qualified Lead,2026-07-01,
Lena,Ng,lena@ridge.example,Ridge Supply,Intern,Retail,12,US,Lead,,
Paul,Ortiz,paul@summit.example,Summit Parts,Owner,Logistics,60,US,Customer,,
Gus,Hall,info@northwind.example,Northwind Freight,CEO,Logistics,80,US,Lead,,
Mia,Stone,mia@recent.example,Recent Co,CEO,Logistics,80,US,Lead,2026-10-10,
Tina,Berg,tina@berlin.example,Berlin Spedition,Geschäftsführer,Logistics,90,Germany,Lead,,
Sue,Park,sue@optout.example,Optout Inc,Owner,Logistics,70,US,Lead,,true
Bob,Lee,,No Email Co,Owner,Logistics,70,US,Lead,,
Cy,Dunn,cy@blocked.example,Blocked Co,Owner,Logistics,70,US,Lead,,
Dee,Fox,dana@brightline.example,Brightline Logistics,Director,Logistics,120,US,Lead,,`;
const ICP = { industries: ["logistics", "freight"], titles: ["director", "owner", "founder", "ceo"], min_employees: 30, max_employees: 300, countries: ["US"] };
const run = (extra = {}) => runResearch({ crm: CRM, icp: ICP, offer: SAMPLE_OFFER, suppression: "@blocked.example", today: "2026-10-24", ...extra });

test("ranks by fit with a reason for every point, one lead per company", () => {
  const d = run();
  assert.deepEqual(d.accounts.map((a) => a.company), ["Brightline Logistics", "Harbor Freight Co"].concat(d.accounts.slice(2).map((a) => a.company)));
  const top = d.accounts[0];
  assert.equal(top.contact, "Dana Reyes");
  assert.equal(top.score, 100);
  assert.deepEqual(top.alsoAt, ["Ken Ito (Dispatcher)"]);
  assert.ok(top.why.every((w) => /^\+\d+ /.test(w)));
});

test("drops opted-out, suppressed, customers, role addresses, duplicates, no email, recent contacts", () => {
  const reasons = Object.fromEntries(run().dropped.map((x) => [x.email || x.name, x.reason]));
  assert.match(reasons["sue@optout.example"], /opted out/);
  assert.match(reasons["cy@blocked.example"], /suppression/);
  assert.match(reasons["paul@summit.example"], /not a cold prospect/);
  assert.match(reasons["info@northwind.example"], /role address/);
  assert.match(reasons["Bob Lee"], /no email/);
  assert.match(reasons["mia@recent.example"], /cool-off/);
  assert.match(reasons["dana@brightline.example"], /duplicate/);
});

test("Germany is held for consent, not drafted", () => {
  const d = run();
  assert.ok(d.held.some((h) => h.email === "tina@berlin.example" && /prior consent/.test(h.reason)));
  assert.ok(!d.accounts.some((a) => a.email === "tina@berlin.example"));
});

test("a floor drops weak fits; the intern at retail is out", () => {
  const d = run({ minScore: 50 });
  assert.ok(!d.accounts.some((a) => a.company === "Ridge Supply"));
  assert.ok(d.dropped.some((x) => x.company === "Ridge Supply" && /floor/.test(x.reason)));
});

test("drafts pass the checks, state only offer and export facts, and carry an opt-out", () => {
  for (const a of run().accounts) {
    assert.ok(a.draftOk, a.draftErrors.join());
    assert.match(a.draft.body, /unsubscribe/);
    assert.match(a.draft.body, new RegExp(a.company.split(" ")[0]));
  }
});

test("a draft with no offer is flagged, not approved", () => {
  const d = run({ offer: {} });
  assert.ok(d.accounts.every((a) => !a.draftOk && a.draftErrors.some((e) => /placeholder|opt out|\[your/.test(e))));
});

test("the inbox agent's statuses and an ICP Lens fit_score column are honoured", () => {
  const d = run({ existing: "email,status\nomar@harbor.example,unsubscribed\n" });
  assert.ok(d.dropped.some((x) => x.email === "omar@harbor.example" && /unsubscribed/.test(x.reason)));
  const s = runResearch({ crm: "email,company,fit_score\na@x.example,X,90\nb@y.example,Y,30\n", offer: SAMPLE_OFFER, today: "2026-10-24" });
  assert.deepEqual(s.accounts.map((a) => a.company), ["X"]);
});

test("without any profile nothing is invented: file order, and the brief says so", () => {
  const d = runResearch({ crm: CRM, offer: SAMPLE_OFFER, today: "2026-10-24" });
  assert.equal(d.summary.scored, false);
  assert.match(d.brief, /No ideal customer profile/);
});

test("aliases map other CRMs' headers; csv output has a formula-safe cell", () => {
  const r = normalizeRow({ "person_-_email": "A@B.COM", "organization_-_name": "=cmd", "number_of_employees": "1,200" });
  assert.equal(r.email, "a@b.com"); assert.equal(r.employeesN, 1200);
  const out = csvAccounts(runResearch({ crm: "email,company\na@b.example,=HYPERLINK(x)\n", offer: SAMPLE_OFFER, today: "2026-10-24" }));
  assert.match(out, /'=HYPERLINK/);
  assert.match(csvLeftOutResearch(run()), /^outcome,row,name/);
});

// Shapes real exports have and hand-built ones left out: a byte-order mark, a ";" separator, one name column,
// several addresses in one cell, a bounce column, a marketing status.
test("reads Pipedrive/Excel-style files: BOM, semicolons, one name column, many emails", () => {
  const csv = "﻿Person - Name;Person - Email - Work;Person - Organization;Person - Job title;Person - Marketing status;Email Hard Bounce Reason\n" +
    "Dana Reyes;dana@brightline.example, dana.r@other.example;Brightline Logistics;Director;subscribed;\n" +
    "Ann Lee;ann@gone.example;Gone Co;Owner;subscribed;Mailbox does not exist\n" +
    "Bo Wu;bo@unsub.example;Unsub Co;Owner;Unsubscribed;\n";
  const d = runResearch({ crm: csv, icp: { titles: ["director", "owner"] }, offer: SAMPLE_OFFER, today: "2026-10-24" });
  assert.equal(d.accounts.length, 1);
  assert.equal(d.accounts[0].email, "dana@brightline.example");
  assert.equal(d.accounts[0].contact, "Dana Reyes");
  const reasons = Object.fromEntries(d.dropped.map((x) => [x.email, x.reason]));
  assert.match(reasons["ann@gone.example"], /hard bounce/);
  assert.match(reasons["bo@unsub.example"], /marketing status/);
});

// HubSpot's own header wording ("Unsubscribed from all email", a separate "Lead Status" beside "Lifecycle Stage").
// Headers from HubSpot's export view as remembered; rows made up. No real export tried.
test("HubSpot export: unsubscribed-from-all-email and Unqualified lead status are dropped", () => {
  const crm = [
    "Record ID,First Name,Last Name,Email,Lifecycle Stage,Lead Status,Company Name,Job Title,Industry,Number of Employees,Unsubscribed from all email",
    "1,Ana,Lopez,ana@acmeplumbing.com,Lead,New,Acme Plumbing,Owner,Construction,12,false",
    "2,Bo,Chen,bo@zeta.io,Subscriber,Open,Zeta,CTO,Software,45,true",
    "3,Di,Roe,di@openco.com,Marketing Qualified Lead,Unqualified,OpenCo,Founder,Software,8,false",
  ].join("\n");
  const r = runResearch({ crm, icp: { industries: ["construction"] }, offer: { product: "x", pitch: "y", sender: "S", address: "1 Main" }, today: "2026-10-25" });
  const text = JSON.stringify(r);
  assert.ok(/ana@acmeplumbing/.test(text));
  assert.equal(r.dropped.length, 2);
  assert.ok(r.dropped.some((d) => d.email === "bo@zeta.io"));
  assert.ok(r.dropped.some((d) => d.email === "di@openco.com" && /lead status/.test(d.reason)));
});

// Mautic's contact export (field names from its public import template, rows made up): "title" is the salutation and the job is "position".
test("a salutation in the title column is not the job title; the position column is", () => {
  const r = normalizeRow({ title: "Mrs.", position: "Marketing Lead", email: "a@b.example" });
  assert.equal(r.title, "Marketing Lead");
  assert.equal(normalizeRow({ title: "Dr", email: "a@b.example" }).title, undefined);
  assert.equal(normalizeRow({ title: "Director of Sales", position: "x", email: "a@b.example" }).title, "Director of Sales");
});

// HubSpot contact exports name the company "Associated Company"; Salesforce contacts carry "Mailing Country" and "Has Opted Out of Email" (names from vendor field lists, rows made up).
test("Associated Company, Mailing Country and Has Opted Out of Email are read", () => {
  const r = normalizeRow({ "associated_company": "Acme", "mailing_country": "Germany", "has_opted_out_of_email": "1", email: "a@acme.example" });
  assert.equal(r.company, "Acme");
  assert.equal(r.country, "DE");
  assert.ok(truthyDnc(r.do_not_contact));
});
const truthyDnc = (v) => /^(1|y|yes|true)$/i.test(String(v || ""));
