// Source: U.S. Department of Justice, "Extension of Compliance Dates for
// Nondiscrimination on the Basis of Disability; Accessibility of Web
// Information and Services of State and Local Government Entities," 89 FR
// (interim final rule), published 2026-04-20, Federal Register document
// 2026-07663 -- extending the original 28 CFR 35.200 compliance dates
// (April 24, 2026 / April 26, 2027) by one year. Verify against the current
// Federal Register / ada.gov text before relying on this; a rule extension
// can itself be extended, narrowed, or litigated.
export const SOURCE_URL = "https://www.federalregister.gov/documents/2026/04/20/2026-07663/";
export const FACT_SHEET_URL = "https://www.ada.gov/resources/2024-03-08-web-rule/";

const LARGE_ENTITY_DATE = "2027-04-26";
const SMALL_OR_SPECIAL_DATE = "2028-04-26";

export function resolveDeadline({ entityType, population }) {
  if (entityType === "special-district") {
    return {
      date: SMALL_OR_SPECIAL_DATE,
      reason:
        "Any special district government (school, water, fire, transit, or other special-purpose district) has until April 26, 2028, regardless of population.",
    };
  }
  const trimmed = typeof population === "string" ? population.trim() : population;
  if (trimmed === "" || trimmed === null || trimmed === undefined) {
    throw new Error("Enter the entity's total population as a non-negative number, or pick special district.");
  }
  const pop = Number(trimmed);
  if (!Number.isFinite(pop) || pop < 0) {
    throw new Error("Enter the entity's total population as a non-negative number, or pick special district.");
  }
  if (pop >= 50000) {
    return {
      date: LARGE_ENTITY_DATE,
      reason:
        "State and local government entities with a total population of 50,000 or more have until April 26, 2027.",
    };
  }
  return {
    date: SMALL_OR_SPECIAL_DATE,
    reason:
      "State and local government entities with a total population under 50,000 have until April 26, 2028.",
  };
}

export function daysUntil(dateString, now = new Date()) {
  const target = new Date(`${dateString}T00:00:00Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function deadlineAsText({ entityType, population }, now = new Date()) {
  const { date, reason } = resolveDeadline({ entityType, population });
  const days = daysUntil(date, now);
  const when = days >= 0 ? `${days} day${days === 1 ? "" : "s"} away` : `${-days} day${-days === 1 ? "" : "s"} past`;
  return [
    `ADA Title II web accessibility compliance date: ${date} (${when})`,
    reason,
    "Standard: WCAG 2.1 Level AA, per 28 CFR 35.200.",
    `Source: ${SOURCE_URL}`,
    "This is a plain-language read of a published federal rule, not legal advice. Confirm the current date and scope with your own counsel or ADA coordinator before relying on it -- an interim rule can change.",
  ].join("\n");
}
