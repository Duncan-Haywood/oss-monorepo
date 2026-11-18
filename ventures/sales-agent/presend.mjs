// Pre-send check for a cold outreach email (2026-11-03). Pure rules, no network, nothing sent.
// It reads the subject, body and the recipient's country and lists what to fix before the first
// touch goes out. It is a checklist of well-known requirements and habits, not legal advice:
// each finding says which rule it comes from so a person can look it up.
import { checkDraft } from "./engine.mjs";

// Regimes by recipient country (ISO 3166 alpha-2). Only the broad shape, because the exact test
// (consumer or business, corporate subscriber, existing relationship) is a legal call.
const EU_CONSENT = new Set(["DE", "AT", "IT", "ES", "NL", "BE", "FR", "DK", "SE", "FI", "IE", "PL", "PT", "CZ", "GR", "HU", "RO", "BG", "HR", "SK", "SI", "LT", "LV", "EE", "LU", "MT", "CY"]);
export const REGIMES = {
  US: "CAN-SPAM: opt-out and a postal address are required; B2B is allowed without prior consent.",
  CA: "CASL: commercial messages need consent (express, or implied in narrow cases) plus sender identity and an unsubscribe mechanism.",
  GB: "PECR: to a company address you may send B2B marketing if you identify yourself and offer an opt-out; to a sole trader or partnership treat it like a consumer.",
  DE: "UWG section 7: unsolicited marketing email needs prior consent, including to businesses. Hold cold email.",
  AT: "TKG section 174: unsolicited marketing email needs prior consent. Hold cold email.",
  AU: "Spam Act 2003 (from memory, statute unread): commercial email needs consent (express, or inferred from a published work address related to your offer), a clear sender identity and a working unsubscribe. Hold cold email unless the address is published for business contact.",
  NZ: "Unsolicited Electronic Messages Act 2007 (from memory, statute unread): needs consent (a published work address can imply it), sender identity and an unsubscribe facility.",
  FR: "CPCE L34-5 and CNIL guidance (from memory, texts unread): B2B email to a professional address is tolerated if the offer relates to the person's role, they were told at collection and can opt out for free. Otherwise hold.",
  CH: "UWG art. 3(1)(o) (from memory, text unread): mass advertising email needs prior consent, a sender identity and a free opt-out. Hold cold email.",
  EU: "ePrivacy rules differ by country; many want consent or an existing relationship. Check the recipient's country before sending."
};
// Country names and common spellings people type instead of the 2-letter code (found 2026-11-09:
// "Germany" fell through to "no rule recorded", so a consent hold was silently lost).
const COUNTRY_NAMES = {
  "united states": "US", "united states of america": "US", usa: "US", america: "US",
  "united kingdom": "GB", uk: "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB",
  canada: "CA", germany: "DE", deutschland: "DE", austria: "AT", "osterreich": "AT", "österreich": "AT",
  australia: "AU", "new zealand": "NZ", switzerland: "CH", schweiz: "CH", suisse: "CH", france: "FR",
  italy: "IT", italia: "IT", spain: "ES", "españa": "ES", espana: "ES", netherlands: "NL", "the netherlands": "NL", holland: "NL",
  belgium: "BE", denmark: "DK", sweden: "SE", finland: "FI", ireland: "IE", poland: "PL", portugal: "PT",
  "czech republic": "CZ", czechia: "CZ", greece: "GR", hungary: "HU", romania: "RO", bulgaria: "BG", croatia: "HR",
  slovakia: "SK", slovenia: "SI", lithuania: "LT", latvia: "LV", estonia: "EE", luxembourg: "LU", malta: "MT", cyprus: "CY",
  "european union": "EU", europe: "EU"
};
export function regime(country) {
  const raw = String(country || "").trim().replace(/\.$/, "").replace(/\s+/g, " ");
  const c = (COUNTRY_NAMES[raw.toLowerCase()] || raw).toUpperCase();
  if (!c) return { code: "", kind: "unknown", text: "No recipient country given, so only the checks that apply everywhere ran." };
  if (c === "UK") return regime("GB");
  if (REGIMES[c]) return { code: c, kind: c === "DE" || c === "AT" || c === "CA" || c === "AU" || c === "NZ" || c === "CH" ? "consent" : "notice", text: REGIMES[c] };
  if (EU_CONSENT.has(c)) return { code: c, kind: "consent", text: REGIMES.EU };
  return { code: c, kind: "unknown", text: `No rule of thumb recorded for ${c}; check local law before sending.` };
}

