// The tests that matter here are the ones proving the checker can say "no".
//
// A checker that reports "your robots.txt does not govern this site" for
// every input would pass a naive suite and be worthless, because the whole
// value is the discrimination: an origin-root site is fine and must be told
// so, a subpath site is not and must be told exactly why. Both directions are
// asserted below, and so is the case that trips people up most -- a subpath
// site whose origin root happens to carry a sitemap line for it after all.
import test from "node:test";
import assert from "node:assert/strict";

import {
  assess,
  identifyHost,
  parseRobotsTxt,
  parseSiteUrl,
  pathAllowedBy,
  remediesFor,
} from "./analyze.mjs";

test("a site at an origin root governs its own robots.txt", () => {
  const report = assess({ siteUrl: "https://example.com/" });
  assert.equal(report.ok, true);
  assert.equal(report.governs, true);
  assert.equal(report.verdict, "governs");
  assert.equal(report.counts.critical, 0);
  assert.equal(report.site.governingRobotsUrl, "https://example.com/robots.txt");
  assert.equal(report.site.publishedRobotsUrl, "https://example.com/robots.txt");
  assert.ok(report.findings.some((f) => f.id === "origin-root"));
});

test("a GitHub Pages project site does not, and the report names the repo that does", () => {
  const report = assess({ siteUrl: "https://duncan-haywood.github.io/monorepo-projects/" });
  assert.equal(report.governs, false);
  assert.equal(report.verdict, "does-not-govern");
  assert.equal(report.hostKind, "github-pages");
  assert.equal(report.site.governingRobotsUrl, "https://duncan-haywood.github.io/robots.txt");
  assert.equal(
    report.site.publishedRobotsUrl,
    "https://duncan-haywood.github.io/monorepo-projects/robots.txt",
  );

  const notYours = report.findings.find((f) => f.id === "robots-not-yours");
  assert.ok(notYours, "expected the robots-not-yours finding");
  // The actionable part: which other repository serves the governing file.
  assert.match(notYours.detail, /duncan-haywood\.github\.io/);

  assert.ok(
    report.findings.some((f) => f.id === "sitemap-never-discovered"),
    "the sitemap discovery gap is the finding that costs traffic",
  );
});

test("a GitLab Pages project site is recognised the same way", () => {
  const report = assess({ siteUrl: "https://acme.gitlab.io/docs/" });
  assert.equal(report.hostKind, "gitlab-pages");
  const notYours = report.findings.find((f) => f.id === "robots-not-yours");
  assert.match(notYours.detail, /acme\.gitlab\.io/);
});

test("a GitHub Pages USER site is at the origin root and must not be flagged", () => {
  // This is the discrimination a naive "is it github.io?" check gets wrong,
  // and getting it wrong tells a user with a working setup to buy a domain.
  const report = assess({ siteUrl: "https://duncan-haywood.github.io/" });
  assert.equal(report.governs, true);
  assert.equal(report.verdict, "governs");
  assert.equal(
    report.findings.filter((f) => f.id === "robots-not-yours").length,
    0,
    "a user/org site publishes the governing file itself",
  );
});

test("an unknown host on a subpath is still flagged, without inventing an owner", () => {
  const report = assess({ siteUrl: "https://cdn.example.net/marketing-site/" });
  assert.equal(report.governs, false);
  assert.equal(report.hostKind, "generic-subpath");
  const notYours = report.findings.find((f) => f.id === "robots-not-yours");
  assert.match(notYours.detail, /whoever controls the root of this origin/);
});

test("a URL ending in a file name describes the site rooted at its directory", () => {
  const parsed = parseSiteUrl("https://example.com/docs/index.html");
  assert.equal(parsed.pathname, "/docs/");
  assert.equal(parsed.isSubpath, true);
});

test("a bare host with no scheme is accepted, because that is what people paste", () => {
  const parsed = parseSiteUrl("acme.github.io/widget/");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.origin, "https://acme.github.io");
  assert.equal(parsed.pathname, "/widget/");
});

test("input that is not a usable URL is refused with a message, never thrown", () => {
  assert.equal(parseSiteUrl("").ok, false);
  assert.equal(parseSiteUrl("   ").ok, false);
  assert.equal(parseSiteUrl("ftp://example.com/x/").ok, false);
  assert.match(parseSiteUrl("ftp://example.com/x/").error, /http and https/);
  const report = assess({ siteUrl: "not a url at all" });
  assert.equal(report.ok, false);
  assert.ok(report.error);
});

test("directives in a subpath site's own robots.txt are reported inert, both ways", () => {
  const report = assess({
    siteUrl: "https://acme.github.io/widget/",
    publishedRobots: [
      "User-agent: *",
      "Disallow: /widget/drafts/",
      "Allow: /widget/",
      "",
      "Sitemap: https://acme.github.io/widget/sitemap.xml",
    ].join("\n"),
  });

  const inertSitemap = report.findings.find((f) => f.id === "inert-sitemap-line");
  assert.ok(inertSitemap);
  assert.match(inertSitemap.title, /never be read/);

  const inert = report.findings.find((f) => f.id === "inert-directives");
  assert.ok(inert);
  // The direction people miss: a Disallow they wrote is not protecting anything.
  assert.match(inert.detail, /cannot \*block\* a crawler/);
  assert.match(inert.remedy, /noindex/);
});

