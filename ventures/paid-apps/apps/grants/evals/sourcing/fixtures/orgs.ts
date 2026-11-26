// Two FICTIONAL orgs for the sourcing evals. Names, places, partners, ids and figures are invented
// ("Cholla County", "Ashwater Pueblo" and "Port Calder" do not exist).
// Fact ids have no "_" after "fct_" so the matching FakeLlm (fct_[0-9a-z]+) parses them whole.
import { fact } from "../../fixtures/build";
import type { SourcingOrg } from "./types";

export const juniperFlats: SourcingOrg = {
  key: "jfta",
  orgId: "org_eval_jfta",
  name: "Juniper Flats Trades Alliance",
  profile: {
    legalName: "Juniper Flats Trades Alliance",
    orgType: "nonprofit_501c3",
    city: "Juniper Flats",
    state: "NM",
    country: "US",
    ein: "00-0000001",
    uei: "JFTA0EXAMPL1",
    websiteUrl: "https://jfta.example.org",
    foundedYear: 2011,
    focusAreas: ["construction trades training", "pre-apprenticeship", "Native American workforce"],
    serviceAreas: ["Cholla County, NM", "Ashwater Pueblo, NM"],
  },
  projects: [
    {
      id: "prj_jfta1",
      title: "Cholla County Construction Pre-Apprenticeship Cohorts",
      summary:
        "Two more 16-week carpentry, electrical and plumbing pre-apprenticeship cohorts per year for Native American and rural adults, with tools, stipends and apprenticeship placement.",
      budgetNeededCents: 40_000_000,
    },
  ],
  facts: [
    fact(
      "fct_jfta01",
      "identity",
      "Juniper Flats Trades Alliance (JFTA) is a 501(c)(3) nonprofit in Cholla County, New Mexico, that trains adults for careers in the construction trades.",
      "JFTA is a 501(c)(3) nonprofit in Cholla County, New Mexico, training adults for construction careers.",
      { sensitivity: "public" },
    ),
    fact(
      "fct_jfta02",
      "mission",
      "JFTA's mission is to build pathways into living-wage construction careers for Native American and rural adults in northwestern New Mexico.",
      "Our mission: pathways into living-wage construction careers for Native American and rural adults.",
      { sensitivity: "public" },
    ),
    fact("fct_jfta03", "history", "JFTA was founded in 2011.", "Founded 2011.", {
      value: { year: 2011 },
    }),
    fact(
      "fct_jfta04",
      "program",
      "JFTA runs a 16-week construction pre-apprenticeship covering carpentry, electrical and plumbing fundamentals, with OSHA 10 and NCCER Core credentials.",
      "16-week pre-apprenticeship: carpentry, electrical, plumbing; OSHA 10 and NCCER Core.",
    ),
    fact(
      "fct_jfta05",
      "population_served",
      "In 2025, 78% of JFTA trainees identified as Native American.",
      "78% of 2025 trainees identified as Native American.",
      { asOf: "2025" },
    ),
    fact(
      "fct_jfta06",
      "geography",
      "JFTA serves rural Cholla County and the Ashwater Pueblo, where the nearest community college is 90 miles away.",
      "Rural Cholla County and Ashwater Pueblo; nearest community college is 90 miles away.",
    ),
    fact(
      "fct_jfta07",
      "metric",
      "JFTA enrolled 142 adults in its pre-apprenticeship in 2025, and 118 completed.",
      "2025: 142 enrolled, 118 completed.",
      { asOf: "2025" },
    ),
    fact(
      "fct_jfta08",
      "outcome",
      "71% of JFTA's 2025 completers were placed in construction jobs or registered apprenticeships within 90 days.",
      "71% of 2025 completers placed in construction jobs or registered apprenticeships within 90 days.",
      { asOf: "2025" },
    ),
    fact(
      "fct_jfta09",
      "partner",
      "Four Winds Carpenters Local 512 accepts JFTA completers directly into its registered apprenticeship.",
      "Local 512 accepts our completers directly into its registered apprenticeship.",
    ),
    fact(
      "fct_jfta10",
      "program",
      "JFTA runs a women-in-the-trades cohort every spring with women instructors.",
      "Every spring we run a women-in-the-trades cohort taught by women instructors.",
    ),
    fact(
      "fct_jfta11",
      "program",
      "JFTA trainees complete a home-repair practicum, repairing roofs, ramps and plumbing for elders on the Ashwater Pueblo.",
      "Trainees repair roofs, ramps and plumbing for Ashwater Pueblo elders as a practicum.",
    ),
    fact(
      "fct_jfta12",
      "capacity",
      "JFTA operates a 12,000-square-foot training shop and a mobile training trailer for remote chapters.",
      "12,000 sq ft shop plus a mobile training trailer.",
    ),
    fact(
      "fct_jfta13",
      "staff",
      "JFTA has 9 full-time staff, including 4 journey-level instructors.",
      "9 FTE; 4 journey-level instructors.",
    ),
    fact(
      "fct_jfta14",
      "financial",
      "JFTA's operating budget for fiscal year 2025 was $1.9 million.",
      "FY2025 operating budget: $1.9M.",
      { value: { number: 1_900_000, unit: "USD", year: 2025 }, asOf: "FY2025" },
    ),
    fact(
      "fct_jfta15",
      "identity",
      "JFTA is registered in SAM.gov with Unique Entity ID JFTA0EXAMPL1, active through 2027.",
      "SAM.gov registration active through 2027, UEI JFTA0EXAMPL1.",
    ),
    fact(
      "fct_jfta16",
      "history",
      "JFTA has managed two federal workforce training grants since 2019.",
      "We have managed two federal workforce grants since 2019.",
    ),
    fact(
      "fct_jfta17",
      "program",
      "Since 2024 JFTA's curriculum includes a weatherization and residential solar installation module.",
      "Added a weatherization and residential solar installation module in 2024.",
    ),
    fact(
      "fct_jfta18",
      "program",
      "JFTA runs a reentry cohort for adults returning from the Cholla County detention center.",
      "Reentry cohort with the Cholla County detention center.",
    ),
    fact(
      "fct_jfta19",
      "outcome",
      "JFTA places 500 graduates in jobs every year.",
      "500 graduates placed every year (draft brochure).",
      { status: "rejected" },
    ),
    fact(
      "fct_jfta20",
      "population_served",
      "Trainee case notes, including one trainee's probation conditions.",
      "Case notes (restricted).",
      { sensitivity: "restricted" },
    ),
    fact(
      "fct_jfta21",
      "project",
      "JFTA plans to open a second training site at the Ashwater Pueblo in 2027.",
      "We hope to open a second site at Ashwater Pueblo in 2027.",
      { status: "proposed" },
    ),
  ],
};

