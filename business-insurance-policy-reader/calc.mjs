// Business insurance policy reader. Reads pasted commercial policy or declarations text (general liability, professional liability / E&O,
// BOP, cyber) and returns limits, deductible, trigger type, key dates, whether limits meet a client's contract requirement, and the
// coverage gaps buyers usually ask a broker about. Fixed text rules, not a coverage opinion: every value shows the sentence it came from.

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


const money = (s) => parseMoney(String(s).replace(/\s/g, ""));
const MONEY = "\\$\\s?([\\d,]+(?:\\.\\d{2})?)";

export function extract(rawText) {
  const text = norm(rawText);
  const x = {};
  const src = {};
  const set = (k, v, sentence) => { x[k] = v; src[k] = sentence; };

  let r = find(text, new RegExp(`policy period[^.]{0,60}?(${DATE_RE})\\s*(?:to|through|-|–|until|and)\\s*(${DATE_RE})`, "i")) || find(text, new RegExp(`(?:from|effective)\\s*(${DATE_RE})\\s*(?:to|through|until)\\s*(${DATE_RE})`, "i"));
  if (r) { set("effective", parseDate(r.m[1]), r.sentence); x.expiration = parseDate(r.m[2]); src.expiration = r.sentence; }
  r = find(text, new RegExp(`(?:policy )?(?:expiration|expiry|expires?)(?: date)?[^.]{0,30}?(${DATE_RE})`, "i"));
  if (r && !x.expiration) set("expiration", parseDate(r.m[1]), r.sentence);

  r = find(text, /claims[- ]made( and reported)?/i);
  if (r) set("trigger", r.m[1] ? "claims-made-and-reported" : "claims-made", r.sentence);
  else { r = find(text, /\boccurrence (?:basis|form|policy|coverage)|on an occurrence basis|caused by an occurrence/i); if (r) set("trigger", "occurrence", r.sentence); }
  r = find(text, new RegExp(`retroactive date[^.]{0,40}?(${DATE_RE}|none|full prior acts|inception)`, "i"));
  if (r) set("retroDate", /^\d|^[a-z]{3}/i.test(r.m[1]) && parseDate(r.m[1]) ? parseDate(r.m[1]) : r.m[1].toLowerCase(), r.sentence);

  r = find(text, new RegExp(`(?:each occurrence|per occurrence|each claim|per claim|each wrongful act)[^.]{0,60}?${MONEY}`, "i"));
  if (r) set("perOccurrence", money(r.m[1]), r.sentence);
  r = find(text, new RegExp(`(?:general aggregate|aggregate limit|annual aggregate|policy aggregate|aggregate)[^.]{0,60}?${MONEY}`, "i"));
  if (r) set("aggregate", money(r.m[1]), r.sentence);
  r = find(text, new RegExp(`(?:deductible|self[- ]insured retention|\\bsir\\b|retention)[^.]{0,60}?${MONEY}`, "i"));
  if (r) set("deductible", money(r.m[1]), r.sentence);
  r = find(text, new RegExp(`(?:total |annual |policy )?premium[^.]{0,40}?${MONEY}`, "i"));
  if (r) set("premium", money(r.m[1]), r.sentence);

  r = find(text, new RegExp(`(?:cancel|cancellation|non-?renew)[^.]{0,200}?${NUM}${PAREN}\\s*(?:calendar |business )?days`, "i")) || find(text, new RegExp(`${NUM}${PAREN}\\s*days[^.]{0,60}(?:written )?notice[^.]{0,60}(?:cancel|non-?renew)`, "i"));
  if (r && /cancel|renew/i.test(r.sentence)) set("cancelNoticeDays", num(r.m[1]), r.sentence);
  r = find(text, new RegExp(`(?:extended reporting period|extended reporting|tail)[^.]{0,200}?${NUM}${PAREN}\\s*days`, "i"));
  if (r) set("erpDays", num(r.m[1]), r.sentence);
  r = find(text, new RegExp(`(?:waiting period|elimination period|after a waiting period)(?: of)?\\s*${NUM}${PAREN}\\s*hours`, "i")) || find(text, new RegExp(`${NUM}${PAREN}\\s*hours[^.]{0,60}(?:waiting|elimination|business income|suspension)`, "i"));
  if (r) set("waitingHours", num(r.m[1]), r.sentence);
  r = find(text, /(\d{2,3})\s?%\s*coinsurance|coinsurance[^.]{0,30}?(\d{2,3})\s?%/i);
  if (r) set("coinsurancePct", Number(r.m[1] || r.m[2]), r.sentence);
  return { x, src };
}

