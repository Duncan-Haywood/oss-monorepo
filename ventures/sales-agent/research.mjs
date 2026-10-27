// Sales Agent, milestone 6: the research agent. It reads a CRM export (HubSpot, Pipedrive, Salesforce or any CSV),
// ranks the contacts against your ideal customer profile, and writes an account brief and a first-touch draft for the
// best ones. Same principle as the rest of the agent: it only ever reduces contact on its own (it drops suppressed,
// opted-out, customer, role-address and recently-contacted rows, and holds regions that usually need prior consent),
// and the drafts wait in the approval queue. It reads no website, scrapes nothing and guesses no email address: every
// fact in a brief is a field of your export, named, so a person can check it.
import { parseCsv, toCsv, iso, toDay, DAY, firstName, footer, checkDraft } from "./engine.mjs";

// Header aliases, so a HubSpot "Company name" and a Pipedrive "Organization - Name" land in the same place.
const ALIASES = {
  email: ["email", "e-mail", "email_address", "person_-_email", "person_-_email_-_work", "person_-_email_-_home", "person_-_email_-_other", "email_address_1", "work_email", "primary_email"],
  full_name: ["name", "full_name", "person_-_name", "contact_name", "contact"],
  bounce: ["email_hard_bounce_reason", "hard_bounce_reason", "email_hard_bounced", "bounced", "person_-_bounced"],
  marketing_status: ["marketing_contact_status", "person_-_marketing_status", "marketing_status", "email_status"],
  first_name: ["first_name", "firstname", "person_-_first_name", "given_name"],
  last_name: ["last_name", "lastname", "person_-_last_name", "surname", "family_name"],
  company: ["company", "company_name", "organization", "organization_-_name", "account", "account_name", "person_-_organization", "associated_company", "primary_associated_company"],
  title: ["title", "job_title", "jobtitle", "person_-_job_title", "position", "role"],
  industry: ["industry", "organization_-_industry", "sector", "vertical"],
  employees: ["employees", "number_of_employees", "numberofemployees", "company_size", "organization_-_employee_count", "headcount", "annual_employees"],
  country: ["country", "country/region", "country_region", "organization_-_country", "person_-_country", "mailing_country", "billing_country", "country_name"],
  lifecycle: ["lifecycle_stage", "lifecyclestage", "stage", "status", "person_-_label"],
  lead_status: ["lead_status", "hs_lead_status"],
  last_contacted: ["last_contacted", "last_activity_date", "last_activity", "last_contact_date", "last_engagement_date", "person_-_last_activity_date"],
  do_not_contact: ["do_not_contact", "donotcall", "do_not_email", "unsubscribed", "unsubscribed_from_all_emails", "unsubscribed_from_all_email", "unsubscribed_from_all_email_addresses", "email_opt_out", "opted_out", "hs_email_optout", "person_-_unsubscribed", "has_opted_out_of_email", "email_opt_out_"],
  fit_score: ["fit_score", "icp_score", "score", "icp_lens_score"],
  website: ["website", "website_url", "domain", "company_domain_name", "organization_-_website"],
};
const ROLE_LOCALS = /^(info|sales|support|admin|contact|hello|office|team|help|billing|accounts?|enquiries|enquiry|marketing|hr|jobs|press|webmaster|noreply|no-reply|postmaster|abuse)$/i;
const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|icloud|aol|proton(mail)?|live)\.[a-z.]+$/i;
// Regions where cold B2B email usually needs prior consent. A hold, not a legal opinion: confirm your own basis.
const CONSENT_REGIONS = { CA: "Canada (CASL: most commercial email needs consent)", DE: "Germany (UWG: cold email needs prior consent)", AT: "Austria (TKG: cold email needs prior consent)" };
const COUNTRY = { "united states": "US", usa: "US", "united kingdom": "GB", uk: "GB", canada: "CA", germany: "DE", deutschland: "DE", austria: "AT", australia: "AU", ireland: "IE", france: "FR", netherlands: "NL", spain: "ES", italy: "IT" };
const SENIOR = /\b(owner|founder|co-?founder|ceo|cto|coo|cfo|president|principal|partner|managing director|general manager|head of|vp|vice president|director|chief)\b/i;
// Mautic (and some Salesforce exports) put the salutation in "title" and the job in "position"; a salutation is not a job title.
const SALUTATION = /^(mr|mrs|ms|miss|mx|dr|prof|sir|madam|mme|mlle|herr|frau|sr|sra)\.?$/i;
const truthy = (v) => /^(1|y|yes|true|x|unsubscribed|opted[- ]?out)$/i.test(String(v || "").trim());
const list = (v) => (Array.isArray(v) ? v : String(v || "").split(/[,;|]/)).map((s) => s.trim().toLowerCase()).filter(Boolean);

