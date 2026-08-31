// Pure scoring logic — no network, no DOM. Testable directly under `node --test`
// and loadable as a plain <script> in the browser (defines globals, no bundler).
//
// `facts` is the normalized shape app.js builds from GitHub API responses:
//
// {
//   repo: { description, homepage, topics, hasLicense, pushedAt, archived },
//   community: { hasCodeOfConduct, hasContributing, hasIssueTemplate, hasLicenseFile },
//   funding: { present, hasEntries },
//   readme: { present, mentionsSponsorship, lengthChars },
// }

const RECENT_ACTIVITY_DAYS = 90;
const README_SUBSTANTIAL_CHARS = 500;
const MIN_TOPICS = 3;

// Ordered by weight, descending — the default "fix this first" order.
const CHECKS = [
  {
    id: "funding_config",
    weight: 30,
    label: "A valid FUNDING.yml is present",
    why: "This is the file that turns on the \"Sponsor\" button on your repo page — without it, visitors have no path to sponsor you at all.",
    fix: "Add .github/FUNDING.yml with at least one funding platform (github: [your-username] is the simplest).",
    test: (f) => Boolean(f.funding?.present && f.funding?.hasEntries),
  },
  {
    id: "recent_activity",
    weight: 12,
    label: `Pushed to within the last ${RECENT_ACTIVITY_DAYS} days`,
    why: "Sponsors fund projects that look maintained. A stale push date is the fastest way to read as abandoned.",
    fix: "Ship a commit — even a small docs or dependency update signals the project is alive.",
    test: (f) => isRecent(f.repo?.pushedAt, RECENT_ACTIVITY_DAYS),
  },
  {
    id: "funding_mentioned",
    weight: 10,
    label: "README makes a visible sponsorship ask",
    why: "A funding button nobody sees converts nobody. Repos that explicitly ask, with why the project needs support, get more sponsors than ones that just enable the button.",
    fix: "Add a short \"Support this project\" section near the top of your README linking to your Sponsors page.",
    test: (f) => Boolean(f.readme?.present && f.readme?.mentionsSponsorship),
  },
  {
    id: "readme_substantial",
    weight: 10,
    label: "README is a real onboarding doc, not a stub",
    why: "A visitor decides whether to trust and fund a project in the first screen of the README. A stub reads as unfinished.",
    fix: "Cover what the project does, why it exists, and how to get started in the first few hundred words.",
    test: (f) => Boolean(f.readme?.present && (f.readme?.lengthChars ?? 0) >= README_SUBSTANTIAL_CHARS),
  },
  {
    id: "description_set",
    weight: 8,
    label: "Repo has a description",
    why: "The one-line description is what shows up in search results and topic listings — the first thing a potential sponsor reads.",
    fix: "Set a description in the repo's \"About\" panel.",
    test: (f) => Boolean(f.repo?.description && f.repo.description.trim().length > 0),
  },
  {
    id: "topics_set",
    weight: 8,
    label: `At least ${MIN_TOPICS} topics set`,
    why: "Topics are how people who don't already know your project's name find it via GitHub Topics search.",
    fix: "Add topics in the \"About\" panel that describe what the project does and who it's for.",
    test: (f) => Array.isArray(f.repo?.topics) && f.repo.topics.length >= MIN_TOPICS,
  },
  {
    id: "license_present",
    weight: 8,
    label: "A license file is present",
    why: "Companies and serious individual sponsors generally will not fund — or even depend on — unlicensed code.",
    fix: "Add a LICENSE file. GitHub's repo creation UI can generate one from a template.",
    test: (f) => Boolean(f.repo?.hasLicense || f.community?.hasLicenseFile),
  },
  {
    id: "contributing_guide",
    weight: 6,
    label: "CONTRIBUTING guide is present",
    why: "Sponsors who might also contribute code look for a clear entry point. Its absence reads as \"outside contributions not really wanted.\"",
    fix: "Add a CONTRIBUTING.md describing how to file issues and submit changes.",
    test: (f) => Boolean(f.community?.hasContributing),
  },
  {
    id: "homepage_or_demo",
    weight: 4,
    label: "A homepage / live demo link is set",
    why: "\"Show, don't tell\" — a working demo or docs site converts skeptical visitors faster than a README alone.",
    fix: "Set the repo's homepage URL in the \"About\" panel to a demo, docs site, or landing page.",
    test: (f) => Boolean(f.repo?.homepage && f.repo.homepage.trim().length > 0),
  },
  {
    id: "code_of_conduct",
    weight: 4,
    label: "A CODE_OF_CONDUCT is present",
    why: "A published code of conduct signals the maintainer is running the project deliberately, which correlates with the other signals here.",
    fix: "Add a CODE_OF_CONDUCT.md — GitHub's community health template is a reasonable default.",
    test: (f) => Boolean(f.community?.hasCodeOfConduct),
  },
];

function isRecent(isoDate, withinDays) {
  if (!isoDate) return false;
  const pushed = new Date(isoDate).getTime();
  if (Number.isNaN(pushed)) return false;
  const ageMs = Date.now() - pushed;
  return ageMs >= 0 && ageMs <= withinDays * 24 * 60 * 60 * 1000;
}

// Returns { score, maxScore, results: [{ ...check, pass }] } sorted with
// failing, highest-weight checks first — the "fix this first" order.
function scoreRepo(facts) {
  const results = CHECKS.map((check) => ({
    id: check.id,
    weight: check.weight,
    label: check.label,
    why: check.why,
    fix: check.fix,
    pass: Boolean(check.test(facts)),
  }));

  const score = results.filter((r) => r.pass).reduce((sum, r) => sum + r.weight, 0);
  const maxScore = CHECKS.reduce((sum, c) => sum + c.weight, 0);

  const ranked = [...results].sort((a, b) => {
    if (a.pass !== b.pass) return a.pass ? 1 : -1; // failing first
    return b.weight - a.weight; // then highest-impact first
  });

  return { score, maxScore, results: ranked };
}

function formatScoreSummary({ owner, repo, score, maxScore, results, archived }) {
  const pct = maxScore ? Math.round((score / maxScore) * 100) : 0;
  const lines = [`Sponsor Ready: ${owner}/${repo} — ${pct}/100 (${score}/${maxScore} pts)`];
  if (archived) {
    lines.push("Note: this repository is archived. Recent activity still matters to sponsors.");
  }
  const failing = (results || []).filter((r) => !r.pass);
  if (failing.length) {
    lines.push("", "Fix first:");
    for (const r of failing) {
      lines.push(`- [${r.weight} pts] ${r.label}`);
      lines.push(`  ${r.fix}`);
    }
  } else {
    lines.push("", "Every checklist item is present.");
  }
  return lines.join("\n");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { scoreRepo, CHECKS, isRecent, formatScoreSummary };
}
