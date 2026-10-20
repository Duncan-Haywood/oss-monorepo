// Security-deposit return deadlines for tenants, by US state, plus a demand letter.
// Pure functions, no I/O. Statute data is a best-effort summary as of REVIEWED; it is
// not legal advice and local ordinances (e.g. city rent rules) can differ.

export const REVIEWED = "2026-10";

// days: calendar days unless `business`. months: calendar months. clock: what starts it.
// forwarding: the statute (or practice) expects the tenant to give a forwarding address.
// multiplier: statutory damages multiple of the wrongfully withheld amount (when one is
// a flat multiple); penaltyText says what the statute says in words.
export const STATES = {
  AZ: { name: "Arizona", cite: "A.R.S. § 33-1321", days: 14, business: true, forwarding: false, multiplier: 2, penaltyText: "up to twice the amount wrongfully withheld, plus the deposit owed" },
  CA: { name: "California", cite: "Cal. Civ. Code § 1950.5", days: 21, forwarding: false, multiplier: 2, penaltyText: "bad-faith retention can add statutory damages of up to twice the deposit" },
  CO: { name: "Colorado", cite: "C.R.S. § 38-12-103", months: 1, forwarding: false, multiplier: 3, penaltyText: "willful retention can mean three times the amount wrongfully withheld, plus fees (the lease may extend the period up to 60 days)" },
  DC: { name: "District of Columbia", cite: "D.C. Mun. Regs. tit. 14, § 308", days: 45, forwarding: false, multiplier: null, penaltyText: "the landlord may owe the deposit back with interest; see the regulation for further remedies" },
  FL: { name: "Florida", cite: "Fla. Stat. § 83.49", days: 15, forwarding: false, multiplier: null, penaltyText: "15 days to return it if no claim is made, or 30 days to send written notice of a claim by certified mail; a landlord who misses the 30-day notice may lose the right to impose the claim", extraDays: 30 },
  GA: { name: "Georgia", cite: "O.C.G.A. § 44-7-34", days: 30, forwarding: false, multiplier: 3, penaltyText: "bad-faith retention can mean three times the amount wrongfully withheld, plus fees" },
  MA: { name: "Massachusetts", cite: "Mass. Gen. Laws ch. 186, § 15B", days: 30, forwarding: false, multiplier: 3, penaltyText: "three times the deposit (and interest) can be owed if the statute was not followed, plus fees" },
  MD: { name: "Maryland", cite: "Md. Code, Real Prop. § 8-203", days: 45, forwarding: false, multiplier: 3, penaltyText: "up to three times the amount wrongfully withheld, plus fees, for a landlord who withholds in bad faith" },
  MI: { name: "Michigan", cite: "Mich. Comp. Laws § 554.609", days: 30, forwarding: true, multiplier: 2, penaltyText: "a landlord who fails to follow the notice rules may owe double the amount wrongfully withheld; the tenant must give a forwarding address within 4 days of moving out" },
  MN: { name: "Minnesota", cite: "Minn. Stat. § 504B.178", days: 21, forwarding: true, multiplier: null, penaltyText: "a landlord who retains a deposit in bad faith can owe a $500 punitive amount on top of the deposit; the period runs from moving out once the tenant gives a forwarding address" },
  NC: { name: "North Carolina", cite: "N.C. Gen. Stat. § 42-52", days: 30, forwarding: false, multiplier: null, penaltyText: "30 days, extended to 60 if the landlord cannot yet determine the full claim and says so in writing; a landlord who wilfully fails can lose the right to keep any of it" },
  NJ: { name: "New Jersey", cite: "N.J. Stat. § 46:8-21.1", days: 30, forwarding: false, multiplier: 2, penaltyText: "a landlord who does not return it on time can owe double the amount wrongfully withheld, plus fees" },
  NY: { name: "New York", cite: "N.Y. Gen. Oblig. Law § 7-108", days: 14, forwarding: false, multiplier: null, penaltyText: "a landlord who does not send an itemized statement and the balance within 14 days forfeits the right to keep any of the deposit; willful violations can bring punitive damages of up to twice the deposit" },
  OH: { name: "Ohio", cite: "Ohio Rev. Code § 5321.16", days: 30, forwarding: true, multiplier: 2, penaltyText: "double the amount wrongfully withheld, plus fees; the tenant must give a forwarding address in writing" },
  OR: { name: "Oregon", cite: "Or. Rev. Stat. § 90.300", days: 31, forwarding: false, multiplier: 2, penaltyText: "a landlord who fails to comply can owe twice the amount wrongfully withheld" },
  PA: { name: "Pennsylvania", cite: "68 P.S. § 250.512", days: 30, forwarding: true, multiplier: 2, penaltyText: "double the amount of the deposit if the landlord does not provide the list of damages and the balance within 30 days; the tenant must give a forwarding address in writing" },
  TX: { name: "Texas", cite: "Tex. Prop. Code §§ 92.103, 92.107, 92.109", days: 30, forwarding: true, multiplier: 3, penaltyText: "a landlord who retains a deposit in bad faith is liable for $100 plus three times the amount wrongfully withheld and attorney's fees; the landlord is not required to return it until the tenant gives a written forwarding address" },
  VA: { name: "Virginia", cite: "Va. Code § 55.1-1226", days: 45, forwarding: false, multiplier: null, penaltyText: "the tenant can sue for the amount wrongfully withheld and damages and fees" },
  WA: { name: "Washington", cite: "Wash. Rev. Code § 59.18.280", days: 21, forwarding: false, multiplier: 2, penaltyText: "a landlord who intentionally refuses without a lawful reason can owe up to twice the deposit" },
};

