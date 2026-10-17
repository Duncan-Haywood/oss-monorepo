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

test("accepting a handoff saves the draft immediately, not on the autosave debounce", async () => {
  // Found 2026-09-11 by driving the real journey in Chromium: a creator who
  // pressed "Add these to my media kit" and went straight back to the other
  // rate calculator to add their second platform lost everything just
  // inserted, because `scheduleSave()` waits 400ms and the navigation
  // happened first. Nothing errored; the rows were simply gone on return.
  //
  // Asserted on the shipped markup rather than in a DOM harness because this
  // page has no module boundary for the click path — the guard that matters
  // is that the handoff branch writes through `saveDraft` rather than only
  // queueing. Typing may still debounce: there is nothing to lose between two
  // keystrokes.
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const handler = /#handoff-add"\)\.addEventListener\("click"[\s\S]*?\n    \}\);/.exec(page);
  assert.ok(handler, "the handoff-add click handler should be present");
  assert.match(handler[0], /saveDraft\(localStorage, values\)/);
  assert.doesNotMatch(handler[0], /scheduleSave\(\)/);
});

test("the page's privacy note names every event it counts", async () => {
  // The footer promises a specific list. An event counted but not listed is a
  // small dishonesty in the one paragraph a privacy-conscious reader checks.
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const script = /<script type="module">([\s\S]*)<\/script>/.exec(page)[1];
  const counted = new Set([...script.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]));
  assert.ok(counted.size >= 5, `expected several events, found ${[...counted].join(", ")}`);
  // The footer ELEMENT, not everything after the opening tag: this page puts
  // its <script> after </footer>, so slicing to the end of the file made the
  // assertion trivially true against the very code it is checking. It was,
  // for one commit, and it passed while three events genuinely went unlisted.
  const footer = /<footer[\s\S]*?<\/footer>/.exec(page)[0];
  for (const event of counted) {
    assert.ok(footer.includes(event), `the footer does not name the '${event}' event it counts`);
  }
});

test('index links the Kitly incumbent-comparison page and the sitemap lists it too', async () => {
  const index = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(index, /vs-kitly\.html/);
  assert.match(sitemap, /vs-kitly\.html/);
});

test("the Kitly comparison page links back, names the incumbent honestly, and states no unverifiable price", async () => {
  const vsKitly = await readFile(new URL("./vs-kitly.html", import.meta.url), "utf8");
  assert.match(vsKitly, /<a href="\.\/">/);
  assert.match(vsKitly, /not affiliated with, endorsed by, or sponsored by Kitly/i);
  // Kitly's own site was not reached by a live fetch from this session, so
  // no dollar figure for its product may appear on the page.
  assert.doesNotMatch(vsKitly, /\$\d/);
  assert.match(vsKitly, /No warranty/i);
  assert.match(vsKitly, /Best-effort hosting, no SLA/i);
  assert.match(vsKitly, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("the Kitly comparison page FAQPage JSON-LD matches the visible copy verbatim", async () => {
  const vsKitly = await readFile(new URL("./vs-kitly.html", import.meta.url), "utf8");
  const match = vsKitly.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found on vs-kitly.html");
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length > 0);
  for (const { name, acceptedAnswer } of schema.mainEntity) {
    assert.ok(vsKitly.includes(`<h3>${name}</h3>`), `FAQ question "${name}" has no matching <h3>`);
    assert.ok(vsKitly.includes(acceptedAnswer.text), `answer not found verbatim: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('index links the generic-method comparison page and the sitemap lists it too', async () => {
  const index = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(index, /vs-assembling-one-by-hand\.html/);
  assert.match(sitemap, /vs-assembling-one-by-hand\.html/);
});

test("the by-hand comparison page links back, names no specific product, and carries the standard clauses", async () => {
  const vsByHand = await readFile(new URL("./vs-assembling-one-by-hand.html", import.meta.url), "utf8");
  assert.match(vsByHand, /<a href="\.\/">/);
  assert.match(vsByHand, /names no specific document editor, product, or company/i);
  assert.match(vsByHand, /No warranty/i);
  assert.match(vsByHand, /Best-effort hosting, no SLA/i);
  assert.match(vsByHand, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("the by-hand comparison page FAQPage JSON-LD matches the visible copy verbatim", async () => {
  const vsByHand = await readFile(new URL("./vs-assembling-one-by-hand.html", import.meta.url), "utf8");
  const match = vsByHand.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found on vs-assembling-one-by-hand.html");
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length > 0);
  for (const { name, acceptedAnswer } of schema.mainEntity) {
    assert.ok(vsByHand.includes(`<h3>${name}</h3>`), `FAQ question "${name}" has no matching <h3>`);
    assert.ok(vsByHand.includes(acceptedAnswer.text), `answer not found verbatim: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});
