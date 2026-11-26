// Static fixture data for the public, client-only product demo (/demo). Everything here is about an
// IMAGINED charity: the organization, its places, documents, numbers, funders and grants are all made
// up, and every screen that shows them says so. Nothing in this file is sent anywhere.
//
// Rules the fixtures follow (src/client/components/demo/demo.test.tsx checks them):
// - every fact's `quote` appears word for word in its source document;
// - every number in a supported draft sentence appears in the quotes of the facts it cites;
// - the one deliberately unsupported sentence ("500 families") contradicts its fact (320).
import type { Eligibility, FactCategory } from "@shared/enums";

export const DEMO_ORG = {
  name: "Juniper Mesa Community Builders",
  shortName: "Juniper Mesa",
  kind: "Rural trades-training nonprofit",
  place: "Alder Flats, serving Tobosa and Red Wash counties",
} as const;

/** Shown on every demo screen. */
export const DEMO_DISCLAIMER = "Demo data: Juniper Mesa is an imagined charity";

// ── Source documents ────────────────────────────────────────────────────────────────────────────

export type DemoDocId = "doc-mission" | "doc-annual" | "doc-interview";

export interface DemoParagraph {
  /** Speaker label for interview transcripts ("Interviewer", "Director"). */
  speaker?: string;
  text: string;
}

export interface DemoDocument {
  id: DemoDocId;
  title: string;
  kindLabel: string;
  detail: string;
  paragraphs: DemoParagraph[];
}

export const DEMO_DOCUMENTS: readonly DemoDocument[] = [
  {
    id: "doc-mission",
    title: "Mission statement",
    kindLabel: "Mission statement",
    detail: "1 page · adopted by the board in 2023",
    paragraphs: [
      {
        text: "Juniper Mesa Community Builders trains rural adults in the building trades so they can earn a living wage close to home.",
      },
      {
        text: "Founded in 2014 in Alder Flats, we serve residents of Tobosa and Red Wash counties. Our crews learn carpentry, basic electrical work and weatherization by repairing homes for elderly and disabled neighbors at no cost to them.",
      },
      {
        text: "We believe a steady paycheck and a safe, warm house are both foundations of a strong community.",
      },
    ],
  },
  {
    id: "doc-annual",
    title: "2025 annual report (excerpt)",
    kindLabel: "Annual report",
    detail: "2 pages · program results for 2025",
    paragraphs: [
      {
        text: "In 2025, 64 trainees enrolled in our 16-week pre-apprenticeship program and 51 completed it. Within 90 days of finishing, 43 graduates were working in the trades, at a median starting wage of $21.50 an hour.",
      },
      {
        text: "Training crews repaired 38 homes this year. Counting trainees, their households and repair clients, our programs served 320 families across both counties.",
      },
      {
        text: "Our 2025 operating budget was $612,000, with 58% coming from foundation grants.",
      },
    ],
  },
  {
    id: "doc-interview",
    title: "Interview answers",
    kindLabel: "Interview transcript",
    detail: "Typed interview with the executive director · October 2026",
    paragraphs: [
      { speaker: "Interviewer", text: "How big is your team?" },
      {
        speaker: "Director",
        text: "We have nine full-time staff, including four licensed tradespeople who lead our training crews.",
      },
      { speaker: "Interviewer", text: "Who are your trainees?" },
      {
        speaker: "Director",
        text: "About 70% of our trainees are the first in their family to attend any training after high school. Most live more than 40 miles from the nearest city.",
      },
      { speaker: "Interviewer", text: "Who hires your graduates?" },
      {
        speaker: "Director",
        text: "We place graduates with 22 local employers, from small contractors to the county road department.",
      },
      { speaker: "Interviewer", text: "What would you do next with more funding?" },
      {
        speaker: "Director",
        text: "Our next goal is a mobile training trailer, so we can bring the program to the most remote ranching communities.",
      },
    ],
  },
];

export const documentById = (id: DemoDocId) => {
  const doc = DEMO_DOCUMENTS.find((d) => d.id === id);
  if (!doc) throw new Error(`Unknown demo document ${id}`);
  return doc;
};