export const lakeshoreReaders: SourcingOrg = {
  key: "lrp",
  orgId: "org_eval_lrp",
  name: "Lakeshore Readers Project",
  profile: {
    legalName: "Lakeshore Readers Project",
    orgType: "nonprofit_501c3",
    city: "Port Calder",
    state: "OH",
    country: "US",
    ein: "00-0000002",
    uei: null, // trap: no UEI in the profile and no UEI fact
    websiteUrl: "https://lrp.example.org",
    foundedYear: 1994,
    focusAreas: ["adult literacy", "ESOL", "digital literacy", "high school equivalency"],
    serviceAreas: ["Port Calder, OH", "Calder County, OH"],
  },
  projects: [
    {
      id: "prj_lrp1",
      title: "Port Calder Neighborhood Literacy Hubs",
      summary:
        "Expand adult literacy tutoring, ESOL classes and digital literacy workshops to two more urban neighborhood library sites.",
      budgetNeededCents: 25_000_000,
    },
  ],
  facts: [
    fact(
      "fct_lrp01",
      "identity",
      "Lakeshore Readers Project (LRP) is a 501(c)(3) nonprofit in Port Calder, Ohio, that teaches adults to read, write and speak English.",
      "LRP is a 501(c)(3) nonprofit in Port Calder, Ohio, teaching adults to read, write and speak English.",
      { sensitivity: "public" },
    ),
    fact(
      "fct_lrp02",
      "mission",
      "LRP's mission is to help adults in Port Calder's urban neighborhoods build literacy, English and digital skills for work, family and citizenship.",
      "We help adults in Port Calder's neighborhoods build literacy, English and digital skills.",
      { sensitivity: "public" },
    ),
    fact("fct_lrp03", "history", "LRP was founded in 1994.", "Founded 1994.", {
      value: { year: 1994 },
    }),
    fact(
      "fct_lrp04",
      "program",
      "LRP matches adults reading below a sixth-grade level with trained volunteer tutors for one-to-one literacy tutoring.",
      "One-to-one volunteer tutoring for adults reading below sixth-grade level.",
    ),
    fact(
      "fct_lrp05",
      "program",
      "LRP teaches English for Speakers of Other Languages (ESOL) classes at 5 neighborhood sites.",
      "ESOL classes at 5 neighborhood sites.",
    ),
    fact(
      "fct_lrp06",
      "program",
      "LRP offers high school equivalency (GED) preparation classes for adults.",
      "GED preparation classes for adults.",
    ),
    fact(
      "fct_lrp07",
      "program",
      "LRP runs digital literacy workshops on email, online job applications and telehealth.",
      "Digital literacy workshops: email, online job applications, telehealth.",
    ),
    fact(
      "fct_lrp08",
      "population_served",
      "In 2025, 64% of LRP learners were immigrants or refugees and 70% were low-income.",
      "2025 learners: 64% immigrants or refugees, 70% low-income.",
      { asOf: "2025" },
    ),
    fact(
      "fct_lrp09",
      "geography",
      "LRP serves Calder County, Ohio, mostly the urban neighborhoods of Port Calder.",
      "We serve Calder County, mostly Port Calder's urban neighborhoods.",
    ),
    fact("fct_lrp10", "metric", "LRP served 612 adult learners in 2025.", "612 learners in 2025.", {
      asOf: "2025",
    }),
    fact(
      "fct_lrp11",
      "outcome",
      "58% of LRP's tutored learners gained at least one educational functioning level on standardized literacy assessments in 2025.",
      "58% gained an educational functioning level (2025).",
      { asOf: "2025" },
    ),
    fact(
      "fct_lrp12",
      "outcome",
      "96 LRP learners earned a high school equivalency credential between 2023 and 2025.",
      "96 HSE credentials earned 2023-2025.",
    ),
    fact(
      "fct_lrp13",
      "capacity",
      "LRP trains and supports 240 active volunteer tutors.",
      "240 active volunteer tutors.",
    ),
    fact(
      "fct_lrp14",
      "partner",
      "The Port Calder Public Library hosts LRP classes at 3 branches.",
      "Classes at 3 Port Calder Public Library branches.",
    ),
    fact(
      "fct_lrp15",
      "partner",
      "LRP runs a family literacy program with Port Calder City Schools for parents of elementary students.",
      "Family literacy program with Port Calder City Schools for parents.",
    ),
    fact(
      "fct_lrp16",
      "financial",
      "LRP's operating budget for fiscal year 2025 was $1.1 million.",
      "FY2025 budget: $1.1M.",
      { value: { number: 1_100_000, unit: "USD", year: 2025 }, asOf: "FY2025" },
    ),
    fact("fct_lrp17", "staff", "LRP has 11 staff members.", "11 staff."),
    fact(
      "fct_lrp18",
      "program",
      "LRP teaches workplace literacy classes for hospital environmental-services workers at Lakeview General.",
      "Workplace literacy classes for Lakeview General environmental-services staff.",
    ),
    fact(
      "fct_lrp19",
      "outcome",
      "LRP has taught 20,000 adults to read.",
      "20,000 adults taught (old flyer, unverified).",
      { status: "rejected" },
    ),
    fact(
      "fct_lrp20",
      "population_served",
      "A learner's immigration case details.",
      "Immigration case details (restricted).",
      { sensitivity: "restricted" },
    ),
    fact(
      "fct_lrp21",
      "project",
      "LRP is exploring a mobile classroom van for neighborhoods without library branches.",
      "Exploring a mobile classroom van.",
      { status: "proposed" },
    ),
  ],
};

export const SOURCING_ORGS: SourcingOrg[] = [juniperFlats, lakeshoreReaders];
