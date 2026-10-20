// Sales Cadence Builder engine. Pure functions, no network, no dependencies: runs in a browser tab, in Node 18+ and
// from cli.mjs. It plans a multi-channel prospecting cadence (email, phone call with a voicemail script, LinkedIn
// connection note, mailed letter) over business days for a list the user already has, drafts every touch from
// templates with merge fields, and gates each prospect on the rules a small team most often trips over: suppression
// and do-not-contact lists, duplicates, CASL consent for Canada, consent for EU email, and calling only inside the
// prospect's own local business hours. It never sends, dials or posts anything; the user does, from their own tools.

// ---------- cadences ----------

// `day` is a business day counted from the start date (1 = the start date itself when it is a business day).
export const CADENCES = Object.freeze({
  "b2b-classic": {
    label: "Classic B2B: 8 touches over 15 business days (email, call, LinkedIn, letter)",
    steps: [
      { day: 1, channel: "email", template: "intro" },
      { day: 1, channel: "linkedin", template: "connect" },
      { day: 3, channel: "call", template: "call" },
      { day: 5, channel: "email", template: "question" },
      { day: 8, channel: "call", template: "call" },
      { day: 10, channel: "letter", template: "letter" },
      { day: 12, channel: "email", template: "proof" },
      { day: 15, channel: "email", template: "breakup" },
    ],
  },
  "phone-first": {
    label: "Phone first: 4 calls and 3 emails over 15 business days",
    steps: [
      { day: 1, channel: "call", template: "call" },
      { day: 1, channel: "email", template: "intro" },
      { day: 3, channel: "call", template: "call" },
      { day: 6, channel: "call", template: "call" },
      { day: 8, channel: "email", template: "proof" },
      { day: 11, channel: "call", template: "call" },
      { day: 15, channel: "email", template: "breakup" },
    ],
  },
  "letter-first": {
    label: "Letter first: a mailed letter, then calls and email once it has arrived",
    steps: [
      { day: 1, channel: "letter", template: "letter" },
      { day: 6, channel: "call", template: "call" },
      { day: 7, channel: "email", template: "intro" },
      { day: 10, channel: "call", template: "call" },
      { day: 12, channel: "email", template: "proof" },
      { day: 16, channel: "email", template: "breakup" },
    ],
  },
  "email-light": {
    label: "Light touch: 4 emails over 16 business days",
    steps: [
      { day: 1, channel: "email", template: "intro" },
      { day: 4, channel: "email", template: "question" },
      { day: 9, channel: "email", template: "proof" },
      { day: 16, channel: "email", template: "breakup" },
    ],
  },
});

export const CHANNEL_LABELS = Object.freeze({ email: "Email", call: "Call", linkedin: "LinkedIn", letter: "Letter" });

// ---------- templates ----------
// {{field}} is replaced; a missing field becomes a visible [field] placeholder that the checks refuse to pass.
// {{#field}}...{{/field}} is kept only when the field has a value, {{^field}}...{{/field}} only when it has none. Templates never state a number, a customer or a
// result: those come only from fields the user typed (offer, outcome, proof).

