const test = require("node:test");
const assert = require("node:assert/strict");
const { parseRepoInput, fundingYmlHasEntries, containsSponsorshipAsk, fetchRepoFacts, repoFromHash, buildShareUrl } = require("./app.js");

test("repoFromHash reads a shared repo out of the fragment", () => {
  assert.equal(repoFromHash("#repo=octocat%2Fhello-world"), "octocat/hello-world");
  assert.equal(repoFromHash("repo=octocat%2Fhello-world"), "octocat/hello-world");
});

test("repoFromHash returns null when there is nothing to share", () => {
  assert.equal(repoFromHash(""), null);
  assert.equal(repoFromHash(undefined), null);
  assert.equal(repoFromHash("#other=1"), null);
});

test("buildShareUrl round-trips through repoFromHash", () => {
  const url = buildShareUrl("https://example.com", "/sponsor-ready/", "octocat", "hello-world");
  assert.equal(url, "https://example.com/sponsor-ready/#repo=octocat%2Fhello-world");
  const hash = url.slice(url.indexOf("#"));
  assert.equal(repoFromHash(hash), "octocat/hello-world");
});

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

test("fundingYmlHasEntries rejects GitHub's empty FUNDING.yml scaffold", () => {
  // Official template: every platform key is followed by `# Replace with…`.
  const scaffold = `# These are supported funding model platforms

github: # Replace with up to 4 GitHub Sponsors-enabled usernames e.g., [user1, user2]
patreon: # Replace with a single Patreon username
open_collective: # Replace with a single Open Collective username
ko_fi: # Replace with a single Ko-fi username
custom: # Replace with up to 4 custom sponsorship URLs e.g., ['link1', 'link2']
`;
  assert.equal(fundingYmlHasEntries(scaffold), false);
});

test("fundingYmlHasEntries still accepts a real value with a trailing comment", () => {
  assert.equal(fundingYmlHasEntries("github: [octocat] # Sponsors\n"), true);
});

test("containsSponsorshipAsk is case-insensitive and matches common phrasing", () => {
  assert.equal(containsSponsorshipAsk("Please consider Sponsoring this project"), true);
  assert.equal(containsSponsorshipAsk("Support us on Ko-fi"), true);
  assert.equal(containsSponsorshipAsk("This is a README with nothing relevant"), false);
});

function jsonResponse(status, body, remaining) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === "x-ratelimit-remaining" ? remaining : null) },
    json: async () => body,
  };
}