// ── Facts ───────────────────────────────────────────────────────────────────────────────────────

export type DemoFactStatus = "proposed" | "confirmed" | "rejected";

export interface DemoFact {
  id: string;
  statement: string;
  category: FactCategory;
  documentId: DemoDocId;
  /** Verbatim words from the source document. */
  quote: string;
  asOf?: string;
  /** Extraction confidence, 0-1. */
  confidence: number;
  /** Most facts were already confirmed by the imagined team; a few wait for you in step 1. */
  initialStatus: Exclude<DemoFactStatus, "rejected">;
}

export const DEMO_FACTS: readonly DemoFact[] = [
  // Mission statement
  {
    id: "f-mission",
    statement:
      "Juniper Mesa Community Builders trains rural adults in the building trades so they can earn a living wage close to home.",
    category: "mission",
    documentId: "doc-mission",
    quote:
      "Juniper Mesa Community Builders trains rural adults in the building trades so they can earn a living wage close to home.",
    confidence: 0.98,
    initialStatus: "confirmed",
  },
  {
    id: "f-founded",
    statement: "Founded in 2014 in Alder Flats.",
    category: "history",
    documentId: "doc-mission",
    quote: "Founded in 2014 in Alder Flats",
    confidence: 0.97,
    initialStatus: "confirmed",
  },
  {
    id: "f-counties",
    statement: "Serves residents of Tobosa and Red Wash counties.",
    category: "geography",
    documentId: "doc-mission",
    quote: "we serve residents of Tobosa and Red Wash counties",
    confidence: 0.96,
    initialStatus: "confirmed",
  },
  {
    id: "f-curriculum",
    statement: "Trainees learn carpentry, basic electrical work and weatherization.",
    category: "program",
    documentId: "doc-mission",
    quote: "Our crews learn carpentry, basic electrical work and weatherization",
    confidence: 0.93,
    initialStatus: "confirmed",
  },
  {
    id: "f-free-repairs",
    statement: "Training crews repair homes for elderly and disabled neighbors at no cost to them.",
    category: "program",
    documentId: "doc-mission",
    quote: "repairing homes for elderly and disabled neighbors at no cost to them",
    confidence: 0.92,
    initialStatus: "confirmed",
  },
  // 2025 annual report
  {
    id: "f-enrolled",
    statement: "64 trainees enrolled in the 16-week pre-apprenticeship program.",
    category: "metric",
    documentId: "doc-annual",
    quote: "In 2025, 64 trainees enrolled in our 16-week pre-apprenticeship program",
    asOf: "2025",
    confidence: 0.95,
    initialStatus: "confirmed",
  },
  {
    id: "f-completed",
    statement: "51 trainees completed the pre-apprenticeship program.",
    category: "outcome",
    documentId: "doc-annual",
    quote: "and 51 completed it",
    asOf: "2025",
    confidence: 0.94,
    initialStatus: "confirmed",
  },
  {
    id: "f-employed",
    statement: "43 graduates were working in the trades within 90 days of finishing.",
    category: "outcome",
    documentId: "doc-annual",
    quote: "Within 90 days of finishing, 43 graduates were working in the trades",
    asOf: "2025",
    confidence: 0.94,
    initialStatus: "confirmed",
  },
  {
    id: "f-wage",
    statement: "Graduates' median starting wage was $21.50 an hour.",
    category: "outcome",
    documentId: "doc-annual",
    quote: "at a median starting wage of $21.50 an hour",
    asOf: "2025",
    confidence: 0.9,
    initialStatus: "proposed",
  },
  {
    id: "f-homes",
    statement: "Training crews repaired 38 homes.",
    category: "metric",
    documentId: "doc-annual",
    quote: "Training crews repaired 38 homes this year",
    asOf: "2025",
    confidence: 0.93,
    initialStatus: "confirmed",
  },
  {
    id: "f-families",
    statement: "Programs served 320 families across both counties.",
    category: "population_served",
    documentId: "doc-annual",
    quote: "our programs served 320 families across both counties",
    asOf: "2025",
    confidence: 0.91,
    initialStatus: "confirmed",
  },
  {
    id: "f-budget",
    statement: "The 2025 operating budget was $612,000, 58% of it from foundation grants.",
    category: "financial",
    documentId: "doc-annual",
    quote: "Our 2025 operating budget was $612,000, with 58% coming from foundation grants",
    asOf: "2025",
    confidence: 0.96,
    initialStatus: "confirmed",
  },
  // Interview answers
  {
    id: "f-staff",
    statement: "Nine full-time staff, including four licensed tradespeople who lead the crews.",
    category: "staff",
    documentId: "doc-interview",
    quote:
      "We have nine full-time staff, including four licensed tradespeople who lead our training crews",
    asOf: "2026",
    confidence: 0.95,
    initialStatus: "confirmed",
  },
  {
    id: "f-first-gen",
    statement:
      "About 70% of trainees are the first in their family to attend any training after high school.",
    category: "population_served",
    documentId: "doc-interview",
    quote:
      "About 70% of our trainees are the first in their family to attend any training after high school",
    asOf: "2026",
    confidence: 0.88,
    initialStatus: "confirmed",
  },
  {
    id: "f-employers",
    statement: "Graduates are placed with 22 local employers.",
    category: "partner",
    documentId: "doc-interview",
    quote: "We place graduates with 22 local employers",
    asOf: "2026",
    confidence: 0.92,
    initialStatus: "confirmed",
  },
  {
    id: "f-trailer",
    statement: "Next goal: a mobile training trailer to reach remote ranching communities.",
    category: "project",
    documentId: "doc-interview",
    quote:
      "Our next goal is a mobile training trailer, so we can bring the program to the most remote ranching communities",
    confidence: 0.84,
    initialStatus: "proposed",
  },
];

