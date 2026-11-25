// Miller Act payment bond claims on federal construction jobs: who may claim, the 90-day notice a
// second-tier claimant must give the prime contractor, when a suit may be filed and the one-year
// limit, and a draft of the notice. Federal only; state "little Miller Acts" differ.
//
// Sources (read 2026-11-25 on the official or primary sites):
//   40 U.S.C. 3131 and 3133, govinfo.gov (2023 edition) and law.cornell.edu (no amendment after
//     Pub. L. 109-284, 2006);
//   FAR 28.102-1, acquisition.gov, FAC 2026-01 effective 2026-03-13 ($150,000 bond threshold,
//     payment protections between $35,000 and $150,000);
//   J.W. Bateson Co. v. United States ex rel. Board of Trustees, 434 U.S. 586 (1978), on Cornell LII
//     (a sub-subcontractor's own subcontractors and employees are not covered).
//
// Day counting: the statute says "within 90 days from the date" and "no later than one year after
// the day". We count 90 calendar days starting the day after the last day of work, and a year as
// the same calendar date a year later (29 Feb -> 28 Feb, the earlier date). Courts have not all
// counted alike, so the page says to act well before either date. Pure functions, no I/O.
import { fmt, toCents } from "./calc.mjs";

const DAY = 86400000;

export const TIERS = {
  prime: "I am the prime contractor",
  first: "I contracted directly with the prime contractor",
  second: "I contracted with one of the prime's subcontractors",
  remote: "I contracted with a sub-subcontractor or further down",
};

// FAR 28.102-1 (FAC 2026-01): payment bond above $150,000; between $35,000 and $150,000 the
// contracting officer picks two or more payment protections, one of which may be a payment bond.
export const BOND_THRESHOLD = 15000000;
export const PROTECTION_FLOOR = 3500000;

export function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}
export const isoDate = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (t, n) => t + n * DAY;
function addYear(t) {
  const d = new Date(t);
  const y = d.getUTCFullYear() + 1;
  const m = d.getUTCMonth();
  const day = Math.min(d.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
  return Date.UTC(y, m, day);
}

function status(deadline, today) {
  const daysLeft = Math.round((deadline - today) / DAY);
  const state = daysLeft < 0 ? "past" : daysLeft === 0 ? "today" : daysLeft <= 14 ? "soon" : "open";
  return { date: isoDate(deadline), daysLeft, state };
}

function bondNote(contract) {
  if (contract === null) return "Contract value not entered: a payment bond is required on federal construction contracts above $150,000 (FAR 28.102-1). Ask the contracting agency for a copy of the bond.";
  if (contract > BOND_THRESHOLD) return `A ${fmt(contract)} prime contract is above the $150,000 threshold in FAR 28.102-1, so the prime should have furnished a payment bond.`;
  if (contract > PROTECTION_FLOOR) return `A ${fmt(contract)} prime contract is between $35,000 and $150,000: the contracting officer picks two or more payment protections (a payment bond, an irrevocable letter of credit, a tripartite escrow, certificates of deposit or other security) and the prime furnishes one of them (FAR 28.102-1(b)). Ask the agency which one this contract has; the deadlines below are for a payment bond.`;
  return `A ${fmt(contract)} prime contract is at or under $35,000, where FAR 28.102-1 requires no payment bond or alternative. Check with the agency whether one was furnished anyway; if not, there is no bond to claim on.`;
}

/**
 * Deadlines for one claim.
 * @param {{tier: string, lastDay: string, today: string, contract?: string}} input
 * lastDay: the last day you performed labor or supplied material under your contract.
 */
export function millerDeadlines({ tier, lastDay, today, contract = "" } = {}) {
  const errors = [];
  const notes = [];
  if (!Object.hasOwn(TIERS, tier)) errors.push("Pick who you contracted with.");
  const last = parseDate(lastDay);
  if (Number.isNaN(last)) errors.push("Last day of labor or material: enter a date as YYYY-MM-DD.");
  const now = parseDate(today);
  if (Number.isNaN(now)) errors.push("Today's date: enter a date as YYYY-MM-DD.");
  const c = String(contract ?? "").trim() === "" ? null : toCents(contract);
  if (c !== null && (!Number.isFinite(c) || c < 0)) errors.push(`Prime contract value: "${contract}" is not an amount.`);
  if (errors.length) return { errors, notes, covered: false, notice: null, suitFrom: null, suitBy: null, bond: null };

  if (last > now) notes.push("The last day is after today. The deadlines count from the day you actually last worked or delivered, so recheck them once the work is done.");

  if (tier === "prime") {
    return { errors, notes: [...notes, "The payment bond protects the people who supply labor and material to the prime; the prime does not claim on its own bond. A prime's payment dispute with the government goes through the contract's disputes clause instead."], covered: false, notice: null, suitFrom: null, suitBy: null, bond: null };
  }
  if (tier === "remote") {
    return { errors, notes: [...notes, "The Supreme Court held in J.W. Bateson Co. v. United States (1978) that the bond covers only those who contracted with the prime or with one of its subcontractors. Someone who contracted with a sub-subcontractor (or its employees) has no claim on the federal payment bond. Look at the contract above you instead: a sub-subcontractor may have given its own bond, and your state may give other rights against the party you contracted with."], covered: false, notice: null, suitFrom: null, suitBy: null, bond: bondNote(c) };
  }

  const notice = tier === "second" ? status(addDays(last, 90), now) : null;
  const suitFrom = isoDate(addDays(last, 91));
  const suitBy = status(addYear(last), now);
  if (tier === "first") notes.push("You contracted with the prime, so the statute asks for no 90-day notice before a suit. A written demand to the prime and its surety is still the usual first step.");
  if (notice && notice.state === "past") notes.push("The 90-day notice date has passed. A notice sent late can still matter if the prime received written notice of the claim earlier in some other form; ask an attorney before giving up the claim.");
  if (suitBy.state === "past") notes.push("The one-year date has passed. The statute says an action must be brought no later than one year after the last day of labor or material.");
  return { errors, notes, covered: true, notice, suitFrom, suitBy, bond: bondNote(c) };
}

/** Draft of the second-tier notice to the prime (40 U.S.C. 3133(b)(2)). Returns "" until the essentials are there. */
export function noticeLetter({ claimant = "", prime = "", furnishedTo = "", project = "", contractNo = "", amount = "", lastDay = "", today = "" } = {}) {
  const cents = toCents(amount);
  if (!claimant.trim() || !prime.trim() || !furnishedTo.trim() || !Number.isFinite(cents) || cents <= 0 || Number.isNaN(parseDate(lastDay))) return "";
  const lines = [
    "NOTICE OF CLAIM ON PAYMENT BOND",
    "Under 40 U.S.C. 3133(b)(2) (the Miller Act)",
    "",
    `To: ${prime.trim()}`,
    `Date: ${parseDate(today) ? today : ""}`.trimEnd(),
    project.trim() ? `Project: ${project.trim()}` : "",
    contractNo.trim() ? `Federal contract number: ${contractNo.trim()}` : "",
    "",
    `${claimant.trim()} gives notice of its claim of ${fmt(cents)} against the payment bond furnished for this contract.`,
    "",
    `The labor or material was furnished to, or performed for: ${furnishedTo.trim()}.`,
    `The last of the labor was performed or material supplied on: ${lastDay}.`,
    `The amount claimed, ${fmt(cents)}, was unpaid on the date of this notice.`,
    "",
    claimant.trim(),
    "By: ____________________",
  ];
  return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}
