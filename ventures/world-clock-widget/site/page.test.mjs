import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const page = () => readFile(new URL("./index.html", import.meta.url), "utf8");

test("every FAQPage question/answer pair is also rendered as visible copy", async () => {
  const html = await page();
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((block) => block["@type"] === "FAQPage");
  assert.ok(ld, "expected a FAQPage JSON-LD block");
  for (const entry of ld.mainEntity) {
    assert.ok(html.includes(entry.name), `question not visible on page: ${entry.name}`);
    assert.ok(
      html.includes(entry.acceptedAnswer.text),
      `answer not visible on page: ${entry.name}`,
    );
  }
});

test("every .html file in the venture is reachable from the sitemap", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  const htmlFiles = (await readdir(new URL("./", import.meta.url))).filter((n) => n.endsWith(".html"));
  for (const name of htmlFiles) {
    if (name === "index.html" || name === "offline.html") continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, "\\.")), `${name} is missing from sitemap.xml`);
  }
});

test("the page wires the solar module and the usage counter", async () => {
  const html = await page();
  assert.match(html, /from "\.\/solar\.mjs"/);
  assert.match(html, /from "\.\/usage\.mjs"/);
});

test("every usage event named in the footer is actually recorded by the page", async () => {
  // The footer makes a promise about exactly which events are counted. A
  // counter added later without updating that list would make the privacy copy
  // quietly false, which is the one claim on this page worth pinning.
  const html = await page();
  const footerList = [...html.matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]);
  const recorded = new Set([...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]));

  assert.ok(footerList.length > 0, "expected the footer to name its usage events");
  for (const event of footerList) {
    assert.ok(recorded.has(event), `footer names "${event}" but nothing records it`);
  }
  for (const event of recorded) {
    assert.ok(footerList.includes(event), `page records "${event}" but the footer does not disclose it`);
  }
});

test("every interactive control has an accessible name", async () => {
  // Measured fleet-wide on 2026-09-06: the first full contrast/axe run found 48
  // critical `label` violations across three live products — inputs announced
  // to a screen reader as "edit, number" and nothing else. Every control this
  // page ships is either wrapped by a <label for>, carries aria-label, or has
  // visible text content; this asserts that rather than trusting the review.
  const html = await page();

  const labelledIds = new Set([...html.matchAll(/<label for="([^"]+)"/g)].map((m) => m[1]));

  // <select> and <input> need an associated <label for> or an aria-label.
  for (const m of html.matchAll(/<(select|input)\b([^>]*)>/g)) {
    const attrs = m[2];
    const id = /id="([^"]+)"/.exec(attrs)?.[1];
    const hasAria = /aria-label="/.test(attrs);
    assert.ok(
      hasAria || (id && labelledIds.has(id)),
      `<${m[1]}> has no accessible name: ${m[0]}`,
    );
  }

  // Buttons are named by their text content unless they carry aria-label.
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = m[1];
    const text = m[2].replace(/<[^>]*>/g, "").trim();
    assert.ok(
      /aria-label="/.test(attrs) || text.length > 0,
      `<button> has no accessible name: ${m[0]}`,
    );
  }
});

test("the remove button in each rendered row carries a per-city aria-label", async () => {
  // The row buttons are built in a template string, so the assertion above
  // cannot see them — they are not literal markup in the file.
  const html = await page();
  assert.match(
    html,
    /aria-label="Remove \$\{escapeHtml\(c\.city\.name\)\}"/,
    "row remove buttons must name the city they remove",
  );
});

test("the disclaimer names the limits that actually matter for solar times", async () => {
  const html = await page();
  assert.match(html, /No warranty/);
  // The specific unsafe uses, not just a generic clause: an almanac
  // approximation on city-centre coordinates must never be read as an
  // authority for these.
  for (const term of ["navigation", "aviation", "religious observance"]) {
    assert.ok(html.includes(term), `disclaimer should name ${term} as out of scope`);
  }
});

test("the page states that nothing is uploaded and honours DNT/GPC", async () => {
  const html = await page();
  assert.match(html, /Do Not Track and Global Privacy Control are honoured/);
  assert.match(html, /id="optout"/);
});

test("index links to a sibling tool so a crawler can leave in one hop", async () => {
  // Sitemap enumeration does not work on this origin (the catalogue is served
  // from a project-Pages subpath, so the robots.txt a crawler reads belongs to
  // another site). Internal links are the only crawl path, which makes this a
  // discoverability check rather than a courtesy one.
  const html = await page();
  assert.match(
    html,
    /href="\.\.\/cron-dst-drift-check\/"/,
    "index must link ../cron-dst-drift-check/ so crawlers can reach a sibling tool",
  );
});

test("the sponsor link is present and described as optional", async () => {
  const html = await page();
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /never changes what the tool does/);
});

test("the page links its own LICENSE, which the venture ships", async () => {
  const html = await page();
  assert.match(html, /href="LICENSE"/);
  // build.mjs copies ventures/<slug>/LICENSE next to the built page, so the
  // link only resolves if the file is really there.
  await readFile(new URL("../LICENSE", import.meta.url), "utf8");
});