test("fetchRepoFacts throws when a follow-up request is rate-limited", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/repos/octocat/hello-world")) {
      return jsonResponse(200, { description: "hi", homepage: "", topics: [], license: { key: "mit" }, pushed_at: "2026-08-01T00:00:00Z", archived: false }, "10");
    }
    return jsonResponse(403, { message: "API rate limit exceeded" }, "0");
  };
  try {
    await assert.rejects(() => fetchRepoFacts("octocat", "hello-world"), /rate limit/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchRepoFacts treats a 404 FUNDING.yml as missing, not rate-limited", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/repos/octocat/hello-world")) {
      return jsonResponse(200, { description: "hi", homepage: "", topics: [], license: { key: "mit" }, pushed_at: "2026-08-01T00:00:00Z", archived: false }, "10");
    }
    if (path.includes("/community/profile")) {
      return jsonResponse(200, { files: {} }, "9");
    }
    if (path.includes("/readme")) {
      return jsonResponse(200, { content: Buffer.from("# Hello").toString("base64") }, "8");
    }
    return jsonResponse(404, { message: "Not Found" }, "7");
  };
  try {
    const facts = await fetchRepoFacts("octocat", "hello-world");
    assert.equal(facts.funding.present, false);
    assert.equal(facts.funding.hasEntries, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchRepoFacts treats a custom CoC file as present when GitHub has no template metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/repos/octocat/hello-world")) {
      return jsonResponse(200, { description: "hi", homepage: "", topics: [], license: { key: "mit" }, pushed_at: "2026-08-01T00:00:00Z", archived: false, owner: { type: "User" } }, "10");
    }
    if (path.includes("/community/profile")) {
      return jsonResponse(200, {
        files: {
          code_of_conduct: null,
          code_of_conduct_file: { url: "https://api.github.com/repos/octocat/hello-world/contents/CODE_OF_CONDUCT.md", html_url: "https://github.com/octocat/hello-world/blob/main/CODE_OF_CONDUCT.md" },
        },
      }, "9");
    }
    if (path.includes("/readme")) {
      return jsonResponse(200, { content: Buffer.from("# Hello").toString("base64") }, "8");
    }
    return jsonResponse(404, { message: "Not Found" }, "7");
  };
  try {
    const facts = await fetchRepoFacts("octocat", "hello-world");
    assert.equal(facts.community.hasCodeOfConduct, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchRepoFacts uses the org .github default FUNDING.yml when the scanned repo has none", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/repos/acme/widget")) {
      return jsonResponse(200, { description: "hi", homepage: "", topics: [], license: { key: "mit" }, pushed_at: "2026-08-01T00:00:00Z", archived: false, owner: { login: "acme", type: "Organization" } }, "10");
    }
    if (path.includes("/community/profile")) {
      return jsonResponse(200, { files: {} }, "9");
    }
    if (path.includes("/readme")) {
      return jsonResponse(200, { content: Buffer.from("# Hello").toString("base64") }, "8");
    }
    if (path.includes("/repos/acme/.github/contents/.github/FUNDING.yml")) {
      return jsonResponse(200, { content: Buffer.from("github: [acme]\n").toString("base64") }, "7");
    }
    return jsonResponse(404, { message: "Not Found" }, "6");
  };
  try {
    const facts = await fetchRepoFacts("acme", "widget");
    assert.equal(facts.funding.present, true);
    assert.equal(facts.funding.hasEntries, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchRepoFacts uses the user .github default FUNDING.yml when the scanned repo has none", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/repos/octocat/hello-world")) {
      return jsonResponse(200, { description: "hi", homepage: "", topics: [], license: { key: "mit" }, pushed_at: "2026-08-01T00:00:00Z", archived: false, owner: { login: "octocat", type: "User" } }, "10");
    }
    if (path.includes("/community/profile")) {
      return jsonResponse(200, { files: {} }, "9");
    }
    if (path.includes("/readme")) {
      return jsonResponse(200, { content: Buffer.from("# Hello").toString("base64") }, "8");
    }
    if (path.includes("/repos/octocat/.github/contents/.github/FUNDING.yml")) {
      return jsonResponse(200, { content: Buffer.from("github: [octocat]\n").toString("base64") }, "7");
    }
    return jsonResponse(404, { message: "Not Found" }, "6");
  };
  try {
    const facts = await fetchRepoFacts("octocat", "hello-world");
    assert.equal(facts.funding.present, true);
    assert.equal(facts.funding.hasEntries, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchRepoFacts does not recurse into .github/.github when scanning the .github repo itself", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    const path = String(url);
    requested.push(path);
    if (path.endsWith("/repos/octocat/.github")) {
      return jsonResponse(200, { description: "hi", homepage: "", topics: [], license: { key: "mit" }, pushed_at: "2026-08-01T00:00:00Z", archived: false, owner: { login: "octocat", type: "User" } }, "10");
    }
    if (path.includes("/community/profile")) {
      return jsonResponse(200, { files: {} }, "9");
    }
    if (path.includes("/readme")) {
      return jsonResponse(200, { content: Buffer.from("# Hello").toString("base64") }, "8");
    }
    return jsonResponse(404, { message: "Not Found" }, "7");
  };
  try {
    const facts = await fetchRepoFacts("octocat", ".github");
    assert.equal(facts.funding.present, false);
    assert.equal(requested.filter((p) => p.includes("/repos/octocat/.github/contents")).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the example repo parses through the same input path a visitor types", () => {
  // The example is fed to requestSubmit(), so it must survive parseRepoInput
  // exactly as pasted text would. A malformed constant would fail only at
  // runtime, in the one flow a first-time visitor is most likely to use.
  assert.deepStrictEqual(parseRepoInput("Duncan-Haywood/monorepo-projects"), {
    owner: "Duncan-Haywood",
    repo: "monorepo-projects",
  });
});

test("an unreachable API is reported, never scored as a missing file", async () => {
  // The regression this guards: a blocked FUNDING.yml request scored as
  // "no funding file" would put "add a FUNDING.yml" on the checklist of a
  // maintainer who already has one. Silence is not evidence of absence.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/repos/octocat/hello-world")) {
      return jsonResponse(200, { description: "hi", homepage: "", topics: [], license: { key: "mit" }, pushed_at: "2026-08-01T00:00:00Z", archived: false }, "10");
    }
    if (path.includes("/community/profile")) return jsonResponse(200, { files: {} }, "9");
    if (path.includes("/readme")) return jsonResponse(200, { content: Buffer.from("# Hello").toString("base64") }, "8");
    throw new TypeError("Failed to fetch"); // what a blocked request looks like
  };
  try {
    await assert.rejects(() => fetchRepoFacts("octocat", "hello-world"), /Could not reach api\.github\.com/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unreachable base lookup names the cause instead of leaking 'Failed to fetch'", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  try {
    await assert.rejects(
      () => fetchRepoFacts("octocat", "hello-world"),
      (err) => /Could not reach api\.github\.com/.test(err.message) && /proxy|blocker/i.test(err.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