export function normalizeRow(raw) {
  const out = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) if (raw[n] !== undefined && String(raw[n]).trim() !== "" && !(field === "title" && SALUTATION.test(String(raw[n]).trim()))) { out[field] = String(raw[n]).trim(); break; }
  }
  // Pipedrive and some HubSpot exports put several addresses in one cell; the first is the primary one.
  const e = (out.email || "").split(/[,;\s]+/)[0].toLowerCase();
  if (out.full_name && !out.first_name && !out.last_name) {
    const parts = out.full_name.split(/\s+/);
    out.first_name = parts[0];
    out.last_name = parts.slice(1).join(" ");
  }
  if (!out.lifecycle && out.lead_status) out.lifecycle = out.lead_status;
  out.email = e;
  const c = (out.country || "").trim();
  out.country = COUNTRY[c.toLowerCase()] || (c.length === 2 ? c.toUpperCase() : c);
  const n = Number(String(out.employees || "").replace(/[, ]/g, "").split(/[-–]/)[0]);
  out.employeesN = Number.isFinite(n) && out.employees ? n : NaN;
  return out;
}

/** Score one contact 0-100 against the ICP, with every point explained. icp: { industries, exclude_industries, titles, min_employees, max_employees, countries } */
export function scoreFit(r, icp = {}) {
  const why = [];
  let pts = 0, max = 0;
  const add = (cond, w, yes, no) => { max += w; if (cond === true) { pts += w; why.push(`+${w} ${yes}`); } else if (cond === false && no) why.push(`+0 ${no}`); };
  const ind = (r.industry || "").toLowerCase();
  if (list(icp.industries).length) add(ind ? list(icp.industries).some((x) => ind.includes(x)) : undefined, 30, `industry "${r.industry}" is one you target`, ind ? `industry "${r.industry}" is not in your list` : "");
  if (icp.min_employees || icp.max_employees) {
    const lo = icp.min_employees ?? 0, hi = icp.max_employees ?? Infinity;
    add(Number.isFinite(r.employeesN) ? r.employeesN >= lo && r.employeesN <= hi : undefined, 25, `${r.employeesN} employees is inside ${lo}-${hi === Infinity ? "up" : hi}`, `${r.employeesN} employees is outside ${lo}-${hi === Infinity ? "up" : hi}`);
  }
  const t = r.title || "";
  if (list(icp.titles).length) add(t ? list(icp.titles).some((x) => t.toLowerCase().includes(x)) : undefined, 25, `title "${t}" is a buyer you named`, t ? `title "${t}" is not in your list` : "");
  else if (t && Object.keys(icp).length) add(SENIOR.test(t), 15, `title "${t}" is senior`, "");
  if (list(icp.countries).length) add(r.country ? list(icp.countries).includes(r.country.toLowerCase()) : undefined, 10, `country ${r.country} is one you serve`, r.country ? `country ${r.country} is not in your list` : "");
  const fit = Number(r.fit_score);
  if (Number.isFinite(fit) && r.fit_score !== undefined) { const f = Math.max(0, Math.min(100, fit)); max += 100; pts += f; why.push(`+${Math.round(f)} your export's own fit score (ICP Lens) is ${f}`); }
  const missing = [];
  if (!ind && list(icp.industries).length) missing.push("industry");
  if (!Number.isFinite(r.employeesN) && (icp.min_employees || icp.max_employees)) missing.push("employees");
  if (!t && list(icp.titles).length) missing.push("title");
  return { score: max ? Math.round((pts / max) * 100) : null, why, missing };
}

function firstTouch(r, offer) {
  const hi = `Hi ${firstName({ first_name: r.first_name })},`;
  const intro = offer.product ? `I'm ${offer.sender || "writing"}${offer.company ? " at " + offer.company : ""}, and I'm reaching out because ${r.company ? r.company : "your team"}${r.industry ? " works in " + r.industry.toLowerCase() : ""} and ${offer.product} ${offer.value || "may be relevant"}.` : "[One line: who you are and why you are writing to them]";
  const ask = offer.booking_link ? `If it is worth a short call, you can pick a time here: ${offer.booking_link}` : "If it is worth a short call, reply with a time that suits you.";
  const body = [hi, "", intro, offer.proof || "", "", ask, "", "If this isn't relevant, tell me and I won't write again.", footer(offer)].filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");
  return { subject: `${offer.product || "A question"}${r.company ? " for " + r.company : ""}`, body };
}

/**
 * input: { crm (CSV text or rows), icp, offer, suppression (text), existing (the prospects.csv the inbox agent keeps, CSV
 * text or rows), today, top = 25, minScore = 40, cooldownDays = 90 }.
 * Returns { today, accounts (ranked, with brief and draft), dropped, held, summary, brief }.
 */
