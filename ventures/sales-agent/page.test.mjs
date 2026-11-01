import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { score } from "./eval/run.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const load = (f) => page(`eval/${f}`).split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("index page carries the disclaimer, privacy line, sponsor link and the never-sends promise", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax or sales-compliance advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /may always do less on its own; it may never do more without you/);
  assert.match(html, /SENDS NOTHING/);
});

test("JSON-LD parses and every FAQ question and answer is on the page", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 3);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
});

test("the accuracy the page states is what the eval measures", () => {
  const html = page("index.html");
  const s = score(load("fresh-2026-10-21.jsonl"));
  const unsub = load("fresh-2026-10-21.jsonl").filter((r) => r.label === "unsubscribe").length;
  assert.ok(html.includes(`${s.acted} of ${s.n}; right on ${s.actedRight} (${Math.round(100 * s.precision)}%)`));
  assert.ok(html.includes(`${s.n - s.acted}; the word model's guess was right on ${s.guessRight}`));
  assert.ok(html.includes(`${unsub - s.unsubMissed} of ${unsub} (the other ${s.unsubMissed}`));
  assert.ok(html.includes(`${s.guessOverreach} of ${s.n - s.acted} (guesses never act`));
  assert.ok(html.includes(`named a category for ${s.acted} and were right on ${s.actedRight}`));
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Sales Agent/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /AI sales agent/i);
});

test("every input has a label, and no page code sends data anywhere itself", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 10);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  for (const f of ["engine.mjs", "learn.mjs", "model.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, f);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the engine has no send path", () => {
  for (const f of ["engine.mjs", "ai.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), /nodemailer|smtp|sendmail|createTransport|twilio/i, f);
});

test("the research section is wired to the engine and the example runs", async () => {
  const html = page("index.html");
  for (const id of ["crm", "icp-industries", "icp-titles", "icp-countries", "icp-min", "icp-max", "icp-top", "go-research", "dl-accounts"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /from "\.\/research\.mjs"/);
  const { runResearch, SAMPLE_CRM } = await import("./research.mjs");
  const { SAMPLE_OFFER } = await import("./engine.mjs");
  const d = runResearch({ crm: SAMPLE_CRM, icp: { industries: ["logistics"], titles: ["director", "owner", "founder", "ceo"], min_employees: 30, max_employees: 300, countries: ["US"] }, offer: SAMPLE_OFFER, today: "2026-10-24" });
  assert.equal(d.accounts[0].company, "Brightline Logistics");
  assert.equal(d.summary.held, 1);
  assert.doesNotMatch(page("research.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the call section is wired to prep and follow-up and both run", async () => {
  const html = page("index.html");
  for (const id of ["call-email", "call-notes", "go-prep", "go-followup", "call-out"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /from "\.\/prep\.mjs"/);
  assert.match(html, /from "\.\/followup\.mjs"/);
  const { runPrep } = await import("./prep.mjs");
  const { runFollowUp } = await import("./followup.mjs");
  const input = { email: "dana@brightline.example", prospects: "email,first_name,company,status\ndana@brightline.example,Dana,Brightline Logistics,active", replies: "From: Dana Reyes <dana@brightline.example>\nSubject: Re: route planning\nWe lose about 6 hours a week on manual routing.", notes: "I will send the pricing sheet.", today: "2026-10-24", offer: {} };
  const p = runPrep(input);
  assert.equal(p.stop, "");
  assert.ok(p.unknown.length < 9 && p.brief.includes("Brightline Logistics"));
  const f = runFollowUp(input);
  assert.equal(f.approval === "nothing_to_send", false);
  const stopped = runFollowUp({ ...input, suppression: "dana@brightline.example" });
  assert.equal(stopped.draft, null);
  assert.doesNotMatch(page("prep.mjs") + page("followup.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("index page's relative links point at servable files, so the front-door mirror can build", () => {
  // Markdown is not mirrored: a relative link to a .md file is a dead link there
  // and makes `front-door-tools.mjs` refuse to build the whole mirror.
  const hrefs = [...page("index.html").matchAll(/href="([^"#?:]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs.filter((h) => /\.md$/i.test(h)), []);
});

test("the call section offers optional dictation and read-aloud, feature-detected, with the audio caveat and no network code", () => {
  const html = page("index.html");
  for (const id of ["dictate", "read-aloud", "voice-note"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /from "\.\/voice\.mjs"/);
  assert.match(html, /webkitSpeechRecognition/);
  assert.match(html, /sends the audio to the browser maker/);
  assert.doesNotMatch(page("voice.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});
