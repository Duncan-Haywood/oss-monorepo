// Commercial lease abstract reader. Reads pasted lease text and returns the key terms, a dated calendar of notice
// deadlines, the base-rent schedule and risk flags. Fixed text rules, not a legal reading: every extracted value is
// shown with the sentence it came from so the user can confirm it against the lease.

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATE_RE = "(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{4}-\\d{2}-\\d{2})";

export function parseDate(s) {
  const t = String(s || "").trim().toLowerCase().replace(/(\d)(st|nd|rd|th)/, "$1");
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) [mo, d, y] = [+m[1], +m[2], +m[3] < 100 ? 2000 + +m[3] : +m[3]];
  else if ((m = t.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    mo = MONTHS.findIndex((n) => n.startsWith(m[1].slice(0, 3))) + 1;
    [d, y] = [+m[2], +m[3]];
  } else return null;
  if (!mo || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}
export const iso = (d) => d.toISOString().slice(0, 10);
export function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
export function addMonths(d, n) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d.getUTCDate(), last));
  return t;
}
export function parseMoney(s) {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return 0;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : null;
}
export function dollars(c) {
  return "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const NUMWORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, sixty: 60, ninety: 90, "one hundred eighty": 180 };
const num = (s) => (/^\d+$/.test(s) ? +s : NUMWORD[String(s).toLowerCase()] ?? null);
const NUM = "(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty-five|forty|sixty|ninety|one hundred eighty)";

// First sentence in the text matching `re`; returns { m, sentence } so every value can be shown with its source.
function find(text, re) {
  for (const s of text.split(/(?<=[.;])\s+/)) {
    const m = s.match(re);
    if (m) return { m, sentence: s.length > 320 ? s.slice(0, 320) + "…" : s };
  }
  return null;
}

export function extract(rawText) {
  const text = norm(rawText);
  const x = {};
  const src = {};
  const set = (k, v, sentence) => { x[k] = v; src[k] = sentence; };

  let r = find(text, new RegExp(`commencement date[^.]{0,60}?(${DATE_RE})`, "i")) || find(text, new RegExp(`term[^.]{0,40}commenc[a-z]*[^.]{0,30}(${DATE_RE})`, "i"));
  if (r) set("commencement", parseDate(r.m[1]), r.sentence);
  r = find(text, new RegExp(`(?:expiration|expiry|termination) date[^.]{0,60}?(${DATE_RE})`, "i")) || find(text, new RegExp(`(?:expire[sd]?|end[s]?|terminat[a-z]*)[^.]{0,30}(?:on|:)\\s*(${DATE_RE})`, "i"));
  if (r) set("expiration", parseDate(r.m[1]), r.sentence);
  r = find(text, new RegExp(`(?:initial |lease )?term of ${NUM}\\s*(?:\\(\\d+\\)\\s*)?(years?|months?)`, "i"));
  if (r) { const n = num(r.m[1]); set("termMonths", /year/i.test(r.m[2]) ? n * 12 : n, r.sentence); }
  if (x.commencement && !x.expiration && x.termMonths) x.expiration = addDays(addMonths(x.commencement, x.termMonths), -1);
  if (x.commencement && x.expiration && !x.termMonths) {
    x.termMonths = (x.expiration.getUTCFullYear() - x.commencement.getUTCFullYear()) * 12 + x.expiration.getUTCMonth() - x.commencement.getUTCMonth() + 1;
  }

  r = find(text, /(?:base rent|minimum rent|annual rent)[^.]{0,80}?\$\s?([\d,]+(?:\.\d{2})?)\s*(?:per|\/|a)\s*(?:month|mo\b)/i);
  if (r) set("monthlyRent", parseMoney(r.m[1]), r.sentence);
  if (x.monthlyRent == null) {
    r = find(text, /(?:base rent|minimum rent|annual (?:base )?rent)[^.]{0,80}?\$\s?([\d,]+(?:\.\d{2})?)\s*(?:per (?:year|annum)|annually|\/\s?yr|a year)/i);
    if (r) set("monthlyRent", Math.round(parseMoney(r.m[1]) / 12), r.sentence);
  }
  r = find(text, /\$\s?(\d+(?:\.\d{1,2})?)\s*(?:per|\/)\s*(?:rentable\s+)?(?:square foot|sq\.? ?ft|sf|rsf)/i);
  if (r) set("rentPsf", parseMoney(r.m[1]), r.sentence);
  r = find(text, /(\d{1,3}(?:,\d{3})*)\s*(?:rentable\s+)?(?:square feet|sq\.? ?ft|rsf|sf)\b/i);
  if (r) set("sqft", +r.m[1].replace(/,/g, ""), r.sentence);
  if (x.monthlyRent == null && x.rentPsf != null && x.sqft) set("monthlyRent", Math.round((x.rentPsf * x.sqft) / 12), src.rentPsf);

  r = find(text, /(?:escalat|increase|adjust)[^.]{0,80}?(\d{1,2}(?:\.\d+)?)\s?%/i) || find(text, /(\d{1,2}(?:\.\d+)?)\s?%\s*(?:annual|per annum|each (?:lease )?year|per year)/i);
  if (r) set("escalationPct", Number(r.m[1]), r.sentence);
  r = find(text, /(?:escalat|increase|adjust)[^.]{0,60}?(?:consumer price index|\bcpi\b)/i);
  if (r) set("cpi", true, r.sentence);

  r = find(text, /security deposit[^.]{0,60}?\$\s?([\d,]+(?:\.\d{2})?)/i);
  if (r) set("deposit", parseMoney(r.m[1]), r.sentence);
  r = find(text, new RegExp(`(?:option|right) to (?:renew|extend)[^.]{0,120}`, "i"));
  if (r) {
    const opts = r.sentence.match(new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?(?:successive\\s+)?(?:additional\\s+)?(?:renewal |extension )?(?:options?|terms?)`, "i"));
    const len = r.sentence.match(new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?[- ]?(year|month)`, "i"));
    set("renewal", { options: opts ? num(opts[1]) : null, termMonths: len ? num(len[1]) * (/year/i.test(len[2]) ? 12 : 1) : null }, r.sentence);
  }
  r = find(text, new RegExp(`(?:renew|extend|extension|option)[^.]{0,200}?(?:not less than|at least|no (?:earlier|later) than|prior to)\\s*${NUM}\\s*(?:\\(\\d+\\)\\s*)?(?:calendar |business )?days`, "i"))
    || find(text, new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?days[^.]{0,30}(?:prior|before)[^.]{0,60}(?:expiration|expiry|end of the (?:initial )?term)`, "i"));
  if (r && /renew|extend|option/i.test(r.sentence)) set("renewalNoticeDays", num(r.m[1]), r.sentence);
  r = find(text, new RegExp(`holdover[^.]{0,120}?(\\d{2,3})\\s?%`, "i"));
  if (r) set("holdoverPct", +r.m[1], r.sentence);
  r = find(text, /late (?:fee|charge)[^.]{0,80}?(\d{1,2}(?:\.\d+)?)\s?%|late (?:fee|charge)[^.]{0,60}?\$\s?([\d,]+)/i);
  if (r) set("lateFee", r.m[1] ? `${r.m[1]}%` : `$${r.m[2]}`, r.sentence);
  r = find(text, /(?:tenant improvement|improvement|build-?out) allowance[^.]{0,80}?\$\s?([\d,]+(?:\.\d{2})?)/i);
  if (r) set("tiAllowance", parseMoney(r.m[1]), r.sentence);
  r = find(text, new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?months?[^.]{0,30}(?:free|abate|abatement)|(?:free|abated|abatement of) rent[^.]{0,60}?${NUM}\\s*(?:\\(\\d+\\)\\s*)?months?`, "i"));
  if (r) set("freeRentMonths", num(r.m[1] || r.m[2]), r.sentence);
  r = find(text, new RegExp(`(?:early )?termination (?:option|right)[^.]{0,200}?${NUM}\\s*(?:\\(\\d+\\)\\s*)?days`, "i"));
  if (r) set("tenantTerminationNoticeDays", num(r.m[1]), r.sentence);
  return { x, src };
}