export function runResearch(input) {
  const today = input.today || iso(Date.now());
  const rows = (Array.isArray(input.crm) ? input.crm : parseCsv(input.crm)).map(normalizeRow);
  const existing = new Map((Array.isArray(input.existing) ? input.existing : parseCsv(input.existing)).filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
  const sup = new Set(), supDomains = new Set();
  for (const s of String(input.suppression || "").split(/[\n,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) (s.startsWith("@") ? supDomains.add(s.slice(1)) : sup.add(s));
  const icp = input.icp || {}, offer = input.offer || {};
  const top = input.top ?? 25, minScore = input.minScore ?? 40, cool = (input.cooldownDays ?? 90) * DAY;
  const dropped = [], held = [], seen = new Set(), candidates = [];

  rows.forEach((r, i) => {
    const id = { row: i + 2, name: [r.first_name, r.last_name].filter(Boolean).join(" "), company: r.company, email: r.email };
    const drop = (reason) => dropped.push({ ...id, reason });
    if (!r.email) return drop("no email address (nothing is guessed)");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) return drop("not a valid email address");
    if (sup.has(r.email) || supDomains.has(r.email.split("@")[1])) return drop("on your suppression list");
    if (r.bounce && !/^(0|n|no|false)$/i.test(r.bounce)) return drop(`the export records a hard bounce (${r.bounce})`);
    if (/^(unsubscribed|opted[- ]?out|do not email|non-?marketing.*unsub)/i.test(r.marketing_status || "")) return drop(`marketing status "${r.marketing_status}"`);
    if (truthy(r.do_not_contact)) return drop("opted out or marked do-not-contact in the export");
    const ex = existing.get(r.email);
    if (ex && ["unsubscribed", "closed_lost", "bounced", "left", "replied"].includes((ex.status || "").toLowerCase())) return drop(`the inbox agent has them as ${ex.status}`);
    if (/^(unqualified|disqualified|do not contact)$/i.test(r.lead_status || "")) return drop(`lead status "${r.lead_status}": not a cold prospect`);
    if (/customer|client|won|evangelist|opportunity|disqualified|unqualified|churn/i.test(r.lifecycle || "")) return drop(`lifecycle "${r.lifecycle}": not a cold prospect`);
    if (seen.has(r.email)) return drop("duplicate of an earlier row");
    seen.add(r.email);
    if (ROLE_LOCALS.test(r.email.split("@")[0])) return drop("role address (shared inbox); find a named person");
    if (r.last_contacted && toDay(r.last_contacted) > toDay(today) - cool) return drop(`contacted ${r.last_contacted}, inside the ${input.cooldownDays ?? 90}-day cool-off`);
    const fit = scoreFit(r, icp);
    candidates.push({ ...id, ...r, ...fit, personalMail: FREE_MAIL.test(r.email) });
  });

  // One lead per company: the best-scoring contact; the others become "also at this account".
  const byCo = new Map();
  for (const c of candidates.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))) {
    const key = (c.company || c.email.split("@")[1]).toLowerCase();
    if (!byCo.has(key)) byCo.set(key, { lead: c, others: [] }); else byCo.get(key).others.push(c);
  }
  const accounts = [];
  for (const { lead, others } of byCo.values()) {
    if (lead.score !== null && lead.score < minScore) { dropped.push({ row: lead.row, name: lead.name, company: lead.company, email: lead.email, reason: `fit ${lead.score} is under your floor of ${minScore}` }); continue; }
    const region = CONSENT_REGIONS[lead.country];
    const facts = ["email", "first_name", "last_name", "title", "company", "industry", "employees", "country", "lifecycle", "website"].filter((k) => lead[k]).map((k) => `${k.replace("_", " ")}: ${lead[k]}`);
    const draft = firstTouch(lead, offer);
    const check = checkDraft(draft, [JSON.stringify(offer), ...facts].join(" "));
    const flags = [];
    if (lead.personalMail) flags.push("personal mailbox (gmail, yahoo...): confirm this is a business contact");
    if (lead.missing.length) flags.push(`missing ${lead.missing.join(", ")}: the score is on partial data`);
    if (region) { held.push({ row: lead.row, name: lead.name, company: lead.company, email: lead.email, reason: `${region}; no draft until you have consent`, score: lead.score }); continue; }
    accounts.push({
      rank: 0, website: lead.website || "", company: lead.company, contact: lead.name, title: lead.title || "", email: lead.email, score: lead.score, why: lead.why, facts, flags,
      alsoAt: others.map((o) => `${o.name || o.email}${o.title ? " (" + o.title + ")" : ""}`), draft, draftOk: check.ok, draftErrors: check.errors, draftWarnings: check.warnings, source: `CRM export row ${lead.row}`,
    });
  }
  accounts.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const ranked = accounts.slice(0, top).map((a, i) => ({ ...a, rank: i + 1 }));
  const overflow = accounts.length - ranked.length;
  const summary = { rows: rows.length, accounts: ranked.length, dropped: dropped.length, held: held.length, belowTopN: overflow, draftsReady: ranked.filter((a) => a.draftOk).length, scored: candidates.some((c) => c.score !== null) };
  return { today, accounts: ranked, dropped, held, summary, brief: brief(today, ranked, dropped, held, summary) };
}

