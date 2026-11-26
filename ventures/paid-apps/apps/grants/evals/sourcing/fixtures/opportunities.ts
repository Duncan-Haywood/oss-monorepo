// ~30 FICTIONAL opportunities modeled on federal (Grants.gov / Simpler Grants), state and
// foundation listings. No funder, program or opportunity number here is real. Each carries an
// expert gold label per org (see GoldLabel) and some carry a trap the pipeline must catch.
import type { SourcingOpportunity } from "./types";

const NP =
  "Nonprofits having a 501(c)(3) status with the IRS, other than institutions of higher education";
const NP_NO501 =
  "Nonprofits that do not have a 501(c)(3) status with the IRS, other than institutions of higher education";
const TRIBAL_GOV = "Native American tribal governments (Federally recognized)";
const TRIBAL_ORG =
  "Native American tribal organizations (other than Federally recognized tribal governments)";
const STATE_GOV = "State governments";
const COUNTY_GOV = "County governments";
const CITY_GOV = "City or township governments";
const PUBLIC_IHE = "Public and State controlled institutions of higher education";
const SMALL_BIZ = "Small businesses";
const FOR_PROFIT = "For profit organizations other than small businesses";
const UNRESTRICTED =
  'Unrestricted (i.e., open to any type of entity above), subject to any clarification in text field entitled "Additional Information on Eligibility"';
const OTHERS = 'Others (see text field entitled "Additional Information on Eligibility")';

const SAM =
  "Applicants must have an active registration in SAM.gov and a Unique Entity Identifier (UEI) at the time of application.";
const M = 100; // cents per dollar

type Draft = Omit<
  SourcingOpportunity,
  | "categories"
  | "keywords"
  | "totalFundingCents"
  | "expectedAwards"
  | "costSharingRequired"
  | "status"
> &
  Partial<
    Pick<
      SourcingOpportunity,
      | "categories"
      | "keywords"
      | "totalFundingCents"
      | "expectedAwards"
      | "costSharingRequired"
      | "status"
    >
  >;

const opp = (d: Draft): SourcingOpportunity => ({
  categories: [],
  keywords: [],
  totalFundingCents: null,
  expectedAwards: null,
  costSharingRequired: false,
  status: "posted",
  ...d,
});

