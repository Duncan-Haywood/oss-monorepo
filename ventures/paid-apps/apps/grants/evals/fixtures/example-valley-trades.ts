// FICTIONAL organization for evals: "Example Valley Trades Collective" (construction trades training).
// All names, people, places, funders and figures are invented.
import { fact, requirements } from "./build";
import type { EvalOrg } from "./types";

const F = "fct_evtc_";

export const exampleValleyTrades: EvalOrg = {
  key: "evtc",
  orgId: "org_eval_evtc",
  name: "Example Valley Trades Collective",
  profile:
    "Example Valley Trades Collective (EVTC) — 501(c)(3) nonprofit, construction trades training, Example Valley region (fictional).",
  facts: [
    fact(
      `${F}01`,
      "identity",
      "Example Valley Trades Collective (EVTC) is a nonprofit that trains adults for careers in the construction trades.",
      "Example Valley Trades Collective (EVTC) is a nonprofit that trains adults for careers in the construction trades.",
      { sensitivity: "public" },
    ),
    fact(
      `${F}02`,
      "history",
      "EVTC was founded in 2011.",
      "Since EVTC was founded in 2011, our doors have stayed open to anyone ready to learn a trade.",
      { value: { year: 2011 }, sensitivity: "public" },
    ),
    fact(
      `${F}03`,
      "mission",
      "EVTC's mission is to open pathways to family-sustaining construction careers for low-income adults in the Example Valley region.",
      "Our mission is to open pathways to family-sustaining construction careers for low-income adults in the Example Valley region.",
      { sensitivity: "public" },
    ),
    fact(
      `${F}04`,
      "program",
      "EVTC runs a 12-week pre-apprenticeship program covering carpentry, electrical basics and OSHA-10 safety certification.",
      "The 12-week pre-apprenticeship covers carpentry, electrical basics and OSHA-10 safety certification.",
    ),
    fact(
      `${F}05`,
      "metric",
      "In 2025, 142 adults enrolled in the EVTC pre-apprenticeship program.",
      "Enrollment 2025: 142 adults.",
      { value: { number: 142, unit: "people", year: 2025 }, asOf: "2025" },
    ),
    fact(
      `${F}06`,
      "outcome",
      "118 of the 142 adults who enrolled in 2025 completed the pre-apprenticeship program.",
      "Completions 2025: 118 of 142 enrolled.",
      { value: { number: 118, unit: "people", year: 2025 }, asOf: "2025" },
    ),
    fact(
      `${F}07`,
      "outcome",
      "78% of 2025 program graduates were employed in the construction trades within 90 days of completion.",
      "78% of 2025 graduates were working in the trades within 90 days.",
      { value: { number: 78, unit: "percent", year: 2025 }, asOf: "2025" },
    ),
    fact(
      `${F}08`,
      "outcome",
      "Graduates placed in jobs in 2025 earned a median starting wage of $21.50 per hour.",
      "median starting wage for 2025 placements was about $21.50/hr",
      {
        status: "proposed",
        sourceType: "interview",
        value: { number: 21.5, unit: "USD", year: 2025 },
        asOf: "2025",
      },
    ),
    fact(
      `${F}09`,
      "population_served",
      "64% of 2025 participants were people of color and 31% were women.",
      "Participant demographics 2025: 64% people of color, 31% women.",
      { asOf: "2025" },
    ),
    fact(
      `${F}10`,
      "population_served",
      "Most EVTC participants are unemployed or underemployed adults ages 18 to 45 from the Example Valley region.",
      "Most of our participants are unemployed or underemployed adults ages 18 to 45 from the Example Valley region.",
    ),
    fact(
      `${F}11`,
      "geography",
      "EVTC serves the three counties of the Example Valley region: Alder, Birch and Cedar counties.",
      "We serve the three counties of the Example Valley region: Alder, Birch and Cedar.",
      { sensitivity: "public" },
    ),
    fact(
      `${F}12`,
      "partner",
      "EVTC partners with the Example Valley Carpenters Local 101 apprenticeship program, which reserves 20 apprenticeship slots per year for EVTC graduates.",
      "Carpenters Local 101 reserves 20 apprenticeship slots per year for EVTC graduates.",
    ),
    fact(
      `${F}13`,
      "partner",
      "Example Valley Community College provides classroom space to EVTC and awards 6 college credits to EVTC graduates.",
      "Example Valley Community College provides classroom space and awards 6 college credits to our graduates.",
    ),
    fact(
      `${F}14`,
      "staff",
      "EVTC has 9 full-time staff, including 4 journey-level instructors.",
      "We have 9 full-time staff, including 4 journey-level instructors.",
      { asOf: "2026" },
    ),
    fact(
      `${F}15`,
      "staff",
      "Executive Director Dana Reyes has led EVTC since 2018 and previously worked 15 years as a union electrician.",
      "Dana Reyes has led EVTC since 2018 after 15 years as a union electrician.",
    ),
    fact(
      `${F}16`,
      "financial",
      "EVTC's operating budget for fiscal year 2025 was $1.8 million.",
      "FY2025 operating budget: $1.8 million.",
      { value: { number: 1800000, unit: "USD", year: 2025 }, asOf: "2025" },
    ),
    fact(
      `${F}17`,
      "financial",
      "The cost to train one pre-apprenticeship participant is approximately $6,200.",
      "it costs us roughly $6,200 to train one participant",
      { status: "proposed", sourceType: "interview", value: { number: 6200, unit: "USD" } },
    ),
    fact(
      `${F}18`,
      "governance",
      "EVTC is governed by an 11-member board of directors, 5 of whom work in the construction industry.",
      "Our 11-member board includes 5 people who work in the construction industry.",
    ),
    fact(
      `${F}19`,
      "project",
      "EVTC plans to launch a women-in-trades pre-apprenticeship cohort of 24 participants in 2027.",
      "Next year we plan to launch a women-in-trades cohort of 24 participants (2027).",
      { sourceType: "interview" },
    ),
    fact(
      `${F}20`,
      "capacity",
      "EVTC operates a 7,500-square-foot training shop with hands-on carpentry and electrical stations.",
      "our 7,500 sq ft shop has carpentry and electrical stations",
      { status: "proposed", sourceType: "interview" },
    ),
    fact(
      `${F}21`,
      "metric",
      "71% of graduates from the 2024 cohort who were placed in jobs were still employed 12 months after placement.",
      "12-month retention, 2024 cohort: 71% of placed graduates still employed.",
      { value: { number: 71, unit: "percent", year: 2024 }, asOf: "2024" },
    ),
    fact(
      `${F}22`,
      "program",
      "Every EVTC participant receives a basic tool kit and work boots at no cost.",
      "Every participant receives a basic tool kit and work boots at no cost.",
      { status: "proposed" },
    ),
    // Must never reach a draft:
    fact(
      `${F}90`,
      "population_served",
      "Participant J.M. disclosed a felony conviction during intake in 2025.",
      "J.M. disclosed a felony conviction at intake.",
      { sensitivity: "restricted", sourceType: "interview" },
    ),
    fact(
      `${F}91`,
      "metric",
      "In 2025, 400 adults enrolled in the EVTC pre-apprenticeship program.",
      "400 adults trained!",
      { status: "rejected", sourceType: "website" },
    ),
    fact(`${F}92`, "staff", "EVTC has 6 full-time staff.", "We have 6 full-time staff.", {
      status: "superseded",
      asOf: "2023",
    }),
  ],
  opportunities: [
    {
      key: "workforce-pathways",
      requestedAmountCents: 25_000_000,
      expectGapSections: ["intellectual_property"],
      opportunity: {
        title: "Workforce Pathways Fund — Construction Careers Grants (FY2027)",
        funderName: "Example State Department of Workforce Development (fictional)",
        summary:
          "Grants for pre-apprenticeship programs that place low-income adults into registered apprenticeships.",
        description:
          "Supports community-based construction pre-apprenticeship programs with documented placement outcomes.",
        eligibilityText:
          "501(c)(3) nonprofits operating construction training programs in Example State.",
        awardFloorCents: 10_000_000,
        awardCeilingCents: 30_000_000,
        closeDate: new Date("2027-02-15T00:00:00Z"),
      },
      requirements: requirements([
        {
          key: "organization_background",
          title: "Organization Background and Capacity",
          prompt:
            "Describe your organization's history, mission, leadership, staff and governance, and your capacity to manage this grant.",
          wordLimit: 250,
        },
        {
          key: "statement_of_need",
          title: "Statement of Need",
          prompt:
            "Describe the population you serve and the need for construction career pathways in your region.",
          wordLimit: 300,
        },
        {
          key: "program_design",
          title: "Program Design",
          prompt:
            "Describe your pre-apprenticeship program: training content, duration, partners and supports provided to participants.",
          wordLimit: 350,
        },
        {
          key: "outcomes_evaluation",
          title: "Outcomes and Evaluation",
          prompt:
            "Report enrollment, completion, employment and retention results, and how you measure them.",
          wordLimit: 250,
        },
        {
          key: "intellectual_property",
          title: "Intellectual Property",
          prompt:
            "List any patents, trademarks or copyrighted curricula your organization holds, and explain how intellectual property rights would be shared with the funder.",
          wordLimit: 150,
        },
      ]),
    },
    {
      key: "women-in-trades",
      requestedAmountCents: 7_500_000,
      expectGapSections: ["climate_benefits"],
      opportunity: {
        title: "Women in Trades Initiative 2027",
        funderName: "Example Valley Community Foundation (fictional)",
        summary: "One-year grants to expand access for women to skilled construction careers.",
        description:
          "Funds cohort-based training, supportive services and employer partnerships for women entering the trades.",
        eligibilityText: "Nonprofits serving Alder, Birch or Cedar counties.",
        awardFloorCents: 2_500_000,
        awardCeilingCents: 10_000_000,
        closeDate: new Date("2027-04-01T00:00:00Z"),
      },
      requirements: requirements([
        {
          key: "project_summary",
          title: "Project Summary",
          prompt: "Summarize the women-in-trades project you propose and who will carry it out.",
          wordLimit: 150,
        },
        {
          key: "need_population",
          title: "Need and Population",
          prompt:
            "Who will participate, and what barriers do women in your region face in entering construction careers?",
          wordLimit: 250,
        },
        {
          key: "approach_partners",
          title: "Approach and Partners",
          prompt:
            "Describe the training approach, employer and apprenticeship partners, and participant supports.",
          wordLimit: 300,
        },
        {
          key: "budget_narrative",
          title: "Budget Narrative",
          prompt: "Explain the budget for this request, including the cost per participant.",
          kind: "budget",
          wordLimit: 200,
        },
        {
          key: "climate_benefits",
          title: "Climate Benefits",
          prompt:
            "Quantify the greenhouse-gas emission reductions this grant will achieve and explain the methodology used to verify those reductions.",
          wordLimit: 150,
        },
      ]),
    },
  ],
  fabrications: [
    {
      kind: "wrong_number",
      text: "In 2025, 214 adults enrolled in the EVTC pre-apprenticeship program.",
      factIds: [`${F}05`],
      truth: "142 adults enrolled in 2025",
    },
    {
      kind: "invented_partner",
      text: "EVTC partners with Ridgeline Builders Guild, which hires EVTC graduates directly.",
      factIds: [`${F}12`],
      truth: "the partner is Carpenters Local 101; no Ridgeline Builders Guild",
    },
    {
      kind: "inflated_outcome",
      text: "98% of 2025 program graduates were employed in the construction trades within 90 days of completion.",
      factIds: [`${F}07`],
      truth: "78% employed within 90 days",
    },
    {
      kind: "wrong_year",
      text: "EVTC was founded in 2006.",
      factIds: [`${F}02`],
      truth: "founded in 2011",
    },
    {
      kind: "uncited_factual",
      text: "EVTC has trained more than 1,000 licensed electricians across the state.",
      factIds: [],
      truth: "no fact supports this",
    },
  ],
};