export const TEMPLATES = Object.freeze({
  intro: {
    subject: "{{topic}} at {{company}}",
    body: "Hi {{first_name}},\n\n{{#trigger}}I saw {{trigger}}, so this seemed like a good time to write.\n\n{{/trigger}}I'm {{sender_name}} at {{sender_company}}. {{offer}} We help teams {{outcome}}.\n\nIs {{topic}} something you're working on this quarter? If it is, would {{cta}} be useful?\n\nThanks,\n{{sender_name}}",
  },
  question: {
    subject: "A question about {{topic}}",
    body: "Hi {{first_name}},\n\nA quick question instead of a pitch: how does {{company}} handle {{topic}} today? If it already works well, tell me and I'll leave you be.\n\n{{sender_name}}",
  },
  proof: {
    subject: "{{topic}}: what a similar team did",
    body: "Hi {{first_name}},\n\n{{proof}}. If {{company}} has a similar goal, I'm happy to walk you through how they did it. Would {{cta}} work?\n\n{{sender_name}}",
  },
  // Used in place of `proof` when the user has no real result to cite: a referral ask, never an invented case study.
  referral: {
    subject: "Who owns {{topic}} at {{company}}?",
    body: "Hi {{first_name}},\n\nIs {{topic}} yours, or is someone else at {{company}} the better person to talk to? A name is all I need, and I won't mention you unless you say I can.\n\n{{sender_name}}",
  },
  breakup: {
    subject: "Closing the loop",
    body: "Hi {{first_name}},\n\nI haven't heard back, so I'll assume {{topic}} isn't a priority right now and I won't follow up again. If that changes, just reply to this email.\n\nThanks for your time,\n{{sender_name}}",
  },
  call: {
    body: "Opener: Hi {{first_name}}, this is {{sender_name}} from {{sender_company}}. I'm calling about {{topic}}. Do you have half a minute, or is now a bad time?\nWhy them: {{#trigger}}I saw {{trigger}}. {{/trigger}}{{offer}}\nQuestion: How are you handling {{topic}} today?\nAsk: If it's worth a look, would {{cta}} work?\nIf not now: ask who owns {{topic}} or when to check back, and log the answer.",
    voicemail: "Hi {{first_name}}, it's {{sender_name}} from {{sender_company}}, calling about {{topic}} at {{company}}. We help teams {{outcome}}. {{#can_email}}I'll send a short email as well. {{/can_email}}You can reach me on {{sender_phone}}. Again, that's {{sender_name}}, {{sender_phone}}.",
  },
  connect: {
    body: "Hi {{first_name}}, I work on {{topic}} with teams like {{company}}'s and would like to connect. {{sender_name}}",
  },
  letter: {
    body: "{{first_name}} {{last_name}}\n{{#title}}{{title}}\n{{/title}}{{company}}\n{{address}}\n\nDear {{first_name}},\n\n{{#trigger}}I saw {{trigger}}. {{/trigger}}{{offer}} We help teams {{outcome}}.\n\n{{#can_call}}I'll call in the next week or so to ask whether {{topic}} is on your list this year. If you'd rather I didn't, email or call me and I won't.{{/can_call}}{{^can_call}}If {{topic}} is on your list this year, I'd be glad to hear from you.{{/can_call}}\n\nSincerely,\n\n{{sender_name}}\n{{sender_company}}\n{{sender_address}}\n{{sender_phone}}",
  },
});

const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

export function fill(template, fields) {
  const missing = new Set();
  const val = (k) => String(fields[k] ?? "").trim();
  let out = String(template).replace(/\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, sign, k, inner) => ((sign === "#") === Boolean(val(k)) ? inner : ""));
  out = out.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = val(k);
    if (!v) { missing.add(k); return `[${k}]`; }
    return v;
  });
  return { text: out, missing: [...missing] };
}

// ---------- CSV ----------

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const ALIASES = {
  first_name: ["first_name", "firstname", "first", "given_name"],
  last_name: ["last_name", "lastname", "last", "surname", "family_name"],
  name: ["name", "full_name", "contact", "contact_name"],
  email: ["email", "email_address", "work_email", "e_mail"],
  phone: ["phone", "phone_number", "direct_phone", "mobile", "telephone", "work_phone"],
  company: ["company", "company_name", "organization", "organisation", "account", "account_name"],
  title: ["title", "job_title", "position", "role"],
  address: ["address", "mailing_address", "postal_address", "street_address"],
  state: ["state", "region", "province", "state_province"],
  country: ["country", "country_code"],
  timezone: ["timezone", "time_zone", "tz"],
  trigger: ["trigger", "reason", "note", "notes", "why_now"],
  consent: ["consent", "consent_basis", "lawful_basis", "opt_in"],
  dnc: ["do_not_contact", "dnc", "unsubscribed", "opted_out", "opt_out", "do_not_call", "do_not_email"],
};
const norm = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function readProspects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { prospects: [], columns: {}, unknown: [] };
  const head = rows[0].map(norm);
  const columns = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const i = head.findIndex((h) => names.includes(h));
    if (i >= 0) columns[field] = i;
  }
  const used = new Set(Object.values(columns));
  const unknown = rows[0].filter((_, i) => !used.has(i));
  const prospects = rows.slice(1).map((r, n) => {
    const p = { row: n + 2 };
    for (const [field, i] of Object.entries(columns)) p[field] = String(r[i] ?? "").trim();
    if (!p.first_name && p.name) {
      const parts = p.name.split(/\s+/);
      p.first_name = parts[0];
      if (!p.last_name) p.last_name = parts.slice(1).join(" ");
    }
    return p;
  });
  return { prospects, columns, unknown };
}

