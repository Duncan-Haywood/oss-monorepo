// Offline demo catalog (used when FAKE_EXTERNALS=true instead of calling Grants.gov).
// Every entry is FICTIONAL and clearly labeled: titles start with "[Sample] ", funders are named
// "Sample ..." and contact details use example.org. They do not represent real funders or programs.
import type { OpportunityRequirements, RequirementSection } from "@shared/content";
import type { FunderType, OpportunityStatus } from "@shared/enums";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { opportunities } from "../../db/schema";
import { sha256Hex } from "../../lib/hash";
import { type UpsertOutcome, upsertCatalogOpportunity } from "./catalog";
import type { CatalogRecord } from "./grants-gov";

const SAMPLE_VERSION = 1;
const DAY = 24 * 3600_000;

type Section = Partial<RequirementSection> & Pick<RequirementSection, "key" | "title">;
const section = (s: Section): RequirementSection => ({
  prompt: "",
  kind: "narrative",
  required: true,
  wordLimit: null,
  charLimit: null,
  guidance: "",
  ...s,
});

export interface SampleOpportunity {
  slug: string;
  title: string;
  funderName: string;
  funderType: FunderType;
  summary: string;
  description: string;
  eligibilityText: string;
  applicantTypes: string[];
  categories: string[];
  keywords: string[];
  geographicScope: string;
  awardFloorCents: number | null;
  awardCeilingCents: number | null;
  totalFundingCents: number | null;
  expectedAwards: number | null;
  costSharingRequired: boolean;
  /** Relative to the seed time so the demo catalog always has live deadlines. */
  openOffsetDays: number;
  closeOffsetDays: number;
  status: OpportunityStatus;
  submissionMethod: "email" | "portal";
  requirements: OpportunityRequirements;
}

const NONPROFIT = "Nonprofits having a 501(c)(3) status with the IRS";
const TRIBAL_ORG = "Native American tribal organizations";
const TRIBAL_GOV = "Native American tribal governments (Federally recognized)";

const standardAttachments = [
  { name: "IRS determination letter", required: true, description: "Proof of 501(c)(3) status." },
  { name: "Line-item budget", required: true, description: "Use the funder's budget template." },
  { name: "Most recent audited financial statements or Form 990", required: true, description: "" },
  { name: "Board of directors list", required: false, description: "Names and affiliations." },
];

