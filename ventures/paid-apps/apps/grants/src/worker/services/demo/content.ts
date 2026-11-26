// Sample content for the offline demo org. EVERYTHING here is FICTIONAL: the organization, people,
// funders and numbers are invented for demonstration and must never be presented as a real tenant.
// Contact details use reserved example.org addresses.
import type { DocumentKind, PastOutcome } from "@shared/enums";
import type { ProjectInput } from "../knowledge/projects";

/** Marker stored in organization.metadata so the seed is idempotent per user. */
export const DEMO_SEED_KEY = "example-valley-trades";
export const DEMO_SEED_VERSION = 1;

export const DEMO_ORG = {
  name: "Example Valley Trades Collective",
  legalName: "Example Valley Trades Collective (fictional demo organization)",
  orgType: "nonprofit_501c3",
  city: "Example Valley",
  state: "NM",
  websiteUrl: "https://example.org",
  focusAreas: ["workforce development", "construction trades", "apprenticeship", "home repair"],
  serviceAreas: ["Example Valley, NM", "Rural northern New Mexico"],
  foundedYear: 2012,
  contactName: "Demo Grants Contact",
  contactEmail: "grants@example.org",
} as const;

export interface DemoDocument {
  key: string;
  title: string;
  kind: DocumentKind;
  text: string;
  past?: { outcome: PastOutcome; funder: string; amountCents: number; year: number };
}

const FICTIONAL =
  "> SAMPLE DATA: Example Valley Trades Collective is a fictional organization created for the Grant Autopilot demo.";

export const DEMO_DOCUMENTS: DemoDocument[] = [
  {
    key: "mission",
    title: "Mission statement (sample)",
    kind: "mission_statement",
    text: `# Mission Statement

${FICTIONAL}

Our mission is to prepare rural adults in northern New Mexico for living-wage careers in the construction trades.

Example Valley Trades Collective was founded in 2012 in Example Valley, New Mexico.

We serve adults aged 18 to 55 from rural households in Example Valley and the surrounding counties.

Our programs combine hands-on carpentry, electrical and plumbing training with paid work on community home repair projects.

We partner with local contractors who hire our graduates into apprenticeships and full-time jobs.
`,
  },
  {
    key: "annual-report",
    title: "Annual report summary 2025 (sample)",
    kind: "annual_report",
    text: `# Annual Report Summary — 2025

${FICTIONAL}

In 2025, 64 trainees completed our 16-week pre-apprenticeship program.

Of the 2025 graduates, 48 were placed in construction jobs or registered apprenticeships within 90 days, a placement rate of 75 percent.

Graduates earned 112 industry-recognized credentials in 2025, including OSHA 10 and NCCER Core certifications.

Trainee crews completed repairs on 37 homes owned by elders and low-income families in 2025.

Our total operating budget for 2025 was $1,240,000, of which 22 percent came from earned revenue on repair contracts.

The organization employed 14 staff members, including 6 certified instructors, at the end of 2025.

Our board of directors has 9 members, 5 of whom work in the construction industry.
`,
  },
  {
    key: "program",
    title: "Program description: Pathways to Trades (sample)",
    kind: "program_description",
    text: `# Program Description — Pathways to Trades

${FICTIONAL}

Pathways to Trades is a 16-week pre-apprenticeship training program offered three times per year.

Each cohort enrolls up to 24 participants who receive a weekly training stipend of $300.

The curriculum covers construction math, blueprint reading, tool safety, carpentry, basic electrical and plumbing.

Participants spend two days per week on supervised job sites repairing homes in Example Valley.

Case managers help participants with transportation, childcare referrals and driver's license reinstatement.

After graduation, job coaches follow up with each graduate for 12 months to support job retention.
`,
  },
  {
    key: "past-application",
    title: "Past application: Rural Workforce Fund 2024 (sample, awarded)",
    kind: "past_application",
    past: {
      outcome: "awarded",
      funder: "Sample Rural Workforce Fund (fictional)",
      amountCents: 7_500_000,
      year: 2024,
    },
    text: `# Application to the Sample Rural Workforce Fund — 2024 (awarded)

${FICTIONAL}

## Organization Background

Example Valley Trades Collective was founded in 2012 to connect rural adults with careers in the building trades.

Since 2012, more than 500 adults have completed our pre-apprenticeship training.

## Statement of Need

Local contractors report that they cannot find enough entry-level carpenters and electricians to meet demand.

## Program Design

The grant will fund one additional training cohort per year and the purchase of a mobile tool trailer.

## Goals and Measurable Outcomes

We will enroll 24 additional trainees and place at least 70 percent of graduates in jobs within 90 days.
`,
  },
  {
    key: "interview",
    title: "Interview transcript: program director (sample)",
    kind: "interview_transcript",
    text: `# Interview Transcript — Program Director

${FICTIONAL}

Interviewer: What makes your training model different?

Program Director: Our trainees learn on real job sites from the second week, repairing homes for elders in Example Valley.

Interviewer: What do employers say about your graduates?

Program Director: Twelve local contractors hired our graduates in 2025, and most of them hire from every cohort.

Interviewer: What would you do with new funding?

Program Director: We plan to launch a solar installation track in 2027 so graduates can work on rooftop solar and weatherization jobs.

Interviewer: What is the biggest barrier your trainees face?

Program Director: Transportation is the biggest barrier, because many trainees live more than 30 miles from the training center.
`,
  },
];

/** Fact categories confirmed by the seed (a reviewer would confirm these first). */
export const DEMO_CONFIRM_CATEGORIES = new Set([
  "mission",
  "history",
  "outcome",
  "financial",
  "population_served",
  "geography",
]);
export const DEMO_CONFIRM_MAX = 10;

export const DEMO_PROJECTS: (ProjectInput & { title: string })[] = [
  {
    title: "Mobile tool trailer and fourth training cohort (sample)",
    summary:
      "Add a fourth Pathways to Trades cohort each year and buy a mobile tool trailer so crews can train on job sites across the service area.",
    problem:
      "Contractors in Example Valley report more open entry-level positions than trained applicants.",
    approach:
      "Hire one additional instructor, purchase a mobile tool trailer and run a fourth 16-week cohort per year.",
    populationServed: "Rural adults aged 18 to 55 in Example Valley and surrounding counties",
    location: "Example Valley, NM",
    budgetNeededCents: 18_500_000,
    status: "planned",
    priority: 1,
  },
  {
    title: "Solar and weatherization installer track (sample)",
    summary:
      "Launch a solar installation and weatherization specialization for Pathways to Trades graduates.",
    problem: "Few local workers are trained for rooftop solar and weatherization work.",
    approach:
      "Partner with local installers to deliver an 8-week specialization with paid job-site practice.",
    populationServed: "Pathways to Trades graduates",
    location: "Example Valley, NM",
    budgetNeededCents: 9_000_000,
    status: "idea",
    priority: 2,
  },
];