// ---------- jurisdiction and time zones ----------

// US states and Canadian provinces to IANA zones. A state that spans two zones lists both, and its call window is
// the overlap, so a call is inside business hours wherever in the state the prospect is.
const US = {
  AL: ["America/Chicago"], AK: ["America/Anchorage"], AZ: ["America/Phoenix"], AR: ["America/Chicago"],
  CA: ["America/Los_Angeles"], CO: ["America/Denver"], CT: ["America/New_York"], DE: ["America/New_York"],
  DC: ["America/New_York"], FL: ["America/New_York", "America/Chicago"], GA: ["America/New_York"],
  HI: ["Pacific/Honolulu"], ID: ["America/Boise", "America/Los_Angeles"], IL: ["America/Chicago"],
  IN: ["America/Indiana/Indianapolis", "America/Chicago"], IA: ["America/Chicago"],
  KS: ["America/Chicago", "America/Denver"], KY: ["America/New_York", "America/Chicago"], LA: ["America/Chicago"],
  ME: ["America/New_York"], MD: ["America/New_York"], MA: ["America/New_York"],
  MI: ["America/Detroit", "America/Chicago"], MN: ["America/Chicago"], MS: ["America/Chicago"],
  MO: ["America/Chicago"], MT: ["America/Denver"], NE: ["America/Chicago", "America/Denver"],
  NV: ["America/Los_Angeles"], NH: ["America/New_York"], NJ: ["America/New_York"], NM: ["America/Denver"],
  NY: ["America/New_York"], NC: ["America/New_York"], ND: ["America/Chicago", "America/Denver"],
  OH: ["America/New_York"], OK: ["America/Chicago"], OR: ["America/Los_Angeles", "America/Boise"],
  PA: ["America/New_York"], RI: ["America/New_York"], SC: ["America/New_York"],
  SD: ["America/Chicago", "America/Denver"], TN: ["America/Chicago", "America/New_York"],
  TX: ["America/Chicago", "America/Denver"], UT: ["America/Denver"], VT: ["America/New_York"],
  VA: ["America/New_York"], WA: ["America/Los_Angeles"], WV: ["America/New_York"], WI: ["America/Chicago"],
  WY: ["America/Denver"], PR: ["America/Puerto_Rico"],
};
const CA = {
  BC: ["America/Vancouver"], AB: ["America/Edmonton"], SK: ["America/Regina"], MB: ["America/Winnipeg"],
  ON: ["America/Toronto", "America/Winnipeg"], QC: ["America/Toronto"], NB: ["America/Moncton"],
  NS: ["America/Halifax"], PE: ["America/Halifax"], NL: ["America/St_Johns"], YT: ["America/Whitehorse"],
  NT: ["America/Yellowknife"], NU: ["America/Iqaluit", "America/Winnipeg", "America/Edmonton"],
};
const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO"]);
const COUNTRY_NAMES = {
  "united states": "US", usa: "US", "u.s.": "US", "u.s.a.": "US", america: "US", canada: "CA",
  "united kingdom": "GB", uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
  "northern ireland": "GB", germany: "DE", france: "FR", spain: "ES", italy: "IT", netherlands: "NL",
  ireland: "IE", belgium: "BE", austria: "AT", sweden: "SE", denmark: "DK", finland: "FI", poland: "PL",
  portugal: "PT", norway: "NO", australia: "AU", "new zealand": "NZ",
};
const TLD = { ca: "CA", uk: "GB", de: "DE", fr: "FR", es: "ES", it: "IT", nl: "NL", ie: "IE", be: "BE", at: "AT", se: "SE", dk: "DK", fi: "FI", pl: "PL", pt: "PT", no: "NO", au: "AU", nz: "NZ" };
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "web.de", "mail.com", "yandex.com", "zoho.com", "btinternet.com", "sky.com", "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "shaw.ca", "rogers.com", "sympatico.ca"]);

