const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreRepo, CHECKS, isRecent, formatScoreSummary } = require("./scoring.js");

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

const fullyConfigured = {
  repo: {
    description: "A tool that does something useful.",
    homepage: "https://example.com",
    topics: ["cli", "developer-tools", "productivity"],
    hasLicense: true,
    pushedAt: daysAgo(1),
    archived: false,
  },
  community: {
    hasCodeOfConduct: true,
    hasContributing: true,
    hasIssueTemplate: true,
    hasLicenseFile: true,
  },
  funding: { present: true, hasEntries: true },
  readme: {
    present: true,
    mentionsSponsorship: true,
    lengthChars: 4000,
  },
};

const nothingConfigured = {
  repo: {
    description: "",
    homepage: "",
    topics: [],
    hasLicense: false,
    pushedAt: daysAgo(400),
    archived: false,
  },
  community: {
    hasCodeOfConduct: false,
    hasContributing: false,
    hasIssueTemplate: false,
    hasLicenseFile: false,
  },
  funding: { present: false, hasEntries: false },
  readme: {
    present: false,
    mentionsSponsorship: false,
    lengthChars: 0,
  },
};

test("a fully-configured repo scores the maximum", () => {
  const { score, maxScore, results } = scoreRepo(fullyConfigured);
  assert.equal(score, maxScore);
  assert.ok(results.every((r) => r.pass));
});

test("an unconfigured repo scores zero and every check fails", () => {
  const { score, results } = scoreRepo(nothingConfigured);
  assert.equal(score, 0);
  assert.ok(results.every((r) => !r.pass));
});

test("weights sum to 100 so the score reads as a percentage", () => {
  const total = CHECKS.reduce((sum, c) => sum + c.weight, 0);
  assert.equal(total, 100);
});

test("results are ranked failing-first, highest weight first", () => {
  const facts = {
    ...nothingConfigured,
    funding: { present: true, hasEntries: true }, // the highest-weight check now passes
  };
  const { results } = scoreRepo(facts);
  assert.equal(results[0].pass, false);
  assert.ok(results[0].weight >= results[1].weight || results[1].pass === false);
  const fundingResult = results.find((r) => r.id === "funding_config");
  assert.equal(fundingResult.pass, true);
  // A passed check is sorted after all failing ones.
  const firstPassIndex = results.findIndex((r) => r.pass);
  const anyFailAfter = results.slice(firstPassIndex).some((r) => !r.pass);
  assert.equal(anyFailAfter, false);
});

test("FUNDING.yml present but empty does not pass the funding_config check", () => {
  const facts = { ...nothingConfigured, funding: { present: true, hasEntries: false } };
  const { results } = scoreRepo(facts);
  const fundingResult = results.find((r) => r.id === "funding_config");
  assert.equal(fundingResult.pass, false);
});

test("a repo with a license field but no community-profile license file still passes license_present", () => {
  const facts = {
    ...nothingConfigured,
    repo: { ...nothingConfigured.repo, hasLicense: true },
    community: { ...nothingConfigured.community, hasLicenseFile: false },
  };
  const { results } = scoreRepo(facts);
  assert.equal(results.find((r) => r.id === "license_present").pass, true);
});

test("isRecent handles missing, malformed, and future dates without throwing", () => {
  assert.equal(isRecent(null, 90), false);
  assert.equal(isRecent(undefined, 90), false);
  assert.equal(isRecent("not-a-date", 90), false);
  assert.equal(isRecent(daysAgo(-5), 90), false); // pushed_at in the future — reject rather than pass silently
  assert.equal(isRecent(daysAgo(10), 90), true);
  assert.equal(isRecent(daysAgo(200), 90), false);
});

test("a repo missing the community/profile response entirely (facts.community undefined) does not throw", () => {
  const facts = { ...nothingConfigured, community: undefined };
  assert.doesNotThrow(() => scoreRepo(facts));
});

test("formatScoreSummary lists failing checks first and never names a recommended action as required", () => {
  const { results, score, maxScore } = scoreRepo(nothingConfigured);
  const text = formatScoreSummary({
    owner: "octocat",
    repo: "hello-world",
    score,
    maxScore,
    results,
  });
  assert.match(text, /Sponsor Ready: octocat\/hello-world — 0\/100/);
  assert.match(text, /Fix first:/);
  assert.match(text, /FUNDING\.yml/);
  assert.doesNotMatch(text, /you should turn Sponsors on|must enable sponsors/i);
});

test("formatScoreSummary notes an archived repo without changing the score", () => {
  const { results, score, maxScore } = scoreRepo(fullyConfigured);
  const text = formatScoreSummary({
    owner: "octocat",
    repo: "hello-world",
    score,
    maxScore,
    results,
    archived: true,
  });
  assert.match(text, /Every checklist item is present/);
  assert.match(text, /archived/);
});
