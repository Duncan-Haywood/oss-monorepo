// Interview topic catalog: labels + warm, concrete, non-leading canned questions.
// Used to build agendas and by the deterministic fallback / FakeLlm interviewer.
import type { InterviewAgendaItem } from "../../db/schema/interviews";

interface TopicDef {
  label: string;
  question: string;
}

/** Org-level topics. Keys cover knowledge coverage topics (fact categories and common variants). */
const ORG_TOPICS: Record<string, TopicDef> = {
  identity: {
    label: "Who you are",
    question:
      "How would you describe your organization to someone who has never heard of it — what you do, and for whom?",
  },
  mission: {
    label: "Mission",
    question:
      "In your own words, what is your organization's mission, and has it changed over the years?",
  },
  history: {
    label: "History",
    question:
      "When and how did the organization get started, and what have been the biggest milestones since then?",
  },
  program: {
    label: "Programs",
    question:
      "What are your main programs today? For one of them, could you walk me through what a participant actually experiences?",
  },
  population_served: {
    label: "Who you serve",
    question:
      "Who do your programs serve? Roughly how many people did you serve last year, and how do they find you?",
  },
  geography: {
    label: "Where you work",
    question:
      "Which communities, counties or chapters do you serve, and where are your sites located?",
  },
  outcome: {
    label: "Outcomes",
    question:
      "What changes for the people you serve? Could you share a specific result from the last year or two — for example how many people completed a program or found a job?",
  },
  metric: {
    label: "Numbers you track",
    question:
      "Which numbers do you track regularly — enrollments, completions, placements, hours? What were they for your most recent year?",
  },
  financial: {
    label: "Budget and funding",
    question:
      "What is your approximate annual operating budget, and where does most of the funding come from today?",
  },
  staff: {
    label: "Staff and volunteers",
    question:
      "How many staff and volunteers do you have, and who leads your key programs day to day?",
  },
  governance: {
    label: "Board and governance",
    question:
      "Tell me about your board: how many members, and how is the community you serve represented on it?",
  },
  partner: {
    label: "Partners",
    question:
      "Which organizations do you partner with — employers, schools, tribal programs, agencies — and what does each partnership involve?",
  },
  capacity: {
    label: "Capacity to deliver",
    question:
      "What experience do you have managing grants, and what systems do you use to track spending and report results?",
  },
  project: {
    label: "Projects you want funded",
    question:
      "Is there a specific project or expansion you would most like to get funded in the next year or two? What would it involve?",
  },
};

const ALIASES: Record<string, string> = {
  programs: "program",
  outcomes: "outcome",
  metrics: "metric",
  finances: "financial",
  financials: "financial",
  budget: "financial",
  partners: "partner",
  partnerships: "partner",
  population: "population_served",
  populations: "population_served",
  service_area: "geography",
  location: "geography",
  leadership: "staff",
  board: "governance",
  projects: "project",
};

export const DEFAULT_ONBOARDING_TOPICS = [
  "mission",
  "history",
  "program",
  "population_served",
  "geography",
  "outcome",
  "metric",
  "financial",
  "staff",
  "partner",
  "governance",
  "capacity",
];

export const PROJECT_TOPICS = [
  "problem",
  "approach",
  "population",
  "location",
  "budget",
  "timeline",
  "outcomes",
  "partners",
] as const;
export type ProjectTopic = (typeof PROJECT_TOPICS)[number];

const PROJECT_QUESTIONS: Record<ProjectTopic, (p: string) => TopicDef> = {
  problem: (p) => ({
    label: "The problem",
    question: `What problem is ${p} meant to solve? What have you seen first-hand that tells you it's needed?`,
  }),
  approach: (p) => ({
    label: "The approach",
    question: `How would ${p} work in practice — what would participants do, week to week?`,
  }),
  population: (p) => ({
    label: "Who it serves",
    question: `Who would ${p} serve, and about how many people per year?`,
  }),
  location: (p) => ({
    label: "Location",
    question: `Where would ${p} take place — which sites, towns or chapters?`,
  }),
  budget: (p) => ({
    label: "Budget",
    question: `What would ${p} cost, roughly, and what would the biggest expenses be?`,
  }),
  timeline: (p) => ({
    label: "Timeline",
    question: `When would ${p} start, and what are the main milestones until it's fully running?`,
  }),
  outcomes: (p) => ({
    label: "Expected outcomes",
    question: `If ${p} goes well, what would be different a year after it starts? How would you measure that?`,
  }),
  partners: (p) => ({
    label: "Partners",
    question: `Who would you work with on ${p} — employers, schools, agencies — and what would each of them contribute?`,
  }),
};

export function humanizeTopic(key: string): string {
  const s = key.replace(/[_.-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "This topic";
}

export function orgTopicItem(key: string): InterviewAgendaItem {
  const def = ORG_TOPICS[key] ?? ORG_TOPICS[ALIASES[key] ?? ""];
  if (def) return { key, label: def.label, question: def.question };
  const label = humanizeTopic(key);
  return {
    key,
    label,
    question: `Could you tell me about ${label.toLowerCase()} at your organization? Specific numbers, dates or names help the most.`,
  };
}

export function projectTopicItem(
  key: ProjectTopic,
  projectTitle: string | null,
): InterviewAgendaItem {
  const name = projectTitle ? `"${projectTitle}"` : "this project";
  const def = PROJECT_QUESTIONS[key](name);
  return { key, label: def.label, question: def.question };
}

export function gapItems(
  questions: { question: string; flagId?: string }[],
): InterviewAgendaItem[] {
  const seen = new Set<string>();
  const out: InterviewAgendaItem[] = [];
  for (const q of questions) {
    const question = q.question.trim();
    const norm = question.toLowerCase().replace(/\s+/g, " ");
    if (!question || seen.has(norm)) continue;
    seen.add(norm);
    const n = out.length + 1;
    out.push({
      key: `gap_${n}`,
      label: `Open question ${n}`,
      question,
      ...(q.flagId ? { flagId: q.flagId } : {}),
    });
  }
  return out;
}
