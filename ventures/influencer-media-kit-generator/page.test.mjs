import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test('index links to the "what is a media kit" docs page', async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /href="what-is-a-media-kit\.html"/);
});

test("docs page links back to the tool", async () => {
  const page = await readFile(new URL("./what-is-a-media-kit.html", import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("every page carries the no-warranty clause", async () => {
  for (const file of ["index.html", "what-is-a-media-kit.html"]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test("index has title, meta description, and JSON-LD", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /<title>.+<\/title>/);
  assert.match(page, /<meta name="description" content="[^"]+"/);
  assert.match(page, /"@type":"SoftwareApplication"/);
  assert.match(page, /"@type":"FAQPage"/);
});

// Reciprocal of the link in epk-generator's footer. Both tools are a
// self-presentation document sent to a gatekeeper to get chosen -- a
// sponsorship media kit to a brand, an electronic press kit to a
// venue/festival/blog -- for a different kind of applicant.
test("index links one hop to the epk-generator sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/epk-generator\/"/,
    "index must link ../epk-generator/ so a reader weighing both reaches it in one hop",
  );
});

// Adjacent step in the same workflow: brand-deal-rate-calculator answers
// "what should I charge", this tool answers "how do I present it" -- a
// creator with a rate in hand still needs the one-pager to send it in.
test("index links one hop to the brand-deal-rate-calculator sibling", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/brand-deal-rate-calculator\/"/,
    "index must link ../brand-deal-rate-calculator/ so a reader weighing both reaches it in one hop",
  );
});

test("index carries the sponsor link", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("index exposes a usage opt-out control", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /setUsageOptOut/);
  assert.match(page, /id="optout"/);
});

test("index imports the generator and state modules it needs", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /from ".\/generator\.mjs"/);
  assert.match(page, /from ".\/state\.mjs"/);
  assert.match(page, /from ".\/usage\.mjs"/);
});

test("index never mentions uploading, storing, or transmitting what the visitor types", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /never uploaded/i);
});

test("every field id referenced by the script exists in the form", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const ids = ["creatorName", "tagline", "niche", "location", "bio", "photoUrl", "photoAlt",
    "contactName", "contactEmail", "contactPhone", "websiteUrl"];
  for (const id of ids) {
    assert.match(page, new RegExp(`id="${id}-input"`), `missing input#${id}-input`);
  }
  for (const id of ["platforms", "audience", "collabs", "testimonials", "rates"]) {
    assert.match(page, new RegExp(`id="${id}-input"`), `missing textarea#${id}-input`);
  }
});
