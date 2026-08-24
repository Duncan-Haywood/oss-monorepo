const test = require("node:test");
const assert = require("node:assert/strict");
const { parseRepoInput, fundingYmlHasEntries, containsSponsorshipAsk } = require("./app.js");

test("parseRepoInput accepts owner/repo", () => {
  assert.deepEqual(parseRepoInput("octocat/hello-world"), { owner: "octocat", repo: "hello-world" });
});

test("parseRepoInput accepts a full github.com URL, with or without trailing slash", () => {
  assert.deepEqual(parseRepoInput("https://github.com/octocat/hello-world"), { owner: "octocat", repo: "hello-world" });
  assert.deepEqual(parseRepoInput("https://github.com/octocat/hello-world/"), { owner: "octocat", repo: "hello-world" });
});

test("parseRepoInput strips a trailing .git", () => {
  assert.deepEqual(parseRepoInput("https://github.com/octocat/hello-world.git"), { owner: "octocat", repo: "hello-world" });
});

test("parseRepoInput rejects garbage input", () => {
  assert.equal(parseRepoInput("not a repo"), null);
  assert.equal(parseRepoInput(""), null);
  assert.equal(parseRepoInput("https://example.com/foo/bar"), null);
});

test("fundingYmlHasEntries rejects an all-comment or empty file", () => {
  assert.equal(fundingYmlHasEntries("# github: [username]\n"), false);
  assert.equal(fundingYmlHasEntries(""), false);
  assert.equal(fundingYmlHasEntries("\n\n"), false);
});

test("fundingYmlHasEntries accepts a real entry", () => {
  assert.equal(fundingYmlHasEntries("github: [octocat]\n"), true);
  assert.equal(fundingYmlHasEntries("custom: https://example.com/donate\n"), true);
});

test("fundingYmlHasEntries rejects a key present with an empty value", () => {
  assert.equal(fundingYmlHasEntries("github: []\n"), false);
  assert.equal(fundingYmlHasEntries("custom: ''\n"), false);
});

test("containsSponsorshipAsk is case-insensitive and matches common phrasing", () => {
  assert.equal(containsSponsorshipAsk("Please consider Sponsoring this project"), true);
  assert.equal(containsSponsorshipAsk("Support us on Ko-fi"), true);
  assert.equal(containsSponsorshipAsk("This is a README with nothing relevant"), false);
});
