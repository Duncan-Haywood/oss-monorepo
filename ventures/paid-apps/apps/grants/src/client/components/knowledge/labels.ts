// Friendly labels / helper text for knowledge-base enums (documents, facts, projects).
import type {
  DocumentKind,
  DocumentStatus,
  FactCategory,
  FactStatus,
  PastOutcome,
  ProjectStatus,
} from "@shared/enums";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export const DOCUMENT_KIND_INFO: Record<DocumentKind, { label: string; help: string }> = {
  mission_statement: {
    label: "Mission statement",
    help: "Your mission, vision and values in your own words.",
  },
  charter_bylaws: {
    label: "Charter / bylaws",
    help: "Articles of incorporation, bylaws, tribal charter or IRS determination letter.",
  },
  annual_report: {
    label: "Annual report",
    help: "Yearly summaries of programs, people served and outcomes.",
  },
  financial_statement: {
    label: "Financial statement / audit",
    help: "Audited financials, Form 990, balance sheets.",
  },
  budget: { label: "Budget", help: "Organization or program budgets, including line items." },
  program_description: {
    label: "Program description",
    help: "How a program works, who it serves and what it achieves.",
  },
  past_application: {
    label: "Past grant application",
    help: "A proposal you submitted before. Tell us how it went so we learn from it.",
  },
  award_letter: { label: "Award letter", help: "Notice that a grant was awarded." },
  rejection_letter: {
    label: "Decline letter / reviewer feedback",
    help: "Funder declines and any reviewer comments.",
  },
  letter_of_support: {
    label: "Letter of support",
    help: "Letters from partners, officials or community members.",
  },
  interview_transcript: {
    label: "Interview transcript",
    help: "Notes or transcripts of conversations with staff or participants.",
  },
  website_page: { label: "Website page", help: "Text from your website." },
  policy: {
    label: "Policy",
    help: "Organizational policies (conflict of interest, non-discrimination…).",
  },
  other: { label: "Other", help: "Anything else that describes your work accurately." },
  update_note: {
    label: "Update note",
    help: "A short note about what changed recently, typed or dictated as a quick update.",
  },
};

export const documentKindLabel = (k: string) =>
  DOCUMENT_KIND_INFO[k as DocumentKind]?.label ?? humanize(k);

export const DOCUMENT_STATUS_INFO: Record<DocumentStatus, { label: string; tone: Tone }> = {
  uploaded: { label: "Queued", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  ready: { label: "Ready", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export const isDocumentBusy = (status: string) => status === "uploaded" || status === "processing";

export const PAST_OUTCOME_LABELS: Record<PastOutcome, string> = {
  awarded: "Awarded",
  declined: "Declined",
  pending: "Pending decision",
  unknown: "Unknown",
};

export const FACT_CATEGORY_LABELS: Record<FactCategory, string> = {
  identity: "Identity",
  mission: "Mission",
  history: "History",
  program: "Program",
  population_served: "Population served",
  geography: "Geography",
  outcome: "Outcome",
  metric: "Metric",
  financial: "Financial",
  staff: "Staff",
  governance: "Governance",
  partner: "Partner",
  capacity: "Capacity",
  project: "Project",
  other: "Other",
};

export const factCategoryLabel = (c: string) =>
  FACT_CATEGORY_LABELS[c as FactCategory] ?? humanize(c);

export const FACT_STATUS_INFO: Record<FactStatus, { label: string; tone: Tone }> = {
  proposed: { label: "Needs review", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  superseded: { label: "Superseded", tone: "neutral" },
};

export const PROJECT_STATUS_INFO: Record<ProjectStatus, { label: string; tone: Tone }> = {
  idea: { label: "Idea", tone: "neutral" },
  planned: { label: "Planned", tone: "info" },
  active: { label: "Active", tone: "brand" },
  funded: { label: "Funded", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: "1 — Highest",
  2: "2 — High",
  3: "3 — Medium",
  4: "4 — Low",
  5: "5 — Lowest",
};

export function humanize(s: string) {
  const t = s.replace(/[_-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "$12,500.50" -> 1250050; "" -> null; invalid -> NaN */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return Number.NaN;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** 1250050 -> "12500.50"; 1250000 -> "12500" (for input fields) */
export function centsToDollarInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