export const factById = (id: string) => DEMO_FACTS.find((f) => f.id === id);

// ── Interview (step 2) ──────────────────────────────────────────────────────────────────────────

export interface DemoInterviewTurn {
  id: string;
  question: string;
  /** Why the interviewer asks: shown under the question. */
  why: string;
  answer: string;
  /** Facts proposed from this answer. */
  factIds: string[];
}

export const DEMO_INTERVIEW: readonly DemoInterviewTurn[] = [
  {
    id: "q-team",
    question: "How big is your team?",
    why: "Funders ask about staff capacity, and none of the documents says.",
    answer:
      "We have nine full-time staff, including four licensed tradespeople who lead our training crews.",
    factIds: ["f-staff"],
  },
  {
    id: "q-trainees",
    question: "Who are your trainees?",
    why: "Workforce funders want to know who you reach.",
    answer:
      "About 70% of our trainees are the first in their family to attend any training after high school. Most live more than 40 miles from the nearest city.",
    factIds: ["f-first-gen"],
  },
  {
    id: "q-employers",
    question: "Who hires your graduates?",
    why: "Employer partners make an outcomes claim stronger.",
    answer:
      "We place graduates with 22 local employers, from small contractors to the county road department.",
    factIds: ["f-employers"],
  },
];

export const YOUR_TURN_QUESTION = {
  question: "How many volunteers helped your crews last year, and for how many hours?",
  why: "Several funders ask for volunteer numbers. Try any answer: the demo shows how it would become a fact.",
  sample: "In 2025, 35 volunteers gave about 1,200 hours alongside our training crews.",
} as const;

// ── Grant matches (step 3) ──────────────────────────────────────────────────────────────────────

export interface DemoMatchReason {
  tone: "fit" | "risk";
  text: string;
  factIds: string[];
}

export interface DemoOpportunity {
  id: string;
  title: string;
  funder: string;
  awardRange: string;
  /** What Juniper Mesa would ask for. */
  askCents: number;
  closesInDays: number;
  /** 0-100 */
  fitScore: number;
  /** 0-1 */
  likelihood: number;
  eligibility: Eligibility;
  summary: string;
  firstSubmissionToFunder: boolean;
  /** The funder takes applications we can send without a person (e.g. by email). */
  channelSupportsAuto: boolean;
  channelLabel: string;
  reasons: DemoMatchReason[];
}

