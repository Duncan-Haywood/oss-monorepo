// Construction delay claim check. Pure arithmetic over what the user types in: delay events are sorted by who caused them, the
// contract time is extended for the excusable ones, money is claimed only for owner-caused delay that was not concurrent with the
// contractor's own, and liquidated damages are charged on whatever lateness is left. The home-office overhead share uses the Eichleay
// formula. This sets the claim against the liquidated damages so the net position of a delayed job can be seen before the letter is written.

export const CAUSES = ["owner", "contractor", "weather", "other"];
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const round4 = (x) => Math.round((x + Number.EPSILON) * 10000) / 10000;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));
const optional = (v, dflt = 0) => (v === undefined || v === null || String(v).trim() === "" ? dflt : num(v));

// One event per line: name, days, owner|contractor|weather|other, concurrent yes|no
// "weather" and "other" are neutral causes (excusable, not compensable). "concurrent" means the contractor was also delaying the job.
export function parseDelays(text) {
  const delays = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    const [name, daysRaw, causeRaw, concRaw] = p;
    const where = `Delay line ${i + 1}`;
    if (!name || daysRaw === undefined || !causeRaw) return errors.push(`${where}: need "name, days, owner|contractor|weather|other, concurrent yes|no".`);
    const days = num(daysRaw), cause = causeRaw.toLowerCase(), conc = (concRaw || "no").toLowerCase();
    if (!Number.isFinite(days) || days <= 0) return errors.push(`${where}: days must be a number above zero.`);
    if (!CAUSES.includes(cause)) return errors.push(`${where}: cause must be owner, contractor, weather or other.`);
    if (!["yes", "no", "y", "n"].includes(conc)) return errors.push(`${where}: concurrent must be yes or no.`);
    delays.push({ name, days, cause, concurrent: conc.startsWith("y") });
  });
  return { delays, errors };
}

// Eichleay: (contract billings / total billings over the contract period) x home office overhead for the period, divided by the days
// the contract actually took, gives a daily rate; the rate times the compensable delay days is the claim.
export function eichleay({ contractBillings, totalBillings, homeOverhead, actualDays, delayDays }) {
  if (!(contractBillings > 0 && totalBillings >= contractBillings && homeOverhead > 0 && actualDays > 0)) return { allocated: 0, daily: 0, claim: 0 };
  const allocated = (contractBillings / totalBillings) * homeOverhead;
  const daily = allocated / actualDays;
  return { allocated: round2(allocated), daily: round2(daily), claim: round2(daily * delayDays), share: round4(contractBillings / totalBillings) };
}

