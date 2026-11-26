// Plain-language help copy: the single source for "?" help tips (components/guide/help-tip.tsx), the
// help center (routes/org/help.tsx) and tour text. Keep it short, concrete and free of jargon; say
// what the user can do about it. Definitions follow docs/GLOSSARY.md.

export const HELP_TERMS = [
  "fit_score",
  "likelihood",
  "expected_value",
  "review_tier",
  "grounding",
  "citation",
  "flag",
  "proposed_fact",
  "confirmed_fact",
  "coverage",
  "automation_level",
  "safety_rails",
] as const;
export type HelpTerm = (typeof HELP_TERMS)[number];

export interface HelpEntry {
  id: HelpTerm;
  /** The concept's name as it appears in the app. */
  term: string;
  /** One or two sentences, shown in the "?" popover. */
  short: string;
  /** A little more detail for the help center (plain text, a few sentences). */
  body: string;
  /** Extra words people might search for. */
  keywords: readonly string[];
  /** Where in the app this lives, under /orgs/{orgId}. */
  path?: string;
}

export const HELP: Record<HelpTerm, HelpEntry> = {
  fit_score: {
    id: "fit_score",
    term: "Fit score",
    short:
      "How well a grant matches your mission, programs, the people you serve and where you work, from 0 to 100. Higher is a better match.",
    body: "We compare the funder's priorities and eligibility rules with your profile, facts and projects. A fit of 70 or more is usually worth a look. Fit says nothing about your chances of winning; that is likelihood.",
    keywords: ["match", "score", "relevance", "0-100"],
    path: "/opportunities",
  },
  likelihood: {
    id: "likelihood",
    term: "Likelihood",
    short:
      "A cautious estimate of your chance of an award if you apply. It is deliberately conservative, especially for competitive federal grants.",
    body: "Likelihood looks at fit, eligibility, the type of funder and how competitive the program is. It is capped by funder type, so even a great federal match rarely shows a high number. Use it to compare grants, not as a promise.",
    keywords: ["chance", "probability", "odds", "win rate"],
    path: "/opportunities",
  },
  expected_value: {
    id: "expected_value",
    term: "Expected value",
    short:
      "Likelihood multiplied by the amount you would ask for. We use it to put the grants most worth your time at the top.",
    body: "A $50,000 grant with a 20% likelihood has an expected value of $10,000. A small grant you are very likely to win can rank above a large long shot. Your matches are sorted by expected value.",
    keywords: ["ranking", "sort", "worth", "value"],
    path: "/opportunities",
  },
  review_tier: {
    id: "review_tier",
    term: "Review tier",
    short:
      "How much human checking a draft gets before it is sent: full review (section by section), one-click approval, or automatic for small low-risk grants you allowed.",
    body: "Large asks, high-likelihood grants and anything with open problems always get full review. One-click means a person reads the summary and flags and approves. Automatic only happens if you turned it on and every safety rail passes.",
    keywords: ["approval", "review", "one click", "full review", "auto"],
    path: "/reviews",
  },
  grounding: {
    id: "grounding",
    term: "Grounding",
    short:
      "A separate check that every claim in a draft is backed by a fact in your fact base. Numbers, dates and amounts must match exactly.",
    body: "After drafting, an independent verifier reads each claim next to the facts it cites. Unsupported claims, mismatched numbers and unanswered questions become flags for you to fix. A draft passes grounding only when nothing is unsupported.",
    keywords: ["verify", "fact check", "accuracy", "hallucination", "honest"],
  },
  citation: {
    id: "citation",
    term: "Citation",
    short:
      "The link from a sentence in a draft to the fact it relies on. Open a citation to see the fact and the exact quote it came from.",
    body: "Every factual sentence lists the facts it uses. If a citation points to a proposed (unconfirmed) fact, the sentence is flagged until someone confirms the fact.",
    keywords: ["source", "reference", "evidence", "quote"],
    path: "/applications",
  },
  flag: {
    id: "flag",
    term: "Flag",
    short:
      "Something in a draft a person needs to look at: an unsupported claim, a number that doesn't match, a missing answer or an unconfirmed fact.",
    body: "Blockers must be resolved before a draft can be approved. Warnings and info are worth a look. Missing-information flags can turn into short interview questions so you can answer them by talking.",
    keywords: ["problem", "issue", "blocker", "warning", "missing"],
    path: "/reviews",
  },
  proposed_fact: {
    id: "proposed_fact",
    term: "Proposed fact",
    short:
      "A fact we pulled from your documents or interviews that nobody has checked yet. Confirm it if it's right, edit it, or reject it.",
    body: "Proposed facts can appear in drafts, but every sentence that relies on one is flagged for review, and autopilot never submits a draft that cites one. Confirming facts is the fastest way to better drafts.",
    keywords: ["unconfirmed", "extracted", "needs review", "pending"],
    path: "/knowledge/facts?status=proposed",
  },
  confirmed_fact: {
    id: "confirmed_fact",
    term: "Confirmed fact",
    short:
      "A fact a person on your team has checked and said is true. Confirmed facts are safe for drafts and for autopilot.",
    body: "Facts you type in yourself are confirmed automatically. If something changes (a new budget, updated numbers), edit the fact or add a new one; the old one is kept as superseded for your records.",
    keywords: ["verified", "approved", "true"],
    path: "/knowledge/facts?status=confirmed",
  },
  coverage: {
    id: "coverage",
    term: "Coverage",
    short:
      "A checklist of what funders usually ask about (mission, programs, outcomes, budget, staff) and how much we know about each.",
    body: "Topics marked missing or thin are where drafts will have gaps. Upload a document that covers them, or do a short interview and we will ask about exactly those topics.",
    keywords: ["gaps", "missing", "checklist", "topics"],
    path: "/knowledge/facts",
  },
  automation_level: {
    id: "automation_level",
    term: "Automation level",
    short:
      "How much we do on our own, from only finding grants, to preparing drafts for you to approve, to submitting small low-risk grants within limits you set.",
    body: "The recommended level prepares drafts and waits for a person to approve every submission. Higher levels need an admin's explicit consent, and you can lower the level at any time.",
    keywords: ["autopilot", "automatic", "settings", "manual", "supervised"],
    path: "/settings/autopilot",
  },
  safety_rails: {
    id: "safety_rails",
    term: "Safety rails",
    short:
      "Rules no automation level can switch off: no unsupported claims, no unconfirmed facts, no open blockers, and a monthly cap on automatic submissions.",
    body: "Even at the highest level, a draft that fails grounding, cites an unconfirmed fact or has an open blocker goes to a person. The first submission to a new funder can also be held for review.",
    keywords: ["limits", "guard", "protection", "cap", "safe"],
    path: "/settings/autopilot",
  },
};