export const SAMPLE_OPPORTUNITIES: SampleOpportunity[] = [
  {
    slug: "rural-trades-apprenticeship",
    title: "[Sample] Rural Trades Apprenticeship Expansion Grant",
    funderName: "Sample Foundation for Rural Workforce",
    funderType: "foundation",
    summary:
      "Supports nonprofits that expand pre-apprenticeship and apprenticeship pathways in the construction trades (carpentry, electrical, plumbing, HVAC) for adults in rural communities.",
    description:
      "SAMPLE DATA — fictional funder for demonstration. The Rural Trades Apprenticeship Expansion Grant funds programs that help rural adults enter registered apprenticeships or living-wage construction jobs. Priority is given to programs that combine hands-on training with employer partnerships, industry-recognized credentials (e.g. OSHA 10, NCCER) and supportive services. Grants may fund instructor salaries, tools and equipment, curriculum, stipends and job placement activities. Programs serving tribal communities and areas with persistent poverty are especially encouraged.",
    eligibilityText:
      "501(c)(3) nonprofit organizations and tribal organizations operating workforce training programs in rural areas of the U.S. Southwest. Applicants must have at least two years of program operating history.",
    applicantTypes: [NONPROFIT, TRIBAL_ORG],
    categories: ["Employment, Labor and Training", "Education"],
    keywords: ["workforce development", "construction trades", "apprenticeship"],
    geographicScope: "Rural Arizona, New Mexico, Utah and Colorado",
    awardFloorCents: 5_000_000,
    awardCeilingCents: 15_000_000,
    totalFundingCents: 120_000_000,
    expectedAwards: 10,
    costSharingRequired: false,
    openOffsetDays: -20,
    closeOffsetDays: 30,
    status: "posted",
    submissionMethod: "portal",
    requirements: {
      complete: true,
      eligibilityCriteria: [
        "Registered 501(c)(3) or tribal organization",
        "Program operates in a rural county of AZ, NM, UT or CO",
        "At least two years of workforce program operating history",
      ],
      submissionInstructions:
        "Submit through the Sample Foundation online portal (portal.example.org) by 5:00 PM Mountain Time on the deadline.",
      attachments: standardAttachments,
      sections: [
        section({
          key: "organization_background",
          title: "Organization Background",
          prompt:
            "Describe your organization's mission, history and track record in workforce training.",
          wordLimit: 400,
          guidance: "Reviewers look for a demonstrated history of serving the target population.",
        }),
        section({
          key: "need_statement",
          title: "Statement of Need",
          prompt:
            "Describe the employment barriers facing the people you serve and the local demand for skilled trades workers.",
          wordLimit: 500,
          guidance: "Use local data where available. 20 points.",
        }),
        section({
          key: "program_design",
          title: "Program Design",
          prompt:
            "Describe the training model, curriculum, credentials offered, employer partners and how participants move into apprenticeships or jobs.",
          wordLimit: 750,
          guidance: "30 points. Clear pathway from training to employment.",
        }),
        section({
          key: "goals_outcomes",
          title: "Goals and Measurable Outcomes",
          prompt:
            "List enrollment, completion, credential and placement targets for the grant period.",
          wordLimit: 300,
          guidance: "20 points.",
        }),
        section({
          key: "evaluation_plan",
          title: "Evaluation Plan",
          prompt:
            "How will you track participant outcomes and use the data to improve the program?",
          wordLimit: 300,
        }),
        section({
          key: "budget_narrative",
          title: "Budget Narrative",
          prompt: "Explain each budget line and how it supports program outcomes.",
          kind: "budget",
          wordLimit: 400,
        }),
        section({
          key: "sustainability",
          title: "Sustainability",
          prompt: "How will the program continue after the grant period?",
          wordLimit: 250,
        }),
      ],
    },
  },
  {
    slug: "native-led-workforce-pathways",
    title: "[Sample] Native-Led Workforce Pathways Fund",
    funderName: "Sample Tribal Communities Fund",
    funderType: "foundation",
    summary:
      "Flexible grants for Native-led and Native-serving organizations creating culturally grounded job training and career pathways on or near tribal lands.",
    description:
      "SAMPLE DATA — fictional funder for demonstration. The Native-Led Workforce Pathways Fund invests in organizations that serve American Indian and Alaska Native communities with job training, career coaching and placement. The Fund values programs that integrate cultural knowledge, language and community priorities, and that partner with tribal employers, chapters or enterprises. Funds may be used for general program support.",
    eligibilityText:
      "Nonprofit organizations and tribal organizations that are Native-led or that primarily serve American Indian / Alaska Native people.",
    applicantTypes: [NONPROFIT, TRIBAL_ORG, TRIBAL_GOV],
    categories: ["Employment, Labor and Training", "Community Development"],
    keywords: ["Native American", "tribal", "job training"],
    geographicScope: "United States (tribal communities)",
    awardFloorCents: 2_500_000,
    awardCeilingCents: 7_500_000,
    totalFundingCents: 60_000_000,
    expectedAwards: 12,
    costSharingRequired: false,
    openOffsetDays: -30,
    closeOffsetDays: 21,
    status: "posted",
    submissionMethod: "email",
    requirements: {
      complete: true,
      eligibilityCriteria: [
        "Native-led organization or majority of participants are American Indian / Alaska Native",
        "Nonprofit, tribal organization or tribal government",
      ],
      submissionInstructions:
        "Email a single PDF to grants@sample-tribal-fund.example.org with the subject line 'Workforce Pathways Application – [Organization Name]'.",
      attachments: [
        { name: "Proof of nonprofit or tribal status", required: true, description: "" },
        { name: "Program budget", required: true, description: "One page." },
        { name: "Letter of support from a tribal partner", required: false, description: "" },
      ],
      sections: [
        section({
          key: "community_context",
          title: "Community Context",
          prompt: "Tell us about the community you serve and the workforce challenges it faces.",
          wordLimit: 400,
        }),
        section({
          key: "program_description",
          title: "Program Description",
          prompt:
            "Describe your job training or career pathway program, including how it reflects community and cultural priorities.",
          wordLimit: 600,
        }),
        section({
          key: "community_partnerships",
          title: "Community Partnerships",
          prompt: "Which tribal entities, employers or community groups do you partner with?",
          wordLimit: 300,
        }),
        section({
          key: "outcomes",
          title: "Expected Outcomes",
          prompt: "What will change for participants and the community over the next 12 months?",
          wordLimit: 300,
        }),
        section({
          key: "budget_summary",
          title: "Budget Summary",
          kind: "budget",
          prompt: "Summarize how the requested funds will be used.",
          wordLimit: 200,
        }),
      ],
    },
  },
  {
    slug: "home-repair-construction-training",
    title: "[Sample] Community Home Repair & Construction Training Initiative",
    funderName: "Sample Southwest Housing Collaborative",
    funderType: "foundation",
    summary:
      "Funds programs where trainees learn construction skills by repairing or building homes for low-income families, elders and people with disabilities.",
    description:
      "SAMPLE DATA — fictional funder for demonstration. This initiative supports 'learn-by-building' models: trainees gain carpentry, roofing, electrical and plumbing skills on supervised home repair and new construction projects that improve housing conditions for families in need. Proposals should describe the training model, safety supervision, the homes or families to be served, and how trainees are connected to employment.",
    eligibilityText:
      "501(c)(3) organizations with experience in housing, construction or workforce training. Projects must be located in New Mexico or Arizona.",
    applicantTypes: [NONPROFIT, TRIBAL_ORG],
    categories: ["Housing", "Employment, Labor and Training"],
    keywords: ["construction trades", "housing", "New Mexico"],
    geographicScope: "New Mexico and Arizona",
    awardFloorCents: 10_000_000,
    awardCeilingCents: 25_000_000,
    totalFundingCents: 150_000_000,
    expectedAwards: 6,
    costSharingRequired: true,
    openOffsetDays: -10,
    closeOffsetDays: 45,
    status: "posted",
    submissionMethod: "portal",
    requirements: {
      complete: true,
      eligibilityCriteria: [
        "501(c)(3) organization",
        "Projects located in New Mexico or Arizona",
        "20% cost share (cash or in-kind)",
      ],
      submissionInstructions: "Apply through apply.sample-housing.example.org.",
      attachments: [
        ...standardAttachments,
        { name: "Cost-share commitment letter", required: true, description: "" },
      ],
      sections: [
        section({
          key: "project_summary",
          title: "Project Summary",
          prompt: "Summarize the project in plain language.",
          charLimit: 1500,
        }),
        section({
          key: "need_statement",
          title: "Housing and Workforce Need",
          prompt: "Describe the housing conditions and workforce needs the project addresses.",
          wordLimit: 500,
        }),
        section({
          key: "training_model",
          title: "Training Model and Safety",
          prompt:
            "Describe how trainees are recruited, trained and supervised on job sites, and the credentials they earn.",
          wordLimit: 600,
        }),
        section({
          key: "homes_served",
          title: "Homes and Families Served",
          prompt: "How will you select homes and families, and how many will be served?",
          wordLimit: 300,
        }),
        section({
          key: "organizational_capacity",
          title: "Organizational Capacity",
          prompt: "Describe staff, licenses, equipment and past construction projects.",
          wordLimit: 400,
        }),
        section({
          key: "budget_narrative",
          title: "Budget Narrative and Cost Share",
          kind: "budget",
          prompt: "Explain the budget and identify the source of the 20% cost share.",
          wordLimit: 400,
        }),
      ],
    },
  },
  {
    slug: "youth-summer-skills",
    title: "[Sample] Youth Skills & Summer Employment Mini-Grant",
    funderName: "Sample High Desert Community Foundation",
    funderType: "foundation",
    summary:
      "Small grants for summer employment, paid internships and skills workshops for youth ages 16–24 in northwestern New Mexico.",
    description:
      "SAMPLE DATA — fictional funder for demonstration. Mini-grants support short-term youth employment and skills programs, including paid summer work crews, trades exploration camps and internships with local employers. A short application is used.",
    eligibilityText:
      "501(c)(3) organizations serving youth in McKinley, San Juan or Cibola counties, NM.",
    applicantTypes: [NONPROFIT],
    categories: ["Employment, Labor and Training", "Youth"],
    keywords: ["job training", "youth", "New Mexico"],
    geographicScope: "McKinley, San Juan and Cibola counties, New Mexico",
    awardFloorCents: 500_000,
    awardCeilingCents: 2_000_000,
    totalFundingCents: 20_000_000,
    expectedAwards: 15,
    costSharingRequired: false,
    openOffsetDays: -5,
    closeOffsetDays: 60,
    status: "posted",
    submissionMethod: "email",
    requirements: {
      complete: true,
      eligibilityCriteria: [
        "501(c)(3) organization",
        "Serves youth ages 16–24 in the service area",
      ],
      submissionInstructions: "Email the application to youthgrants@sample-highdesert.example.org.",
      attachments: [{ name: "IRS determination letter", required: true, description: "" }],
      sections: [
        section({
          key: "program_overview",
          title: "Program Overview",
          prompt: "What will youth do in your program and what skills will they gain?",
          wordLimit: 300,
        }),
        section({
          key: "youth_served",
          title: "Youth Served",
          prompt: "How many youth will participate and how will you recruit them?",
          wordLimit: 150,
        }),
        section({
          key: "budget_summary",
          title: "Budget",
          kind: "budget",
          prompt: "List how funds will be spent (wages, supplies, transportation, etc.).",
          wordLimit: 150,
        }),
      ],
    },
  },
  {
    slug: "clean-energy-installer-training",
    title: "[Sample] Solar & Weatherization Installer Training Grant",
    funderName: "Sample Clean Energy Careers Alliance",
    funderType: "other",
    summary:
      "Supports training programs that prepare workers for solar installation, home weatherization and energy-efficiency retrofit jobs in underserved communities.",
    description:
      "SAMPLE DATA — fictional funder for demonstration. Grants fund curriculum, instructors, training equipment, certification exam fees and placement services for clean-energy construction careers. Applicants should describe employer demand, the credential pathway (e.g. solar installer and weatherization technician certifications) and how training reaches communities with high energy burdens, including tribal and rural communities.",
    eligibilityText:
      "Nonprofit training providers, community colleges and tribal organizations in the Mountain West.",
    applicantTypes: [NONPROFIT, TRIBAL_ORG, TRIBAL_GOV],
    categories: ["Energy", "Employment, Labor and Training"],
    keywords: ["workforce development", "construction trades", "clean energy"],
    geographicScope: "Mountain West (AZ, CO, NM, NV, UT)",
    awardFloorCents: 7_500_000,
    awardCeilingCents: 20_000_000,
    totalFundingCents: 100_000_000,
    expectedAwards: 7,
    costSharingRequired: false,
    openOffsetDays: -15,
    closeOffsetDays: 75,
    status: "posted",
    submissionMethod: "portal",
    requirements: {
      complete: true,
      eligibilityCriteria: ["Nonprofit, college or tribal organization in the Mountain West"],
      submissionInstructions:
        "Submit via the Alliance portal at grants.sample-cleanenergy.example.org.",
      attachments: standardAttachments,
      sections: [
        section({
          key: "need_statement",
          title: "Need and Employer Demand",
          prompt: "Describe local clean-energy employer demand and the community's energy burden.",
          wordLimit: 400,
        }),
        section({
          key: "project_description",
          title: "Training Program Description",
          prompt: "Describe the curriculum, credentials, instructors and equipment.",
          wordLimit: 600,
        }),
        section({
          key: "goals_objectives",
          title: "Goals and Objectives",
          prompt: "Provide SMART objectives for enrollment, certification and placement.",
          wordLimit: 300,
        }),
        section({
          key: "evaluation_plan",
          title: "Evaluation Plan",
          prompt: "How will you measure and report outcomes?",
          wordLimit: 300,
        }),
        section({
          key: "budget_narrative",
          title: "Budget Narrative",
          kind: "budget",
          prompt: "Justify each budget category.",
          wordLimit: 400,
        }),
      ],
    },
  },
  {
    slug: "trades-tools-equipment",
    title: "[Sample] Skilled Trades Tools & Equipment Mini-Grants",
    funderName: "Sample Corporate Giving Program for Skilled Trades",
    funderType: "corporate",
    summary:
      "One-time grants for tools, safety gear and training equipment for nonprofit trades training programs.",
    description:
      "SAMPLE DATA — fictional funder for demonstration. Mini-grants purchase hand and power tools, personal protective equipment and shop equipment for nonprofit programs that train adults or youth in the skilled trades. A brief application and an itemized equipment list are required.",
    eligibilityText:
      "501(c)(3) organizations operating skilled-trades training programs in the U.S.",
    applicantTypes: [NONPROFIT],
    categories: ["Employment, Labor and Training"],
    keywords: ["construction trades", "job training"],
    geographicScope: "United States",
    awardFloorCents: 500_000,
    awardCeilingCents: 1_500_000,
    totalFundingCents: 30_000_000,
    expectedAwards: 25,
    costSharingRequired: false,
    openOffsetDays: -40,
    closeOffsetDays: 14,
    status: "posted",
    submissionMethod: "email",
    requirements: {
      complete: true,
      eligibilityCriteria: ["501(c)(3) organization with an active trades training program"],
      submissionInstructions: "Email to tradesgiving@sample-corporate.example.org.",
      attachments: [
        { name: "Itemized equipment list with quotes", required: true, description: "" },
        { name: "IRS determination letter", required: true, description: "" },
      ],
      sections: [
        section({
          key: "program_summary",
          title: "Program Summary",
          prompt: "Briefly describe your trades training program and who it serves.",
          wordLimit: 250,
        }),
        section({
          key: "equipment_need",
          title: "Equipment Need",
          prompt: "What equipment do you need and how will it improve training?",
          wordLimit: 250,
        }),
      ],
    },
  },
  {
    slug: "tribal-entrepreneurship-forecast",
    title: "[Sample] Tribal Small Business & Entrepreneurship Program (Forecast)",
    funderName: "Sample Rural Economic Opportunity Fund",
    funderType: "foundation",
    summary:
      "Forecasted opportunity to support entrepreneurship training, business coaching and access to capital for Native entrepreneurs, including contractors and tradespeople starting their own businesses.",
    description:
      "SAMPLE DATA — fictional funder for demonstration. This is a forecast: the full guidelines have not been released. The Fund expects to support programs that help Native entrepreneurs — including skilled tradespeople launching contracting businesses — with training, mentoring, licensing support and connections to lenders.",
    eligibilityText: "Expected: nonprofits and tribal organizations serving Native entrepreneurs.",
    applicantTypes: [NONPROFIT, TRIBAL_ORG, TRIBAL_GOV],
    categories: ["Business and Commerce", "Community Development"],
    keywords: ["Native American", "tribal", "entrepreneurship"],
    geographicScope: "Four Corners region",
    awardFloorCents: 5_000_000,
    awardCeilingCents: 10_000_000,
    totalFundingCents: 50_000_000,
    expectedAwards: 5,
    costSharingRequired: false,
    openOffsetDays: 30,
    closeOffsetDays: 120,
    status: "forecasted",
    submissionMethod: "portal",
    requirements: {
      complete: false,
      eligibilityCriteria: [
        "Expected: nonprofit or tribal organization serving Native entrepreneurs",
      ],
      submissionInstructions: "Guidelines not yet released (forecast).",
      attachments: [],
      sections: [
        section({
          key: "need_statement",
          title: "Statement of Need",
          guidance: "Standard section (guidelines not yet published).",
        }),
        section({
          key: "project_description",
          title: "Project Description",
          guidance: "Standard section (guidelines not yet published).",
        }),
        section({
          key: "organizational_capacity",
          title: "Organizational Capacity",
          guidance: "Standard section (guidelines not yet published).",
        }),
        section({
          key: "budget_narrative",
          title: "Budget Narrative",
          kind: "budget",
          guidance: "Standard section (guidelines not yet published).",
        }),
      ],
    },
  },
  {
    slug: "wraparound-supports-job-seekers",
    title: "[Sample] Wraparound Supports for Job Seekers",
    funderName: "Sample Regional Health & Wellbeing Trust",
    funderType: "foundation",
    summary:
      "Funds transportation, childcare, emergency assistance and case management that help adults complete job training and keep employment.",
    description:
      "SAMPLE DATA — fictional funder for demonstration. The Trust recognizes that barriers like transportation, childcare and housing instability keep people from finishing training. Grants pay for supportive services and case management linked to an existing job training or placement program in rural New Mexico.",
    eligibilityText:
      "501(c)(3) organizations operating job training or placement programs in rural New Mexico.",
    applicantTypes: [NONPROFIT, TRIBAL_ORG],
    categories: ["Health", "Employment, Labor and Training", "Income Security and Social Services"],
    keywords: ["workforce development", "New Mexico", "supportive services"],
    geographicScope: "Rural New Mexico",
    awardFloorCents: 4_000_000,
    awardCeilingCents: 10_000_000,
    totalFundingCents: 80_000_000,
    expectedAwards: 10,
    costSharingRequired: false,
    openOffsetDays: -7,
    closeOffsetDays: 40,
    status: "posted",
    submissionMethod: "portal",
    requirements: {
      complete: true,
      eligibilityCriteria: [
        "501(c)(3) organization",
        "Operates a job training or placement program in rural New Mexico",
      ],
      submissionInstructions: "Apply online at trust.sample-wellbeing.example.org/apply.",
      attachments: standardAttachments,
      sections: [
        section({
          key: "need_statement",
          title: "Barriers Facing Participants",
          prompt: "What barriers keep your participants from completing training or keeping jobs?",
          wordLimit: 400,
        }),
        section({
          key: "services",
          title: "Supportive Services Plan",
          prompt:
            "Which services will you provide, to how many people, and how are they delivered?",
          wordLimit: 500,
        }),
        section({
          key: "linkage",
          title: "Link to Training and Employment",
          prompt: "How are services connected to your training and placement program?",
          wordLimit: 300,
        }),
        section({
          key: "evaluation_plan",
          title: "Measuring Success",
          prompt: "How will you know the services improved completion and retention?",
          wordLimit: 300,
        }),
        section({
          key: "budget_narrative",
          title: "Budget Narrative",
          kind: "budget",
          prompt: "Explain the budget, including per-participant service costs.",
          wordLimit: 300,
        }),
      ],
    },
  },
];