test("an origin-root robots.txt that blocks the subpath is the finding that matters most", () => {
  const report = assess({
    siteUrl: "https://acme.github.io/widget/",
    governingRobots: ["User-agent: *", "Disallow: /widget/"].join("\n"),
  });
  const blocked = report.findings.find((f) => f.id === "blocked-by-origin-root");
  assert.ok(blocked, "expected the blocked-by-origin-root finding");
  assert.equal(blocked.severity, "critical");
  assert.match(blocked.detail, /cannot be changed from this site's own repository/);
});

test("an origin-root robots.txt that allows the subpath says so rather than staying silent", () => {
  const report = assess({
    siteUrl: "https://acme.github.io/widget/",
    governingRobots: ["User-agent: *", "Disallow: /private/"].join("\n"),
  });
  const allowed = report.findings.find((f) => f.id === "allowed-by-origin-root");
  assert.ok(allowed);
  assert.equal(allowed.severity, "pass");
});

test("an origin root that DOES list our sitemap flips the discovery verdict", () => {
  // The case that makes the tool honest: a subpath site can be fine, if
  // someone with root access added the line. Reporting it as broken anyway
  // would be the same overclaiming the tool exists to prevent.
  const report = assess({
    siteUrl: "https://acme.github.io/widget/",
    governingRobots: [
      "User-agent: *",
      "Allow: /",
      "Sitemap: https://acme.github.io/widget/sitemap.xml",
    ].join("\n"),
  });
  const listed = report.findings.find((f) => f.id === "sitemap-listed-at-root");
  assert.ok(listed, "expected sitemap-listed-at-root");
  assert.equal(listed.severity, "pass");
  assert.equal(
    report.findings.filter((f) => f.id === "sitemap-absent-at-root").length,
    0,
  );
});

test("an origin root with no sitemap line for us confirms the gap as measurement", () => {
  const report = assess({
    siteUrl: "https://acme.github.io/widget/",
    governingRobots: ["User-agent: *", "Allow: /", "Sitemap: https://acme.github.io/sitemap.xml"].join("\n"),
  });
  const absent = report.findings.find((f) => f.id === "sitemap-absent-at-root");
  assert.ok(absent);
  assert.match(absent.detail, /confirms the discovery gap above rather than merely predicting/);
});

test("findings are ordered with the critical ones first", () => {
  const report = assess({
    siteUrl: "https://acme.github.io/widget/",
    publishedRobots: "User-agent: *\nDisallow: /drafts/\nSitemap: https://acme.github.io/widget/sitemap.xml",
    governingRobots: "User-agent: *\nAllow: /",
  });
  const ranks = report.findings.map((f) => f.severity);
  const order = { critical: 0, warning: 1, info: 2, pass: 3 };
  for (let i = 1; i < ranks.length; i += 1) {
    assert.ok(order[ranks[i - 1]] <= order[ranks[i]], `out of order at ${i}: ${ranks.join(",")}`);
  }
});

test("remedies are only offered for a site that needs them", () => {
  const rootReport = assess({ siteUrl: "https://example.com/" });
  assert.deepEqual(rootReport.remedies, []);

  const subReport = assess({ siteUrl: "https://acme.github.io/widget/" });
  const ids = subReport.remedies.map((r) => r.id);
  assert.deepEqual(ids, [
    "custom-domain",
    "direct-submission",
    "indexnow",
    "link-graph",
    "meta-robots",
  ]);
  // Every remedy states its cost -- a remedy with an unstated cost reads as
  // free advice and this one is not always free.
  for (const remedy of subReport.remedies) {
    assert.ok(remedy.cost && remedy.cost.length > 5, `${remedy.id} has no stated cost`);
  }
});

test("the GitHub Pages remedy names the mechanism rather than hand-waving", () => {
  const parsed = parseSiteUrl("https://acme.github.io/widget/");
  const remedies = remediesFor(parsed, identifyHost(parsed.host));
  const domain = remedies.find((r) => r.id === "custom-domain");
  assert.match(domain.detail, /CNAME/);
});

test("IndexNow is described accurately, including that Google does not consume it", () => {
  const report = assess({ siteUrl: "https://acme.github.io/widget/" });
  const indexnow = report.remedies.find((r) => r.id === "indexnow");
  assert.match(indexnow.detail, /Google does not/);
});

// ---------------------------------------------------------------- parsing

test("robots.txt parsing keeps sitemap lines out of user-agent groups", () => {
  // RFC 9309 makes `Sitemap:` group-independent. Filing it under whatever
  // User-agent happened to precede it is a real parser bug, so assert it.
  const parsed = parseRobotsTxt(
    ["User-agent: Googlebot", "Disallow: /x/", "Sitemap: https://e.com/s.xml"].join("\n"),
  );
  assert.equal(parsed.sitemaps.length, 1);
  assert.equal(parsed.sitemaps[0].value, "https://e.com/s.xml");
  assert.equal(parsed.directives.length, 1);
  assert.deepEqual(parsed.directives[0].agents, ["Googlebot"]);
});

test("consecutive user-agent lines form one group", () => {
  const parsed = parseRobotsTxt(
    ["User-agent: A", "User-agent: B", "Disallow: /x/"].join("\n"),
  );
  assert.deepEqual(parsed.directives[0].agents, ["A", "B"]);
});

test("comments and blank lines are ignored", () => {
  const parsed = parseRobotsTxt(
    ["# a comment", "", "User-agent: *   # trailing", "Disallow: /x/ # here too"].join("\n"),
  );
  assert.equal(parsed.directives.length, 1);
  assert.equal(parsed.directives[0].value, "/x/");
  assert.deepEqual(parsed.directives[0].agents, ["*"]);
});

test("longest-match wins, and Allow wins a tie", () => {
  const parsed = parseRobotsTxt(
    ["User-agent: *", "Disallow: /docs/", "Allow: /docs/public/"].join("\n"),
  );
  assert.equal(pathAllowedBy(parsed, "/docs/private/").allowed, false);
  assert.equal(pathAllowedBy(parsed, "/docs/public/").allowed, true);

  const tie = parseRobotsTxt(["User-agent: *", "Disallow: /x/", "Allow: /x/"].join("\n"));
  assert.equal(pathAllowedBy(tie, "/x/").allowed, true);
});

test("an empty Disallow value allows everything", () => {
  const parsed = parseRobotsTxt(["User-agent: *", "Disallow:"].join("\n"));
  assert.equal(pathAllowedBy(parsed, "/anything/").allowed, true);
});

test("wildcards and end-anchors are honoured", () => {
  const parsed = parseRobotsTxt(["User-agent: *", "Disallow: /*/drafts/"].join("\n"));
  assert.equal(pathAllowedBy(parsed, "/site/drafts/").allowed, false);
  assert.equal(pathAllowedBy(parsed, "/site/live/").allowed, true);

  const anchored = parseRobotsTxt(["User-agent: *", "Disallow: /x$"].join("\n"));
  assert.equal(pathAllowedBy(anchored, "/x").allowed, false);
  assert.equal(pathAllowedBy(anchored, "/x/y").allowed, true);
});

test("a named user-agent group replaces the wildcard group entirely", () => {
  const parsed = parseRobotsTxt(
    ["User-agent: *", "Disallow: /", "", "User-agent: Googlebot", "Allow: /"].join("\n"),
  );
  assert.equal(pathAllowedBy(parsed, "/page/", "Googlebot").allowed, true);
  assert.equal(pathAllowedBy(parsed, "/page/", "OtherBot").allowed, false);
});

test("an unmatched path is allowed by default", () => {
  const parsed = parseRobotsTxt(["User-agent: *", "Disallow: /private/"].join("\n"));
  assert.equal(pathAllowedBy(parsed, "/public/").allowed, true);
  assert.equal(pathAllowedBy(parsed, "/public/").rule, null);
});

test("an empty robots.txt allows everything and lists no sitemaps", () => {
  const parsed = parseRobotsTxt("");
  assert.deepEqual(parsed.directives, []);
  assert.deepEqual(parsed.sitemaps, []);
  assert.equal(pathAllowedBy(parsed, "/anything/").allowed, true);
});

test("identifyHost returns null for a host it has no specific knowledge of", () => {
  assert.equal(identifyHost("example.com"), null);
  assert.equal(identifyHost("cdn.example.net"), null);
  assert.equal(identifyHost("acme.github.io").id, "github-pages");
  assert.equal(identifyHost("acme.gitlab.io").id, "gitlab-pages");
});

// ------------------------------------------------- dogfooded worked example

test("the portfolio's own published catalogue reproduces the documented defect", () => {
  // This portfolio measured exactly this failure on its own site (see
  // `platform/ci/pages_state.py`'s `indexing` row, which reports
  // `subpath-robots`). Asserting it here keeps the tool's headline claim
  // pinned to a real, checkable instance rather than a constructed one.
  const report = assess({
    siteUrl: "https://duncan-haywood.github.io/monorepo-projects/",
    publishedRobots: [
      "User-agent: *",
      "Allow: /",
      "",
      "Sitemap: https://duncan-haywood.github.io/monorepo-projects/sitemap.xml",
    ].join("\n"),
  });
  assert.equal(report.verdict, "does-not-govern");
  assert.equal(report.site.governingRobotsUrl, "https://duncan-haywood.github.io/robots.txt");
  assert.ok(report.findings.some((f) => f.id === "sitemap-never-discovered"));
  assert.ok(report.findings.some((f) => f.id === "inert-sitemap-line"));
});
