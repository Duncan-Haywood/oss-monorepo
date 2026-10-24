import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRobots, robotsAllows, extractFacts, originOf, readSite, enrich } from "./webfacts.mjs";
import { runResearch, briefOf, csvAccounts } from "./research.mjs";
import { SAMPLE_OFFER } from "./engine.mjs";

const HTML = `<html><head><title> Brightline &amp; Co | Freight </title><meta name="description" content="Regional freight, 24/7 dispatch."></head></html>`;
const site = (map) => async (u) => { if (u in map) return map[u]; return { status: 404, text: "" }; };

test("robots: longest rule wins, specific agent beats *, wildcards and $", () => {
  const r = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: SalesAgentBot\nDisallow: /nope$\n");
  assert.equal(robotsAllows(r, "/"), true);
  assert.equal(robotsAllows(r, "/nope"), false);
  assert.equal(robotsAllows(r, "/private"), true);
  const star = parseRobots("User-agent: *\nDisallow: /\nAllow: /private/open");
  assert.equal(robotsAllows(star, "/"), false);
  assert.equal(robotsAllows(star, "/private/open/x"), true);
  assert.equal(robotsAllows(parseRobots("User-agent: *\nDisallow:"), "/"), true);
  assert.equal(robotsAllows(parseRobots("User-agent: *\nDisallow: /*.pdf$"), "/a.pdf"), false);
});

test("extractFacts and originOf", () => {
  assert.deepEqual(extractFacts(HTML), { title: "Brightline & Co | Freight", description: "Regional freight, 24/7 dispatch." });
  assert.equal(originOf("www.brightline.example/about"), "https://www.brightline.example");
  assert.equal(originOf("not a site"), null);
  assert.equal(originOf(""), null);
});

test("readSite refuses when robots disallows, 403s, or errors; reads when allowed", async () => {
  const ok = await readSite("a.example", site({ "https://a.example/robots.txt": { status: 404, text: "" }, "https://a.example/": { status: 200, text: HTML } }));
  assert.equal(ok.ok, true);
  const blocked = await readSite("b.example", site({ "https://b.example/robots.txt": { status: 200, text: "User-agent: *\nDisallow: /" }, "https://b.example/": { status: 200, text: HTML } }));
  assert.equal(blocked.ok, false);
  assert.match(blocked.note, /disallows/);
  assert.match((await readSite("c.example", site({ "https://c.example/robots.txt": { status: 403, text: "" } }))).note, /closed/);
  assert.match((await readSite("d.example", async () => { throw new Error("boom"); })).note, /boom/);
  assert.match((await readSite("", site({}))).note, /no usable website/);
});

test("enrich reads each origin once and the brief and CSV carry the facts", async () => {
  const crm = "First Name,Email,Company name,Website,Industry\nDana,dana@a.example,A Co,a.example,Logistics\nOmar,omar@b.example,B Co,b.example,Logistics\n";
  const d = runResearch({ crm, icp: { industries: ["logistics"] }, offer: SAMPLE_OFFER, today: "2026-10-24" });
  let hits = 0;
  const f = site({ "https://a.example/robots.txt": { status: 404, text: "" }, "https://a.example/": { status: 200, text: HTML }, "https://b.example/robots.txt": { status: 200, text: "User-agent: *\nDisallow: /" } });
  await enrich(d.accounts, async (u) => { hits++; return f(u); });
  d.brief = briefOf(d);
  assert.equal(hits, 3);
  assert.match(d.brief, /Public page \(https:\/\/a\.example, robots\.txt allowed\): "Brightline & Co \| Freight"/);
  assert.match(d.brief, /Public page not read: robots\.txt disallows/);
  assert.match(csvAccounts(d), /Regional freight/);
});
