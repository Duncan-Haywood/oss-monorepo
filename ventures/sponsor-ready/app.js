// DOM + GitHub API orchestration. Depends on scoring.js's globals (scoreRepo)
// being loaded first via a plain <script> tag — no bundler, no build step.

const GITHUB_API = "https://api.github.com";
const SPONSORSHIP_KEYWORDS = ["sponsor", "sponsoring", "donate", "funding", "buy me a coffee", "ko-fi", "patreon", "open collective"];
const RATE_LIMIT_ERROR =
  "GitHub's public API rate limit was hit. This tool makes unauthenticated requests, capped at 60/hour per visitor IP — try again in a few minutes.";
const NETWORK_ERROR =
  "Could not reach api.github.com. Check your connection — a VPN, corporate proxy, or content blocker can block requests to GitHub's API.";

// Usage counting lives in usage.js (loaded first). DNT/GPC and the page
// opt-out skip the write entirely. Never store which repo was scanned.
function track(eventName) {
  if (typeof recordUsage === "function") recordUsage(eventName);
}

function parseRepoInput(raw) {
  const trimmed = raw.trim().replace(/\.git$/, "");
  const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+?)\/?$/i);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };
  return null;
}

async function fetchJson(path) {
  let res;
  try {
    res = await fetch(`${GITHUB_API}${path}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch {
    // `fetch` rejects rather than resolving for a dropped connection, a
    // blocked request, or a proxy that strips CORS headers. Reported as a
    // distinct outcome so every caller can say *why* the scan stopped.
    //
    // Deliberately NOT degraded to "this file is absent". A blocked
    // FUNDING.yml lookup scored as "no funding file" would tell someone who
    // has one to go add it — a confidently wrong checklist is worse than an
    // honest failure, and this tool's whole output is a list of things to fix.
    return { ok: false, status: 0, data: null, networkError: true };
  }
  if (res.status === 404) return { ok: false, status: 404, data: null };
  if (!res.ok) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    return { ok: false, status: res.status, data: null, rateLimited: remaining === "0" };
  }
  return { ok: true, status: res.status, data: await res.json() };
}

function decodeBase64Content(contentsResponse) {
  if (!contentsResponse?.data?.content) return "";
  try {
    return atob(contentsResponse.data.content.replace(/\n/g, ""));
  } catch {
    return "";
  }
}

function containsSponsorshipAsk(text) {
  const lower = text.toLowerCase();
  return SPONSORSHIP_KEYWORDS.some((kw) => lower.includes(kw));
}

function stripUnquotedYamlComment(value) {
  const trimmed = value.trim();
  // Quoted scalars keep `#` (custom URLs, labels). GitHub's empty
  // FUNDING.yml scaffold is unquoted: `github: # Replace with…`.
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed;
  }
  const commentAt = trimmed.search(/(^|\s)#/);
  return commentAt === -1 ? trimmed : trimmed.slice(0, commentAt);
}

function fundingYmlHasEntries(yamlText) {
  // FUNDING.yml is a flat map of platform -> username(s). A non-empty,
  // non-comment, non-blank line with a value after the colon is enough
  // signal without a full YAML parser.
  return yamlText.split("\n").some((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return false;
    const [, value] = trimmed.split(/:(.*)/s);
    if (!value) return false;
    const meaningful = stripUnquotedYamlComment(value).trim();
    return Boolean(meaningful.length > 0 && meaningful !== "[]" && meaningful !== "''" && meaningful !== '""');
  });
}

// Fetches and normalizes everything scoreRepo() needs. Throws on an unknown
// repo (404 on the base lookup), a mid-scan rate limit, or an unreachable API.
//
// A sub-resource that answers 404 degrades to "not present" — that is a real
// answer from GitHub and means the file genuinely is not there. A sub-resource
// we could not reach at all does not: it is indistinguishable from absent, and
// guessing "absent" would put "add a FUNDING.yml" on the checklist of someone
// who already has one.
async function fetchRepoFacts(owner, repo) {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const repoRes = await fetchJson(base);
  if (repoRes.rateLimited) {
    throw new Error(RATE_LIMIT_ERROR);
  }
  if (repoRes.networkError) {
    throw new Error(NETWORK_ERROR);
  }
  if (!repoRes.ok) {
    throw new Error(repoRes.status === 404 ? `No public repo found at ${owner}/${repo}.` : `GitHub API returned an unexpected error (status ${repoRes.status}).`);
  }
  const repoData = repoRes.data;

  const [communityRes, fundingRes, fundingRootRes, readmeRes] = await Promise.all([
    fetchJson(`${base}/community/profile`),
    fetchJson(`${base}/contents/.github/FUNDING.yml`),
    fetchJson(`${base}/contents/FUNDING.yml`),
    fetchJson(`${base}/readme`),
  ]);

  if ([communityRes, fundingRes, fundingRootRes, readmeRes].some((r) => r.rateLimited)) {
    throw new Error(RATE_LIMIT_ERROR);
  }
  if ([communityRes, fundingRes, fundingRootRes, readmeRes].some((r) => r.networkError)) {
    throw new Error(NETWORK_ERROR);
  }

  // Repo-level FUNDING.yml wins. If the scanned repo has none, GitHub still
  // shows the Sponsor button from the account's public `.github` default file
  // (organizations and users).
  let fundingRes2 = fundingRes.ok ? fundingRes : fundingRootRes;
  if (!fundingRes2.ok && repo !== ".github") {
    const orgGithub = `/repos/${encodeURIComponent(owner)}/.github`;
    const [orgFundingRes, orgFundingRootRes] = await Promise.all([
      fetchJson(`${orgGithub}/contents/.github/FUNDING.yml`),
      fetchJson(`${orgGithub}/contents/FUNDING.yml`),
    ]);
    if ([orgFundingRes, orgFundingRootRes].some((r) => r.rateLimited)) {
      throw new Error(RATE_LIMIT_ERROR);
    }
    if ([orgFundingRes, orgFundingRootRes].some((r) => r.networkError)) {
      throw new Error(NETWORK_ERROR);
    }
    fundingRes2 = orgFundingRes.ok ? orgFundingRes : orgFundingRootRes;
  }
  const fundingText = fundingRes2.ok ? decodeBase64Content(fundingRes2) : "";
  const readmeText = readmeRes.ok ? decodeBase64Content(readmeRes) : "";

  const community = communityRes.ok ? communityRes.data : null;

  return {
    repo: {
      description: repoData.description || "",
      homepage: repoData.homepage || "",
      topics: Array.isArray(repoData.topics) ? repoData.topics : [],
      hasLicense: Boolean(repoData.license),
      pushedAt: repoData.pushed_at || null,
      archived: Boolean(repoData.archived),
    },
    community: {
      // `code_of_conduct` is recognized-template metadata and can be null for
      // a custom file; `code_of_conduct_file` is the actual community-health file.
      hasCodeOfConduct: Boolean(community?.files?.code_of_conduct_file || community?.files?.code_of_conduct),
      hasContributing: Boolean(community?.files?.contributing),
      hasIssueTemplate: Boolean(community?.files?.issue_template),
      hasLicenseFile: Boolean(community?.files?.license),
    },
    funding: {
      present: fundingRes2.ok,
      hasEntries: fundingRes2.ok && fundingYmlHasEntries(fundingText),
    },
    readme: {
      present: readmeRes.ok,
      mentionsSponsorship: readmeRes.ok && containsSponsorshipAsk(readmeText),
      lengthChars: readmeText.length,
    },
  };
}

function renderResults(container, { owner, repo, score, maxScore, results, archived }) {
  const pct = Math.round((score / maxScore) * 100);
  const band = pct >= 80 ? "good" : pct >= 50 ? "mid" : "low";
  const summary = formatScoreSummary({ owner, repo, score, maxScore, results, archived });

  const checklistHtml = results
    .map(
      (r) => `
      <li class="check ${r.pass ? "pass" : "fail"}">
        <div class="check-head">
          <span class="check-icon" aria-hidden="true">${r.pass ? "✓" : "✗"}</span>
          <span class="check-label">${escapeHtml(r.label)}</span>
          <span class="check-weight">${r.weight} pts</span>
        </div>
        ${r.pass ? "" : `<p class="check-why">${escapeHtml(r.why)}</p><p class="check-fix"><strong>Fix:</strong> ${escapeHtml(r.fix)}</p>`}
      </li>`
    )
    .join("");

  const archivedNote = archived
    ? `<p class="archived-note" role="status">This repository is marked archived. Sponsors typically fund projects that look maintained — the activity check still uses the last push date.</p>`
    : "";

  container.innerHTML = `
    <div class="score-card ${band}">
      <div class="score-number">${pct}<span class="score-suffix">/100</span></div>
      <div class="score-repo">${escapeHtml(owner)}/${escapeHtml(repo)}</div>
    </div>
    ${archivedNote}
    <ul class="checklist">${checklistHtml}</ul>
    <div class="summary-actions">
      <button type="button" id="copy-summary">Copy ranked list</button>
      <span id="copy-status" role="status"></span>
    </div>
  `;

  const copyBtn = container.querySelector("#copy-summary");
  const status = container.querySelector("#copy-status");
  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(summary);
      if (status) status.textContent = "Copied.";
      track("summary_copied");
    } catch {
      if (status) status.textContent = "Copy failed — select the list above instead.";
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// The repo this tool lives in. Used as the worked example rather than a
// well-known third-party project: the page would otherwise open by publicly
// scoring somebody else's work, and a low score on a stranger's repo reads as a
// judgement the tool has no standing to make. Scoring ourselves does not.
const EXAMPLE_REPO = "Duncan-Haywood/monorepo-projects";

function initApp() {
  const form = document.getElementById("scan-form");
  const input = document.getElementById("repo-input");
  const results = document.getElementById("results");
  const errorBox = document.getElementById("error");
  const loading = document.getElementById("loading");
  const optout = document.getElementById("optout");

  if (optout && typeof isUsageEnabled === "function" && typeof setUsageEnabled === "function") {
    optout.checked = !isUsageEnabled();
    optout.addEventListener("change", () => setUsageEnabled(!optout.checked));
  }

  // Goes through requestSubmit rather than calling the scan directly, so the
  // example takes the same validation, error, rate-limit, and tracking path as
  // anything a visitor types. An example with its own code path is an example
  // that can pass while the real thing is broken.
  const example = document.getElementById("example-repo");
  example?.addEventListener("click", () => {
    input.value = EXAMPLE_REPO;
    track("example_used");
    form.requestSubmit();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    results.innerHTML = "";

    const parsed = parseRepoInput(input.value);
    if (!parsed) {
      errorBox.textContent = "Enter a public repo as owner/name or a github.com URL.";
      errorBox.hidden = false;
      return;
    }

    loading.hidden = false;
    track("scan_started");
    try {
      const facts = await fetchRepoFacts(parsed.owner, parsed.repo);
      const scored = scoreRepo(facts);
      renderResults(results, { ...parsed, ...scored, archived: Boolean(facts.repo?.archived) });
      track("scan_completed");
    } catch (err) {
      errorBox.textContent = err.message || "Something went wrong fetching that repo.";
      errorBox.hidden = false;
      track("scan_failed");
    } finally {
      loading.hidden = true;
    }
  });
}

if (typeof window !== "undefined") {
  document.addEventListener("DOMContentLoaded", initApp);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseRepoInput, fundingYmlHasEntries, containsSponsorshipAsk, fetchRepoFacts, renderResults };
}
