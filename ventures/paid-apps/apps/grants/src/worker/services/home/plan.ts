// Pure parts of the home "grant plan": ranking next best actions, the 90-day calendar, the
// automation summary and the greeting. index.ts loads the org's own rows and calls these.
import type {
  AutomationSummary,
  CalendarEntry,
  CalendarMonth,
  HomeCalendar,
  NextBestAction,
} from "@shared/api/home";
import type { ApplicationStatus, FactCategory, FactStatus, MemberRole } from "@shared/enums";
import { ROLE_RANK } from "@shared/enums";
import { type CoverageItem, computeCoverage } from "../knowledge";
import { type AutomationSettings, presetDefaults, resolveAutomation } from "../review/automation";

export const DAY_MS = 86_400_000;
export const CALENDAR_WINDOW_DAYS = 90;
export const MAX_ACTIONS = 5;
/** Matches below this fit stay off the calendar and the "new matches" nudge unless shortlisted. */
export const MIN_FIT_FOR_PLAN = 60;
/** A "new" match counts as new for this many days after it was scored. */
export const NEW_MATCH_DAYS = 14;
/** Shortlisted grants closing within this many days with no draft get a "start the draft" nudge. */
export const START_DRAFT_WITHIN_DAYS = 45;

/** Whole days until `d` (rounded up, like GET /submissions/dashboard). */
export const daysLeft = (d: Date, now: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY_MS);