export const DEMO_OPPORTUNITIES: readonly DemoOpportunity[] = [
  {
    id: "opp-trades",
    title: "Rural Trades Pathways Grant",
    funder: "Hollow Creek Foundation",
    awardRange: "$40,000 – $75,000",
    askCents: 6_000_000,
    closesInDays: 34,
    fitScore: 91,
    likelihood: 0.42,
    eligibility: "eligible",
    summary:
      "Two-year support for nonprofits that train rural adults for skilled trades jobs in the region.",
    firstSubmissionToFunder: true,
    channelSupportsAuto: true,
    channelLabel: "Online form",
    reasons: [
      {
        tone: "fit",
        text: "The funder's priority, rural adults trained for skilled trades jobs, is Juniper Mesa's mission almost word for word.",
        factIds: ["f-mission", "f-curriculum"],
      },
      {
        tone: "fit",
        text: "Tobosa and Red Wash counties are inside the funder's service region.",
        factIds: ["f-counties"],
      },
      {
        tone: "fit",
        text: "The funder asks for job placement results, and the 2025 numbers are strong: 43 of 51 graduates working in the trades within 90 days.",
        factIds: ["f-completed", "f-employed"],
      },
      {
        tone: "fit",
        text: "Applicants must have operated for at least five years. Juniper Mesa was founded in 2014.",
        factIds: ["f-founded"],
      },
      {
        tone: "risk",
        text: "First application to this funder, so a person on the team reviews it before it goes out.",
        factIds: [],
      },
    ],
  },
  {
    id: "opp-federal",
    title: "Workforce Futures Innovation Award",
    funder: "National Workforce Futures Program",
    awardRange: "$250,000 – $500,000",
    askCents: 30_000_000,
    closesInDays: 52,
    fitScore: 72,
    likelihood: 0.08,
    eligibility: "likely_eligible",
    summary:
      "Large multi-year awards for workforce programs that test new training models. Highly competitive.",
    firstSubmissionToFunder: true,
    channelSupportsAuto: false,
    channelLabel: "Federal portal (a person submits)",
    reasons: [
      {
        tone: "fit",
        text: "Pre-apprenticeship training with employer partners fits the program's goals.",
        factIds: ["f-enrolled", "f-employers"],
      },
      {
        tone: "risk",
        text: "Awards start at $250,000, which is 40% of Juniper Mesa's whole $612,000 budget. Reviewers look closely at capacity.",
        factIds: ["f-budget"],
      },
      {
        tone: "risk",
        text: "Very competitive: the estimated chance of an award is only 8%.",
        factIds: [],
      },
    ],
  },
  {
    id: "opp-repair",
    title: "Home Repair & Weatherization Fund",
    funder: "Desert Light Community Trust",
    awardRange: "Up to $10,000",
    askCents: 1_000_000,
    closesInDays: 19,
    fitScore: 84,
    likelihood: 0.48,
    eligibility: "eligible",
    summary:
      "Small grants for groups that make homes safer and warmer for older and disabled residents.",
    firstSubmissionToFunder: false,
    channelSupportsAuto: true,
    channelLabel: "By email",
    reasons: [
      {
        tone: "fit",
        text: "Training crews repair homes for elderly and disabled neighbors at no cost, and repaired 38 homes in 2025.",
        factIds: ["f-free-repairs", "f-homes"],
      },
      {
        tone: "fit",
        text: "Weatherization is part of the curriculum.",
        factIds: ["f-curriculum"],
      },
      {
        tone: "risk",
        text: "Small award, so a high chance of winning still adds up to a modest expected value.",
        factIds: [],
      },
    ],
  },
  {
    id: "opp-arts",
    title: "Arts in Rural Places",
    funder: "Prairie Lantern Fund",
    awardRange: "$5,000 – $15,000",
    askCents: 1_000_000,
    closesInDays: 27,
    fitScore: 18,
    likelihood: 0.03,
    eligibility: "ineligible",
    summary: "Grants for arts and culture organizations in small towns.",
    firstSubmissionToFunder: true,
    channelSupportsAuto: true,
    channelLabel: "Online form",
    reasons: [
      {
        tone: "risk",
        text: "Only arts and culture organizations may apply. Nothing in Juniper Mesa's records describes arts programming.",
        factIds: ["f-mission"],
      },
    ],
  },
];

