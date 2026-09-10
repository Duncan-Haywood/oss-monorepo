import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CHANNEL_PRESETS } from "./calc.mjs";
import { buildSpec } from "./share.mjs";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const explainer = readFileSync(new URL("./doordash-fees-for-restaurants.html", import.meta.url), "utf8");
const versus = readFileSync(new URL("./doordash-vs-ubereats-fees.html", import.meta.url), "utf8");
const calcSource = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
const script = /<script type="module">([\s\S]*)<\/script>/.exec(page)[1];

test("landing page names the restaurant search phrases and the job", () => {
  assert.match(page, /DoorDash Fee Calculator for Restaurants/);
  assert.match(page, /menu price each app needs to match dine-in/);
  assert.match(page, /<title>/);
  assert.match(page, /meta name="description"/);
  assert.match(page, /SoftwareApplication/);
  assert.match(page, /FAQPage/);
});

test("landing page is a complete calculator, not a placeholder", () => {
  assert.match(page, /id="ticketPrice"/);
  assert.match(page, /id="foodCost"/);
  assert.match(page, /id="rows"/);
  assert.match(page, /from "\.\/calc\.mjs"/);
  assert.match(page, /Price to match dine-in/);
  assert.match(page, /copySummary/);
  assert.match(page, /summary_copied/);
});

test("FAQ covers Uber Eats and Grubhub by name, not just DoorDash", () => {
  // The header, meta description, and calculator itself all name DoorDash,
  // Uber Eats, and Grubhub as first-class channels, but until now the FAQ
  // (and its FAQPage schema) only ever answered a DoorDash-specific
  // question -- a search for "how much does Uber Eats take" or "Grubhub
  // commission" found nothing tailored on a page that answers exactly that.
  assert.match(page, /How much does Uber Eats take from restaurants\?/);
  assert.match(page, /How much commission does Grubhub charge restaurants\?/);
  const faqBlockMatch = page.match(/"@type":\s*"FAQPage"[\s\S]*?<\/script>/);
  assert.ok(faqBlockMatch, "FAQPage JSON-LD block should exist");
  assert.match(faqBlockMatch[0], /Uber Eats take from restaurants/);
  assert.match(faqBlockMatch[0], /Grubhub charge restaurants/);
});

test("disclaimer, privacy, opt-out, and optional sponsors are visible", () => {
  assert.match(page, /No warranty/);
  assert.match(page, /not tax, financial, or business advice/i);
  assert.match(page, /usageOptOut/);
  assert.match(page, /Do Not Track/);
  assert.match(page, /github.com\/sponsors\/Duncan-Haywood/);
});

test("explainer page walks the same default ticket the calculator ships", () => {
  assert.match(explainer, /\$21\.17/);
  assert.match(explainer, /\$10\.11/);
  assert.match(explainer, /\$47\.15/);
  assert.match(explainer, /\$4,424/);
  assert.match(explainer, /No warranty/);
});

test("a shareable link exists and reads and writes the whole comparison, not just a text summary", () => {
  assert.match(page, /id="copyLink"/);
  assert.match(page, /id="linkStatus"/);
  assert.match(page, /id="restoreNote"/);
  assert.match(script, /from "\.\/share\.mjs"/);
  assert.match(script, /encodeShare\(SHARE_SPEC, readSavable\(\)\)/);
  assert.match(script, /restoreShare\(SHARE_SPEC/);
  assert.match(script, /link_copied/);
  // The comparison rides in the URL fragment, never the query string a
  // server's access log or a later click's Referer header would carry.
  assert.match(script, /location\.origin.*location\.pathname.*#/);
});

test("the shareable link's field spec is built from the same lists the page reads and renders with, not a second hand-kept copy", () => {
  // Restating SHARED_FIELDS or CHANNEL_FIELDS a second time here would be
  // exactly the drift this repo has already paid for once: a field added to
  // the form that a hand-maintained allowlist silently drops from the link.
  assert.match(script, /buildSpec\(\s*SHARED_FIELDS,\s*CHANNEL_FIELDS\.map\(\(field\) => field\.key\),\s*CHANNEL_PRESETS\.map\(\(channel\) => channel\.id\),?\s*\)/);
});

test("every channel field calc.mjs actually reads off a channel object rides in the share spec", () => {
  // Extracted from calc.mjs itself -- calculateChannel's and compareChannels'
  // own readers -- rather than re-typed, so a field calc.mjs starts reading
  // that the share spec does not carry fails here instead of shipping a link
  // that silently drops it.
  const sharedFieldsMatch = /const SHARED_FIELDS = \[([^\]]+)\];/.exec(script);
  assert.ok(sharedFieldsMatch, "SHARED_FIELDS should be declared in the page script");
  const SHARED_FIELDS = JSON.parse(`[${sharedFieldsMatch[1]}]`);

  const channelFieldKeys = [...script.matchAll(/key:\s*"(\w+)",\s*label:/g)].map((m) => m[1]);
  assert.ok(channelFieldKeys.length > 0, "CHANNEL_FIELDS keys should be extractable from the page script");

  const spec = buildSpec(SHARED_FIELDS, channelFieldKeys, CHANNEL_PRESETS.map((c) => c.id));
  const specRowKeys = new Set(spec.rows.fields.map((f) => f.key));
  const specNumberKeys = new Set(spec.numbers);

  const excludedChannelKeys = new Set(["id", "label", "note"]);
  for (const key of new Set([...calcSource.matchAll(/\bchannel\??\.(\w+)/g)].map((m) => m[1]))) {
    if (excludedChannelKeys.has(key)) continue;
    assert.ok(specRowKeys.has(key), `channel field '${key}' read by calc.mjs is missing from the share spec`);
  }
  for (const key of new Set([...calcSource.matchAll(/\bshared\.(\w+)/g)].map((m) => m[1]))) {
    assert.ok(specNumberKeys.has(key), `shared field '${key}' read by calc.mjs is missing from the share spec`);
  }
});

test("DoorDash vs Uber Eats page names all three apps and matches the calculator's math", () => {
  // The three commission-driven "you keep" figures below are calc.mjs's
  // CHANNEL_PRESETS run through calculateChannel() by hand for the same
  // $32/$9.60/$18-per-hour/8-minute/$1.25 default ticket the landing page and
  // doordash-fees-for-restaurants.html already use, so a change to those
  // defaults or commission rates should break this test too.
  assert.match(versus, /<title>DoorDash vs Uber Eats/);
  assert.match(versus, /meta name="description"/);
  assert.match(versus, /FAQPage/);
  assert.match(versus, /Uber Eats/);
  assert.match(versus, /Grubhub/);
  assert.match(versus, /\$10\.11/); // DoorDash keeps, 27%
  assert.match(versus, /\$9\.15/); // Uber Eats keeps, 30%
  assert.match(versus, /\$10\.75/); // Grubhub keeps, 25%
  assert.match(versus, /\$47\.15/); // DoorDash price to match dine-in
  assert.match(versus, /\$49\.17/); // Uber Eats price to match dine-in
  assert.match(versus, /\$45\.89/); // Grubhub price to match dine-in
  assert.match(versus, /No warranty/);
  assert.match(versus, /href="doordash-fees-for-restaurants\.html"/);
});

test("links to the menu engineering calculator", () => {
  assert.match(page, /href="\.\.\/menu-engineering-calculator\/"/, "the sibling-tool link is missing");
});