// Base-rent schedule by lease year. Escalations apply on each anniversary; free rent months come off year one.
export function rentSchedule({ monthlyRent, escalationPct = 0, termMonths, freeRentMonths = 0 }) {
  if (!monthlyRent || !termMonths) return [];
  const rows = [];
  let remaining = termMonths, year = 1, free = freeRentMonths;
  while (remaining > 0) {
    const months = Math.min(12, remaining);
    const monthly = Math.round(monthlyRent * Math.pow(1 + escalationPct / 100, year - 1));
    const freeNow = Math.min(free, months);
    free -= freeNow;
    rows.push({ year, months, monthly, total: monthly * (months - freeNow), freeMonths: freeNow });
    remaining -= months; year += 1;
  }
  return rows;
}

const f = (id, severity, title, why, ask) => ({ id, severity, title, why, ask });

export function analyze(rawText, settings = {}) {
  const text = norm(rawText);
  const low = text.toLowerCase();
  if (text.length < 200) return { errors: ["Paste the full lease text first (at least a few paragraphs)."], findings: [], terms: {}, sources: {}, schedule: [], calendar: [] };
  const today = settings.today ? parseDate(settings.today) : null;
  if (settings.today && !today) return { errors: ["Today's date is not a date (use YYYY-MM-DD)."], findings: [], terms: {}, sources: {}, schedule: [], calendar: [] };
  const { x, src } = extract(text);
  const rent = parseMoney(settings.monthlyRent);
  if (rent === null) return { errors: ["The monthly rent override is not a number."], findings: [], terms: {}, sources: {}, schedule: [], calendar: [] };
  if (rent) { x.monthlyRent = rent; src.monthlyRent = "Entered by you."; }
  const esc = settings.escalationPct === "" || settings.escalationPct == null ? x.escalationPct ?? 0 : Number(settings.escalationPct);
  if (!Number.isFinite(esc) || esc < 0 || esc > 30) return { errors: ["Annual escalation must be between 0 and 30 percent."], findings: [], terms: {}, sources: {}, schedule: [], calendar: [] };
  if (settings.escalationPct !== "" && settings.escalationPct != null) { x.escalationPct = esc; src.escalationPct = "Entered by you."; }

  const schedule = rentSchedule({ monthlyRent: x.monthlyRent, escalationPct: esc, termMonths: x.termMonths, freeRentMonths: x.freeRentMonths || 0 });
  const totalBase = schedule.reduce((a, r) => a + r.total, 0);

  const calendar = [];
  if (x.commencement) calendar.push({ date: x.commencement, label: "Lease commencement" });
  if (x.commencement && esc) for (let y = 2; schedule.some((r) => r.year === y); y++) calendar.push({ date: addMonths(x.commencement, 12 * (y - 1)), label: `Rent steps up to ${dollars(schedule[y - 1].monthly)}/month (lease year ${y})` });
  if (x.expiration) {
    calendar.push({ date: x.expiration, label: "Lease expires" });
    if (x.renewalNoticeDays) calendar.push({ date: addDays(x.expiration, -x.renewalNoticeDays), label: `Last day to give renewal notice (${x.renewalNoticeDays} days before expiration)`, critical: true });
    // Many leases also require notice to vacate; surface the common 90/180-day marks as planning dates, not deadlines.
    calendar.push({ date: addDays(x.expiration, -180), label: "Planning date: 180 days before expiration, start the renew-or-move decision", planning: true });
  }
  calendar.sort((a, b) => a.date - b.date);

  const findings = [];
  const missing = (k, label) => findings.push(f(`missing-${k}`, "info", `Could not find: ${label}`, "The rules did not match wording for this. It may be phrased differently, or absent.", "Find it in the lease yourself before relying on this abstract."));
  if (!x.commencement) missing("commencement", "commencement date");
  if (!x.expiration) missing("expiration", "expiration date");
  if (!x.monthlyRent) missing("rent", "base rent");

  if (x.renewal && !x.renewalNoticeDays) {
    findings.push(f("renewal-no-notice-found", "medium", "A renewal option, but no notice deadline found", "A missed renewal-notice window usually forfeits the option, and the landlord can then reprice the space.", "Find the exact notice window and deadline and put it in your calendar now."));
  }
  if (x.renewalNoticeDays && x.renewalNoticeDays >= 180) {
    findings.push(f("early-renewal-window", "medium", `Renewal notice is due ${x.renewalNoticeDays} days before expiration`, "A long notice window means you commit to staying long before you can compare other space.", "Ask for 90 days, or notice that is only effective if the renewal rent is known by then."));
  }
  if (x.renewal && !/(fair market|market rent|fixed|same rent|at the rate of|rent during the renewal|renewal rent|\d+\s?%)/.test(low.slice(low.indexOf("renew"), low.indexOf("renew") + 800))) {
    findings.push(f("renewal-rent-unset", "medium", "Renewal rent is not stated near the option", "An option with no rent formula is an agreement to agree: the landlord can name any rent.", "Fix the renewal rent as a stated escalation, or fair market rent with a cap and an appraisal process."));
  }
  if (!x.renewal && !/(renew|extend)/.test(low)) {
    findings.push(f("no-renewal", "medium", "No renewal or extension option found", "At expiration you have no right to stay and no rent protection.", "Ask for at least one renewal option at a stated rent."));
  }
  if (x.holdoverPct && x.holdoverPct >= 150) {
    findings.push(f("holdover", "high", `Holdover rent is ${x.holdoverPct}% of the last month's rent`, "Staying even a few weeks after expiration, for example while a move slips, can cost double or more.", "Ask for 125% for the first 60 days, and no consequential damages unless the holdover exceeds that."));
  }
  if (/(personal(ly)? guarant|guarantor|guaranty)/.test(low)) {
    const unlimited = !/(burn[- ]?off|reduc(e|ed|es)|cap(ped)?|not (to )?exceed|limited to|release[sd]? (of )?(the )?guarant)/.test(low.slice(Math.max(0, low.search(/guarant/) - 50), low.search(/guarant/) + 900));
    findings.push(f("personal-guaranty", unlimited ? "high" : "medium", unlimited ? "Personal guaranty with no cap or burn-off" : "Personal guaranty", "If the business cannot pay, the landlord can collect from your personal assets, for the whole remaining term.", "Negotiate a good-guy clause, a cap (for example 6 to 12 months of rent), a burn-off after on-time years, and a release on a sale of the business."));
  }
  if (/(accelerat)/.test(low) && /(rent)/.test(low)) {
    findings.push(f("acceleration", "medium", "Rent acceleration on default", "After a default the landlord may be able to demand all remaining rent at once.", "Require the landlord to mitigate by re-letting and discount accelerated rent to present value."));
  }
  if (/(triple net|\bnnn\b|net lease|operating expenses|common area maintenance|\bcam\b)/.test(low)) {
    const capped = /(cap|not to exceed|shall not increase by more than|controllable)/.test(low.slice(Math.max(0, low.search(/common area maintenance|\bcam\b|operating expenses/)), Math.max(0, low.search(/common area maintenance|\bcam\b|operating expenses/)) + 900));
    findings.push(f("pass-through", capped ? "info" : "high", capped ? "You pay a share of operating costs (a cap is mentioned)" : "You pay a share of operating costs with no visible cap", "Base rent is only part of what you pay: taxes, insurance and common-area costs are passed through and can rise every year.", "Ask for a cap on controllable expenses (for example 4% a year, non-cumulative), an audit right, and exclusion of capital items and management fee beyond 3 to 5%."));
    if (!/(audit|inspect (the )?(books|records)|review (the )?(books|records))/.test(low)) {
      findings.push(f("no-audit", "medium", "No right to audit operating-cost charges", "Without access to the landlord's records you cannot check the pass-through bills.", "Add an annual right to audit expense and tax statements, with the landlord paying if errors exceed 3 to 5%."));
    }
  }
  if (/(landlord|lessor)[^.]{0,80}(relocat|substitute (premises|space))/.test(low)) {
    findings.push(f("relocation", "high", "The landlord can relocate you", "A forced move can cost build-out, signage and customers, and the clause may leave you to pay for it.", "Strike it, or require landlord-paid move costs, equal space and a right to terminate."));
  }
  if (/(assign|sublet|sublease|transfer)/.test(low) && /(sole (and absolute )?discretion|absolute discretion|consent[^.]{0,40}(may be )?withheld)/.test(low) && !/not (be )?unreasonabl[a-z]* (withheld|conditioned|delayed)|reasonable consent/.test(low)) {
    findings.push(f("assignment-consent", "high", "Assignment or subletting needs consent the landlord can withhold at will", "You may be locked in if you want to sell the business, sublet, or downsize.", "Require consent not to be unreasonably withheld, conditioned or delayed, with deemed consent after 15 days and a free transfer on a sale of the business."));
  }
  if (!/(exclusive use|exclusive right|exclusive)/.test(low)) {
    findings.push(f("no-exclusive", "info", "No exclusive-use clause found", "The landlord may rent next door to a direct competitor.", "If a competitor nearby would hurt you, ask for an exclusive for your main use."));
  }
  if (!/(quiet enjoyment)/.test(low)) findings.push(f("no-quiet-enjoyment", "info", "No covenant of quiet enjoyment found", "It protects you against interference by the landlord.", "Ask for the standard covenant."));
  if (/(waive|waiver)[^.]{0,60}(jury|trial by jury|consequential|subrogation)/.test(low) || /confess(ion of)? judgment|cognovit/.test(low)) {
    findings.push(f("waivers", /confess|cognovit/.test(low) ? "high" : "medium", /confess|cognovit/.test(low) ? "Confession of judgment clause" : "A waiver of jury trial or damages rights", "These give up rights that cost money to get back in a dispute.", "Strike a confession of judgment outright; make waivers mutual and limited."));
  }
  if (!x.deposit && !/(security deposit)/.test(low)) findings.push(f("no-deposit-info", "info", "No security deposit found", "Often a deposit exists but is stated elsewhere.", "Confirm the amount and the conditions for its return."));
  if (x.deposit && x.monthlyRent && x.deposit > 3 * x.monthlyRent) {
    findings.push(f("big-deposit", "medium", `Deposit is ${(x.deposit / x.monthlyRent).toFixed(1)} months of rent`, "A large deposit ties up cash and is only returned after the landlord's inspection.", "Ask for 1 to 2 months, reducing after a year of on-time rent, with a fixed return date."));
  }
  if (x.lateFee && /%/.test(x.lateFee) && parseFloat(x.lateFee) > 5) {
    findings.push(f("late-fee", "medium", `Late charge of ${x.lateFee}`, "Combined with interest this can be expensive for a payment a few days late.", "Ask for a 5-day grace period, once-a-year waiver, and 5% or less."));
  }
  if (x.termMonths && x.termMonths >= 60 && !x.tenantTerminationNoticeDays && !/(early termination|terminat[a-z]* option|right to terminate)/.test(low)) {
    findings.push(f("no-exit", "medium", `A ${Math.round(x.termMonths / 12)}-year term with no early exit`, "If the business shrinks or fails, you owe the remaining rent.", "Ask for a termination option after year 3 with a fee equal to unamortized costs and some months' rent."));
  }
  if (x.tiAllowance && x.sqft) {
    findings.push(f("ti-info", "info", `Improvement allowance is ${dollars(Math.round(x.tiAllowance / x.sqft))} per square foot`, "Compare it with your actual build-out quote; unspent allowance is usually lost.", "Confirm how and when the landlord pays and the deadline for claiming it."));
  }

  const rank = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const verdict = findings.some((g) => g.severity === "high") ? "negotiate" : findings.some((g) => g.severity === "medium") ? "review" : "few-flags";
  const upcoming = today ? calendar.filter((c) => c.date >= today).slice(0, 3) : [];
  return { errors: [], findings, verdict, terms: x, sources: src, schedule, totalBase, calendar, upcoming };
}