/** Short how-to articles for the help center, beyond the term definitions. */
export interface HelpArticle {
  id: string;
  title: string;
  summary: string;
  /** Plain-text paragraphs. */
  paragraphs: readonly string[];
  keywords: readonly string[];
  path?: string;
}

export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    id: "first-draft",
    title: "From sign-up to your first grounded draft",
    summary: "The shortest path: profile, documents, facts, interview, project, matches, draft.",
    paragraphs: [
      "Grant Autopilot only writes what it can back up from your own material. So the first hour is about giving it that material: a complete profile, a few documents (including a past application if you have one) and a short interview.",
      "Then confirm the facts we extracted, add a project you want funded and shortlist a few matched grants. Start a draft from a shortlisted grant and open it: every claim links to the fact it came from.",
      "The getting-started checklist on your dashboard tracks these steps for you, based on what you've actually done.",
    ],
    keywords: ["getting started", "onboarding", "setup", "checklist", "begin"],
    path: "",
  },
  {
    id: "documents",
    title: "Which documents to upload",
    summary: "Annual reports, budgets, program descriptions and past applications work best.",
    paragraphs: [
      "Upload what you'd hand a new grant writer: your latest annual report, an organizational budget, program descriptions, impact or evaluation summaries and two or three past applications (won or lost).",
      "We read them, pull out facts with the exact quote they came from, and use past applications as examples of your writing style. Nothing is shared with other organizations.",
    ],
    keywords: ["upload", "files", "pdf", "word", "annual report", "budget"],
    path: "/knowledge/documents",
  },
  {
    id: "interviews",
    title: "Interviews, dictation and quick updates",
    summary: "Talk or type answers; we turn them into facts for you to confirm.",
    paragraphs: [
      "The onboarding interview takes about 10 minutes and covers what documents usually miss: recent results, how many people you serve, what's changed this year.",
      "You can answer by voice, upload a transcript of a conversation you already had, or post a short update whenever something changes. Each answer becomes proposed facts for you to check.",
    ],
    keywords: ["voice", "dictation", "talk", "transcript", "update"],
    path: "/interviews",
  },
  {
    id: "finding-grants",
    title: "Finding grants: matches, watchlist and prospects",
    summary: "We search public catalogs daily and score each grant for your organization.",
    paragraphs: [
      "Matches are grants from public catalogs scored for fit, likelihood and expected value. Shortlist the ones worth pursuing and dismiss the rest; dismissing teaches us what you don't want.",
      "You can also import a grant from a link or an RFP file, watch a funder's page for new rounds, and browse foundation prospects based on public tax filings.",
    ],
    keywords: ["search", "opportunities", "inbox", "import", "watchlist", "foundation", "prospect"],
    path: "/opportunities",
  },
  {
    id: "reviewing-drafts",
    title: "Reviewing a draft: citations, flags and approval",
    summary:
      "Check flagged sentences first, open a few citations, then approve or request changes.",
    paragraphs: [
      "Start with the flags: they point at sentences that need a person. Resolve blockers by confirming a fact, editing the sentence or answering a missing-information question.",
      "Open a few citations to see the fact and source quote behind each claim. When you're happy, approve. Depending on the funder, we either send it or give you a ready-to-submit package with step-by-step instructions.",
    ],
    keywords: ["review", "approve", "edit", "citations", "flags", "changes"],
    path: "/reviews",
  },
  {
    id: "after-submitting",
    title: "After you submit: follow-ups, awards and reports",
    summary: "We keep the exact package you sent and remind you about follow-ups and reports.",
    paragraphs: [
      "Every submission is stored exactly as sent. We schedule follow-ups and deadline reminders, and you can record the outcome when you hear back.",
      "Recording awards and declines keeps your dashboard and history accurate, and reviewer feedback on drafts steers how later drafts are written.",
    ],
    keywords: ["submission", "follow up", "award", "declined", "report", "outcome"],
    path: "/submissions",
  },
  {
    id: "team-billing",
    title: "Team, roles and billing",
    summary: "Invite reviewers and editors; manage your plan in settings.",
    paragraphs: [
      "Viewers can read everything, editors can upload and edit, reviewers can approve drafts, and admins manage settings, members and billing.",
      "Your plan sets how many application drafts you can create each month. You can see usage and change plans under Settings, Billing.",
    ],
    keywords: ["invite", "member", "role", "reviewer", "admin", "plan", "billing", "price"],
    path: "/settings/members",
  },
];

/** Lowercased text used to search a help entry or article. */
export function helpSearchText(item: HelpEntry | HelpArticle): string {
  const parts =
    "term" in item
      ? [item.term, item.short, item.body, ...item.keywords]
      : [item.title, item.summary, ...item.paragraphs, ...item.keywords];
  return parts.join(" ").toLowerCase();
}

/** Every query word must appear (prefix-insensitive substring match). Empty query matches all. */
export function matchesHelpQuery(item: HelpEntry | HelpArticle, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = helpSearchText(item);
  return words.every((w) => text.includes(w));
}