export function sampleToRecord(s: SampleOpportunity, now: Date): CatalogRecord {
  const slugUrl = `https://sample-grants.example.org/opportunities/${s.slug}`;
  return {
    source: "manual",
    sourceId: `sample:${s.slug}`,
    sourceUrl: slugUrl,
    funder: { name: s.funderName, type: s.funderType },
    title: s.title,
    opportunityNumber: `SAMPLE-${s.slug.toUpperCase().slice(0, 18)}`,
    summary: s.summary,
    description: s.description,
    eligibilityText: s.eligibilityText,
    applicantTypes: s.applicantTypes,
    categories: s.categories,
    geographicScope: s.geographicScope,
    awardFloorCents: s.awardFloorCents,
    awardCeilingCents: s.awardCeilingCents,
    totalFundingCents: s.totalFundingCents,
    expectedAwards: s.expectedAwards,
    costSharingRequired: s.costSharingRequired,
    openDate: new Date(now.getTime() + s.openOffsetDays * DAY),
    closeDate: new Date(now.getTime() + s.closeOffsetDays * DAY),
    estimatedPostDate: null,
    estimatedCloseDate: null,
    status: s.status,
    submissionMethod: s.submissionMethod,
    submissionEmail:
      s.submissionMethod === "email"
        ? (/[\w.-]+@[\w.-]+\.example\.org/.exec(s.requirements.submissionInstructions)?.[0] ?? null)
        : null,
    submissionUrl: s.submissionMethod === "portal" ? `${slugUrl}/apply` : null,
  };
}