const POSTAL = /\b\d{1,6}\s+[\w.'-]+(\s+[\w.'-]+){0,4}\s+(st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|way|ct|court|pl|place|suite|ste|floor|box|strasse|straße|rue|calle)\b|\bP\.?O\.?\s*Box\s*\d+|\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b|\b\d{5}-\d{4}\b|,\s*[A-Za-z]{2}\s+\d{5}\b|\b[\wäöüß.-]*(str\.|straße|strasse|gasse|platz|allee|weg|laan|straat)\s*\d+[a-z]?\b|,\s*\d{4,5}\s+[A-ZÄÖÜ][\wäöüß-]+/i;
const OPT_OUT = /unsubscribe|opt[- ]?out|not hear from me|stop (emailing|contacting|these)|reply (with )?['\"“‘]?(stop|no)\b|(say|tell me|let me know|write) ?(me )?(to )?['\"“‘]?stop|remove (me|you)\b|take (me|you) off|no more (emails|messages)|abmelden|austragen|se désabonner|désinscri|darse de baja|cancelar suscripci/i;
const FAKE_FWD = /^\s*(re|fw|fwd)\s*:/i;
const DECEPTIVE = [[/\b(your (invoice|order|payment|account|package)|security alert|action required|urgent)\b/i, "Subject looks like a transactional or alarm message; CAN-SPAM bans deceptive subject lines"], [/\bfree (gift|trial|money)\b/i, "Subject leads with a free offer; make sure the body delivers exactly that"]];
const SHOUT = /[A-Z]{4,}(\s+[A-Z]{4,}){1,}/;

/**
 * @param {{subject?:string, body?:string, country?:string, fromName?:string, isReply?:boolean, facts?:string}} m
 * @returns {{ok:boolean, score:number, errors:{rule:string,text:string}[], warnings:{rule:string,text:string}[], regime:object, words:number}}
 */
export function presend(m = {}) {
  const subject = String(m.subject || ""), body = String(m.body || "");
  const errors = [], warnings = [];
  const e = (rule, text) => errors.push({ rule, text }), w = (rule, text) => warnings.push({ rule, text });
  const rg = regime(m.country);

  if (!body.trim()) e("empty", "The body is empty.");
  if (!subject.trim()) e("subject", "No subject line.");

  // Reuse the draft checker for its numbers, spam phrases, placeholders and opt-out rules.
  const base = checkDraft({ subject, body }, m.facts == null ? body : m.facts);
  for (const t of base.errors) {
    if (/opt out/i.test(t)) continue; // handled below with more detail
    if (/^States "/.test(t) && m.facts == null) continue; // numbers are only checked against facts the user supplies
    e(/placeholder/i.test(t) ? "placeholder" : /^Remove/.test(t) ? "spam-phrase" : /Re:/.test(t) ? "fake-re" : "claim", t);
  }
  for (const t of base.warnings) w(/word/.test(t) ? "length" : "filler", t);

  if (!OPT_OUT.test(body)) e("opt-out", "No opt-out line. CAN-SPAM, PECR and CASL all need a working way to say stop; one plain sentence is enough.");
  if (!POSTAL.test(body)) {
    const us = rg.code === "US" || !rg.code;
    (us ? e : w)("postal-address", "No postal address found. CAN-SPAM requires a valid physical postal address in commercial email; CASL and PECR also want the sender's contact details.");
  }
  if (FAKE_FWD.test(subject) && !m.isReply) e("fake-re", `Subject starts with "${subject.match(FAKE_FWD)[0].trim()}" but this is a first touch; that is a deceptive subject line.`);
  for (const [re, why] of DECEPTIVE) if (re.test(subject)) w("deceptive-subject", why + ` ("${subject.match(re)[0]}")`);
  if (SHOUT.test(subject)) w("shouting", "Subject has several all-caps words; it reads as spam and trips filters.");
  if ((subject.match(/[!?]{2,}|!/g) || []).length > 1) w("punctuation", "More than one exclamation mark in the subject.");
  if (subject.length > 70) w("subject-length", `Subject is ${subject.length} characters; phones cut it near 40 to 60.`);
  if (m.fromName && !new RegExp(String(m.fromName).split(/\s+/)[0].replace(/[^\p{L}\d]/gu, ""), "i").test(body)) w("identity", "The sender's name does not appear in the body; say who you are.");

  const links = body.match(/https?:\/\/\S+/gi) || [];
  if (links.length > 2) w("links", `${links.length} links; one is plenty in a first touch, and more raise spam scores.`);
  if (/\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly)\//i.test(body)) w("shortener", "A link shortener hides the destination and is a common spam signal.");
  if (/<img[^>]*\b(width|height)\s*=\s*["']?1["'\s>]/i.test(body)) w("tracking", "A tracking pixel needs disclosure in the EU and UK, and costs deliverability.");
  const asks = (body.match(/\?/g) || []).length;
  if (asks === 0) w("ask", "No question. A first touch with no clear ask gets no reply.");
  else if (asks > 3) w("ask", `${asks} questions; pick one.`);
  if (!/\b(you|your|you're)\b/i.test(body)) w("self-centred", "Never mentions the reader (you, your).");
  if (/^(hi|hello|dear)\s*[,\n]|^(hi|hello|dear) (there|sir|madam|sir\/madam|friend)\b/i.test(body.trim())) w("generic-greeting", "Generic greeting; use their first name or drop the greeting.");

  if (rg.kind === "consent") w("consent", rg.text);
  else if (rg.kind === "notice" && rg.code) w("regime", rg.text);

  const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);
  return { ok: errors.length === 0, score, errors, warnings, regime: rg, words: body.split(/\s+/).filter(Boolean).length };
}