export function isValidZone(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

export function regionOf(p) {
  const c = String(p.country || "").trim();
  let country = null;
  if (/^[A-Za-z]{2}$/.test(c)) country = c.toUpperCase() === "UK" ? "GB" : c.toUpperCase();
  else if (c) country = COUNTRY_NAMES[c.toLowerCase()] || null;
  const st = String(p.state || "").trim().toUpperCase();
  if (!country && US[st]) country = "US";
  if (!country && CA[st]) country = "CA";
  const domain = String(p.email || "").split("@")[1]?.toLowerCase() || "";
  if (!country && domain) country = TLD[domain.split(".").pop()] || null;
  let zones = [];
  if (p.timezone && isValidZone(p.timezone)) zones = [p.timezone];
  else if (country === "US" && US[st]) zones = US[st];
  else if (country === "CA" && CA[st]) zones = CA[st];
  const group = country === "US" ? "US" : country === "CA" ? "CA" : country === "GB" ? "UK" : EU.has(country) ? "EU" : country ? "other" : "unknown";
  return { country, group, zones, personalEmail: FREE_MAIL.has(domain), domain };
}

// Minutes east of UTC for `tz` at noon UTC on `dateISO`.
export function zoneOffset(tz, dateISO) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return Math.round((local - d.getTime()) / 60000);
}

const hhmm = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;

// The calling window, in the seller's own time zone, that is inside `from`-`to` (minutes after midnight) local time
// everywhere the prospect could be. Default 9:00-17:00: inside the federal TCPA 8am-9pm window and inside the
// stricter 8am-8pm state windows (Florida, Oklahoma, Maryland and others).
export function callWindow(zones, sellerTz, dateISO, from = 9 * 60, to = 17 * 60) {
  if (!zones.length || !sellerTz) return null;
  const s = zoneOffset(sellerTz, dateISO);
  let start = -Infinity, end = Infinity;
  for (const z of zones) {
    const shift = s - zoneOffset(z, dateISO);
    start = Math.max(start, from + shift);
    end = Math.min(end, to + shift);
  }
  if (end - start < 30) return null;
  return { start, end, startUtc: start - s, endUtc: end - s, label: `${hhmm(start)}–${hhmm(end)}` };
}

// ---------- business days ----------

const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

export function businessDay(startISO, n, holidays = []) {
  const off = new Set(holidays);
  let d = startISO, count = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (weekday(d) !== 0 && weekday(d) !== 6 && !off.has(d)) { count++; if (count === n) return d; }
    d = addDays(d, 1);
  }
  throw new Error("could not schedule within 400 days");
}

// ---------- suppression and gating ----------

const digits = (s) => String(s || "").replace(/\D/g, "");
const phoneKey = (s) => { const d = digits(s); return d.length >= 10 ? d.slice(-10) : d; };
const TRUTHY = /^(y|yes|true|1|x|unsubscribed|opted[ _-]?out|dnc|do not contact|bounced)$/i;

export function readSuppression(text) {
  const emails = new Set(), domains = new Set(), phones = new Set();
  for (const raw of String(text || "").split(/[\n,;]+/)) {
    const v = raw.trim().toLowerCase().replace(/^mailto:/, "");
    if (!v) continue;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) emails.add(v);
    else if (/^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) domains.add(v.replace(/^@/, ""));
    else if (digits(v).length >= 7) phones.add(phoneKey(v));
  }
  return { emails, domains, phones, size: emails.size + domains.size + phones.size };
}