export const SOURCING_OPPORTUNITIES: SourcingOpportunity[] = [
  // ---- Federal ------------------------------------------------------------------------------
  opp({
    key: "gg-construction-pathways",
    source: "grants_gov",
    funderName: "National Workforce Opportunity Administration",
    funderType: "federal",
    title: "Tribal and Rural Construction Pathways Grants",
    opportunityNumber: "NWOA-27-014",
    summary:
      "Funds pre-apprenticeship and registered apprenticeship pathways in the construction trades for adults in rural and tribal communities.",
    description:
      "Grants support community organizations that recruit, train and place rural and Native American adults into construction careers: carpentry, electrical, plumbing and weatherization training tied to registered apprenticeship, industry credentials such as OSHA 10 and NCCER, supportive services and employer partnerships. Programs serving tribal communities with persistent unemployment are a priority.",
    eligibilityText: `Nonprofit organizations and tribal organizations that operate workforce training programs. ${SAM}`,
    applicantTypes: [NP, TRIBAL_ORG, TRIBAL_GOV],
    categories: ["Employment, Labor and Training"],
    keywords: ["construction", "apprenticeship", "tribal", "rural"],
    geographicScope: "United States",
    awardFloorCents: 250_000 * M,
    awardCeilingCents: 750_000 * M,
    totalFundingCents: 15_000_000 * M,
    expectedAwards: 25,
    closeInDays: 45,
    gold: {
      jfta: {
        relevance: 2,
        eligible: true,
        reason: "Squarely on-mission (rural/Native construction pre-apprenticeship); UEI on file.",
      },
      lrp: {
        relevance: 0,
        eligible: "unknown",
        reason: "Construction workforce, not literacy; SAM.gov required and no UEI on file.",
      },
    },
  }),
  opp({
    key: "watch-construction-pathways",
    source: "manual",
    funderName: "National Workforce Opportunity Administration",
    funderType: "federal",
    title: "FY 2027 Tribal & Rural Construction Pathways Grant Program",
    opportunityNumber: null,
    summary:
      "Watchlist copy of the funder's announcement page for its tribal and rural construction pathways grants.",
    description:
      "The administration will fund construction pre-apprenticeship and apprenticeship programs for rural and Native American adults. See the full announcement for details.",
    eligibilityText: `Nonprofit and tribal organizations. ${SAM}`,
    applicantTypes: [NP, TRIBAL_ORG, TRIBAL_GOV],
    geographicScope: "United States",
    awardFloorCents: 250_000 * M,
    awardCeilingCents: 750_000 * M,
    closeInDays: 45,
    gold: {
      jfta: {
        relevance: 0,
        eligible: true,
        reason:
          "Same program as gg-construction-pathways (watchlist re-post); showing it twice wastes review time.",
        trap: "near_duplicate",
      },
      lrp: {
        relevance: 0,
        eligible: "unknown",
        reason: "Duplicate of an irrelevant construction listing; SAM.gov required, no UEI.",
      },
    },
  }),
  opp({
    key: "gg-tribal-housing-workforce",
    source: "grants_gov",
    funderName: "Office of Tribal Housing and Workforce",
    funderType: "federal",
    title: "Tribal Government Housing Construction Workforce Program",
    opportunityNumber: "OTHW-27-003",
    summary:
      "Supports tribal governments that train tribal members in residential construction while building and repairing housing on tribal lands.",
    description:
      "Federally recognized tribes may use funds to train members in carpentry, electrical and plumbing through tribal housing construction and repair projects, including stipends, tools and instructor costs.",
    eligibilityText: `Only federally recognized tribal governments may apply. Tribal nonprofits may participate as subrecipients of a tribe. ${SAM}`,
    applicantTypes: [TRIBAL_GOV],
    geographicScope: "United States",
    awardFloorCents: 200_000 * M,
    awardCeilingCents: 1_000_000 * M,
    closeInDays: 60,
    gold: {
      jfta: {
        relevance: 2,
        eligible: false,
        reason:
          "On-topic, but only federally recognized tribal governments may apply; JFTA is a nonprofit.",
        trap: "tribal_gov_only",
      },
      lrp: { relevance: 0, eligible: false, reason: "Tribal governments only; off-mission." },
    },
  }),
  opp({
    key: "gg-adult-ed-family-literacy",
    source: "grants_gov",
    funderName: "Federal Adult Learning Office",
    funderType: "federal",
    title: "Adult Basic Education and Family Literacy Innovation Grants",
    opportunityNumber: "FALO-27-101",
    summary:
      "Supports community organizations that improve reading, writing, English language and numeracy skills of adults with low literacy, including family literacy programs.",
    description:
      "Funds adult basic education, ESOL, high school equivalency preparation and family literacy services delivered by community-based organizations, with measurable gains in educational functioning levels.",
    eligibilityText: `Community-based nonprofit organizations providing adult education. ${SAM}`,
    applicantTypes: [NP, PUBLIC_IHE],
    geographicScope: "United States",
    awardFloorCents: 100_000 * M,
    awardCeilingCents: 400_000 * M,
    totalFundingCents: 12_000_000 * M,
    expectedAwards: 40,
    closeInDays: 50,
    gold: {
      jfta: {
        relevance: 0,
        eligible: true,
        reason: "Adult literacy; JFTA does not run literacy programs.",
      },
      lrp: {
        relevance: 2,
        eligible: "unknown",
        reason: "Squarely on-mission, but SAM.gov/UEI is required and LRP has no UEI on file.",
        trap: "sam_no_uei",
      },
    },
  }),
  opp({
    key: "gg-digital-skills-adults",
    source: "grants_gov",
    funderName: "Federal Adult Learning Office",
    funderType: "federal",
    title: "Digital Skills for Adult Learners",
    opportunityNumber: "FALO-27-115",
    summary:
      "Funds digital literacy instruction for adults: email, online job applications, telehealth and basic computer skills.",
    description:
      "Supports adult education providers that integrate digital literacy into literacy, ESOL and workforce programs for low-income adults.",
    eligibilityText: `Nonprofit adult education providers and public colleges. ${SAM}`,
    applicantTypes: [NP, PUBLIC_IHE],
    geographicScope: "United States",
    awardFloorCents: 50_000 * M,
    awardCeilingCents: 250_000 * M,
    closeInDays: 70,
    gold: {
      jfta: {
        relevance: 1,
        eligible: true,
        reason: "Workforce-adjacent digital skills; a stretch for a trades program.",
      },
      lrp: {
        relevance: 2,
        eligible: "unknown",
        reason: "On-mission digital literacy; SAM.gov required and no UEI on file.",
      },
    },
  }),
  opp({
    key: "gg-clean-energy-installers",
    source: "grants_gov",
    funderName: "Office of Clean Energy Workforce",
    funderType: "federal",
    title: "Weatherization and Solar Installer Training Grants",
    opportunityNumber: "OCEW-27-022",
    summary:
      "Trains adults as weatherization technicians and residential solar installers in the Mountain West.",
    description:
      "Funds hands-on weatherization and solar installation training with employer partners, credentials and job placement, prioritizing rural and tribal communities.",
    eligibilityText: `Nonprofits and tribal organizations operating construction or energy training. ${SAM}`,
    applicantTypes: [NP, TRIBAL_ORG],
    geographicScope: "Arizona, New Mexico, Colorado, Utah and Nevada",
    awardFloorCents: 150_000 * M,
    awardCeilingCents: 500_000 * M,
    closeInDays: 55,
    gold: {
      jfta: {
        relevance: 2,
        eligible: true,
        reason: "JFTA runs a weatherization/solar module in NM; UEI on file.",
      },
      lrp: { relevance: 0, eligible: false, reason: "Mountain West only; LRP is in Ohio." },
    },
  }),
  opp({
    key: "gg-employer-apprenticeship-incentive",
    source: "grants_gov",
    funderName: "National Workforce Opportunity Administration",
    funderType: "federal",
    title: "Registered Apprenticeship Employer Incentive Grants",
    opportunityNumber: "NWOA-27-031",
    summary:
      "Reimburses construction employers that hire and train registered apprentices, including apprentices from tribal and rural communities.",
    description:
      "Construction contractors receive per-apprentice incentives for wages, tools and related instruction for new registered apprentices.",
    eligibilityText: `Construction employers only (small businesses and other for-profit organizations). ${SAM}`,
    applicantTypes: [SMALL_BIZ, FOR_PROFIT],
    geographicScope: "United States",
    awardFloorCents: 25_000 * M,
    awardCeilingCents: 300_000 * M,
    closeInDays: 40,
    gold: {
      jfta: {
        relevance: 2,
        eligible: false,
        reason: "On-topic, but only for-profit employers may apply.",
        trap: "for_profit_only",
      },
      lrp: { relevance: 0, eligible: false, reason: "For-profit employers only; off-mission." },
    },
  }),
  opp({
    key: "gg-native-workforce-closed",
    source: "grants_gov",
    funderName: "National Workforce Opportunity Administration",
    funderType: "federal",
    title: "Native Workforce Innovation Grants",
    opportunityNumber: "NWOA-26-077",
    summary:
      "Funded innovative workforce training for Native American adults, including construction trades pre-apprenticeship.",
    description:
      "Supported training, supportive services and employer partnerships for Native American job seekers in rural areas.",
    eligibilityText: `Nonprofit and tribal organizations. ${SAM}`,
    applicantTypes: [NP, TRIBAL_ORG],
    geographicScope: "United States",
    awardFloorCents: 100_000 * M,
    awardCeilingCents: 600_000 * M,
    closeInDays: -12,
    gold: {
      jfta: {
        relevance: 2,
        eligible: false,
        reason: "Perfect topic, but the deadline passed 12 days ago.",
        trap: "deadline_passed",
      },
      lrp: { relevance: 0, eligible: false, reason: "Deadline passed; off-mission." },
    },
  }),
  opp({
    key: "sg-youth-construction",
    source: "simpler_grants",
    funderName: "National Workforce Opportunity Administration",
    funderType: "federal",
    title: "Community Builders Youth Construction Training",
    opportunityNumber: "NWOA-27-040",
    summary:
      "Out-of-school youth ages 16 to 24 earn a high school credential while training in construction by building affordable housing.",
    description:
      "Combines high school equivalency instruction, construction skills training and leadership development for opportunity youth.",
    eligibilityText: `Nonprofit organizations serving youth. ${SAM}`,
    applicantTypes: [NP],
    geographicScope: "United States",
    awardFloorCents: 400_000 * M,
    awardCeilingCents: 1_500_000 * M,
    closeInDays: 65,
    gold: {
      jfta: {
        relevance: 1,
        eligible: true,
        reason: "Construction training, but for youth 16-24; JFTA serves adults.",
      },
      lrp: {
        relevance: 0,
        eligible: "unknown",
        reason: "Youth construction; SAM.gov required and no UEI.",
      },
    },
  }),
  opp({
    key: "gg-shellfish-hatchery",
    source: "grants_gov",
    funderName: "Office of Coastal Aquaculture",
    funderType: "federal",
    title: "Coastal Shellfish Hatchery Modernization Grants",
    opportunityNumber: "OCA-27-009",
    summary:
      "Replaces seawater pumps, larval tanks and algae culture equipment at oyster and clam hatcheries.",
    description:
      "Funds hatchery equipment upgrades: seawater intake filtration, larval rearing tanks, algae culture systems and shellfish seed nursery upwellers that raise oyster and clam seed survival.",
    eligibilityText: `Open to any entity. ${SAM}`,
    applicantTypes: [UNRESTRICTED],
    // Keyword-stuffed listing metadata (aggregator-style tags): none of it is in the description.
    categories: [
      "Employment, Labor and Training",
      "Education",
      "Native American Affairs",
      "Community Development",
    ],
    keywords: [
      "workforce development",
      "construction trades",
      "apprenticeship",
      "Native American",
      "tribal",
      "rural",
      "New Mexico",
      "adult literacy",
      "ESOL",
      "adult education",
      "GED",
      "digital literacy",
      "Ohio",
      "job training",
    ],
    geographicScope: "United States",
    awardFloorCents: 50_000 * M,
    awardCeilingCents: 150_000 * M,
    closeInDays: 35,
    gold: {
      jfta: {
        relevance: 0,
        eligible: true,
        reason: "Shellfish hatchery equipment; only the tags mention workforce or tribal topics.",
        trap: "keyword_stuffed",
      },
      lrp: {
        relevance: 0,
        eligible: "unknown",
        reason:
          "Shellfish hatchery equipment; tags are stuffed with literacy terms. SAM.gov required.",
        trap: "keyword_stuffed",
      },
    },
  }),
  opp({
    key: "gg-library-learning-hubs",
    source: "grants_gov",
    funderName: "Institute for Community Libraries",
    funderType: "federal",
    title: "Libraries as Adult Learning Hubs",
    opportunityNumber: "ICL-27-012",
    summary: "Helps public libraries expand adult literacy, ESOL and digital skills programs.",
    description:
      "State library agencies, county and city public library systems and public colleges may apply to expand adult learning services in library branches.",
    eligibilityText: `State, county and city governments (public library systems) and public colleges. ${SAM}`,
    applicantTypes: [STATE_GOV, COUNTY_GOV, CITY_GOV, PUBLIC_IHE],
    geographicScope: "United States",
    awardFloorCents: 50_000 * M,
    awardCeilingCents: 500_000 * M,
    closeInDays: 80,
    gold: {
      jfta: { relevance: 0, eligible: false, reason: "Governments/libraries only; off-mission." },
      lrp: {
        relevance: 2,
        eligible: false,
        reason:
          "On-topic, but only library systems (governments) and public colleges may apply; LRP could only partner.",
      },
    },
  }),
  opp({
    key: "gg-reentry-education",
    source: "grants_gov",
    funderName: "Office of Justice Reentry Programs",
    funderType: "federal",
    title: "Second Chance Adult Education and Job Training",
    opportunityNumber: "OJRP-27-044",
    summary:
      "Education and job training for adults returning from incarceration, including literacy, high school equivalency and skilled trades.",
    description:
      "Funds reentry programs that combine adult basic education or occupational training with case management, starting before release.",
    eligibilityText: `Nonprofit organizations and tribal organizations. ${SAM}`,
    applicantTypes: [NP, TRIBAL_ORG],
    geographicScope: "United States",
    awardFloorCents: 300_000 * M,
    awardCeilingCents: 900_000 * M,
    closeInDays: 75,
    gold: {
      jfta: {
        relevance: 1,
        eligible: true,
        reason: "JFTA has a reentry cohort; reentry is not its core program.",
      },
      lrp: {
        relevance: 1,
        eligible: "unknown",
        reason: "Literacy/HSE for returning adults fits partly; SAM.gov required, no UEI.",
      },
    },
  }),
  // ---- State --------------------------------------------------------------------------------
  opp({
    key: "nm-skilled-trades-fund",
    source: "manual",
    funderName: "New Mexico Office of Workforce Investment",
    funderType: "state",
    title: "Rural New Mexico Skilled Trades Training Fund",
    opportunityNumber: "NMOWI-2027-03",
    summary:
      "State grants for construction and skilled trades training in rural New Mexico counties.",
    description:
      "Supports pre-apprenticeship and short-term trades training with credentials and placement for rural and tribal New Mexicans.",
    eligibilityText:
      "Nonprofits, tribal organizations and tribal governments operating in New Mexico.",
    applicantTypes: [NP, TRIBAL_ORG, TRIBAL_GOV],
    geographicScope: "New Mexico",
    awardFloorCents: 50_000 * M,
    awardCeilingCents: 250_000 * M,
    closeInDays: 40,
    gold: {
      jfta: {
        relevance: 2,
        eligible: true,
        reason: "NM rural trades training: on-mission and in-state.",
      },
      lrp: { relevance: 0, eligible: false, reason: "New Mexico only." },
    },
  }),
  opp({
    key: "nm-adult-literacy",
    source: "manual",
    funderName: "New Mexico Adult Learning Council",
    funderType: "state",
    title: "New Mexico Adult Literacy Program Grants",
    opportunityNumber: "NMALC-27-01",
    summary: "Grants to adult literacy and ESOL programs serving New Mexico residents.",
    description:
      "Funds volunteer tutoring, ESOL classes and high school equivalency preparation for adults in New Mexico.",
    eligibilityText: "Nonprofit literacy providers located in New Mexico.",
    applicantTypes: [NP],
    geographicScope: "New Mexico",
    awardFloorCents: 10_000 * M,
    awardCeilingCents: 60_000 * M,
    closeInDays: 30,
    gold: {
      jfta: {
        relevance: 0,
        eligible: true,
        reason: "In-state, but adult literacy is not JFTA's program.",
      },
      lrp: {
        relevance: 2,
        eligible: false,
        reason: "Exactly LRP's programs, but New Mexico only.",
        trap: "wrong_state",
      },
    },
  }),
  opp({
    key: "oh-building-trades-preapp",
    source: "manual",
    funderName: "Ohio Workforce Pathways Board",
    funderType: "state",
    title: "Ohio Building Trades Pre-Apprenticeship Grants",
    opportunityNumber: "OWPB-27-07",
    summary:
      "Funds construction pre-apprenticeship programs that feed Ohio building trades apprenticeships.",
    description:
      "Supports carpentry, electrical and plumbing pre-apprenticeship with contextualized math and reading, credentials and placement into registered apprenticeships in Ohio.",
    eligibilityText: "Ohio nonprofits and community colleges.",
    applicantTypes: [NP, PUBLIC_IHE],
    geographicScope: "Ohio",
    awardFloorCents: 75_000 * M,
    awardCeilingCents: 300_000 * M,
    closeInDays: 45,
    gold: {
      jfta: {
        relevance: 2,
        eligible: false,
        reason: "Exactly JFTA's program model, but Ohio only.",
        trap: "wrong_state",
      },
      lrp: {
        relevance: 1,
        eligible: true,
        reason: "Contextualized reading for pre-apprentices is a partial fit; in-state.",
      },
    },
  }),
  opp({
    key: "oh-adult-literacy-esol",
    source: "manual",
    funderName: "Ohio Adult Literacy Fund",
    funderType: "state",
    title: "Ohio Adult Literacy and ESOL Expansion Grants",
    opportunityNumber: "OALF-2027-A",
    summary: "Expands adult literacy tutoring and ESOL classes across Ohio.",
    description:
      "Funds volunteer tutor training, ESOL classes, digital literacy and high school equivalency preparation for Ohio adults with low literacy.",
    eligibilityText: "Ohio 501(c)(3) adult literacy providers.",
    applicantTypes: [NP],
    geographicScope: "Ohio",
    awardFloorCents: 25_000 * M,
    awardCeilingCents: 150_000 * M,
    closeInDays: 35,
    gold: {
      jfta: { relevance: 0, eligible: false, reason: "Ohio only; off-mission." },
      lrp: { relevance: 2, eligible: true, reason: "On-mission, in-state, nonprofit." },
    },
  }),
  opp({
    key: "oh-calder-adult-ed",
    source: "manual",
    funderName: "Calder County Community Foundation",
    funderType: "foundation",
    title: "Calder County Adult Education Fund",
    opportunityNumber: null,
    summary: "Local grants for adult education, literacy and ESOL in Calder County.",
    description:
      "Supports nonprofits that help Calder County adults improve reading, English and digital skills.",
    eligibilityText: "Nonprofits serving Calder County, Ohio residents.",
    applicantTypes: [NP],
    geographicScope: "Calder County, Ohio",
    awardFloorCents: 5_000 * M,
    awardCeilingCents: 40_000 * M,
    closeInDays: 28,
    gold: {
      jfta: { relevance: 0, eligible: false, reason: "Calder County, Ohio only." },
      lrp: { relevance: 2, eligible: true, reason: "Local funder, LRP's own county and mission." },
    },
  }),
  opp({
    key: "az-construction-careers",
    source: "manual",
    funderName: "Arizona Trades Council",
    funderType: "state",
    title: "Arizona Construction Careers Grants",
    opportunityNumber: "ATC-27-2",
    summary: "Construction careers training for Arizona adults.",
    description: "Funds pre-apprenticeship and trades training in Arizona counties.",
    eligibilityText: "Arizona nonprofits.",
    applicantTypes: [NP],
    geographicScope: "Arizona",
    awardFloorCents: 50_000 * M,
    awardCeilingCents: 200_000 * M,
    closeInDays: 50,
    gold: {
      jfta: {
        relevance: 2,
        eligible: false,
        reason: "On-topic but Arizona only; JFTA serves New Mexico.",
      },
      lrp: { relevance: 0, eligible: false, reason: "Arizona only; off-mission." },
    },
  }),
  // ---- Foundations --------------------------------------------------------------------------
  opp({
    key: "fdn-native-workforce-futures",
    source: "manual",
    funderName: "Turquoise Mesa Foundation",
    funderType: "foundation",
    title: "Native-Led Workforce Futures Fund",
    opportunityNumber: null,
    summary: "Multi-year grants for Native-serving workforce programs in the Four Corners states.",
    description:
      "Supports Native-led and Native-serving organizations that train adults for living-wage careers, including the construction trades, with wraparound supports.",
    eligibilityText: "501(c)(3) nonprofits and tribal organizations serving Native communities.",
    applicantTypes: [NP, TRIBAL_ORG],
    geographicScope: "Arizona, New Mexico, Utah and Colorado (tribal communities)",
    awardFloorCents: 100_000 * M,
    awardCeilingCents: 300_000 * M,
    closeInDays: 60,
    gold: {
      jfta: {
        relevance: 2,
        eligible: true,
        reason: "Native-serving construction workforce in NM.",
      },
      lrp: { relevance: 0, eligible: false, reason: "Four Corners states only." },
    },
  }),
  opp({
    key: "fdn-women-building-trades",
    source: "manual",
    funderName: "Harriet Lowell Fund",
    funderType: "foundation",
    title: "Women in the Building Trades Initiative",
    opportunityNumber: null,
    summary: "Supports programs that recruit, train and retain women in construction trades.",
    description:
      "Grants for women-focused pre-apprenticeship cohorts, women instructors, childcare and tools for women entering the building trades.",
    eligibilityText: "U.S. 501(c)(3) organizations.",
    applicantTypes: [NP],
    geographicScope: "National",
    awardFloorCents: 25_000 * M,
    awardCeilingCents: 100_000 * M,
    closeInDays: 42,
    gold: {
      jfta: { relevance: 2, eligible: true, reason: "JFTA's women-in-the-trades cohort." },
      lrp: { relevance: 0, eligible: true, reason: "Eligible, but construction is off-mission." },
    },
  }),
  opp({
    key: "fdn-adult-literacy-impact",
    source: "manual",
    funderName: "Brightline Reading Foundation",
    funderType: "foundation",
    title: "Adult Literacy Impact Awards",
    opportunityNumber: null,
    summary: "Unrestricted awards to adult literacy programs with measurable learner gains.",
    description:
      "Recognizes and funds adult literacy and ESOL programs that use volunteer tutors and standardized assessments to show learner progress.",
    eligibilityText: "U.S. 501(c)(3) adult literacy organizations.",
    applicantTypes: [NP],
    geographicScope: "National",
    awardFloorCents: 20_000 * M,
    awardCeilingCents: 75_000 * M,
    closeInDays: 38,
    gold: {
      jfta: { relevance: 0, eligible: true, reason: "Eligible, but literacy is off-mission." },
      lrp: {
        relevance: 2,
        eligible: true,
        reason: "Volunteer tutoring with assessed gains: LRP's model.",
      },
    },
  }),
  opp({
    key: "fdn-family-literacy-greatlakes",
    source: "manual",
    funderName: "Maple and Oak Family Foundation",
    funderType: "foundation",
    title: "Family Literacy Partnerships",
    opportunityNumber: null,
    summary: "Family literacy programs that teach parents and children together.",
    description:
      "Funds adult literacy for parents paired with early reading for their children, often with schools.",
    eligibilityText: "501(c)(3) organizations in Ohio, Michigan, Indiana or Pennsylvania.",
    applicantTypes: [NP],
    geographicScope: "Ohio, Michigan, Indiana and Pennsylvania",
    awardFloorCents: 15_000 * M,
    awardCeilingCents: 80_000 * M,
    closeInDays: 33,
    gold: {
      jfta: { relevance: 0, eligible: false, reason: "Great Lakes states only." },
      lrp: {
        relevance: 2,
        eligible: true,
        reason: "LRP's family literacy program with city schools; Ohio included.",
      },
    },
  }),
  opp({
    key: "fdn-urban-digital-equity",
    source: "manual",
    funderName: "Lakeline Digital Equity Fund",
    funderType: "foundation",
    title: "Digital Equity for Urban Adults",
    opportunityNumber: null,
    summary: "Digital skills training and device access for adults in urban Ohio neighborhoods.",
    description:
      "Funds digital literacy classes covering email, online job applications and telehealth for low-income urban adults.",
    eligibilityText: "Nonprofits serving urban communities in Ohio.",
    applicantTypes: [NP],
    geographicScope: "Urban communities in Ohio",
    awardFloorCents: 10_000 * M,
    awardCeilingCents: 50_000 * M,
    closeInDays: 47,
    gold: {
      jfta: { relevance: 0, eligible: false, reason: "Ohio only." },
      lrp: { relevance: 2, eligible: true, reason: "Matches LRP's digital literacy workshops." },
    },
  }),
  opp({
    key: "fdn-community-health-workers",
    source: "manual",
    funderName: "Ridgeview Health Trust",
    funderType: "foundation",
    title: "Community Health Worker Training",
    opportunityNumber: null,
    summary: "Trains community health workers for clinics and hospitals.",
    description:
      "Funds certification courses, clinical placements and stipends for community health worker trainees.",
    eligibilityText: "U.S. 501(c)(3) organizations.",
    applicantTypes: [NP],
    geographicScope: "National",
    awardFloorCents: 50_000 * M,
    awardCeilingCents: 200_000 * M,
    closeInDays: 52,
    gold: {
      jfta: { relevance: 0, eligible: true, reason: "Health workforce; off-mission." },
      lrp: { relevance: 0, eligible: true, reason: "Health workforce; off-mission." },
    },
  }),
  opp({
    key: "fdn-public-murals",
    source: "manual",
    funderName: "Silver Hollow Arts Fund",
    funderType: "foundation",
    title: "Public Murals and Community Arts",
    opportunityNumber: null,
    summary: "Commissions public murals and neighborhood arts festivals.",
    description:
      "Funds artist fees, paint and scaffolding for public murals and community arts events.",
    eligibilityText: "U.S. 501(c)(3) organizations.",
    applicantTypes: [NP],
    geographicScope: "National",
    awardFloorCents: 5_000 * M,
    awardCeilingCents: 30_000 * M,
    closeInDays: 44,
    gold: {
      jfta: { relevance: 0, eligible: true, reason: "Arts; off-mission." },
      lrp: { relevance: 0, eligible: true, reason: "Arts; off-mission." },
    },
  }),
  opp({
    key: "fdn-ohio-capacity",
    source: "manual",
    funderName: "Cardinal Point Foundation",
    funderType: "foundation",
    title: "Nonprofit Capacity Building Grants",
    opportunityNumber: null,
    summary: "Strengthens Ohio nonprofits' finance, data and volunteer management systems.",
    description:
      "Funds consultants, software and training that build nonprofit operating capacity.",
    eligibilityText: "Ohio 501(c)(3) nonprofits with budgets under $3 million.",
    applicantTypes: [NP],
    geographicScope: "Ohio",
    awardFloorCents: 10_000 * M,
    awardCeilingCents: 40_000 * M,
    closeInDays: 58,
    gold: {
      jfta: { relevance: 0, eligible: false, reason: "Ohio only." },
      lrp: {
        relevance: 1,
        eligible: true,
        reason: "Generic capacity building; LRP qualifies (Ohio, $1.1M budget).",
      },
    },
  }),
  opp({
    key: "fdn-trades-tools",
    source: "manual",
    funderName: "Keystone Tool Trust",
    funderType: "foundation",
    title: "Skilled Trades Tools and Equipment Grants",
    opportunityNumber: null,
    summary: "Buys tools, shop equipment and safety gear for trades training programs.",
    description:
      "Funds hand and power tools, shop equipment and personal protective equipment for construction trainees.",
    eligibilityText: "U.S. 501(c)(3) organizations running trades training.",
    applicantTypes: [NP],
    geographicScope: "National",
    awardFloorCents: 5_000 * M,
    awardCeilingCents: 25_000 * M,
    closeInDays: 36,
    gold: {
      jfta: { relevance: 2, eligible: true, reason: "Tools for JFTA's training shop." },
      lrp: { relevance: 0, eligible: true, reason: "Trades tools; off-mission." },
    },
  }),
  opp({
    key: "fdn-new-americans-english",
    source: "manual",
    funderName: "Harbor Light Immigrant Fund",
    funderType: "foundation",
    title: "English Language Learning for New Americans",
    opportunityNumber: null,
    summary: "ESOL and civics instruction for immigrant and refugee adults.",
    description:
      "Funds ESOL classes, citizenship preparation and volunteer conversation partners for immigrant and refugee adults.",
    eligibilityText: "U.S. 501(c)(3) organizations.",
    applicantTypes: [NP],
    geographicScope: "National",
    awardFloorCents: 20_000 * M,
    awardCeilingCents: 90_000 * M,
    closeInDays: 41,
    gold: {
      jfta: { relevance: 0, eligible: true, reason: "ESOL; off-mission." },
      lrp: {
        relevance: 2,
        eligible: true,
        reason: "64% of LRP learners are immigrants or refugees.",
      },
    },
  }),
  opp({
    key: "fdn-greatlakes-network-members",
    source: "manual",
    funderName: "Great Lakes Literacy Network",
    funderType: "foundation",
    title: "Member Program Innovation Grants",
    opportunityNumber: null,
    summary: "Innovation grants for adult literacy programs in the network.",
    description:
      "Funds new tutoring models and learner assessments at member adult literacy programs.",
    eligibilityText:
      "Applicants must be dues-paying members of the Great Lakes Literacy Network in good standing.",
    applicantTypes: [OTHERS],
    geographicScope:
      "Ohio, Michigan, Indiana, Illinois, Wisconsin, Minnesota, Pennsylvania and New York",
    awardFloorCents: 10_000 * M,
    awardCeilingCents: 35_000 * M,
    closeInDays: 49,
    gold: {
      jfta: { relevance: 0, eligible: false, reason: "Great Lakes states only." },
      lrp: {
        relevance: 2,
        eligible: "unknown",
        reason: "On-mission, but network membership is required and no fact says LRP is a member.",
      },
    },
  }),
  opp({
    key: "fdn-trades-micro-awards",
    source: "manual",
    funderName: "Piñon Crafts Circle",
    funderType: "foundation",
    title: "Trades and Crafts Micro-Awards",
    opportunityNumber: null,
    summary: "Small awards for tools and materials for trades and crafts students.",
    description:
      "Micro-awards buy tools or materials for individual construction and craft trainees.",
    eligibilityText: "Any U.S. nonprofit.",
    applicantTypes: [NP, NP_NO501],
    geographicScope: "National",
    awardFloorCents: 500 * M,
    awardCeilingCents: 2_000 * M,
    closeInDays: 30,
    gold: {
      jfta: {
        relevance: 1,
        eligible: true,
        reason: "On-topic but a $2,000 ceiling is below the $2,500 minimum worth applying for.",
        trap: "ceiling_below_min",
      },
      lrp: { relevance: 0, eligible: true, reason: "Trades micro-awards; off-mission and tiny." },
    },
  }),
  opp({
    key: "fdn-rural-apprenticeship-forecast",
    source: "manual",
    funderName: "High Desert Community Trust",
    funderType: "foundation",
    title: "Rural Construction Apprenticeship Fund (2027 cycle, forecast)",
    opportunityNumber: null,
    summary: "Forecast: grants for rural construction pre-apprenticeship programs in New Mexico.",
    description:
      "The trust expects to fund rural pre-apprenticeship programs with registered apprenticeship partners; the deadline will be announced.",
    eligibilityText: "New Mexico 501(c)(3) organizations and tribal organizations.",
    applicantTypes: [NP, TRIBAL_ORG],
    geographicScope: "New Mexico",
    awardFloorCents: 50_000 * M,
    awardCeilingCents: 150_000 * M,
    status: "forecasted",
    closeInDays: null,
    gold: {
      jfta: {
        relevance: 2,
        eligible: true,
        reason: "NM rural pre-apprenticeship (forecast; plan ahead).",
      },
      lrp: { relevance: 0, eligible: false, reason: "New Mexico only." },
    },
  }),
];