export function dueLabel(days: number): string {
  if (days < 0) return `overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Ana" from "Ana Begay"; null for empty names or ones that are just an email address. */
export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || first.includes("@")) return null;
  return first.slice(0, 40);
}

// ---------- coverage ----------

export interface FactCountRow {
  category: FactCategory;
  status: FactStatus;
  hasProject: boolean;
  n: number;
}

/** computeCoverage over grouped counts (one GROUP BY row per category/status/project flag). */
export function coverageFromCounts(rows: readonly FactCountRow[]): CoverageItem[] {
  function* expand() {
    for (const r of rows) {
      const one = { category: r.category, status: r.status, projectId: r.hasProject ? "p" : null };
      for (let i = 0; i < r.n; i++) yield one;
    }
  }
  return computeCoverage(expand());
}

/** Topics funders weigh most, used to pick which gap to name when no draft points at one. */
const GAP_PRIORITY = [
  "outcomes",
  "population_served",
  "programs",
  "financials",
  "projects",
  "mission",
  "staff",
  "geography",
  "history",
  "governance",
  "partners",
];

/** Words in a gap flag (section key, message, question) that point at a checklist topic. */
const TOPIC_HINTS: Record<string, RegExp> = {
  mission: /\bmission\b|legal status|identity|\b501\(c\)/i,
  history: /\bhistory\b|founded|milestone/i,
  programs: /\bprogram|\bservices?\b/i,
  population_served: /population|participants|beneficiar|demographic|\bclients?\b|people served/i,
  geography: /geograph|service area|\bcount(y|ies)\b|\bregion|\blocation/i,
  outcomes: /outcome|\bresults?\b|impact|metric|evaluat|measur|placement|success rate/i,
  financials: /budget|financ|revenue|\baudit|\bcosts?\b|funding sources|match(ing)? funds/i,
  staff: /\bstaff|personnel|capacity|volunteer|qualification|facilit/i,
  governance: /\bboard\b|governance|polic(y|ies)/i,
  partners: /partner|collaborat|letters? of support|\bmou\b/i,
  projects: /\bproject|timeline|work ?plan|activities/i,
};

export interface GapFlag {
  applicationId: string;
  text: string;
}

export interface GapChoice {
  topic: CoverageItem;
  /** Open drafts whose missing-info flags point at this topic. */
  drafts: number;
}

/** The thin/missing topic an interview should cover first, and how many drafts it would help. */
export function chooseGap(
  coverage: readonly CoverageItem[],
  flags: readonly GapFlag[],
): GapChoice | null {
  const gaps = coverage.filter((c) => c.status !== "good");
  if (gaps.length === 0) return null;
  const draftsFor = (topic: string) => {
    const re = TOPIC_HINTS[topic];
    if (!re) return 0;
    return new Set(flags.filter((f) => re.test(f.text)).map((f) => f.applicationId)).size;
  };
  const rank = (t: string) => {
    const i = GAP_PRIORITY.indexOf(t);
    return i === -1 ? GAP_PRIORITY.length : i;
  };
  const scored = gaps.map((topic) => ({ topic, drafts: draftsFor(topic.topic) }));
  scored.sort(
    (a, b) =>
      b.drafts - a.drafts ||
      Number(b.topic.status === "missing") - Number(a.topic.status === "missing") ||
      rank(a.topic.topic) - rank(b.topic.topic),
  );
  return scored[0] ?? null;
}

// ---------- focus areas ----------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** True when the text mentions the focus area as a phrase, or every word of it (5-letter stems). */
export function mentionsFocus(focus: string, text: string): boolean {
  const f = norm(focus);
  if (!f) return false;
  const t = ` ${norm(text)} `;
  if (t.includes(` ${f}`)) return true;
  const words = f.split(" ").filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  return words.every((w) => t.includes(` ${w.slice(0, 5)}`));
}

/** The org focus area most of these opportunities mention, with the count; null if none do. */
export function dominantFocus(
  focusAreas: readonly string[],
  texts: readonly string[],
): { focus: string; count: number } | null {
  let best: { focus: string; count: number } | null = null;
  for (const focus of focusAreas) {
    const count = texts.filter((t) => mentionsFocus(focus, t)).length;
    if (count > 0 && (!best || count > best.count)) best = { focus, count };
  }
  return best;
}

// ---------- calendar ----------

export interface CalendarApp {
  id: string;
  title: string;
  status: ApplicationStatus;
  funderName: string;
  deadline: Date | null;
}

export interface CalendarMatch {
  id: string;
  opportunityId: string;
  title: string;
  funderName: string;
  status: string;
  closeDate: Date | null;
}

const monthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);

export function buildCalendar(
  orgId: string,
  apps: readonly CalendarApp[],
  matches: readonly CalendarMatch[],
  appOpportunityIds: ReadonlySet<string>,
  now: Date,
  windowDays = CALENDAR_WINDOW_DAYS,
): HomeCalendar {
  const to = new Date(now.getTime() + windowDays * DAY_MS);
  const inWindow = (d: Date | null): d is Date =>
    !!d && d.getTime() >= now.getTime() && d.getTime() <= to.getTime();
  const entries: (CalendarEntry & { at: number })[] = [];
  for (const a of apps) {
    if (!inWindow(a.deadline)) continue;
    entries.push({
      id: `app:${a.id}`,
      kind: "application",
      title: a.title,
      funderName: a.funderName,
      date: a.deadline.toISOString(),
      daysLeft: daysLeft(a.deadline, now),
      status: a.status,
      href: `/orgs/${orgId}/applications/${a.id}`,
      at: a.deadline.getTime(),
    });
  }
  for (const m of matches) {
    // A grant the org already has an application for shows once, as the application.
    if (!inWindow(m.closeDate) || appOpportunityIds.has(m.opportunityId)) continue;
    entries.push({
      id: `match:${m.id}`,
      kind: "match",
      title: m.title,
      funderName: m.funderName,
      date: m.closeDate.toISOString(),
      daysLeft: daysLeft(m.closeDate, now),
      status: m.status,
      href: `/orgs/${orgId}/opportunities/${m.opportunityId}`,
      at: m.closeDate.getTime(),
    });
  }
  entries.sort((a, b) => a.at - b.at || a.title.localeCompare(b.title));

  const months: CalendarMonth[] = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  while (cursor.getTime() <= to.getTime()) {
    months.push({ month: monthKey(cursor), label: monthLabel(cursor), entries: [] });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const { at, ...e } of entries) byMonth.get(monthKey(new Date(at)))?.entries.push(e);
  return {
    windowDays,
    from: now.toISOString(),
    to: to.toISOString(),
    months,
    total: entries.length,
  };
}

// ---------- next best actions ----------

export interface PlanApp extends CalendarApp {
  reviewTier: string | null;
  /** Open missing-info questions on this application. */
  openQuestions: number;
}

export interface PlanState {
  orgId: string;
  orgName: string;
  role: MemberRole;
  now: Date;
  focusAreas: readonly string[];
  hasUei: boolean;
  documentCount: number;
  factCount: number;
  coverage: readonly CoverageItem[];
  gapFlags: readonly GapFlag[];
  proposedByDocument: readonly { documentId: string; title: string; n: number }[];
  /** Proposed facts with no source document (interviews, typed in). */
  proposedOther: number;
  openApps: readonly PlanApp[];
  pendingManual: readonly {
    submissionId: string;
    applicationId: string;
    title: string;
    funderName: string;
    deadline: Date | null;
  }[];
  /** Shortlisted matches with a deadline and no application yet, soonest first. */
  shortlistedDue: readonly CalendarMatch[];
  newMatchTexts: readonly string[];
  federalMatches: number;
}

interface Candidate extends NextBestAction {
  score: number;
  requiredRole: MemberRole;
}

/** Up to +15 as a deadline approaches (30 days out = 0). */
const urgency = (days: number | null) =>
  days == null ? 0 : Math.max(0, 30 - Math.max(days, 0)) / 2;

const priorityOf = (score: number): NextBestAction["priority"] =>
  score >= 75 ? "high" : score >= 50 ? "medium" : "low";

const topicName = (c: CoverageItem) => c.label.split(" & ")[0] ?? c.label;

/** Ranked, role-filtered next steps for this org (at most MAX_ACTIONS). */
export function rankActions(s: PlanState): NextBestAction[] {
  const base = `/orgs/${s.orgId}`;
  const out: Candidate[] = [];
  const add = (c: Omit<Candidate, "priority">) => out.push({ ...c, priority: priorityOf(c.score) });
  const days = (d: Date | null) => (d ? daysLeft(d, s.now) : null);
  const due = (d: Date | null) => (d ? ` (${dueLabel(daysLeft(d, s.now))})` : "");

  // First run: nothing to draft from yet.
  if (s.documentCount === 0 && s.factCount === 0) {
    add({
      id: "upload_documents",
      kind: "upload_documents",
      title: "Upload your annual report, budget or a past application",
      reason: `Drafts for ${s.orgName} can only use facts from your own sources, so this is where every application starts.`,
      href: `${base}/knowledge/documents`,
      cta: "Upload documents",
      dueAt: null,
      score: 95,
      requiredRole: "editor",
    });
    add({
      id: "onboarding_interview",
      kind: "onboarding_interview",
      title: `Tell us about ${s.orgName} in a 10-minute interview`,
      reason:
        "Talk or type. We turn your answers into facts you confirm before any draft uses them.",
      href: `${base}/interviews`,
      cta: "Start interview",
      dueAt: null,
      score: 90,
      requiredRole: "editor",
    });
  }

  const soonest = <T extends { deadline: Date | null }>(xs: readonly T[]) =>
    [...xs].sort(
      (a, b) =>
        (a.deadline?.getTime() ?? Number.POSITIVE_INFINITY) -
        (b.deadline?.getTime() ?? Number.POSITIVE_INFINITY),
    );

  for (const p of soonest(s.pendingManual).slice(0, 2)) {
    add({
      id: `confirm_submission:${p.submissionId}`,
      kind: "confirm_submission",
      title: `Mark the manual submission to ${p.funderName} as submitted`,
      reason: `The package for "${p.title}" is ready. Submit it through the funder's portal, then confirm it here${due(p.deadline)}.`,
      href: `${base}/applications/${p.applicationId}`,
      cta: "Confirm submission",
      dueAt: p.deadline?.toISOString() ?? null,
      score: 88 + urgency(days(p.deadline)),
      requiredRole: "editor",
    });
  }

  const byStatus = (st: ApplicationStatus) => soonest(s.openApps.filter((a) => a.status === st));
  for (const a of byStatus("needs_info").slice(0, 2)) {
    const q = a.openQuestions;
    add({
      id: `answer_questions:${a.id}`,
      kind: "answer_questions",
      title: `Answer ${q > 0 ? plural(q, "question") : "the open questions"} for ${a.title}${due(a.deadline)}`,
      reason:
        "The draft stopped where your fact base had no answer. Nothing is invented to fill the gap.",
      href: `${base}/applications/${a.id}`,
      cta: "Answer questions",
      dueAt: a.deadline?.toISOString() ?? null,
      score: 80 + urgency(days(a.deadline)),
      requiredRole: "editor",
    });
  }
  for (const a of byStatus("in_review").slice(0, 2)) {
    add({
      id: `review_draft:${a.id}`,
      kind: "review_draft",
      title: `Review the draft for ${a.title}${due(a.deadline)}`,
      reason:
        a.reviewTier === "one_click"
          ? `Fact-checked and ready for one-click approval for ${a.funderName}.`
          : `${a.funderName} application needs a section-by-section review.`,
      href: `${base}/applications/${a.id}`,
      cta: "Review draft",
      dueAt: a.deadline?.toISOString() ?? null,
      score: 72 + urgency(days(a.deadline)),
      requiredRole: "reviewer",
    });
  }
  for (const a of byStatus("changes_requested").slice(0, 1)) {
    add({
      id: `revise_draft:${a.id}`,
      kind: "revise_draft",
      title: `Revise ${a.title}${due(a.deadline)}`,
      reason: "A reviewer asked for changes before it goes to the funder.",
      href: `${base}/applications/${a.id}`,
      cta: "Open draft",
      dueAt: a.deadline?.toISOString() ?? null,
      score: 66 + urgency(days(a.deadline)),
      requiredRole: "editor",
    });
  }

  if (s.factCount > 0 || s.documentCount > 0) {
    const gap = chooseGap(s.coverage, s.gapFlags);
    if (gap) {
      const name = topicName(gap.topic);
      const state =
        gap.topic.status === "missing" ? `has nothing on ${name} yet` : `is thin on ${name}`;
      add({
        id: `fill_gap:${gap.topic.topic}`,
        kind: "fill_gap",
        title:
          gap.drafts > 0
            ? `Your fact base ${state}; a 10-minute interview would strengthen ${plural(gap.drafts, "draft")}`
            : `Your fact base ${state}; a 10-minute interview would fill it in`,
        reason: gap.topic.question,
        href: `${base}/interviews`,
        cta: "Start interview",
        dueAt: null,
        score:
          gap.drafts > 0
            ? 60 + 4 * Math.min(gap.drafts, 5)
            : gap.topic.status === "missing"
              ? 40
              : 35,
        requiredRole: "editor",
      });
    }
  }

  for (const d of s.proposedByDocument.slice(0, 2)) {
    add({
      id: `confirm_facts:${d.documentId}`,
      kind: "confirm_facts",
      title: `Confirm ${plural(d.n, "fact")} extracted from your ${d.title}`,
      reason: "Confirmed facts are the only ones autopilot drafts may rely on without a warning.",
      href: `${base}/knowledge/documents/${d.documentId}`,
      cta: "Review facts",
      dueAt: null,
      score: 50 + Math.min(d.n, 20),
      requiredRole: "editor",
    });
  }
  if (s.proposedOther > 0) {
    add({
      id: "confirm_facts:other",
      kind: "confirm_facts",
      title: `Confirm ${plural(s.proposedOther, "fact")} from your interviews`,
      reason: "Each one quotes what was said, so it takes seconds to check.",
      href: `${base}/knowledge/facts?status=proposed`,
      cta: "Review facts",
      dueAt: null,
      score: 45 + Math.min(s.proposedOther, 20),
      requiredRole: "editor",
    });
  }

  if (!s.hasUei && s.federalMatches > 0) {
    add({
      id: "add_uei",
      kind: "add_uei",
      title: `Add your SAM.gov UEI to qualify for ${plural(s.federalMatches, "federal grant")}`,
      reason:
        "Federal funders require an active SAM.gov registration, and your profile has no UEI.",
      href: `${base}/settings/general`,
      cta: "Add UEI",
      dueAt: null,
      score: 56 + Math.min(s.federalMatches, 10),
      requiredRole: "editor",
    });
  }

  const startDraft = s.shortlistedDue.find(
    (m) => m.closeDate && daysLeft(m.closeDate, s.now) <= START_DRAFT_WITHIN_DAYS,
  );
  if (startDraft?.closeDate) {
    const d = daysLeft(startDraft.closeDate, s.now);
    add({
      id: `start_draft:${startDraft.id}`,
      kind: "start_draft",
      title: `Start the draft for ${startDraft.title} (closes in ${plural(d, "day")})`,
      reason: `You shortlisted this ${startDraft.funderName} grant and there is no application yet.`,
      href: `${base}/opportunities/${startDraft.opportunityId}`,
      cta: "Open grant",
      dueAt: startDraft.closeDate.toISOString(),
      score: 52 + urgency(d),
      requiredRole: "editor",
    });
  }

  if (s.newMatchTexts.length > 0) {
    const n = s.newMatchTexts.length;
    const focus = dominantFocus(s.focusAreas, s.newMatchTexts);
    add({
      id: "new_matches",
      kind: "new_matches",
      title: focus
        ? `${plural(focus.count, "new grant")} ${focus.count === 1 ? "matches" : "match"} your focus on ${focus.focus}`
        : `${plural(n, "new grant")} ${n === 1 ? "matches" : "match"} ${s.orgName}'s profile`,
      reason:
        "Scored against your fact base in the last two weeks. Shortlist the ones worth a draft.",
      href: `${base}/opportunities`,
      cta: "See matches",
      dueAt: null,
      score: 40 + Math.min(3 * n, 15),
      requiredRole: "viewer",
    });
  }

  return out
    .filter((c) => ROLE_RANK[s.role] >= ROLE_RANK[c.requiredRole])
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ACTIONS)
    .map(({ score: _s, requiredRole: _r, ...a }) => a);
}

// ---------- automation ----------

/** Level, preset copy and what is waiting on people, from services/review/automation.ts. */
export function buildAutomationSummary(
  orgId: string,
  settings: AutomationSettings & { autoSubmitMaxCents: number },
  waiting: Omit<AutomationSummary["waitingOnHumans"], "total">,
): AutomationSummary {
  const config = resolveAutomation(settings);
  const preset = presetDefaults(config.level);
  const total =
    waiting.reviews +
    waiting.questions +
    waiting.changesRequested +
    waiting.manualSubmissions +
    waiting.proposedFacts;
  return {
    level: config.level,
    label: preset.label,
    description: preset.description,
    autoSubmit: config.autoSubmit,
    autoSubmitMaxCents:
      config.autoSubmit && config.riskThresholds ? settings.autoSubmitMaxCents : null,
    waitingOnHumans: { ...waiting, total },
    href: `/orgs/${orgId}/settings/autopilot`,
  };
}
