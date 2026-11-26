// FICTIONAL organization for evals: "Mesa Literacy Circle" (adult literacy).
// All names, people, places, funders and figures are invented.
import { fact, requirements } from "./build";
import type { EvalOrg } from "./types";

const F = "fct_mlc_";

export const mesaLiteracy: EvalOrg = {
  key: "mlc",
  orgId: "org_eval_mlc",
  name: "Mesa Literacy Circle",
  profile:
    "Mesa Literacy Circle (MLC) — 501(c)(3) nonprofit, adult literacy and English language tutoring, Mesa Basin region (fictional).",
  facts: [
    fact(
      `${F}01`,
      "identity",
      "Mesa Literacy Circle (MLC) is a volunteer-powered nonprofit that teaches reading, writing and English language skills to adults.",
      "Mesa Literacy Circle (MLC) is a volunteer-powered nonprofit that teaches reading, writing and English language skills to adults.",
      { sensitivity: "public" },
    ),
    fact(
      `${F}02`,
      "history",
      "Mesa Literacy Circle was founded in 1998 by a group of retired teachers.",
      "MLC was founded in 1998 by a group of retired teachers.",
      { value: { year: 1998 }, sensitivity: "public" },
    ),
    fact(
      `${F}03`,
      "mission",
      "MLC's mission is to help adults in the Mesa Basin read, write and speak English with confidence so they can reach their own goals.",
      "Our mission is to help adults in the Mesa Basin read, write and speak English with confidence so they can reach their own goals.",
      { sensitivity: "public" },
    ),
    fact(
      `${F}04`,
      "program",
      "MLC pairs each adult learner with a trained volunteer tutor for two 90-minute tutoring sessions per week.",
      "Each learner is paired with a trained volunteer tutor and meets twice a week for 90 minutes.",
    ),
    fact(
      `${F}05`,
      "program",
      "MLC offers small-group English for Speakers of Other Languages (ESOL) classes at 4 public library branches.",
      "We run small-group ESOL classes at 4 library branches.",
    ),
    fact(
      `${F}06`,
      "metric",
      "MLC served 386 adult learners in program year 2025.",
      "Learners served, PY2025: 386.",
      { value: { number: 386, unit: "people", year: 2025 }, asOf: "2025" },
    ),
    fact(
      `${F}07`,
      "capacity",
      "MLC's 212 active volunteer tutors contributed 18,400 tutoring hours in 2025.",
      "212 active tutors logged 18,400 hours in 2025.",
      { asOf: "2025" },
    ),
    fact(
      `${F}08`,
      "outcome",
      "61% of learners who were assessed twice in 2025 gained at least one educational functioning level in reading.",
      "Of learners with pre- and post-assessments in 2025, 61% gained one or more reading levels.",
      { value: { number: 61, unit: "percent", year: 2025 }, asOf: "2025" },
    ),
    fact(
      `${F}09`,
      "outcome",
      "47 MLC learners earned a high school equivalency credential between 2023 and 2025.",
      "I think about 47 learners got their equivalency credential from 2023 through 2025.",
      { status: "proposed", sourceType: "interview" },
    ),
    fact(
      `${F}10`,
      "outcome",
      "In a 2025 learner survey, 83% of respondents said they felt more confident helping their children with homework.",
      "83% of survey respondents (2025) said they feel more confident helping their children with homework.",
      { asOf: "2025" },
    ),
    fact(
      `${F}11`,
      "population_served",
      "About 70% of MLC learners are immigrants or refugees, and MLC learners speak 23 different first languages.",
      "Roughly 70% of our learners are immigrants or refugees; together they speak 23 first languages.",
    ),
    fact(
      `${F}12`,
      "population_served",
      "Most MLC learners read below a sixth-grade level when they enroll.",
      "Most learners read below a sixth-grade level at intake.",
    ),
    fact(
      `${F}13`,
      "geography",
      "MLC serves adults across the Mesa Basin, with sites in Mesa City and the towns of Juniper Wells and Coyote Bend.",
      "We serve the Mesa Basin: Mesa City, Juniper Wells and Coyote Bend.",
      { sensitivity: "public" },
    ),
    fact(
      `${F}14`,
      "partner",
      "The Mesa Basin Public Library provides free classroom space to MLC at 4 branches.",
      "The Mesa Basin Public Library gives us free classroom space at 4 branches.",
    ),
    fact(
      `${F}15`,
      "partner",
      "The Mesa Basin Adult Education Center refers learners to MLC and administers learner assessments.",
      "The Adult Education Center refers learners to us and administers assessments.",
    ),
    fact(
      `${F}16`,
      "staff",
      "MLC has 5 staff members (3.5 full-time equivalents) led by Executive Director Priya Natarajan.",
      "5 staff (3.5 FTE), led by Executive Director Priya Natarajan.",
      { asOf: "2026" },
    ),
    fact(
      `${F}17`,
      "program",
      "Volunteer tutors complete a 12-hour pre-service training before being matched with a learner.",
      "tutors do 12 hours of training before they're matched",
      { status: "proposed", sourceType: "interview" },
    ),
    fact(
      `${F}18`,
      "financial",
      "MLC's operating budget for 2025 was $640,000.",
      "2025 operating budget: $640,000.",
      { value: { number: 640000, unit: "USD", year: 2025 }, asOf: "2025" },
    ),
    fact(
      `${F}19`,
      "financial",
      "Volunteer tutoring time contributed to MLC in 2025 is valued at about $590,000.",
      "we estimate volunteer time in 2025 at about $590,000",
      { status: "proposed", sourceType: "interview" },
    ),
    fact(
      `${F}20`,
      "governance",
      "MLC is governed by a 9-member volunteer board of directors.",
      "Our 9-member volunteer board of directors governs MLC.",
    ),
    fact(
      `${F}21`,
      "project",
      "MLC plans to open a digital literacy lab with 20 laptops at the Juniper Wells library branch in 2027.",
      "In 2027 we plan to open a 20-laptop digital literacy lab at the Juniper Wells branch.",
      { sourceType: "interview" },
    ),
    fact(
      `${F}22`,
      "financial",
      "MLC has received funding from more than 30 individual donors and 6 local businesses each year since 2022.",
      "Since 2022, over 30 individual donors and 6 local businesses give to MLC every year.",
    ),
    // Must never reach a draft:
    fact(
      `${F}90`,
      "population_served",
      "A learner disclosed being a survivor of domestic violence during intake.",
      "learner disclosed DV history at intake",
      { sensitivity: "restricted", sourceType: "interview" },
    ),
    fact(
      `${F}91`,
      "metric",
      "MLC served 1,200 adult learners in program year 2025.",
      "1,200 learners!",
      { status: "rejected", sourceType: "website" },
    ),
  ],
  opportunities: [
    {
      key: "adult-learner",
      requestedAmountCents: 6_000_000,
      expectGapSections: ["information_security"],
      opportunity: {
        title: "Adult Learner Opportunity Grants 2027",
        funderName: "Example Literacy Foundation (fictional)",
        summary:
          "Grants to community literacy programs that help adults improve reading and English skills.",
        description:
          "Supports tutoring, ESOL and family literacy programs with measurable learner gains.",
        eligibilityText: "Nonprofit adult literacy providers.",
        awardFloorCents: 2_000_000,
        awardCeilingCents: 7_500_000,
        closeDate: new Date("2027-03-01T00:00:00Z"),
      },
      requirements: requirements([
        {
          key: "organization_overview",
          title: "Organization Overview",
          prompt: "Describe your organization's mission, history, staff and governance.",
          wordLimit: 200,
        },
        {
          key: "need",
          title: "Need",
          prompt: "Describe the adult learners you serve and the literacy needs in your community.",
          wordLimit: 250,
        },
        {
          key: "program_description",
          title: "Program Description",
          prompt: "Describe your tutoring and ESOL program model, volunteer tutors and partners.",
          wordLimit: 300,
        },
        {
          key: "evaluation",
          title: "Evaluation and Results",
          prompt:
            "What learner outcomes have you achieved, and how do you assess learner progress?",
          wordLimit: 250,
        },
        {
          key: "information_security",
          title: "Information Security Certification",
          prompt:
            "State the date of your most recent SOC 2 Type II audit and summarize the findings of your latest third-party penetration test.",
          wordLimit: 150,
        },
      ]),
    },
    {
      key: "health-literacy",
      requestedAmountCents: 4_000_000,
      expectGapSections: ["clinical_outcomes"],
      opportunity: {
        title: "Health Literacy Partnerships",
        funderName: "Example Community Health Trust (fictional)",
        summary: "Grants for programs that help adults understand and use health information.",
        description:
          "Funds literacy and language programs that partner with libraries and community organizations.",
        eligibilityText: "Nonprofits in the Mesa Basin.",
        awardFloorCents: 1_000_000,
        awardCeilingCents: 5_000_000,
        closeDate: new Date("2027-05-15T00:00:00Z"),
      },
      requirements: requirements([
        {
          key: "project_summary",
          title: "Project Summary",
          prompt:
            "Summarize your program and how it helps adult learners build reading and English skills.",
          wordLimit: 150,
        },
        {
          key: "population_served",
          title: "Population Served",
          prompt: "Describe the adults you serve, including languages spoken and reading levels.",
          wordLimit: 250,
        },
        {
          key: "partnerships",
          title: "Partnerships and Collaboration",
          prompt:
            "Describe your partners and how you collaborate with libraries and adult education providers.",
          wordLimit: 250,
        },
        {
          key: "sustainability",
          title: "Sustainability",
          prompt: "How is your work funded today, and how will you sustain it after this grant?",
          wordLimit: 200,
        },
        {
          key: "clinical_outcomes",
          title: "Clinical Outcomes",
          prompt:
            "Report the change in hospital readmission rates among people you serve, and name the clinical source for those figures.",
          wordLimit: 150,
        },
      ]),
    },
  ],
  fabrications: [
    {
      kind: "wrong_number",
      text: "MLC served 836 adult learners in program year 2025.",
      factIds: [`${F}06`],
      truth: "386 learners served",
    },
    {
      kind: "invented_partner",
      text: "The Desert Sun Literacy Alliance provides free classroom space to MLC at 4 branches.",
      factIds: [`${F}14`],
      truth: "the partner is the Mesa Basin Public Library",
    },
    {
      kind: "inflated_outcome",
      text: "91% of learners who were assessed twice in 2025 gained at least one educational functioning level in reading.",
      factIds: [`${F}08`],
      truth: "61% gained a level",
    },
    {
      kind: "wrong_year",
      text: "Mesa Literacy Circle was founded in 1988 by a group of retired teachers.",
      factIds: [`${F}02`],
      truth: "founded in 1998",
    },
    {
      kind: "uncited_factual",
      text: "MLC is the largest adult literacy provider in the state.",
      factIds: [],
      truth: "no fact supports this",
    },
  ],
};
