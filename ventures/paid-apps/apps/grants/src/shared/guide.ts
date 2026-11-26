// Getting-started guide: the step contract shared by GET /api/orgs/:orgId/guide (services/guide) and
// the checklist UI (components/guide). Progress is derived from real org data on every request, so
// there is nothing to store server-side; only "dismissed" lives in the browser (per user).

export const GUIDE_STEP_KEYS = [
  "profile",
  "documents",
  "facts",
  "interview",
  "project",
  "matches",
  "first_draft",
  "automation",
  "teammate",
] as const;
export type GuideStepKey = (typeof GUIDE_STEP_KEYS)[number];

/** Thresholds the steps count towards (kept here so copy and logic cannot drift apart). */
export const GUIDE_TARGETS = {
  documents: 3,
  confirmedFacts: 10,
  shortlisted: 3,
} as const;

export interface GuideStepMeta {
  key: GuideStepKey;
  title: string;
  /** One plain sentence: why this step matters for getting a grounded draft. */
  why: string;
  /** Rough time a small team should budget, in minutes. */
  minutes: number;
  /** Deep link under /orgs/{orgId} (may carry a query string). */
  path: string;
  /** Button text for the deep link. */
  cta: string;
}

export const GUIDE_STEPS: readonly GuideStepMeta[] = [
  {
    key: "profile",
    title: "Complete your profile",
    why: "Funders ask for your legal name, EIN, location and focus areas, and we use them to find grants you can apply for.",
    minutes: 5,
    path: "/settings/general",
    cta: "Complete profile",
  },
  {
    key: "documents",
    title: "Upload 3 or more documents, including a past application",
    why: "Your documents are where every fact in a draft comes from. A past application also teaches us your voice.",
    minutes: 10,
    path: "/knowledge/documents",
    cta: "Upload documents",
  },
  {
    key: "facts",
    title: "Confirm 10 facts",
    why: "Drafts only state what's in your fact base. Confirming a fact tells us it's true and safe to use.",
    minutes: 10,
    path: "/knowledge/facts?status=proposed",
    cta: "Review facts",
  },
  {
    key: "interview",
    title: "Do the 10-minute interview",
    why: "Some things aren't written down anywhere. Talk or type your answers and we turn them into facts for you to check.",
    minutes: 10,
    path: "/interviews",
    cta: "Start interview",
  },
  {
    key: "project",
    title: "Add a project you want funded",
    why: "Grants fund specific work. A project with a goal, budget and timeline makes matches and drafts much sharper.",
    minutes: 5,
    path: "/projects",
    cta: "Add a project",
  },
  {
    key: "matches",
    title: "Review your top matches and shortlist 3",
    why: "Shortlisting tells us which grants are worth your time, so we draft the right ones first.",
    minutes: 10,
    path: "/opportunities",
    cta: "Review matches",
  },
  {
    key: "first_draft",
    title: "Open your first draft and check its citations",
    why: "Every claim in a draft links to the fact it came from. Checking a few citations shows you how to trust it.",
    minutes: 15,
    path: "/applications",
    cta: "Open drafts",
  },
  {
    key: "automation",
    title: "Choose your automation level",
    why: "You decide how much we do on our own, from only finding grants to submitting low-risk ones within your limits.",
    minutes: 3,
    path: "/settings/autopilot",
    cta: "Choose a level",
  },
  {
    key: "teammate",
    title: "Invite a teammate or reviewer",
    why: "A second pair of eyes catches mistakes, and reviewers can approve drafts without editing anything.",
    minutes: 2,
    path: "/settings/members",
    cta: "Invite someone",
  },
];

export interface GuideStepDto extends GuideStepMeta {
  done: boolean;
  /** Counted progress for steps with a target (documents, facts, shortlist). */
  progress?: { current: number; target: number };
  /** Short status line computed from data, e.g. "Missing: EIN, focus areas" or "2 of 3 uploaded". */
  detail?: string;
}

export interface GuideDto {
  steps: GuideStepDto[];
  doneCount: number;
  total: number;
  complete: boolean;
  /** The first step that isn't done (null when complete). */
  nextStep: GuideStepKey | null;
}