export const VERDICT_TEXT = {
  negotiate: "Several terms to negotiate before you sign",
  review: "Some terms worth reviewing before you sign",
  "few-flags": "Few flags found by these rules",
};

export function summaryText(r, s = {}) {
  const t = r.terms;
  const d = (v) => (v ? iso(v) : "not found");
  const lines = ["COMMERCIAL LEASE ABSTRACT"];
  if (s.tenant) lines.push(`Tenant: ${s.tenant}`);
  if (s.premises) lines.push(`Premises: ${s.premises}`);
  lines.push(`Commencement: ${d(t.commencement)}`, `Expiration: ${d(t.expiration)}`, `Term: ${t.termMonths ? t.termMonths + " months" : "not found"}`);
  lines.push(`Base rent: ${t.monthlyRent ? dollars(t.monthlyRent) + "/month" : "not found"}`, `Annual escalation: ${t.cpi ? "CPI-based" : t.escalationPct != null ? t.escalationPct + "%" : "not found"}`);
  if (t.renewal) lines.push(`Renewal: ${t.renewal.options ?? "?"} option(s) of ${t.renewal.termMonths ? t.renewal.termMonths + " months" : "?"}; notice ${t.renewalNoticeDays ?? "?"} days`);
  if (t.deposit) lines.push(`Security deposit: ${dollars(t.deposit)}`);
  if (r.totalBase) lines.push(`Total base rent over the term: ${dollars(r.totalBase)}`);
  lines.push("", "KEY DATES");
  for (const c of r.calendar) lines.push(`${iso(c.date)}  ${c.label}`);
  lines.push("", "RENT SCHEDULE");
  for (const y of r.schedule) lines.push(`Year ${y.year}: ${dollars(y.monthly)}/month x ${y.months - y.freeMonths}${y.freeMonths ? ` (+${y.freeMonths} free)` : ""} = ${dollars(y.total)}`);
  lines.push("", `RESULT: ${VERDICT_TEXT[r.verdict]}`, "");
  for (const [i, g] of r.findings.entries()) lines.push(`${i + 1}. [${g.severity.toUpperCase()}] ${g.title}`, `   Why: ${g.why}`, `   Ask for: ${g.ask}`, "");
  lines.push("An abstract from a text reader, not legal advice. Check every value against the lease and have a commercial real estate attorney review it.");
  return lines.join("\n");
}