/** Decide, for one prospect, whether to contact them at all and on which channels. */
export function gate(p, suppression, seen = new Set()) {
  const out = { excluded: null, drop: {}, warnings: [] };
  const email = String(p.email || "").toLowerCase();
  const r = regionOf(p);
  out.region = r;
  if (TRUTHY.test(String(p.dnc || "").trim())) { out.excluded = "marked do-not-contact in your list"; return out; }
  if (email && suppression.emails.has(email)) { out.excluded = "email is on your suppression list"; return out; }
  if (r.domain && suppression.domains.has(r.domain)) { out.excluded = `domain ${r.domain} is on your suppression list`; return out; }
  if (p.phone && suppression.phones.has(phoneKey(p.phone))) { out.excluded = "phone is on your suppression list"; return out; }
  if (email && seen.has(email)) { out.excluded = "duplicate of an earlier row"; return out; }
  if (email) seen.add(email);
  if (!email && !p.phone && !p.address) { out.excluded = "no email, phone or postal address"; return out; }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.drop.email = "the email address is not valid";
  if (!email) out.drop.email = "no email address";
  if (!p.phone) out.drop.call = "no phone number";
  else if (digits(p.phone).length < 7) out.drop.call = "the phone number is too short";
  if (!p.address) out.drop.letter = "no postal address";
  const consent = String(p.consent || "").trim();
  if (r.group === "CA" && !consent && !out.drop.email) out.drop.email = "Canada (CASL): commercial email needs express or implied consent; record it in the consent column";
  if (r.group === "EU" && !consent && !out.drop.email) out.drop.email = "EU: several member states (Germany among them) require prior consent even for business email; record the basis in the consent column";
  if (r.group === "UK" && r.personalEmail && !consent && !out.drop.email) out.drop.email = "UK (PECR): a personal address is treated as an individual, who must opt in first";
  if (r.group === "US" && r.personalEmail && !p.company) out.warnings.push("Looks like a consumer, not a business: check the National Do Not Call Registry and your state's list before calling.");
  if (r.group === "UK" && !out.drop.call) out.warnings.push("UK: screen the number against TPS/CTPS before a sales call.");
  if (r.group === "CA" && !out.drop.call) out.warnings.push("Canada: check the National DNCL before a sales call unless it is business-to-business.");
  if (r.group === "EU" && !consent) out.warnings.push("EU: keep a record of your lawful basis (GDPR) for holding this contact.");
  if (r.group === "unknown") out.warnings.push("Country unknown: add a country or state column so the right rules are applied.");
  if (!out.drop.call && !r.zones.length) out.drop.call = "time zone unknown: add a state or timezone column so calls land in their business hours";
  return out;
}

// ---------- message checks ----------

