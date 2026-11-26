// The "What's new?" check-in agenda (interview kind `update`). Pure: the interview engine passes in
// the org's facts and the date of its last update. Staleness decides the order: themes with dated
// facts from an earlier year come first (last year's enrollment, budget, outcomes), then themes
// whose newest confirmed fact is older than STALE_TOPIC_MONTHS (or that have none), then the rest.
// Questions never state the org's facts (non-leading); they only say how old the latest data is.
import type { FactCategory } from "@shared/enums";
import {
  factStaleness,
  lastVouchedMs,
  monthsAgo,
  STALE_TOPIC_MONTHS,
  type StalenessInput,
} from "@shared/fact-staleness";
import type { InterviewAgendaItem } from "../../db/schema/interviews";

/** Agenda size of an update interview (5–7 questions with at most one follow-up). */
export const UPDATE_AGENDA_SIZE = 6;
export const UPDATE_MAX_QUESTIONS = 7;

interface UpdateTheme {
  key: string;
  label: string;
  categories: readonly FactCategory[];
  question: (since: string) => string;
  /** Wording when the theme's latest dated facts are from `asOf`. */
  datedQuestion?: (asOf: string) => string;
}

export const UPDATE_THEMES: readonly UpdateTheme[] = [
  {
    key: "update_programs",
    label: "New programs",
    categories: ["program"],
    question: (since) =>
      `Since ${since}, have you started, changed or ended any programs? If nothing changed, just say "no change".`,
  },
  {
    key: "update_outcomes",
    label: "Outcomes this period",
    categories: ["outcome", "metric", "population_served"],
    question: () =>
      "What results can you share for this period — for example how many people you served or how many completed a program, and for which year?",
    datedQuestion: (asOf) =>
      `The latest numbers we have on who you serve and your results are from ${asOf}. What are the most recent figures, and which year do they cover?`,
  },
  {
    key: "update_people",
    label: "Staff and board",
    categories: ["staff", "governance"],
    question: () =>
      "Have there been any staff or board changes — new hires, departures, new board members or a new leader?",
    datedQuestion: (asOf) =>
      `Our staff and board details are from ${asOf}. What has changed since then — new hires, departures or board members?`,
  },
  {
    key: "update_awards",
    label: "Awards and grants won",
    categories: ["history"],
    question: (since) =>
      `Have you won any grants, awards or recognition since ${since}? Who from, and for how much?`,
  },
  {
    key: "update_partners",
    label: "Partners",
    categories: ["partner"],
    question: () => "Any new partners, or changes to existing partnerships?",
    datedQuestion: (asOf) =>
      `The partnerships we have on file are from ${asOf}. Are they still active, and are there any new partners?`,
  },
  {
    key: "update_budget",
    label: "Budget changes",
    categories: ["financial", "capacity"],
    question: () =>
      "Has your annual budget or funding mix changed? If so, what is the new figure and for which fiscal year?",
    datedQuestion: (asOf) =>
      `The budget figures we have are from ${asOf}. What is your current annual budget, and for which fiscal year?`,
  },
  {
    key: "update_projects",
    label: "Upcoming projects",
    categories: ["project"],
    question: () =>
      "What's coming up next — any new projects or expansions you'd like to get funded?",
  },
];

export interface AgendaFact extends StalenessInput {
  id: string;
}

export interface UpdateAgendaTopic extends InterviewAgendaItem {
  /** "dated": facts from an earlier year; "stale": no confirmed fact in 6 months; "fresh". */
  staleness: "dated" | "stale" | "fresh";
  staleFactIds: string[];
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "your last update in September 2026" / "the start of the year" when there was none. */
export function sinceLabel(lastUpdateAt: Date | null, now: Date): string {
  if (!lastUpdateAt) return `the start of ${now.getUTCFullYear() - 1}`;
  return `your last update in ${MONTHS[lastUpdateAt.getUTCMonth()]} ${lastUpdateAt.getUTCFullYear()}`;
}

/** Every theme with its staleness, most stale first (stable within a group). */
export function rankUpdateThemes(facts: readonly AgendaFact[], now: Date, since: string) {
  const cutoff = monthsAgo(now, STALE_TOPIC_MONTHS);
  const rank = { dated: 0, stale: 1, fresh: 2 } as const;
  return UPDATE_THEMES.map((theme, order): UpdateAgendaTopic & { order: number } => {
    const inTheme = facts.filter((f) => theme.categories.includes(f.category));
    const dated = inTheme.filter((f) => factStaleness(f, now)?.reason === "dated");
    const newestConfirmed = Math.max(
      -Infinity,
      ...inTheme.filter((f) => f.status === "confirmed").map((f) => lastVouchedMs(f) ?? -Infinity),
    );
    const staleness = dated.length > 0 ? "dated" : newestConfirmed < cutoff ? "stale" : "fresh";
    // The newest of the outdated asOf values ("2025" rather than "2023").
    const latestAsOf = dated
      .map((f) => f.asOf?.trim() ?? "")
      .filter(Boolean)
      .sort()
      .at(-1);
    const question =
      staleness === "dated" && latestAsOf && theme.datedQuestion
        ? theme.datedQuestion(latestAsOf)
        : theme.question(since);
    return {
      key: theme.key,
      label: theme.label,
      question,
      staleness,
      staleFactIds: dated.map((f) => f.id),
      order,
    };
  }).sort((a, b) => rank[a.staleness] - rank[b.staleness] || a.order - b.order);
}

/** The check-in agenda: the UPDATE_AGENDA_SIZE most stale themes, as interview agenda items. */
export function buildUpdateAgenda(
  facts: readonly AgendaFact[],
  now: Date,
  lastUpdateAt: Date | null,
): InterviewAgendaItem[] {
  return rankUpdateThemes(facts, now, sinceLabel(lastUpdateAt, now))
    .slice(0, UPDATE_AGENDA_SIZE)
    .map(({ key, label, question }) => ({ key, label, question }));
}

/** Title of an update interview, e.g. "What's new? — November 2026". */
export function updateInterviewTitle(now: Date): string {
  return `What's new? — ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
}
