// Vendor contract clause reader. Reads pasted SaaS / vendor agreement text and returns the key commercial terms, a dated
// calendar of the non-renewal deadline and price steps, what a missed deadline costs, and the clauses a buyer usually asks
// to change. Fixed text rules, not a legal reading: every extracted value is shown with the sentence it came from.

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

const NUMWORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, "forty-five": 45, forty: 40, sixty: 60, ninety: 90 };
const num = (s) => (/^\d+$/.test(s) ? +s : NUMWORD[String(s).toLowerCase()] ?? null);
const NUM = "(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty-five|forty|sixty|ninety)";
const PAREN = "\\s*(?:\\(\\d+\\)\\s*)?";

function sentences(text) { return text.split(/(?<=[.;])\s+/); }
function find(text, re) {
  for (const s of sentences(text)) {
    const m = s.match(re);
    if (m) return { m, sentence: s.length > 320 ? s.slice(0, 320) + "…" : s };
  }
  return null;
}
const months = (n, unit) => (/year/i.test(unit) ? n * 12 : n);

export function extract(rawText) {
  const text = norm(rawText);
  const x = {};
  const src = {};
  const set = (k, v, sentence) => { x[k] = v; src[k] = sentence; };

  let r = find(text, new RegExp(`(?:effective date|commencement date|start date|subscription start)[^.]{0,60}?(${DATE_RE})`, "i")) || find(text, new RegExp(`(?:effective as of|commences? on|begin(?:s|ning)? on)[^.]{0,20}?(${DATE_RE})`, "i"));
  if (r) set("effective", parseDate(r.m[1]), r.sentence);
  r = find(text, new RegExp(`(?:initial |subscription |service )?term[^.]{0,40}?${NUM}${PAREN}[- ]?(years?|months?)`, "i"));
  if (r) set("termMonths", months(num(r.m[1]), r.m[2]), r.sentence);
  if (x.effective && x.termMonths) x.expiration = addDays(addMonths(x.effective, x.termMonths), -1);

  r = find(text, /(?:automatically (?:renew|extend)|auto-?renew|shall renew automatically|renews? automatically|evergreen)/i);
  if (r) {
    set("autoRenew", true, r.sentence);
    const len = r.sentence.match(new RegExp(`${NUM}${PAREN}[- ]?(year|month)`, "i"));
    if (len) x.renewalTermMonths = months(num(len[1]), len[2]);
    else if (/successive (?:renewal )?terms? equal|same length|equal in length|for (?:an? )?(?:additional|successive) terms? of (?:equal|the same)/i.test(r.sentence)) x.renewalTermMonths = x.termMonths || null;
  }
  r = find(text, new RegExp(`(?:non-?renew|not to renew|notice of (?:non-?renewal|termination)|cancel)[^.]{0,200}?(?:at least|not less than|no (?:later|fewer|less) than|prior to)\\s*${NUM}${PAREN}\\s*(?:calendar |business )?days`, "i"))
    || find(text, new RegExp(`${NUM}${PAREN}\\s*days[^.]{0,40}(?:prior|before)[^.]{0,60}(?:renewal|expiration|end of the (?:then-current|initial|current) term)`, "i"));
  if (r && /renew|expir|term|cancel/i.test(r.sentence)) set("noticeDays", num(r.m[1]), r.sentence);

  r = find(text, /(?:annual|subscription|total)?\s*(?:fees?|charges?|price)[^.]{0,80}?\$\s?([\d,]+(?:\.\d{2})?)\s*(?:per|\/|a)\s*(?:year|annum|yr)|\$\s?([\d,]+(?:\.\d{2})?)\s*(?:per year|annually|a year)/i);
  if (r) set("annualFee", parseMoney(r.m[1] || r.m[2]), r.sentence);
  if (x.annualFee == null) {
    r = find(text, /(?:fees?|charges?|price)[^.]{0,80}?\$\s?([\d,]+(?:\.\d{2})?)\s*(?:per|\/|a)\s*month/i);
    if (r) set("annualFee", Math.round(parseMoney(r.m[1]) * 12), r.sentence);
  }

  r = find(text, /(?:increase|adjust|uplift|escalat)[^.]{0,100}?(?:by|of|up to|not (?:to )?exceed|no more than|cap(?:ped)? (?:at|of))\s*(\d{1,2}(?:\.\d+)?)\s?%/i) || find(text, /(\d{1,2}(?:\.\d+)?)\s?%\s*(?:annual|per year|each year|per annum)\s*(?:increase|uplift|escalat)/i);
  if (r) set("upliftPct", Number(r.m[1]), r.sentence);
  r = find(text, /(?:increase|adjust|uplift|escalat|renewal (?:price|fee|rate))[^.]{0,80}?(?:consumer price index|\bcpi\b)/i);
  if (r) set("cpi", true, r.sentence);
  r = find(text, /(?:then-current|current) (?:list|standard|published) (?:price|rate|fee)s?|vendor'?s? (?:then-current )?(?:list|standard) (?:price|rate)s?/i);
  if (r) set("listPriceRenewal", true, r.sentence);

  r = find(text, new RegExp(`(?:net|payable within|due within)\\s*${NUM}${PAREN}\\s*(?:\\(\\d+\\)\\s*)?days?`, "i"));
  if (r) set("paymentDays", num(r.m[1]), r.sentence);
  r = find(text, /(?:late|overdue|past[- ]due)[^.]{0,80}?(\d{1,2}(?:\.\d+)?)\s?%\s*(?:per|a|each)?\s*(month|year|annum)?/i);
  if (r) set("lateInterest", `${r.m[1]}%${r.m[2] ? " per " + (r.m[2] === "annum" ? "year" : r.m[2]) : ""}`, r.sentence);

  r = find(text, /(?:liability|damages)[^.]{0,120}?(?:shall not exceed|will not exceed|limited to|capped at|in no event exceed)[^.]{0,120}/i);
  if (r) {
    const mm = r.sentence.match(new RegExp(`(?:fees (?:paid|payable)[^.]{0,60}?(?:preceding|prior|previous|last)|(?:preceding|prior|previous|last))\\s*${NUM}${PAREN}[- ]?(months?|years?)`, "i"));
    set("liabilityCap", mm ? { months: months(num(mm[1]), mm[2]) } : { months: null }, r.sentence);
  }
  r = find(text, new RegExp(`(?:uptime|availability)[^.]{0,80}?(\\d{2}(?:\\.\\d+)?)\\s?%`, "i"));
  if (r) set("uptimePct", Number(r.m[1]), r.sentence);
  r = find(text, new RegExp(`(?:delete|destroy|return)[^.]{0,80}?(?:customer data|your data|customer content)[^.]{0,80}?(?:within|after)\\s*${NUM}${PAREN}\\s*days`, "i")) || find(text, new RegExp(`(?:within|after)\\s*${NUM}${PAREN}\\s*days[^.]{0,80}(?:delete|destroy|return|export)[^.]{0,60}(?:customer data|your data|customer content)`, "i"));
  if (r) set("deletionDays", num(r.m[1]), r.sentence);
  return { x, src };
}

// Cost by contract year over the initial term plus one renewal term, with the uplift applied on each anniversary.
export function costSchedule({ annualFee, upliftPct = 0, termMonths, renewalTermMonths }) {
  if (!annualFee || !termMonths) return [];
  const rows = [];
  const total = termMonths + (renewalTermMonths || 0);
  let remaining = total, year = 1;
  while (remaining > 0) {
    const m = Math.min(12, remaining);
    const annual = Math.round(annualFee * Math.pow(1 + upliftPct / 100, year - 1));
    rows.push({ year, months: m, annual, total: Math.round((annual * m) / 12), renewal: year * 12 > termMonths });
    remaining -= m; year += 1;
  }
  return rows;
}

const f = (id, severity, title, why, ask) => ({ id, severity, title, why, ask });
const bad = (errors) => ({ errors, findings: [], terms: {}, sources: {}, schedule: [], calendar: [] });

export function analyze(rawText, settings = {}) {
  const text = norm(rawText);
  const low = text.toLowerCase();
  if (text.length < 200) return bad(["Paste the full agreement text first (at least a few paragraphs)."]);
  const today = settings.today ? parseDate(settings.today) : null;
  if (settings.today && !today) return bad(["Today's date is not a date (use YYYY-MM-DD)."]);
  const { x, src } = extract(text);
  const fee = parseMoney(settings.annualFee);
  if (fee === null) return bad(["The annual fee override is not a number."]);
  if (fee) { x.annualFee = fee; src.annualFee = "Entered by you."; }
  let upl = x.upliftPct ?? 0;
  if (settings.upliftPct !== "" && settings.upliftPct != null) {
    upl = Number(settings.upliftPct);
    if (!Number.isFinite(upl) || upl < 0 || upl > 50) return bad(["Annual price increase must be between 0 and 50 percent."]);
    x.upliftPct = upl; src.upliftPct = "Entered by you.";
  }
  if (settings.effective) {
    const d = parseDate(settings.effective);
    if (!d) return bad(["The start date override is not a date (use YYYY-MM-DD)."]);
    x.effective = d; src.effective = "Entered by you.";
    if (x.termMonths) x.expiration = addDays(addMonths(d, x.termMonths), -1);
  }

  const schedule = costSchedule({ annualFee: x.annualFee, upliftPct: upl, termMonths: x.termMonths, renewalTermMonths: x.autoRenew ? x.renewalTermMonths || 12 : 0 });
  const initialTotal = schedule.filter((r) => !r.renewal).reduce((a, r) => a + r.total, 0);
  const renewalTotal = schedule.filter((r) => r.renewal).reduce((a, r) => a + r.total, 0);

  const calendar = [];
  if (x.effective) calendar.push({ date: x.effective, label: "Agreement start" });
  if (x.effective && upl && x.termMonths) for (let y = 2; y * 12 <= x.termMonths + (x.autoRenew ? x.renewalTermMonths || 12 : 0); y++) calendar.push({ date: addMonths(x.effective, 12 * (y - 1)), label: `Price steps to ${dollars(schedule[y - 1]?.annual ?? 0)} per year (contract year ${y})` });
  if (x.expiration) {
    calendar.push({ date: x.expiration, label: x.autoRenew ? "Term ends; renews automatically if no notice was given" : "Term ends" });
    if (x.autoRenew && x.noticeDays) calendar.push({ date: addDays(x.expiration, -x.noticeDays), label: `Last day to give non-renewal notice (${x.noticeDays} days before the term ends)`, critical: true });
    calendar.push({ date: addDays(x.expiration, -120), label: "Planning date: 120 days before term end, collect usage and ask for a renewal quote", planning: true });
  }
  calendar.sort((a, b) => a.date - b.date);

  const findings = [];
  const missing = (k, label) => findings.push(f(`missing-${k}`, "info", `Could not find: ${label}`, "The rules did not match wording for this. It may be phrased differently, in an order form or exhibit, or absent.", "Find it in the agreement before relying on this summary."));
  if (!x.effective) missing("effective", "start date");
  if (!x.termMonths) missing("term", "initial term");
  if (!x.annualFee) missing("fee", "annual fee");

  if (x.autoRenew && !x.noticeDays) findings.push(f("renew-no-notice", "high", "Auto-renewal found, but no notice deadline found", "If the cancel window is buried in an order form, you can miss it and be committed to another full term.", "Find the exact notice window and add the date to your calendar today. Ask the vendor to confirm it in writing."));
  if (x.autoRenew && x.noticeDays && x.noticeDays >= 60) findings.push(f("long-notice", x.noticeDays >= 90 ? "high" : "medium", `Non-renewal notice is due ${x.noticeDays} days before the term ends`, "A long window means the decision is due long before you have a renewal quote or know your usage.", "Ask for 30 days, or for the vendor to send a renewal reminder 60 days before the deadline, with the window running from that reminder."));
  if (x.autoRenew && x.renewalTermMonths && x.renewalTermMonths >= 12 && x.renewalTermMonths >= (x.termMonths || 0)) findings.push(f("renew-full-term", "medium", `Renews for another ${x.renewalTermMonths} months`, "One missed date commits you to a full additional term, not a month.", "Ask for renewals month-to-month or 12 months at most, cancellable on 30 days' notice."));
  if (x.autoRenew && x.noticeDays && x.annualFee) findings.push(f("miss-cost", "info", `Missing the deadline commits about ${dollars(renewalTotal || x.annualFee)}`, "That is the schedule's renewal term at the current price and uplift.", "Put the deadline in your calendar with a reminder at least 30 days ahead."));
  if (x.listPriceRenewal) findings.push(f("list-price", "high", "Renewal price is the vendor's then-current list price", "The renewal price is whatever the vendor publishes then, which can be far above the price you negotiated.", "Cap the renewal increase at a fixed percentage (for example 3 to 5%) or CPI, and require 90 days' written notice of any price change."));
  if (!x.upliftPct && !x.cpi && !x.listPriceRenewal && /(increase|adjust)[^.]{0,60}(fee|price|rate)/.test(low)) findings.push(f("uplift-unstated", "medium", "A price increase right exists but no cap was found", "A right to raise fees with no stated limit lets the vendor reprice at renewal or mid-term.", "Fix a cap on increases and say when they may take effect."));
  if (x.upliftPct && x.upliftPct >= 7) findings.push(f("high-uplift", "medium", `Price increase of ${x.upliftPct}% a year`, "Compounded it adds up fast: over a three-year term the final year costs noticeably more than the first.", "Ask for a flat price for the initial term and a cap of 3 to 5% at renewal."));
  if (x.cpi) findings.push(f("cpi-uplift", "info", "Price increases are tied to CPI", "CPI-linked clauses are usually fair, but without a cap, a high-inflation year flows straight through.", "Ask for the lesser of CPI and a fixed cap such as 5%."));
  if (/(may|reserves? the right to|right to) (?:modify|change|amend|update)[^.]{0,80}(?:terms|agreement|fees|pricing|services|policies)[^.]{0,80}(?:at any time|from time to time|sole discretion|by posting|upon notice|without)/.test(low)) findings.push(f("unilateral-change", "high", "Vendor can change the terms on its own", "A clause letting the vendor amend the agreement by posting or notice means what you signed can change under you.", "Require changes to be in a signed amendment, or give you a right to terminate with a refund if a change hurts you."));
  const tfc = /(terminate[^.]{0,60}(?:for convenience|without cause|for any reason))|(?:cancel[^.]{0,40}at any time)/.test(low);
  if (x.termMonths && x.termMonths >= 12 && !tfc) findings.push(f("no-exit", x.termMonths >= 24 ? "high" : "medium", `A ${x.termMonths}-month commitment with no way out found`, "If the product stops fitting or the vendor degrades, you owe the rest of the term.", "Ask for termination for convenience after 12 months, or a refund of prepaid fees when the vendor materially breaches or is acquired."));
  if (/(non-?refundable|no refunds?|not (?:be )?refundable)/.test(low)) findings.push(f("no-refund", "medium", "Fees are non-refundable", "Combined with a long term, a refusal to refund leaves you paying for service you cannot use.", "Ask for a pro rata refund of prepaid fees on termination for the vendor's breach or on a discontinued service."));
  if (/(minimum (?:commitment|spend|purchase)|true[- ]?up|overage|exceeds? the (?:number|quantity)|in excess of the)/.test(low)) findings.push(f("true-up", "medium", "Minimum commitment, true-up or overage charges", "Usage above the plan, or below a minimum, can be billed on top of the subscription.", "Ask for the overage rate in writing, a right to true down at renewal, and notice before overage is billed."));
  if (x.paymentDays != null && x.paymentDays < 30) findings.push(f("short-payment", "medium", `Payment is due in ${x.paymentDays} days`, "Short terms strain cash flow and the late fee clock starts early.", "Ask for net 30 and a 10-day cure period before any suspension."));
  if (/(suspend|suspension)[^.]{0,80}(?:without notice|immediately|at any time|sole discretion)/.test(low)) findings.push(f("suspension", "medium", "Vendor can suspend service without notice", "A suspension for a disputed invoice can take your operation offline.", "Require written notice and a 10 to 15 day cure period, and no suspension for amounts disputed in good faith."));
  if (x.liabilityCap) {
    const m = x.liabilityCap.months;
    if (m != null && m <= 12) findings.push(f("liability-cap", "medium", `Vendor liability is capped at ${m} months of fees`, "A small subscription fee caps the vendor's exposure far below what a data loss or outage could cost you.", "Ask for a higher cap (for example 2x fees) and carve out data breach, confidentiality breach, and gross negligence."));
    if (!/(?:exclu|except|carve|shall not apply)[^.]{0,120}(?:confidential|data breach|gross negligence|indemnif|willful)/.test(low)) findings.push(f("cap-no-carveouts", "high", "The liability cap has no carve-outs", "Without carve-outs, the cap applies even to a data breach or the vendor's own gross negligence.", "Carve confidentiality, data breach, indemnities, and gross negligence or willful misconduct out of the cap."));
  } else findings.push(f("no-liability-cap", "info", "No limitation of liability found", "It may sit in a separate document. A cap often protects the vendor only.", "Check that the cap, if any, is mutual."));
  if (/(customer|you|client)[^.]{0,30}(?:shall|will|agrees? to) (?:defend(?:,| and) )?indemnify/.test(low) && !/(vendor|provider|supplier|company)[^.]{0,30}(?:shall|will|agrees? to) (?:defend(?:,| and) )?indemnify/.test(low)) findings.push(f("one-way-indemnity", "high", "Indemnity runs only from you to the vendor", "You cover the vendor's losses but get no protection if its service infringes someone's IP or leaks your data.", "Ask for a mutual indemnity, including IP infringement and data breach by the vendor."));
  if (!/(data processing|\bdpa\b|gdpr|personal data|security (?:measures|program|standards)|soc ?2)/.test(low)) findings.push(f("no-data-terms", "medium", "No data protection or security terms found", "If the vendor handles customer or employee data, you need terms for security, subprocessors and breach notice.", "Ask for a data processing addendum, breach notice within 72 hours, and a SOC 2 or equivalent report on request."));
  if (x.deletionDays == null && !/(delete|return|export)[^.]{0,60}(?:your|customer)'?s? data/.test(low)) findings.push(f("no-exit-data", "medium", "No term for getting your data back or deleted at the end", "When you leave, your data may stay with the vendor or be hard to export.", "Ask for an export in a standard format and deletion within 30 days, with written confirmation."));
  if (x.uptimePct != null && x.uptimePct < 99.9) findings.push(f("low-uptime", "info", `Uptime commitment is ${x.uptimePct}%`, `${x.uptimePct}% allows roughly ${(((100 - x.uptimePct) / 100) * 730).toFixed(1)} hours of downtime a month.`, "Ask for service credits and a right to terminate after repeated misses."));
  if (/(binding arbitration|waive[^.]{0,60}class action|class action waiver)/.test(low)) findings.push(f("arbitration", "medium", "Binding arbitration or a class-action waiver", "It limits where and how a dispute can be raised, usually to the vendor's advantage.", "Accept only if the venue is reasonable and costs are shared; otherwise strike."));
  const gov = low.match(/governed by the laws? of (?:the )?(?:state of )?([a-z ]{3,30}?)(?:,| and|\.| without)/);
  if (gov && !/(your|customer's|client's)/.test(gov[1])) findings.push(f("governing-law", "info", `Governing law: ${gov[1].trim()}`, "Disputes would be decided under another state's law, which may be inconvenient if you are elsewhere.", "Acceptable for small contracts; for large ones, ask for a neutral venue or yours."));
  if (/(assign)[^.]{0,80}(?:without (?:your|customer|client)|any time|freely)/.test(low) || /vendor may assign/.test(low)) findings.push(f("vendor-assign", "info", "Vendor may assign the contract freely", "If the vendor is acquired, you may end up with a new owner and new terms.", "Ask for a right to terminate with a refund if the vendor is acquired by a competitor."));

  const rank = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const verdict = findings.some((g) => g.severity === "high") ? "negotiate" : findings.some((g) => g.severity === "medium") ? "review" : "few-flags";
  const upcoming = today ? calendar.filter((c) => c.date >= today).slice(0, 3) : [];
  return { errors: [], findings, verdict, terms: x, sources: src, schedule, initialTotal, renewalTotal, calendar, upcoming };
}

export const VERDICT_TEXT = {
  negotiate: "Several terms to negotiate before you sign or renew",
  review: "Some terms worth reviewing before you sign or renew",
  "few-flags": "Few flags found by these rules",
};

export function summaryText(r, s = {}) {
  const t = r.terms;
  const d = (v) => (v ? iso(v) : "not found");
  const lines = ["VENDOR CONTRACT SUMMARY"];
  if (s.vendor) lines.push(`Vendor: ${s.vendor}`);
  lines.push(`Start: ${d(t.effective)}`, `Term: ${t.termMonths ? t.termMonths + " months" : "not found"} (ends ${d(t.expiration)})`);
  lines.push(`Auto-renewal: ${t.autoRenew ? `yes${t.renewalTermMonths ? ", " + t.renewalTermMonths + " months" : ""}; notice ${t.noticeDays ?? "?"} days` : "not found"}`);
  lines.push(`Annual fee: ${t.annualFee ? dollars(t.annualFee) : "not found"}`, `Price increase: ${t.cpi ? "CPI-based" : t.listPriceRenewal ? "vendor list price at renewal" : t.upliftPct != null ? t.upliftPct + "% a year" : "not found"}`);
  if (r.initialTotal) lines.push(`Total over the initial term: ${dollars(r.initialTotal)}`);
  if (r.renewalTotal) lines.push(`Committed if the renewal deadline is missed: ${dollars(r.renewalTotal)}`);
  lines.push("", "KEY DATES");
  for (const c of r.calendar) lines.push(`${iso(c.date)}  ${c.label}`);
  lines.push("", `RESULT: ${VERDICT_TEXT[r.verdict]}`, "");
  for (const [i, g] of r.findings.entries()) lines.push(`${i + 1}. [${g.severity.toUpperCase()}] ${g.title}`, `   Why: ${g.why}`, `   Ask for: ${g.ask}`, "");
  lines.push("A summary from a text reader, not legal advice. Check every value against the agreement and have a lawyer review contracts that matter.");
  return lines.join("\n");
}

export function calendarIcs(r, name = "Vendor contract") {
  const stamp = "20260101T000000Z";
  const ev = r.calendar.map((c, i) => {
    const d = iso(c.date).replace(/-/g, "");
    const next = iso(addDays(c.date, 1)).replace(/-/g, "");
    return ["BEGIN:VEVENT", `UID:vendor-${i}-${d}@vendor-contract-clause-reader`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${name}: ${c.label.replace(/[,;\n]/g, " ")}`, ...(c.critical ? ["BEGIN:VALARM", "TRIGGER:-P30D", "ACTION:DISPLAY", "DESCRIPTION:Non-renewal deadline in 30 days", "END:VALARM"] : []), "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//vendor-contract-clause-reader//EN", ...ev, "END:VCALENDAR"].join("\r\n");
}

export function findingsCsv(r) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ["severity,finding,why,ask_for", ...r.findings.map((g) => [g.severity, g.title, g.why, g.ask].map(q).join(","))].join("\n");
}

export function sampleAgreement() {
  return `SOFTWARE SUBSCRIPTION AGREEMENT. This Agreement is effective as of March 1, 2027 (the Effective Date). Customer subscribes to the Services for an initial term of 36 months. Annual fees are $24,000 per year, invoiced annually in advance and payable net 15 days. All fees are non-refundable. Fees will increase by 8% on each anniversary of the Effective Date.

This Agreement shall automatically renew for successive terms of 12 months unless either party gives written notice of non-renewal at least 90 days prior to the end of the then-current term. Upon renewal, fees will be Vendor's then-current list price. Vendor may modify these terms at any time by posting an updated version, and Vendor may suspend the Services immediately at any time in its sole discretion. Late amounts bear interest at 1.5% per month.

Vendor's total liability shall not exceed the fees paid in the preceding 3 months. Customer shall defend and indemnify Vendor against all claims arising from Customer's use of the Services. Any dispute shall be resolved by binding arbitration, and Customer waives any class action. This Agreement is governed by the laws of the State of Delaware.`;
}
export const SAMPLE_SETTINGS = { annualFee: "", upliftPct: "", effective: "", today: "2027-09-01", vendor: "Example SaaS Inc." };