// ── Draft (step 4) ──────────────────────────────────────────────────────────────────────────────

export interface DemoClaim {
  id: string;
  text: string;
  factIds: string[];
}

export interface DemoDraftSection {
  title: string;
  /** What the funder asked for in this section. */
  prompt: string;
  paragraphs: DemoClaim[][];
}

/** Claim ids with special handling in the review screen. */
export const MISMATCH_CLAIM_ID = "c-families";
export const GAP_CLAIM_ID = "c-gap";

export const MISMATCH = {
  unsupportedText: "We served 500 families across both counties.",
  supportedText: "In 2025, our programs served 320 families across both counties.",
  factId: "f-families",
  explanation:
    "The sentence says 500 families, but the fact it cites says 320 (2025 annual report). Nothing in Juniper Mesa's records supports 500, so the checker flagged it as a blocker.",
} as const;

export const GAP = {
  question: "How many trainees will this grant help you train in the first year?",
  explanation:
    "The funder asks for a first-year training target. Juniper Mesa's records don't say, so the draft asks instead of guessing a number.",
} as const;

export const DEMO_DRAFT: DemoDraftSection = {
  title: "Program outcomes",
  prompt: "Describe your program, who it serves and the results you have achieved. (500 words)",
  paragraphs: [
    [
      {
        id: "c-mission",
        text: "Juniper Mesa Community Builders trains rural adults in the building trades so they can earn a living wage close to home.",
        factIds: ["f-mission"],
      },
      {
        id: "c-history",
        text: "Since our founding in 2014, we have served residents of Tobosa and Red Wash counties.",
        factIds: ["f-founded", "f-counties"],
      },
      {
        id: "c-curriculum",
        text: "Trainees learn carpentry, basic electrical work and weatherization by repairing homes for elderly and disabled neighbors at no cost to them.",
        factIds: ["f-curriculum", "f-free-repairs"],
      },
    ],
    [
      {
        id: "c-outcomes",
        text: "In 2025, 51 trainees completed our pre-apprenticeship program, and 43 of them were working in the trades within 90 days.",
        factIds: ["f-completed", "f-employed"],
      },
      { id: MISMATCH_CLAIM_ID, text: MISMATCH.unsupportedText, factIds: [MISMATCH.factId] },
      {
        id: "c-first-gen",
        text: "About 70% of our trainees are the first in their family to attend any training after high school.",
        factIds: ["f-first-gen"],
      },
    ],
    [
      {
        id: "c-staff",
        text: "Nine full-time staff, including four licensed tradespeople, lead our training crews.",
        factIds: ["f-staff"],
      },
      { id: GAP_CLAIM_ID, text: GAP.question, factIds: [] },
    ],
  ],
};

// ── Submission (step 6) ─────────────────────────────────────────────────────────────────────────

export const DEMO_ATTACHMENTS = [
  "2025 annual report (excerpt).pdf",
  "Board-approved 2026 budget.pdf",
  "IRS determination letter.pdf",
] as const;

export const DEMO_FOLLOWUPS = [
  {
    kind: "Status check",
    when: "2 weeks after submission",
    detail: "A reminder to check the funder portal, with a short status email drafted for you.",
  },
  {
    kind: "Decision expected",
    when: "When the funder says decisions go out",
    detail: "Record the outcome. Wins and declines both teach the matcher what fits.",
  },
  {
    kind: "Thank-you note",
    when: "If awarded",
    detail: "A thank-you draft that cites only facts from your fact base.",
  },
  {
    kind: "Report due",
    when: "30 days before each report deadline",
    detail: "Progress reports start from the same facts, updated with new results.",
  },
] as const;