export const STATE_CODES = Object.keys(STATES).sort((a, b) => STATES[a].name.localeCompare(STATES[b].name));

const DAY = 86400000;
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}
export const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
export function longDay(t) {
  return new Date(t).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
export const dollars = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function parseMoney(s) {
  if (typeof s === "number") return Number.isFinite(s) && s >= 0 ? Math.round(s * 100) : NaN;
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100);
}

export function addDays(t, n) { return t + n * DAY; }
export function addMonths(t, n) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(day, last));
}
export function addBusinessDays(t, n) {
  let cur = t, left = n;
  while (left > 0) {
    cur += DAY;
    const wd = new Date(cur).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return cur;
}

export function deadlineFor(stateCode, startT) {
  const s = STATES[stateCode];
  if (!s) return NaN;
  if (s.months) return addMonths(startT, s.months);
  if (s.business) return addBusinessDays(startT, s.days);
  return addDays(startT, s.days);
}

/**
 * input: { state, deposit, moveOut: "YYYY-MM-DD", forwardingGiven: "YYYY-MM-DD"|"", today,
 *          returnedCents, itemized: boolean, tenant, landlord, address, forwardingAddress, disputed }
 * Money fields are numbers or strings in dollars.
 */
export function check(input) {
  const errors = [];
  const s = STATES[input.state];
  if (!s) errors.push("Choose a state.");
  const deposit = parseMoney(input.deposit);
  if (Number.isNaN(deposit) || deposit <= 0) errors.push("Enter the deposit you paid, in dollars.");
  const returned = parseMoney(input.returned ?? 0);
  if (Number.isNaN(returned)) errors.push("The amount returned must be a dollar amount (or blank).");
  const moveOut = parseDay(input.moveOut);
  if (Number.isNaN(moveOut)) errors.push("Enter the date you moved out and returned the keys (YYYY-MM-DD).");
  const today = parseDay(input.today);
  if (Number.isNaN(today)) errors.push("Enter today's date (YYYY-MM-DD).");
  const fwd = input.forwardingGiven ? parseDay(input.forwardingGiven) : null;
  if (input.forwardingGiven && Number.isNaN(fwd)) errors.push("The forwarding-address date must be YYYY-MM-DD, or blank.");
  if (!Number.isNaN(returned) && !Number.isNaN(deposit) && returned > deposit) errors.push("The amount returned is more than the deposit; check the figures.");
  if (errors.length) return { ok: false, errors };

  const notes = [];
  let start = moveOut;
  let clockStarted = true;
  if (s.forwarding) {
    if (fwd === null) {
      clockStarted = false;
      notes.push(`${s.name} expects a written forwarding address from the tenant. Until you give one, the landlord's period may not have started. Send the address in writing (the letter below includes it) and keep proof.`);
    } else if (fwd > start) {
      start = fwd;
      notes.push(`The period is counted from the date you gave your forwarding address (${isoDay(fwd)}), which is later than move-out.`);
    }
  }
  const deadline = clockStarted ? deadlineFor(input.state, start) : NaN;
  if (s.business) notes.push("Counted in business days (weekends skipped). Public holidays are not skipped here, so the real deadline can fall a day or more later.");
  if (s.months) notes.push("Counted in calendar months; a lease may set a longer period, up to the statutory ceiling.");
  if (s.extraDays) notes.push(`Florida has two clocks: 15 days to return the deposit if no claim is made, and ${s.extraDays} days (counted from the same start) for the landlord to send a claim notice by certified mail.`);

  const hardDeadline = s.extraDays && clockStarted ? addDays(start, s.extraDays) : deadline;
  const daysLeft = clockStarted ? Math.round((hardDeadline - today) / DAY) : null;
  const withheld = deposit - returned;
  const itemized = Boolean(input.itemized);

  let status, headline;
  if (!clockStarted) {
    status = "clock-not-started";
    headline = `Send your forwarding address first. ${s.name}'s clock may not run until you do.`;
  } else if (returned >= deposit) {
    status = "returned";
    headline = "The full deposit has been returned.";
  } else if (today <= hardDeadline) {
    status = "within-time";
    headline = daysLeft === 0 ? `The landlord's deadline is today (${longDay(hardDeadline)}).` : `The landlord has ${daysLeft} more day${daysLeft === 1 ? "" : "s"} (until ${longDay(hardDeadline)}).`;
  } else if (itemized && returned >= 0 && withheld > 0 && today > hardDeadline) {
    status = "late-with-statement";
    headline = `The deadline passed ${-daysLeft} day${-daysLeft === 1 ? "" : "s"} ago (${longDay(hardDeadline)}). A statement or part-payment arrived, but check the date it was sent.`;
  } else {
    status = "overdue";
    headline = `The deadline passed ${-daysLeft} day${-daysLeft === 1 ? "" : "s"} ago (${longDay(hardDeadline)}) and ${returned > 0 ? "only part of the deposit came back" : "nothing came back"}.`;
  }

  const exposureCents = s.multiplier && withheld > 0 ? Math.round(withheld * s.multiplier) : null;
  return {
    ok: true, state: input.state, stateName: s.name, cite: s.cite, deposit, returned, withheld,
    moveOut, start, deadline: clockStarted ? hardDeadline : null, firstDeadline: clockStarted ? deadline : null,
    daysLeft, status, headline, notes, itemized, penaltyText: s.penaltyText, multiplier: s.multiplier,
    exposureCents, clockStarted, forwardingExpected: s.forwarding,
  };
}

export function letterKind(r) {
  if (r.status === "clock-not-started") return "forwarding";
  if (r.status === "late-with-statement") return "dispute";
  if (r.status === "overdue") return "overdue";
  if (r.status === "within-time" || r.status === "returned") return r.itemized && r.withheld > 0 ? "dispute" : null;
  return null;
}

export function letterText(r, p = {}, todayIso = "") {
  const kind = letterKind(r);
  if (!kind) return "";
  const tenant = p.tenant || "[Your name]";
  const landlord = p.landlord || "[Landlord or property manager]";
  const premises = p.address || "[Rental address]";
  const fwdAddr = p.forwardingAddress || "[Where to send the deposit]";
  const lines = [];
  lines.push(`${todayIso ? longDay(parseDay(todayIso)) : "[Date]"}`, "", landlord, "", `Re: Security deposit for ${premises}`, "", `Dear ${landlord}:`, "");
  if (kind === "forwarding") {
    lines.push(`I moved out of ${premises} on ${longDay(r.start)}. This letter is written notice of my forwarding address for the return of my security deposit of ${dollars(r.deposit)} and any itemized statement:`, "", `    ${tenant}`, `    ${fwdAddr}`, "", `Please send both there. I understand ${r.stateName} law (${r.cite}) sets the time for returning a deposit and I am keeping a copy of this letter and proof of delivery.`);
  } else if (kind === "overdue") {
    lines.push(`I moved out of ${premises} and returned possession on ${longDay(r.moveOut)}. My security deposit was ${dollars(r.deposit)}. As of today I have received ${r.returned > 0 ? dollars(r.returned) : "nothing"}${r.itemized ? "" : " and no itemized statement of deductions"}.`, "", `Under ${r.stateName} law (${r.cite}), the time to return the deposit${r.itemized ? "" : " and an itemized statement"} ended on ${longDay(r.deadline)}.`, "", `I am asking you to send ${dollars(r.withheld)}${r.itemized ? "" : ", or an itemized statement of any lawful deductions with supporting receipts,"} to the address below within 10 days of the date of this letter:`, "", `    ${tenant}`, `    ${fwdAddr}`, "");
    if (r.penaltyText) lines.push(`I note that the statute provides: ${r.penaltyText}. I would prefer to resolve this without going to court, but I will pursue the remedies available to me, including a small-claims filing, if I do not hear from you.`);
  } else {
    lines.push(`I received your deposit statement for ${premises}. My deposit was ${dollars(r.deposit)}; ${dollars(r.returned)} has been returned and ${dollars(r.withheld)} withheld.`, "");
    lines.push(p.disputed ? `I dispute the following deductions: ${p.disputed}` : "I dispute the deductions listed in your statement. [List each item and why: normal wear and tear, already included in rent, no receipt, or not my responsibility.]", "");
    lines.push(`Please send the disputed amount, or copies of the receipts or invoices that support each deduction, to the address below within 10 days of this letter:`, "", `    ${tenant}`, `    ${fwdAddr}`, "");
    if (r.deadline < parseDay(todayIso || isoDay(r.deadline))) lines.push(`I also note that ${r.stateName} law (${r.cite}) required the statement and balance by ${longDay(r.deadline)}; please confirm the date you sent them.`);
  }
  lines.push("", "Sincerely,", "", tenant);
  return lines.join("\n");
}

export function summaryText(r) {
  if (!r.ok) return r.errors.join("\n");
  const out = [r.headline, `Statute: ${r.cite} (summary reviewed ${REVIEWED}; confirm before relying on it).`, `Deposit ${dollars(r.deposit)}, returned ${dollars(r.returned)}, outstanding ${dollars(r.withheld)}.`];
  if (r.deadline) out.push(`Landlord's deadline: ${isoDay(r.deadline)}.`);
  out.push(`What the statute says about a landlord who misses it: ${r.penaltyText}.`);
  if (r.exposureCents) out.push(`For scale only: a ${r.multiplier}x multiple of ${dollars(r.withheld)} is ${dollars(r.exposureCents)}. A court decides whether any penalty applies.`);
  return out.concat(r.notes).join("\n");
}

export const SAMPLE = { state: "TX", deposit: "1800", moveOut: "2026-08-15", forwardingGiven: "2026-08-16", today: "2026-10-14", returned: "0", itemized: false, tenant: "Sam Rivera", landlord: "Oak Street Properties", address: "412 Oak St, Apt 3, Austin, TX", forwardingAddress: "88 Elm Ave, Dallas, TX 75201" };
