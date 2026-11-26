// What a grant-ready fact base should cover. Used for the /facts/summary coverage view and by the
// interview module to build agendas (topic keys) for missing / thin topics.
import type { FactCategory, FactStatus } from "@shared/enums";

export interface ChecklistTopic {
  topic: string;
  label: string;
  /** Fact categories that count toward this topic. */
  categories: readonly FactCategory[];
  /** Facts needed for "good" coverage (1..goodAt-1 = "thin"). */
  goodAt: number;
  /** What funders ask about; a starting point for interview questions. */
  question: string;
}

export const KNOWLEDGE_CHECKLIST: readonly ChecklistTopic[] = [
  {
    topic: "mission",
    label: "Mission & identity",
    categories: ["mission", "identity"],
    goodAt: 2,
    question: "What is the organization's mission, legal status and who runs it day to day?",
  },
  {
    topic: "history",
    label: "History",
    categories: ["history"],
    goodAt: 2,
    question: "When and why was the organization founded, and what are its key milestones?",
  },
  {
    topic: "programs",
    label: "Programs & services",
    categories: ["program"],
    goodAt: 3,
    question: "What programs and services does the organization run today?",
  },
  {
    topic: "population_served",
    label: "Population served",
    categories: ["population_served"],
    goodAt: 2,
    question: "Who does the organization serve, how many people, and what needs do they have?",
  },
  {
    topic: "geography",
    label: "Service area",
    categories: ["geography"],
    goodAt: 1,
    question: "Which communities, counties, chapters or regions does the organization serve?",
  },
  {
    topic: "outcomes",
    label: "Outcomes & metrics",
    categories: ["outcome", "metric"],
    goodAt: 3,
    question: "What measurable results has the organization achieved (numbers, years)?",
  },
  {
    topic: "financials",
    label: "Financials",
    categories: ["financial"],
    goodAt: 2,
    question: "What is the annual operating budget, and where does funding come from?",
  },
  {
    topic: "staff",
    label: "Staff & capacity",
    categories: ["staff", "capacity"],
    goodAt: 2,
    question: "How many staff and volunteers, key qualifications, facilities and equipment?",
  },
  {
    topic: "governance",
    label: "Governance",
    categories: ["governance"],
    goodAt: 1,
    question: "Who is on the board, how is the organization governed, and what policies exist?",
  },
  {
    topic: "partners",
    label: "Partners",
    categories: ["partner"],
    goodAt: 1,
    question: "Which partners, employers, agencies or funders does the organization work with?",
  },
  {
    topic: "projects",
    label: "Projects seeking funding",
    categories: ["project"],
    goodAt: 2,
    question:
      "What specific projects need funding, what will they cost and what will they achieve?",
  },
] as const;

export type CoverageStatus = "missing" | "thin" | "good";

export interface CoverageItem {
  topic: string;
  label: string;
  factCount: number;
  confirmedCount: number;
  status: CoverageStatus;
  question: string;
}

export interface CoverageInput {
  category: FactCategory;
  status: FactStatus;
  projectId?: string | null;
}

/** Coverage over the checklist. Counts proposed + confirmed facts; rejected/superseded don't count. */
export function computeCoverage(rows: Iterable<CoverageInput>): CoverageItem[] {
  const counts = new Map<string, { all: number; confirmed: number }>();
  for (const t of KNOWLEDGE_CHECKLIST) counts.set(t.topic, { all: 0, confirmed: 0 });
  for (const r of rows) {
    if (r.status !== "proposed" && r.status !== "confirmed") continue;
    for (const t of KNOWLEDGE_CHECKLIST) {
      const counts_ = counts.get(t.topic);
      if (!counts_) continue;
      // Project-scoped facts count toward "projects" whatever their category.
      const hit = t.categories.includes(r.category) || (t.topic === "projects" && !!r.projectId);
      if (!hit) continue;
      counts_.all++;
      if (r.status === "confirmed") counts_.confirmed++;
    }
  }
  return KNOWLEDGE_CHECKLIST.map((t) => {
    const c = counts.get(t.topic) ?? { all: 0, confirmed: 0 };
    return {
      topic: t.topic,
      label: t.label,
      factCount: c.all,
      confirmedCount: c.confirmed,
      status: c.all === 0 ? "missing" : c.all < t.goodAt ? "thin" : "good",
      question: t.question,
    };
  });
}