/** Rebuild the brief text from a result (used after web facts are added). */
export const briefOf = (d) => brief(d.today, d.accounts, d.dropped, d.held, d.summary);
function brief(today, accounts, dropped, held, s) {
  const out = [`# Accounts to contact, ${today}`, "", `${s.rows} rows read. ${s.accounts} accounts ranked, ${s.dropped} dropped, ${s.held} held for consent${s.belowTopN ? `, ${s.belowTopN} more below the top ${s.accounts}` : ""}. Every fact below is a field of your export. Nothing was sent. Facts come from your export, plus a home page title where --web was used and robots.txt allowed it.`, ""];
  if (!s.scored) out.push("No ideal customer profile was given and the export has no fit score, so these are in file order. Add `icp` or run ICP Lens first.", "");
  for (const a of accounts) {
    out.push(`## ${a.rank}. ${a.company || a.email}${a.score !== null ? ` (fit ${a.score})` : ""}`, `${a.contact || a.email}${a.title ? ", " + a.title : ""}; ${a.email}; ${a.source}`);
    for (const w of a.why) out.push(`- ${w}`);
    for (const f of a.flags) out.push(`- Check: ${f}`);
    if (a.web) out.push(a.web.ok ? `- Public page (${a.web.origin}, robots.txt allowed): "${a.web.title}"${a.web.description ? " — " + a.web.description : ""}` : `- Public page not read: ${a.web.note}`);
    if (a.alsoAt.length) out.push(`- Also at this account: ${a.alsoAt.join("; ")}`);
    out.push(a.draftOk ? "- Draft passes the checks; waiting for your approval." : `- Draft needs work: ${a.draftErrors.join("; ")}`, "");
  }
  const section = (t, l) => { if (l.length) { out.push(`## ${t} (${l.length})`); for (const x of l) out.push(`- row ${x.row}: ${x.name || x.email || "(no name)"}${x.company ? ", " + x.company : ""}: ${x.reason}`); out.push(""); } };
  section("Held", held);
  section("Dropped", dropped);
  return out.join("\n");
}

export const csvAccounts = (d) => toCsv(d.accounts.map((a) => ({ ...a, web_title: a.web?.ok ? a.web.title : "", web_description: a.web?.ok ? a.web.description : "", web_note: a.web?.note || "", why: a.why.join(" | "), flags: a.flags.join(" | "), subject: a.draft.subject, body: a.draft.body, draft_ok: a.draftOk ? "yes" : "no", also_at: a.alsoAt.join("; ") })), ["rank", "company", "contact", "title", "email", "score", "why", "flags", "also_at", "web_title", "web_description", "web_note", "subject", "body", "draft_ok", "source"]);
export const csvLeftOutResearch = (d) => toCsv([...d.held.map((x) => ({ ...x, outcome: "held" })), ...d.dropped.map((x) => ({ ...x, outcome: "dropped" }))], ["outcome", "row", "name", "company", "email", "reason"]);

// A small made-up export (HubSpot-style headers) for the page's "Load an example".
export const SAMPLE_CRM = `First Name,Last Name,Email,Company name,Job Title,Industry,Number of Employees,Country/Region,Lifecycle Stage,Last Activity Date,Unsubscribed from all emails
Dana,Reyes,dana@brightline.example,Brightline Logistics,Director of Operations,Logistics,120,United States,Lead,,
Ken,Ito,ken@brightline.example,Brightline Logistics,Dispatcher,Logistics,120,United States,Lead,,
Omar,Khan,omar@harbor.example,Harbor Freight Co,Founder,Logistics,45,US,Marketing Qualified Lead,2026-07-01,
Lena,Ng,lena@ridge.example,Ridge Supply,Intern,Retail,12,US,Lead,,
Paul,Ortiz,paul@summit.example,Summit Parts,Owner,Logistics,60,US,Customer,,
Gus,Hall,info@northwind.example,Northwind Freight,CEO,Logistics,80,US,Lead,,
Tina,Berg,tina@berlin.example,Berlin Spedition,Geschäftsführer,Logistics,90,Germany,Lead,,
Sue,Park,sue@optout.example,Optout Inc,Owner,Logistics,70,US,Lead,,true`;
