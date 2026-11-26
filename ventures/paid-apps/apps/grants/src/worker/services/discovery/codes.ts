// Official Grants.gov code lists used to validate AI search plans and to translate filters for
// Simpler.Grants.gov. Pure data; keep in sync with the sources below.
//
// Sources (verified 2026-11-19):
//  - Grants.gov search2 facet lists: POST https://api.grants.gov/v1/api/search2 with
//    oppStatuses "forecasted|posted|closed|archived" returns `data.eligibilities` and
//    `data.fundingCategories` ({ label, value }) — the values below are those `value`s.
//    Docs: https://www.grants.gov/api/common/search2
//  - Simpler.Grants.gov enums: https://api.simpler.grants.gov/openapi.json
//    (ApplicantTypeFilterV1Schema, FundingCategoryFilterV1Schema).

/** Grants.gov applicant eligibility codes (search2 `eligibilities`), with Simpler enum names. */
export const GRANTS_GOV_ELIGIBILITIES = {
  "00": { label: "State governments", simpler: "state_governments" },
  "01": { label: "County governments", simpler: "county_governments" },
  "02": { label: "City or township governments", simpler: "city_or_township_governments" },
  "04": { label: "Special district governments", simpler: "special_district_governments" },
  "05": { label: "Independent school districts", simpler: "independent_school_districts" },
  "06": {
    label: "Public and State controlled institutions of higher education",
    simpler: "public_and_state_institutions_of_higher_education",
  },
  "07": {
    label: "Native American tribal governments (Federally recognized)",
    simpler: "federally_recognized_native_american_tribal_governments",
  },
  "08": {
    label: "Public housing authorities/Indian housing authorities",
    simpler: "public_and_indian_housing_authorities",
  },
  "11": {
    label:
      "Native American tribal organizations (other than Federally recognized tribal governments)",
    simpler: "other_native_american_tribal_organizations",
  },
  "12": {
    label:
      "Nonprofits having a 501(c)(3) status with the IRS, other than institutions of higher education",
    simpler: "nonprofits_non_higher_education_with_501c3",
  },
  "13": {
    label:
      "Nonprofits that do not have a 501(c)(3) status with the IRS, other than institutions of higher education",
    simpler: "nonprofits_non_higher_education_without_501c3",
  },
  "20": {
    label: "Private institutions of higher education",
    simpler: "private_institutions_of_higher_education",
  },
  "21": { label: "Individuals", simpler: "individuals" },
  "22": {
    label: "For profit organizations other than small businesses",
    simpler: "for_profit_organizations_other_than_small_businesses",
  },
  "23": { label: "Small businesses", simpler: "small_businesses" },
  "25": {
    label: 'Others (see text field entitled "Additional Information on Eligibility")',
    simpler: "other",
  },
  "99": { label: "Unrestricted (i.e., open to any type of entity)", simpler: "unrestricted" },
} as const;
export type EligibilityCode = keyof typeof GRANTS_GOV_ELIGIBILITIES;
export const ELIGIBILITY_CODES = Object.keys(GRANTS_GOV_ELIGIBILITIES) as EligibilityCode[];

/** Grants.gov funding activity category codes (search2 `fundingCategories`), with Simpler enums. */
export const GRANTS_GOV_FUNDING_CATEGORIES = {
  ACA: { label: "Affordable Care Act", simpler: "affordable_care_act" },
  AG: { label: "Agriculture", simpler: "agriculture" },
  AR: { label: "Arts", simpler: "arts" },
  BC: { label: "Business and Commerce", simpler: "business_and_commerce" },
  CD: { label: "Community Development", simpler: "community_development" },
  CP: { label: "Consumer Protection", simpler: "consumer_protection" },
  DPR: { label: "Disaster Prevention and Relief", simpler: "disaster_prevention_and_relief" },
  ED: { label: "Education", simpler: "education" },
  ELT: { label: "Employment, Labor and Training", simpler: "employment_labor_and_training" },
  EN: { label: "Energy", simpler: "energy" },
  EIC: {
    label: "Energy Infrastructure and Critical Mineral and Materials (EICMM)",
    simpler: "energy_infrastructure_and_critical_mineral_and_materials",
  },
  ENV: { label: "Environment", simpler: "environment" },
  FN: { label: "Food and Nutrition", simpler: "food_and_nutrition" },
  HL: { label: "Health", simpler: "health" },
  HO: { label: "Housing", simpler: "housing" },
  HU: { label: "Humanities", simpler: "humanities" },
  ISS: {
    label: "Income Security and Social Services",
    simpler: "income_security_and_social_services",
  },
  IS: { label: "Information and Statistics", simpler: "information_and_statistics" },
  IIJ: {
    label: "Infrastructure Investment and Jobs Act (IIJA)",
    simpler: "infrastructure_investment_and_jobs_act",
  },
  LJL: { label: "Law, Justice and Legal Services", simpler: "law_justice_and_legal_services" },
  NR: { label: "Natural Resources", simpler: "natural_resources" },
  OZ: { label: "Opportunity Zone Benefits", simpler: "opportunity_zone_benefits" },
  O: { label: "Other", simpler: "other" },
  RA: { label: "Recovery Act", simpler: "recovery_act" },
  RT: { label: "Recreation and Tourism", simpler: "recreation_and_tourism" },
  RD: { label: "Regional Development", simpler: "regional_development" },
  ST: {
    label: "Science and Technology and other Research and Development",
    simpler: "science_technology_and_other_research_and_development",
  },
  T: { label: "Transportation", simpler: "transportation" },
} as const;
export type FundingCategoryCode = keyof typeof GRANTS_GOV_FUNDING_CATEGORIES;
export const FUNDING_CATEGORY_CODES = Object.keys(
  GRANTS_GOV_FUNDING_CATEGORIES,
) as FundingCategoryCode[];

/** Assistance Listing Number (formerly CFDA), e.g. "17.268". */
export const ALN_RE = /^\d{2}\.\d{3}$/;

export const isEligibilityCode = (v: string): v is EligibilityCode =>
  Object.hasOwn(GRANTS_GOV_ELIGIBILITIES, v);
export const isFundingCategoryCode = (v: string): v is FundingCategoryCode =>
  Object.hasOwn(GRANTS_GOV_FUNDING_CATEGORIES, v);

const bySimpler = <K extends string>(m: Record<K, { label: string; simpler: string }>) =>
  new Map(Object.values<{ label: string; simpler: string }>(m).map((v) => [v.simpler, v.label]));
const SIMPLER_APPLICANT_LABELS = bySimpler(GRANTS_GOV_ELIGIBILITIES);
const SIMPLER_CATEGORY_LABELS = bySimpler(GRANTS_GOV_FUNDING_CATEGORIES);

/** Simpler enum ("nonprofits_non_higher_education_with_501c3") -> Grants.gov label. */
export const simplerApplicantLabel = (v: string) => SIMPLER_APPLICANT_LABELS.get(v) ?? null;
export const simplerCategoryLabel = (v: string) => SIMPLER_CATEGORY_LABELS.get(v) ?? null;