const f = (id, severity, title, why, ask) => ({ id, severity, title, why, ask });
const bad = (errors) => ({ errors, findings: [], terms: {}, sources: {}, calendar: [], upcoming: [], requirement: [] });

export function analyze(rawText, settings = {}) {
  const text = norm(rawText);
  const low = text.toLowerCase();
  if (text.length < 200) return bad(["Paste the full policy or declarations text first (at least a few paragraphs)."]);
  const today = settings.today ? parseDate(settings.today) : null;
  if (settings.today && !today) return bad(["Today's date is not a date (use YYYY-MM-DD)."]);
  const { x, src } = extract(text);
  if (settings.expiration) {
    const d = parseDate(settings.expiration);
    if (!d) return bad(["The expiration date override is not a date (use YYYY-MM-DD)."]);
    x.expiration = d; src.expiration = "Entered by you.";
  }
  const reqOcc = parseMoney(settings.requiredOccurrence), reqAgg = parseMoney(settings.requiredAggregate);
  if (reqOcc === null || reqAgg === null) return bad(["The required limits must be dollar amounts."]);
  const prem = parseMoney(settings.premium);
  if (prem === null) return bad(["The premium override is not a number."]);
  if (prem) { x.premium = prem; src.premium = "Entered by you."; }

  const requirement = [];
  if (reqOcc) requirement.push({ label: "Each occurrence / claim", required: reqOcc, actual: x.perOccurrence ?? null, ok: x.perOccurrence == null ? null : x.perOccurrence >= reqOcc });
  if (reqAgg) requirement.push({ label: "Aggregate", required: reqAgg, actual: x.aggregate ?? null, ok: x.aggregate == null ? null : x.aggregate >= reqAgg });

  const calendar = [];
  if (x.effective) calendar.push({ date: x.effective, label: "Policy period starts" });
  if (x.expiration) {
    calendar.push({ date: addDays(x.expiration, -90), label: "Start renewal: ask your broker for quotes and send updated revenue, payroll and claims info", planning: true });
    calendar.push({ date: addDays(x.expiration, -30), label: "Renewal terms should be in hand; decide, and bind coverage before it lapses", critical: true });
    calendar.push({ date: x.expiration, label: "Policy period ends; any gap in coverage starts the next day" });
    if (x.trigger && x.trigger.startsWith("claims-made") && x.erpDays) calendar.push({ date: addDays(x.expiration, x.erpDays), label: `Last day to buy extended reporting (tail) coverage if you do not renew (${x.erpDays} days after expiry)`, critical: true });
  }
  calendar.sort((a, b) => a.date - b.date);

  const findings = [];
  const missing = (k, label) => findings.push(f(`missing-${k}`, "info", `Could not find: ${label}`, "The rules did not match wording for this. It may be on a declarations page or endorsement you did not paste, or phrased differently.", "Find it on the declarations page before relying on this summary."));
  if (!x.expiration) missing("expiration", "policy period or expiration date");
  if (x.perOccurrence == null) missing("limit", "per-occurrence or per-claim limit");
  if (x.deductible == null) missing("deductible", "deductible or retention");

  for (const q of requirement) if (q.ok === false) findings.push(f(`short-${q.label.startsWith("Each") ? "occ" : "agg"}`, "high", `${q.label} limit ${dollars(q.actual)} is below the ${dollars(q.required)} your contract asks for`, "A client or landlord that requires a minimum limit can reject your certificate, withhold the job, or treat it as a breach.", "Ask your broker for the higher limit or an umbrella/excess policy that sits above it, and get a quote before the next bid."));

  if (x.trigger && x.trigger.startsWith("claims-made")) {
    findings.push(f("claims-made", "medium", x.trigger === "claims-made-and-reported" ? "Claims-made-and-reported policy" : "Claims-made policy", "It pays only for claims made while the policy is in force. Cancel it or let it lapse and a later claim for work you did earlier is not covered unless you buy tail coverage.", "Never let it lapse. Ask what an extended reporting period costs and keep the retroactive date unchanged at every renewal."));
    if (x.retroDate && x.retroDate instanceof Date) findings.push(f("retro-date", "info", `Retroactive date ${iso(x.retroDate)}`, "Work done before this date is not covered, even if the claim arrives this year.", "If you changed carriers, ask for the retroactive date to match your first policy so older work stays covered."));
    if (!x.retroDate) findings.push(f("retro-missing", "medium", "Claims-made policy but no retroactive date found", "The retroactive date decides how far back your covered work reaches.", "Find it on the declarations page and ask for the earliest date available."));
  }
  if (/(defen[cs]e (?:costs|expenses)|legal (?:costs|expenses))[^.]{0,80}(?:within|are included|erode|reduce|part of)[^.]{0,40}(?:the )?limit|inside the limits?|within the limits? of liability|defense within limits/.test(low)) findings.push(f("defense-inside", "high", "Defense costs reduce the limit", "Legal fees are paid out of your limit, so a $1,000,000 limit can have far less left for a settlement.", "Ask for defense in addition to the limit, or price a higher limit to cover it."));
  if (/(professional (?:services|liability)|errors and omissions|\be&o\b)[^.]{0,80}(?:exclu|not covered|does not apply)|exclu[^.]{0,80}professional (?:services|liability)/.test(low)) findings.push(f("prof-excluded", "high", "Professional services exclusion", "Claims that your advice, design or work product was wrong are not covered by a general liability form carrying this exclusion.", "If you advise, design, consult or process data for clients, ask about professional liability (E&O) as a separate policy."));
  if (/(cyber|data breach|electronic data|computer|network security)[^.]{0,80}(?:exclu|not covered|does not apply)|exclu[^.]{0,80}(?:cyber|data breach|electronic data)/.test(low)) findings.push(f("cyber-excluded", "medium", "Cyber or electronic data exclusion", "Ransomware, a breach of customer data or lost records may not be covered.", "Ask for cyber liability coverage and its limit, or confirm in writing where such losses are covered."));
  if (/(pollution|contaminant)[^.]{0,80}exclu|exclu[^.]{0,80}(?:pollution|contaminant)|total pollution exclusion/.test(low)) findings.push(f("pollution", "info", "Pollution exclusion", "Spills, fumes and cleanup costs are usually excluded from general liability.", "Trades that handle fuel, chemicals, paint, roofing or demolition should ask about contractors pollution liability."));
  if (/(contractual liability|assumed under (?:a|any) contract|insured contract)[^.]{0,80}exclu|exclu[^.]{0,80}(?:contractual liability|liability assumed)/.test(low)) findings.push(f("contractual", "medium", "Contractual liability exclusion", "Hold-harmless and indemnity promises you sign in client contracts may not be insured.", "Show your broker the indemnity wording in your contracts and ask for insured-contract coverage."));
  if (/(subcontract|independent contractor|uninsured subcontractor)[^.]{0,80}exclu|exclu[^.]{0,80}(?:subcontract|independent contractors?)|subcontractor warranty|uninsured subs?/.test(low)) findings.push(f("subs-excluded", "high", "Subcontractor condition or exclusion", "Work done by subs may be excluded, or covered only if they carry their own insurance and name you.", "Collect a certificate and additional-insured endorsement from every sub before they start, and ask whether uninsured subs are excluded."));
  if (/(employees?|workers|wage and hour|employment[- ]related practices)[^.]{0,60}exclu|exclu[^.]{0,60}(?:employees?|bodily injury to (?:an )?employee|employer'?s liability|wage and hour)/.test(low)) findings.push(f("employee-excl", "info", "Employee injury or employment exclusion", "General liability does not pay for your own staff's injuries or employment claims.", "Confirm you carry workers' compensation, and ask about employment practices liability if you have staff."));
  if (/(mold|fungi|fungus|asbestos|silica|lead)[^.]{0,60}exclu|exclu[^.]{0,60}(?:mold|fungi|fungus|asbestos)/.test(low)) findings.push(f("mold", "info", "Mold, fungus, asbestos or silica exclusion", "Claims tied to these are common after water damage or renovation work and are typically excluded.", "If you work with buildings or water damage, ask whether a buy-back endorsement exists."));
  if (/(cosmetic damage|roof surfacing|actual cash value|\bacv\b)/.test(low)) findings.push(f("acv", "medium", "Actual cash value or cosmetic damage terms", "Claims are paid after depreciation instead of the cost to replace, which can leave a large gap on older equipment or a roof.", "Ask for replacement cost on equipment and building items, and what it adds to premium."));
  if (x.coinsurancePct && x.coinsurancePct >= 80) findings.push(f("coinsurance", "medium", `${x.coinsurancePct}% coinsurance clause`, "If the property is insured for less than that share of its real value, every claim is cut proportionally even for a small loss.", "Re-check replacement values every year, or ask for an agreed-value endorsement."));
  if (x.waitingHours != null && x.waitingHours >= 72) findings.push(f("waiting", "medium", `Business income waits ${x.waitingHours} hours`, "You carry the first days of lost income yourself.", "Ask for a 24 or 48 hour waiting period and extra expense coverage."));
  if (x.cancelNoticeDays != null && x.cancelNoticeDays <= 10) findings.push(f("short-cancel", "medium", `Insurer may cancel on ${x.cancelNoticeDays} days notice`, "A short window leaves little time to replace coverage before contracts require proof of it.", "Ask your broker how non-payment and underwriting cancellations are handled, and keep premiums on autopay."));
  if (!/(additional insured|certificate holder|waiver of subrogation|primary and non-?contributory)/.test(low)) findings.push(f("no-additional-insured", "info", "No additional insured or waiver endorsements found", "Clients and landlords often require to be named, with primary and non-contributory wording.", "Ask your broker which blanket endorsements you have, and request certificates from them as contracts require."));
  if (/(consent|hammer clause|settle)[^.]{0,80}(?:without (?:our|the insurer's|the company's) consent)|insurer may settle|hammer clause/.test(low)) findings.push(f("settle", "info", "Insurer controls settlement", "The insurer can settle a claim, which can affect your premiums and record.", "Ask whether you can refuse a settlement and what that costs."));
  if (/(as soon as practicable|immediately|promptly)[^.]{0,60}(?:notify|notice|report)[^.]{0,60}(?:claim|occurrence|loss|suit)|(?:notify|report)[^.]{0,60}(?:as soon as practicable|immediately|within\s+\d+\s+days)/.test(low)) findings.push(f("notice", "info", "Prompt notice of a claim is a condition of coverage", "Late notice can let the insurer deny a claim it would otherwise pay.", "Tell your broker the day a claim, demand letter or incident occurs, even if you are unsure it matters."));
  if (x.deductible != null && x.perOccurrence && x.deductible >= x.perOccurrence * 0.05) findings.push(f("deductible", "medium", `Deductible of ${dollars(x.deductible)} is large relative to the ${dollars(x.perOccurrence)} limit`, "You pay the first dollars of every claim yourself.", "Set aside a cash reserve for the deductible, or compare quotes at a lower deductible."));

  const rank = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const verdict = findings.some((g) => g.severity === "high") ? "gaps" : findings.some((g) => g.severity === "medium") ? "ask-broker" : "few-flags";
  const upcoming = today ? calendar.filter((c) => c.date >= today).slice(0, 3) : [];
  return { errors: [], findings, verdict, terms: x, sources: src, calendar, upcoming, requirement };
}

export const VERDICT_TEXT = {
  gaps: "Gaps or limits to raise with your broker before you rely on this policy",
  "ask-broker": "Some terms worth asking your broker about",
  "few-flags": "Few flags found by these rules",
};

export function summaryText(r, s = {}) {
  const t = r.terms;
  const d = (v) => (v ? iso(v) : "not found");
  const m = (v) => (v != null ? dollars(v) : "not found");
  const lines = ["INSURANCE POLICY SUMMARY"];
  if (s.insured) lines.push(`Insured: ${s.insured}`);
  lines.push(`Policy period: ${d(t.effective)} to ${d(t.expiration)}`, `Coverage trigger: ${t.trigger || "not found"}${t.retroDate instanceof Date ? ", retroactive date " + iso(t.retroDate) : ""}`);
  lines.push(`Each occurrence / claim: ${m(t.perOccurrence)}`, `Aggregate: ${m(t.aggregate)}`, `Deductible / retention: ${m(t.deductible)}`, `Premium: ${m(t.premium)}`);
  for (const q of r.requirement) lines.push(`Contract requirement, ${q.label}: needs ${dollars(q.required)}; policy ${q.actual != null ? dollars(q.actual) : "not found"} - ${q.ok === null ? "unknown" : q.ok ? "meets" : "BELOW"}`);
  lines.push("", "KEY DATES");
  for (const c of r.calendar) lines.push(`${iso(c.date)}  ${c.label}`);
  lines.push("", `RESULT: ${VERDICT_TEXT[r.verdict]}`, "");
  for (const [i, g] of r.findings.entries()) lines.push(`${i + 1}. [${g.severity.toUpperCase()}] ${g.title}`, `   Why: ${g.why}`, `   Ask your broker: ${g.ask}`, "");
  lines.push("A summary from a text reader, not insurance, legal or coverage advice. Check every value against the policy and ask a licensed broker or attorney before relying on it.");
  return lines.join("\n");
}

export function calendarIcs(r, name = "Insurance policy") {
  const stamp = "20260101T000000Z";
  const ev = r.calendar.map((c, i) => {
    const d = iso(c.date).replace(/-/g, "");
    const next = iso(addDays(c.date, 1)).replace(/-/g, "");
    return ["BEGIN:VEVENT", `UID:policy-${i}-${d}@business-insurance-policy-reader`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${name}: ${c.label.replace(/[,;\n]/g, " ")}`, ...(c.critical ? ["BEGIN:VALARM", "TRIGGER:-P14D", "ACTION:DISPLAY", "DESCRIPTION:Insurance renewal date in 14 days", "END:VALARM"] : []), "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//business-insurance-policy-reader//EN", ...ev, "END:VCALENDAR"].join("\r\n");
}

export function findingsCsv(r) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ["severity,finding,why,ask_broker", ...r.findings.map((g) => [g.severity, g.title, g.why, g.ask].map(q).join(","))].join("\n");
}

export function samplePolicy() {
  return `COMMERCIAL GENERAL LIABILITY DECLARATIONS. Named insured: Example Builders LLC. Policy period: March 1, 2027 to March 1, 2028. This is a claims-made policy. Retroactive date: March 1, 2026. Limits of insurance: each occurrence $500,000; general aggregate $1,000,000. Deductible: $25,000 per claim. Total premium: $6,400.

Defense costs are included within the limits of liability and reduce the amount available to pay damages. This policy does not apply to professional services, and a professional services exclusion is attached. A contractual liability exclusion applies except for insured contracts as defined. Coverage does not apply to work performed by uninsured subcontractors. Pollution is excluded under the total pollution exclusion. Property is insured on an actual cash value basis with 90% coinsurance. Business income coverage begins after a waiting period of 72 hours.

We may cancel this policy by giving you 10 days written notice. If this policy is not renewed, you may purchase an extended reporting period by request within 60 days after the policy expires. You must notify us of any claim as soon as practicable.`;
}
export const SAMPLE_SETTINGS = { expiration: "", premium: "", requiredOccurrence: "1000000", requiredAggregate: "2000000", today: "2027-11-15", insured: "Example Builders LLC" };