const OPT_OUT = /(unsubscribe|opt[- ]?out|no thanks|won't email you again|will not email you again|not contact you again|rather not hear)/i;
const ADDRESS = /\d+.*\b(street|st\.?|road|rd\.?|avenue|ave\.?|suite|ste\.?|box|lane|ln\.?|drive|dr\.?|way|blvd|boulevard|place|pl\.?|court|ct\.?)\b/i;

export function checkMessage(channel, msg, ctx = {}) {
  const errors = [], warnings = [];
  const body = String(msg.body || "");
  const all = `${msg.subject || ""}\n${body}\n${msg.voicemail || ""}`;
  const placeholders = [...new Set(all.match(/\[[a-z_]+\]/g) || [])];
  if (placeholders.length) errors.push(`Fill in ${placeholders.join(", ")} before using this.`);
  if (channel === "email") {
    if (/^\s*(re|fwd?|fw)\s*:/i.test(msg.subject || "")) errors.push("Subject starts with Re: or Fwd: but this is not a reply (a deceptive subject line breaks CAN-SPAM).");
    if (!ADDRESS.test(body) && !/\bP\.?O\.? Box\b/i.test(body)) errors.push("Add your valid postal address (CAN-SPAM).");
    if (!OPT_OUT.test(body)) errors.push("Add a clear way to opt out (CAN-SPAM, PECR, CASL).");
    const words = body.split(/\s+/).filter(Boolean).length;
    if (words > 180) warnings.push(`${words} words: cold emails over about 150 words get fewer replies.`);
  }
  if (channel === "linkedin") {
    if (body.length > 300) errors.push(`${body.length} characters: LinkedIn caps a connection note at 300.`);
    else if (body.length > 200) warnings.push(`${body.length} characters: free LinkedIn accounts get a shorter note limit than 300.`);
  }
  if (channel === "call" && msg.voicemail) {
    const words = msg.voicemail.split(/\s+/).filter(Boolean).length;
    if (words > 80) warnings.push(`Voicemail is ${words} words, over 30 seconds: shorten it.`);
  }
  if (/(act now|last chance|only \d+ (left|spots)|expires (today|tonight)|\burgent\b|final notice)/i.test(all)) warnings.push("Remove the fake-urgency wording.");
  if (/(guarantee[sd]?|100%|risk[- ]free|#1\b|best in the (world|industry))/i.test(all)) warnings.push("Soften or prove the absolute claim (FTC and ASA rules on misleading claims).");
  if (ctx.sourceText != null) {
    const allowed = new Set((String(ctx.sourceText).match(/\d[\d,.]*%?/g) || []).map((n) => n.replace(/[,.]$/, "")));
    const stray = (all.match(/\d[\d,.]*%?/g) || []).map((n) => n.replace(/[,.]$/, "")).filter((n) => !allowed.has(n));
    if (stray.length) errors.push(`States numbers that are not in your inputs: ${[...new Set(stray)].slice(0, 4).join(", ")}.`);
  }
  return { errors, warnings };
}

export function emailFooter(sender) {
  const who = [sender.sender_name, sender.sender_company].filter(Boolean).join(", ") || "[sender_name]";
  return `\n\n--\n${who}\n${sender.sender_address || "[sender_address]"}\nNot the right person, or rather not hear from me? Reply "no thanks" and I won't email you again.`;
}

// ---------- the plan ----------

export const DEFAULT_SENDER = Object.freeze({ cta: "a 15-minute call next week" });

/**
 * prospectsCsv: the user's own list. sender: { sender_name, sender_company, sender_address, sender_phone, topic,
 * offer, outcome, proof, cta }. opts: { cadence, start (YYYY-MM-DD), sellerTz, holidays: [], suppression: text,
 * callFrom, callTo (minutes after midnight, prospect local) }.
 */
export function buildPlan(prospectsCsv, sender, opts = {}) {
  const cadence = CADENCES[opts.cadence || "b2b-classic"];
  if (!cadence) throw new Error(`unknown cadence: ${opts.cadence}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.start || "")) throw new Error("start must be a date like 2026-10-26");
  const sellerTz = opts.sellerTz && isValidZone(opts.sellerTz) ? opts.sellerTz : null;
  const s = { ...DEFAULT_SENDER, ...Object.fromEntries(Object.entries(sender || {}).filter(([, v]) => String(v ?? "").trim())) };
  const { prospects, columns, unknown } = readProspects(prospectsCsv);
  const suppression = readSuppression(opts.suppression);
  const seen = new Set();
  const people = [], tasks = [];
  for (const p of prospects) {
    const g = gate(p, suppression, seen);
    const person = { ...p, region: g.region.group, country: g.region.country, zones: g.region.zones, excluded: g.excluded, dropped: g.drop, warnings: g.warnings, touches: 0 };
    people.push(person);
    if (g.excluded) continue;
    const fields = { ...s, ...p, can_email: g.drop.email ? "" : "yes", can_call: g.drop.call ? "" : "yes" };
    cadence.steps.forEach((step, i) => {
      if (g.drop[step.channel]) return;
      const date = businessDay(opts.start, step.day, opts.holidays || []);
      const key = step.template === "proof" && !String(s.proof || "").trim() ? "referral" : step.template;
      const t = TEMPLATES[key];
      const task = { date, step: i + 1, day: step.day, channel: step.channel, template: key, prospect: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || `row ${p.row}`, company: p.company || "", email: p.email || "", phone: p.phone || "", row: p.row };
      const body = fill(t.body, fields);
      task.body = body.text;
      if (t.subject) task.subject = cap(fill(t.subject, fields).text);
      if (t.voicemail) task.voicemail = fill(t.voicemail, fields).text;
      if (step.channel === "email") task.body += emailFooter(s);
      if (step.channel === "call") {
        task.window = callWindow(g.region.zones, sellerTz, date, opts.callFrom, opts.callTo);
        if (!task.window) task.windowNote = sellerTz ? "No overlap with their business hours on this day." : "Set your own time zone to see when to call.";
      }
      task.check = checkMessage(step.channel, task);
      task.warnings = g.warnings;
      tasks.push(task);
      person.touches++;
    });
  }
  tasks.sort((a, b) => a.date.localeCompare(b.date) || (a.window?.start ?? 0) - (b.window?.start ?? 0) || a.row - b.row || a.step - b.step);
  const byChannel = {};
  for (const t of tasks) byChannel[t.channel] = (byChannel[t.channel] || 0) + 1;
  const blocked = tasks.filter((t) => t.check.errors.length).length;
  const included = people.filter((p) => !p.excluded).length;
  return {
    cadence: opts.cadence || "b2b-classic", people, tasks, columns, unknown,
    summary: { prospects: people.length, included, excluded: people.length - included, tasks: tasks.length, byChannel, blocked, first: tasks[0]?.date || null, last: tasks.at(-1)?.date || null, suppressionSize: suppression.size },
  };
}

// ---------- exports ----------

const guard = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };
const csvCell = (v) => { const s = guard(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function toCsv(tasks) {
  const cols = ["date", "call_window", "channel", "step", "prospect", "company", "email", "phone", "subject", "body", "voicemail", "issues"];
  const lines = [cols.join(",")];
  for (const t of tasks) {
    lines.push([t.date, t.window?.label || t.windowNote || "", t.channel, t.step, t.prospect, t.company, t.email, t.phone, t.subject || "", t.body, t.voicemail || "", [...t.check.errors, ...t.check.warnings].join(" | ")].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

const icsText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "", limit = 75;
  for (const ch of line) {
    if (enc.encode(cur + ch).length > limit) { out.push(cur); cur = ""; limit = 74; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const stamp = (iso, minutesUtc) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMinutes(minutesUtc);
  return d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
};

/** An iCalendar file of the plan: timed events for calls (start of the window, 15 minutes), all-day for the rest. */
export function toIcs(tasks, opts = {}) {
  const now = (opts.now || new Date().toISOString()).replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//monorepo-projects//sales-cadence-builder//EN", "CALSCALE:GREGORIAN"];
  tasks.forEach((t, i) => {
    lines.push("BEGIN:VEVENT", `UID:${t.date.replace(/-/g, "")}-${t.row}-${t.step}-${i}@sales-cadence-builder`, `DTSTAMP:${now}`);
    if (t.window) lines.push(`DTSTART:${stamp(t.date, t.window.startUtc)}`, `DTEND:${stamp(t.date, t.window.startUtc + 15)}`);
    else lines.push(`DTSTART;VALUE=DATE:${t.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(t.date, 1).replace(/-/g, "")}`);
    const what = `${CHANNEL_LABELS[t.channel]}: ${t.prospect}${t.company ? ` (${t.company})` : ""}`;
    const desc = [t.window ? `Call between ${t.window.label} your time.` : "", t.phone ? `Phone: ${t.phone}` : "", t.email ? `Email: ${t.email}` : "", t.subject ? `Subject: ${t.subject}` : "", t.body, t.voicemail ? `Voicemail: ${t.voicemail}` : ""].filter(Boolean).join("\n\n");
    lines.push(fold(`SUMMARY:${icsText(what)}`), fold(`DESCRIPTION:${icsText(desc)}`), "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

// ---------- example ----------

export const SAMPLE_PROSPECTS = `first_name,last_name,title,company,email,phone,state,country,address,trigger,consent,do_not_contact
Dana,Reyes,Head of Operations,Brightline Logistics,dana.reyes@brightline.example,(303) 555-0142,CO,US,"1200 Market St, Denver, CO 80202",you opened a second depot in Aurora,,
Marcus,Lee,VP Operations,Harbor Freight Lines,marcus@harborlines.example,(512) 555-0199,TX,US,,,,
Priya,Shah,Fleet Manager,Northstar Couriers,priya@northstar.example,(416) 555-0110,ON,CA,,you are hiring two dispatchers,,
Tom,Becker,Logistikleiter,Becker Transporte,t.becker@becker-transporte.example,,,DE,,,,
Ana,Costa,Owner,Costa Delivery,ana.costa@gmail.com,(305) 555-0123,FL,US,,,,
Leo,Park,COO,Quickroute,leo@quickroute.example,(206) 555-0175,WA,US,,,,yes
Dana,Reyes,Head of Operations,Brightline Logistics,dana.reyes@brightline.example,(303) 555-0142,CO,US,,,,
`;

export const SAMPLE_SENDER = Object.freeze({
  sender_name: "Sam Ortiz",
  sender_company: "RouteLoop",
  sender_address: "500 Main Street, Suite 210, Boulder, CO 80302",
  sender_phone: "(720) 555-0188",
  topic: "route planning",
  offer: "RouteLoop plans delivery routes for regional fleets.",
  outcome: "spend less time building routes by hand",
  proof: "",
  cta: "a 15-minute call next week",
});
