import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const robots = readFileSync(new URL("./robots.txt", import.meta.url), "utf8");

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports and calls the functions it claims to run", () => {
  assert.match(scriptSource, /scaffold/);
  assert.match(scriptSource, /countUsage\("generate"\)/);
  assert.match(scriptSource, /countUsage\(eventName\)/);
  assert.match(scriptSource, /"skillmd_copied"/);
  assert.match(scriptSource, /"folder_tree_copied"/);
});

test("carries the no-warranty disclaimer with runtime-behaviour wording", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a guarantee that Claude will load or invoke the generated skill correctly at runtime/i);
});

test("carries a client-side privacy statement", () => {
  assert.match(html, /<strong>Privacy\.<\/strong>/);
  assert.match(html, /never leave your device/i);
});

test("carries the best-effort hosting and sponsor paragraphs", () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("carries the usage opt-out toggle and states what is counted", () => {
  assert.match(html, /id="usage"/);
  assert.match(html, /Do Not Track and Global Privacy Control disable counting/);
});

test("states plainly that it makes no model call and a clean result is not a runtime guarantee", () => {
  assert.match(html, /never calls an AI model/i);
  assert.match(html, /not a guarantee that Claude will load or invoke the generated skill correctly at runtime/i);
});

test("links to skill-manifest-check, claude-code-settings-check, and mcp-config-risk-check as complementary AI-agent-tooling tools", () => {
  assert.match(html, /skill-manifest-check\/">/);
  assert.match(html, /claude-code-settings-check\/">/);
  assert.match(html, /mcp-config-risk-check\/">/);
});

test("has the input fields the generator reads", () => {
  for (const id of ["nameInput", "whatInput", "whenInput", "titleInput", "scriptsInput", "referencesInput", "assetsInput"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("has the two output fields and their copy buttons", () => {
  assert.match(html, /id="skillMdOut"/);
  assert.match(html, /id="folderTreeOut"/);
  assert.match(html, /id="copySkillMd"/);
  assert.match(html, /id="copyFolderTree"/);
});

test("the FAQPage JSON-LD is valid, matches the visible headings, and its answers are byte-identical to the visible paragraphs", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  for (const q of schema.mainEntity) {
    const escapedQuestion = q.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const heading = new RegExp(`<h3>${escapedQuestion}<\\/h3>`);
    assert.match(html, heading, `FAQ heading missing from visible copy: ${q.name}`);
    const escapedAnswer = q.acceptedAnswer.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const answerPara = new RegExp(`<p>${escapedAnswer}<\\/p>`);
    assert.match(html, answerPara, `FAQ answer not byte-identical to visible copy: ${q.name}`);
  }
});

test("the SoftwareApplication JSON-LD is valid", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"SoftwareApplication".*?\})<\/script>/s);
  assert.ok(match, "no SoftwareApplication schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema.offers.price, "0");
});

test("the example object is present and self-consistent", () => {
  const match = scriptSource.match(/const EXAMPLE = (\{[\s\S]*?\n {2}\});/);
  assert.ok(match, "EXAMPLE not found");
  assert.match(scriptSource, /EXAMPLE\.name/);
  assert.match(scriptSource, /EXAMPLE\.what/);
  assert.match(scriptSource, /EXAMPLE\.when/);
});

test("sitemap lists every published page and no extras", () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs.sort(), ["./", "./vs-writing-the-frontmatter-by-hand.html"]);
});

test("robots.txt allows crawling", () => {
  assert.match(robots, /Allow:\s*\//);
});