export function plan(input) {
  const { delays, errors } = parseDelays(input.delays);
  if (errors.length) return { error: errors[0], errors };
  const contractDays = num(input.contractDays), actualDays = num(input.actualDays);
  const contractValue = optional(input.contractValue), ldPerDay = optional(input.ldPerDay), ldCapPct = optional(input.ldCapPct);
  const fieldDaily = optional(input.fieldDaily), profitPct = optional(input.profitPct);
  const contractBillings = optional(input.contractBillings), totalBillings = optional(input.totalBillings), homeOverhead = optional(input.homeOverhead);
  if (!(contractDays > 0)) return { error: "Enter the original contract time in days, above zero." };
  if (!(actualDays > 0)) return { error: "Enter the days the job actually took (or is projected to take), above zero." };
  if (![contractValue, ldPerDay, ldCapPct, fieldDaily, profitPct, contractBillings, totalBillings, homeOverhead].every((x) => Number.isFinite(x) && x >= 0)) return { error: "Money and percent fields must be zero or more." };
  if (!delays.length) return { error: "Add at least one delay event: name, days, owner|contractor|weather|other, concurrent yes|no." };
  if (homeOverhead > 0 && !(totalBillings >= contractBillings && contractBillings > 0)) return { error: "For the Eichleay share, total billings must be at least this contract's billings, and both above zero." };

  const sum = (f) => delays.filter(f).reduce((a, d) => a + d.days, 0);
  const ownerDays = sum((d) => d.cause === "owner" && !d.concurrent);
  const ownerConcurrent = sum((d) => d.cause === "owner" && d.concurrent);
  const neutralDays = sum((d) => (d.cause === "weather" || d.cause === "other") && !d.concurrent);
  const neutralConcurrent = sum((d) => (d.cause === "weather" || d.cause === "other") && d.concurrent);
  const contractorDays = sum((d) => d.cause === "contractor");
  // Time: every non-contractor delay earns a time extension, concurrent or not. Money: only owner delay that was not concurrent.
  const extensionDays = ownerDays + ownerConcurrent + neutralDays + neutralConcurrent;
  const compensableDays = ownerDays;
  const adjustedDays = contractDays + extensionDays;
  const lateDays = Math.max(0, actualDays - adjustedDays);
  const rawLd = ldPerDay * lateDays;
  const ldCap = ldCapPct > 0 && contractValue > 0 ? contractValue * ldCapPct / 100 : null;
  const ld = round2(ldCap === null ? rawLd : Math.min(rawLd, ldCap));
  const ldWithoutRelief = ldPerDay * Math.max(0, actualDays - contractDays);
  const ldAvoided = round2(Math.max(0, (ldCap === null ? ldWithoutRelief : Math.min(ldWithoutRelief, ldCap)) - ld));

  const field = round2(fieldDaily * compensableDays);
  const e = eichleay({ contractBillings, totalBillings, homeOverhead, actualDays, delayDays: compensableDays });
  const profit = round2((field + e.claim) * profitPct / 100);
  const claim = round2(field + e.claim + profit);
  const net = round2(claim - ld);

  const advice = [];
  advice.push(`Time: ${extensionDays} of the ${delays.reduce((a, d) => a + d.days, 0)} delay days earn an extension, moving the completion date from ${contractDays} to ${adjustedDays} days. The job took ${actualDays}.`);
  if (lateDays > 0) advice.push(`That leaves ${lateDays} day${lateDays === 1 ? "" : "s"} late: ${ldPerDay > 0 ? "liquidated damages of $" + ld.toFixed(2) + (ldCap !== null && rawLd > ldCap ? " (held to the cap)" : "") : "no liquidated damages rate entered"}.`);
  else advice.push("After the extensions the job finished on time, so no liquidated damages should apply.");
  if (ldAvoided > 0) advice.push(`The extensions are worth $${ldAvoided.toFixed(2)} of liquidated damages, which is why the notice and the dates matter more than the cost claim.`);
  if (compensableDays > 0) advice.push(`Money: ${compensableDays} owner-caused day${compensableDays === 1 ? "" : "s"} with no concurrent contractor delay. Field overhead $${field.toFixed(2)}${e.claim > 0 ? `, home-office overhead $${e.claim.toFixed(2)} (Eichleay, $${e.daily.toFixed(2)} a day)` : ""}${profit > 0 ? `, profit $${profit.toFixed(2)}` : ""}: claim $${claim.toFixed(2)}.`);
  else advice.push("No delay days qualify for money: only owner-caused delay that did not run concurrently with a contractor delay is compensable on most contracts.");
  if (ownerConcurrent > 0) advice.push(`${ownerConcurrent} owner-caused day${ownerConcurrent === 1 ? " is" : "s are"} concurrent with your own delay: typically time but no money. Documentation that separates the two is what moves days from this bucket to the compensable one.`);
  if (contractorDays > 0) advice.push(`${contractorDays} day${contractorDays === 1 ? "" : "s"} of contractor-caused delay earn neither time nor money.`);
  if (homeOverhead > 0 && compensableDays > 0) advice.push("Eichleay is usually only allowed when the delay was uncertain in length, the crew was kept on standby, and other work could not be taken on. Check that your facts fit before claiming it, and read your contract for any waiver of delay damages (a no-damages-for-delay clause) or a required notice period.");
  advice.push(`Net position: claim $${claim.toFixed(2)} against liquidated damages $${ld.toFixed(2)} = ${net >= 0 ? "+" : "-"}$${Math.abs(net).toFixed(2)}.`);
  advice.push("This sorts the days and does the arithmetic on your inputs. Whether a day is excusable or compensable turns on your contract, the notice you gave and the proof you hold. It is not legal advice; have a construction attorney read the contract before a claim is sent.");

  return {
    delays, ownerDays, ownerConcurrent, neutralDays, neutralConcurrent, contractorDays, extensionDays, compensableDays,
    adjustedDays, lateDays, ld, ldAvoided, field, eichleay: e, profit, claim, net, advice,
  };
}

// Net position as the number of compensable owner days moves, holding everything else, so the value of proving one more day is visible.
export function sensitivity(input, deltas = [-10, -5, 0, 5, 10]) {
  const { delays } = parseDelays(input.delays);
  const base = plan(input);
  if (base.error) return [];
  return deltas.map((d) => {
    const owner = Math.max(0, base.ownerDays + d);
    const lines = [...delays.filter((x) => !(x.cause === "owner" && !x.concurrent)).map((x) => `${x.name.replace(/,/g, " ")}, ${x.days}, ${x.cause}, ${x.concurrent ? "yes" : "no"}`)];
    if (owner > 0) lines.push(`Owner delay (modelled), ${owner}, owner, no`);
    if (!lines.length) return { ownerDays: owner, claim: 0, ld: base.ld, net: -base.ld };
    const r = plan({ ...input, delays: lines.join("\n") });
    return r.error ? { ownerDays: owner, claim: 0, ld: base.ld, net: -base.ld } : { ownerDays: owner, claim: r.claim, ld: r.ld, net: r.net };
  });
}

export function sampleInput() {
  return {
    contractValue: 2400000, contractDays: 240, actualDays: 297, ldPerDay: 1500, ldCapPct: 10,
    fieldDaily: 1850, profitPct: 5, contractBillings: 2400000, totalBillings: 9600000, homeOverhead: 1100000,
    delays: [
      "Late owner-furnished switchgear, 21, owner, no",
      "Design change RFI backlog, 14, owner, yes",
      "Named storm shutdown, 6, weather, no",
      "Our drywall crew shortage, 12, contractor, no",
    ].join("\n"),
  };
}

export function toCsv(r) {
  const rows = [
    ["owner_days_compensable", r.ownerDays], ["owner_days_concurrent", r.ownerConcurrent], ["neutral_days", r.neutralDays + r.neutralConcurrent],
    ["contractor_days", r.contractorDays], ["time_extension_days", r.extensionDays], ["adjusted_contract_days", r.adjustedDays], ["late_days", r.lateDays],
    ["field_overhead_claim", r.field.toFixed(2)], ["home_office_overhead_claim", r.eichleay.claim.toFixed(2)], ["profit", r.profit.toFixed(2)],
    ["total_claim", r.claim.toFixed(2)], ["liquidated_damages", r.ld.toFixed(2)], ["net_position", r.net.toFixed(2)],
  ];
  return "item,value\n" + rows.map((x) => x.join(",")).join("\n") + "\n";
}
