// DOM + GitHub API orchestration. Depends on scoring.js's globals (scoreRepo)
// being loaded first via a plain <script> tag — no bundler, no build step.

const GITHUB_API = "https://api.github.com";
const SPONSORSHIP_KEYWORDS = ["sponsor", "sponsoring", "donate", "funding", "buy me a coffee", "ko-fi", "patreon", "open collective"];
const RATE_LIMIT_ERROR =
  "GitHub's public API rate limit was hit. This tool makes unauthenticated requests, capped at 60/hour per visitor IP — try again in a few minutes.";

// Privacy-conscious usage counting, per portfolio/usage/README.md:
// aggregate-only, no per-user record, local-first, honours DNT/GPC.
//
// Local-first: always keep a same-browser count in localStorage so a
// visitor can see their own usage; never anything that could re-identify
// them. Remote reporting is off unless `window.SPONSOR_READY_ANALYTICS_ENDPOINT`
// is set (e.g. by a deploy-time snippet in index.html), and even then sends
// only an event name and a day — never the repo scanned, never an IP or
// user-agent record on our side beyond what the transport itself carries.
function track(eventName) {
  try {
    const dntOn = navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl === true;

    const key = "sponsor-ready:usage-counts";
    const counts = JSON.parse(localStorage.getItem(key) || "{}");
    counts[eventName] = (counts[eventName] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(counts));

    if (dntOn) return;
    const endpoint = window.SPONSOR_READY_ANALYTICS_ENDPOINT;
    if (!endpoint) return;
    const day = new Date().toISOString().slice(0, 10);
    navigator.sendBeacon?.(
      endpoint,
      new Blob([JSON.stringify({ event: eventName, day })], { type: "application/json" })
    );
  } catch {
    // Usage counting must never break the tool.
  }
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
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
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

// Fetches and normalizes everything scoreRepo() needs. Throws on
// network failure, an unknown repo (404 on the base repo lookup), or a
// mid-scan rate limit. Individual missing sub-resources degrade to
// "not present" rather than failing the whole check.
async function fetchRepoFacts(owner, repo) {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const repoRes = await fetchJson(base);
  if (repoRes.rateLimited) {
    throw new Error(RATE_LIMIT_ERROR);
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

  // Repo-level FUNDING.yml wins. If the scanned repo has none, GitHub still
  // shows the Sponsor button from the org's public `.github` default file.
  let fundingRes2 = fundingRes.ok ? fundingRes : fundingRootRes;
  if (!fundingRes2.ok && repoData.owner?.type === "Organization" && repo !== ".github") {
    const orgGithub = `/repos/${encodeURIComponent(owner)}/.github`;
    const [orgFundingRes, orgFundingRootRes] = await Promise.all([
      fetchJson(`${orgGithub}/contents/.github/FUNDING.yml`),
      fetchJson(`${orgGithub}/contents/FUNDING.yml`),
    ]);
    if ([orgFundingRes, orgFundingRootRes].some((r) => r.rateLimited)) {
      throw new Error(RATE_LIMIT_ERROR);
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

function renderResults(container, { owner, repo, score, maxScore, results }) {
  const pct = Math.round((score / maxScore) * 100);
  const band = pct >= 80 ? "good" : pct >= 50 ? "mid" : "low";

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

  container.innerHTML = `
    <div class="score-card ${band}">
      <div class="score-number">${pct}<span class="score-suffix">/100</span></div>
      <div class="score-repo">${escapeHtml(owner)}/${escapeHtml(repo)}</div>
    </div>
    <ul class="checklist">${checklistHtml}</ul>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function initApp() {
  const form = document.getElementById("scan-form");
  const input = document.getElementById("repo-input");
  const results = document.getElementById("results");
  const errorBox = document.getElementById("error");
  const loading = document.getElementById("loading");

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
      renderResults(results, { ...parsed, ...scored });
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
  module.exports = { parseRepoInput, fundingYmlHasEntries, containsSponsorshipAsk, fetchRepoFacts };
}