export function calendarIcs(r, name = "Lease") {
  const stamp = "20260101T000000Z";
  const ev = r.calendar.map((c, i) => {
    const d = iso(c.date).replace(/-/g, "");
    const next = iso(addDays(c.date, 1)).replace(/-/g, "");
    return ["BEGIN:VEVENT", `UID:lease-${i}-${d}@commercial-lease-abstract-reader`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${name}: ${c.label.replace(/[,;\n]/g, " ")}`, ...(c.critical ? ["BEGIN:VALARM", "TRIGGER:-P60D", "ACTION:DISPLAY", "DESCRIPTION:Lease deadline in 60 days", "END:VALARM"] : []), "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//commercial-lease-abstract-reader//EN", ...ev, "END:VCALENDAR"].join("\r\n");
}

export function findingsCsv(r) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ["severity,finding,why,ask_for", ...r.findings.map((g) => [g.severity, g.title, g.why, g.ask].map(q).join(","))].join("\n");
}

export function sampleLease() {
  return `RETAIL LEASE AGREEMENT. Landlord leases to Tenant approximately 2,400 rentable square feet. The Commencement Date is March 1, 2027 and the Expiration Date is February 28, 2032. Base Rent shall be $6,000 per month, and shall increase by 3% on each anniversary of the Commencement Date. Tenant shall pay a security deposit of $18,000. Tenant shall receive two months of free rent at the start of the term. Tenant shall pay its pro rata share of operating expenses, common area maintenance and taxes on a triple net basis.

Tenant has one option to renew for five years, exercisable by written notice not less than 270 days prior to the expiration of the initial term. Any holdover by Tenant shall be at 200% of the Base Rent in effect. A late charge of 10% applies to rent more than three days overdue. Tenant may not assign or sublet without Landlord's consent, which may be withheld in Landlord's sole and absolute discretion. Landlord may relocate Tenant to substitute premises on 60 days notice. The principal of Tenant shall personally guarantee all obligations under this lease. Upon default Landlord may accelerate all rent for the remainder of the term.`;
}
export const SAMPLE_SETTINGS = { monthlyRent: "", escalationPct: "", tenant: "Example Bakery LLC", premises: "Suite 4, 100 Main St", today: "2027-01-15" };
