import test from "node:test";
import assert from "node:assert/strict";
import { parseRobotsTxt, isAllowed, auditRobots, validateLlmsTxt, KNOWN_BOTS } from "./audit.mjs";

test("parses a single named block", () => {
  const { records } = parseRobotsTxt("User-agent: GPTBot\nDisallow: /\n");
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].agents, ["GPTBot"]);
  assert.deepEqual(records[0].rules, [{ allow: false, pattern: "/" }]);
});

test("groups consecutive User-agent lines into one record", () => {
  const { records } = parseRobotsTxt("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /private/\n");
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].agents, ["GPTBot", "ClaudeBot"]);
});

test("a new User-agent line after rules started begins a new record", () => {
  const { records } = parseRobotsTxt(
    "User-agent: GPTBot\nDisallow: /a\nUser-agent: ClaudeBot\nDisallow: /b\n"
  );
  assert.equal(records.length, 2);
  assert.deepEqual(records[1].agents, ["ClaudeBot"]);
});

test("ignores comments and blank lines, reads Sitemap", () => {
  const { records, sitemaps } = parseRobotsTxt(
    "# comment\nUser-agent: *\n\nDisallow: /admin # trailing comment\nSitemap: https://example.test/sitemap.xml\n"
  );
  assert.equal(records[0].rules[0].pattern, "/admin");
  assert.deepEqual(sitemaps, ["https://example.test/sitemap.xml"]);
});

test("empty Disallow value blocks nothing", () => {
  const { records } = parseRobotsTxt("User-agent: GPTBot\nDisallow:\n");
  assert.equal(records[0].rules.length, 0);
});

test("isAllowed: no matching group at all defaults to allowed", () => {
  const { records } = parseRobotsTxt("User-agent: SomeOtherBot\nDisallow: /\n");
  const result = isAllowed(records, "GPTBot", "/");
  assert.equal(result.allowed, true);
  assert.equal(result.matchedAs, "none");
});

test("isAllowed: falls back to the wildcard group", () => {
  const { records } = parseRobotsTxt("User-agent: *\nDisallow: /\n");
  const result = isAllowed(records, "GPTBot", "/");
  assert.equal(result.allowed, false);
  assert.equal(result.matchedAs, "wildcard");
});

test("isAllowed: a named group takes precedence over the wildcard group", () => {
  const { records } = parseRobotsTxt("User-agent: *\nDisallow: /\nUser-agent: GPTBot\nAllow: /\n");
  const result = isAllowed(records, "GPTBot", "/anything");
  assert.equal(result.allowed, true);
  assert.equal(result.matchedAs, "named");
});

test("isAllowed: longest matching rule wins regardless of order", () => {
  const { records } = parseRobotsTxt("User-agent: GPTBot\nDisallow: /\nAllow: /public/\n");
  assert.equal(isAllowed(records, "GPTBot", "/public/page").allowed, true);
  assert.equal(isAllowed(records, "GPTBot", "/private/page").allowed, false);
});

test("isAllowed: a tie in match length favors Allow", () => {
  const { records } = parseRobotsTxt("User-agent: GPTBot\nDisallow: /x\nAllow: /x\n");
  assert.equal(isAllowed(records, "GPTBot", "/x").allowed, true);
});

test("isAllowed: wildcard pattern with $ anchor", () => {
  const { records } = parseRobotsTxt("User-agent: GPTBot\nDisallow: /*.pdf$\n");
  assert.equal(isAllowed(records, "GPTBot", "/report.pdf").allowed, false);
  assert.equal(isAllowed(records, "GPTBot", "/report.pdf.html").allowed, true);
});

test("isAllowed: user-agent token match is case-insensitive", () => {
  const { records } = parseRobotsTxt("User-agent: gptbot\nDisallow: /\n");
  assert.equal(isAllowed(records, "GPTBot", "/").allowed, false);
});

test("auditRobots: reports blocked, allowed, and partially-blocked across known bots", () => {
  const robots = [
    "User-agent: *",
    "Disallow: /admin",
    "",
    "User-agent: GPTBot",
    "Disallow: /",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
  ].join("\n");
  const { rows } = auditRobots(robots, ["/", "/admin"]);
  const gptbot = rows.find((r) => r.token === "GPTBot");
  const claudebot = rows.find((r) => r.token === "ClaudeBot");
  const perplexity = rows.find((r) => r.token === "PerplexityBot");
  assert.equal(gptbot.status, "blocked");
  assert.equal(claudebot.status, "allowed");
  assert.equal(perplexity.status, "partially-blocked"); // falls to wildcard: blocked on /admin only
});

test("KNOWN_BOTS has no duplicate tokens and every entry has a purpose", () => {
  const tokens = KNOWN_BOTS.map((b) => b.token.toLowerCase());
  assert.equal(new Set(tokens).size, tokens.length);
  for (const bot of KNOWN_BOTS) {
    assert.ok(bot.operator, `${bot.token} is missing an operator`);
    assert.ok(bot.purpose, `${bot.token} is missing a purpose`);
  }
});

test("validateLlmsTxt: accepts a well-formed file", () => {
  const text = [
    "# Example Site",
    "",
    "> A one-line summary of what this site is.",
    "",
    "## Docs",
    "",
    "- [Getting started](https://example.test/start)",
  ].join("\n");
  const result = validateLlmsTxt(text);
  assert.equal(result.valid, true);
  assert.equal(result.hasTitle, true);
  assert.equal(result.hasSummary, true);
  assert.equal(result.linkCount, 1);
  assert.equal(result.sectionCount, 1);
});

test("validateLlmsTxt: flags a missing title and missing links", () => {
  const result = validateLlmsTxt("Just some text\nwith no structure.");
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /H1 title/.test(e)));
  assert.ok(result.errors.some((e) => /Markdown links/.test(e)));
});

test("validateLlmsTxt: empty input", () => {
  const result = validateLlmsTxt("");
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /empty/.test(e)));
});

test("validateLlmsTxt: title with no summary is a warning, not an error", () => {
  const result = validateLlmsTxt("# Example Site\n\n## Docs\n\n[link](https://example.test)\n");
  assert.equal(result.hasSummary, false);
  assert.ok(result.warnings.some((w) => /blockquote/.test(w)));
  assert.equal(result.valid, true);
});