/**
 * Idempotently upserts the sample catalog. Unchanged samples with a live deadline are left alone;
 * samples whose deadline has passed are rolled forward so the demo always has open opportunities.
 */
export async function seedSampleOpportunities(
  ctx: AppContext,
): Promise<{ found: number; created: number; updated: number; unchanged: number }> {
  const now = ctx.now();
  const counts = { found: SAMPLE_OPPORTUNITIES.length, created: 0, updated: 0, unchanged: 0 };
  const funderCache = new Map<string, string>();
  for (const s of SAMPLE_OPPORTUNITIES) {
    const record = sampleToRecord(s, now);
    const contentHash = `sample.v${SAMPLE_VERSION}.${await sha256Hex(JSON.stringify(s))}`;
    const existing = await ctx.db
      .select({ closeDate: opportunities.closeDate })
      .from(opportunities)
      .where(and(eq(opportunities.source, "manual"), eq(opportunities.sourceId, record.sourceId)))
      .get();
    const expired = !!existing?.closeDate && existing.closeDate.getTime() < now.getTime();
    const res: UpsertOutcome = await upsertCatalogOpportunity(ctx, record, {
      contentHash,
      keywords: s.keywords,
      requirements: s.requirements,
      funderCache,
      force: expired,
    });
    counts[res.outcome]++;
  }
  return counts;
}
