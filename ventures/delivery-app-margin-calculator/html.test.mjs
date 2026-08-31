import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const explainer = readFileSync(new URL("./doordash-fees-for-restaurants.html", import.meta.url), "utf8");

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
