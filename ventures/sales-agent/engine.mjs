// Sales Agent, milestone 1: the inbox agent. It reads the replies your outreach got back, decides what each one
// means, applies the changes that only ever reduce contact (suppress, stop, pause) and queues everything that would
// contact someone (a reply draft, a new contact) for you to approve. One principle runs through the code:
//
//   The agent may always do less on its own. It may never do more without you.
//
// No network, no dependencies; the same file runs in a page, in Node and in a server. ai.mjs adds an optional model
// on the user's own key, under the same rules.
import { guess as nbGuess } from "./learn.mjs";

export const DAY = 86_400_000;

// Categories, ordered by how much contact they lead to (0 = none). A model may move a reply to a category with the
// same or a lower rank than the rules gave, never a higher one (see ai.mjs, mergeTriage).
export const CATEGORIES = Object.freeze({
  unsubscribe: { rank: 0, label: "Unsubscribe / stop", outbound: false },
  bounce: { rank: 0, label: "Bounced", outbound: false },
  not_interested: { rank: 1, label: "Not interested", outbound: false },
  left_company: { rank: 1, label: "Left / wrong person", outbound: false },
  out_of_office: { rank: 2, label: "Out of office", outbound: false },
  not_now: { rank: 2, label: "Not now", outbound: true },
  objection: { rank: 3, label: "Objection", outbound: true },
  question: { rank: 3, label: "Question", outbound: true },
  interested: { rank: 4, label: "Interested / meeting", outbound: true },
  unclear: { rank: 4, label: "Unclear: read it yourself", outbound: false },
});

// ---------- dates (UTC days, YYYY-MM-DD) ----------

export const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const toDay = (s) => { const t = Date.parse(String(s).slice(0, 10) + "T00:00:00Z"); return Number.isFinite(t) ? t : NaN; };
export function addBusinessDays(day, n) {
  let t = toDay(day), left = n;
  while (left > 0) { t += DAY; const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return iso(t);
}
const addDays = (day, n) => iso(toDay(day) + n * DAY);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2, few: 3 };

// The next date on or after `today` with this month and day (year rolls forward if it has passed).
function nextMonthDay(today, m, d) {
  const y = new Date(toDay(today)).getUTCFullYear();
  for (const yr of [y, y + 1]) { const t = Date.UTC(yr, m, d); if (t >= toDay(today)) return iso(t); }
  return iso(Date.UTC(y + 1, m, d));
}

/**
 * Find a "come back" date in a sentence, relative to `today`. Returns { date, text } or null. Understands month and
 * day ("March 3", "3 March", "the 14th"), numeric dates (3/14, 2026-03-14), weekdays ("Monday"), "next week",
 * "in two weeks/months", "next month", "next quarter", "Q1".."Q4", a bare month ("in January", "after June"),
 * "next year", "after the holidays" and "end of the month/quarter/year".
 */
export function findDate(text, today) {
  const r = findDateLower(text, today);
  if (!r) return null;
  const at = String(text).toLowerCase().indexOf(r.text); // report the words as the person wrote them ("Q1", "March 3")
  return at < 0 ? r : { ...r, text: String(text).slice(at, at + r.text.length) };
}

function findDateLower(text, today) {
  const s = String(text).toLowerCase();
  let m;
  if ((m = s.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/))) return { date: `${m[1]}-${m[2]}-${m[3]}`, text: m[0] };
  if ((m = s.match(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`)))) return { date: nextMonthDay(today, MONTHS.indexOf(m[1].slice(0, 3)), +m[2]), text: m[0] };
  if ((m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`)))) return { date: nextMonthDay(today, MONTHS.indexOf(m[2].slice(0, 3)), +m[1]), text: m[0] };
  if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const mo = +m[1] - 1, d = +m[2]; // US order; a day over 12 in the first place means day/month
    const [mm, dd] = mo > 11 ? [d - 1, mo + 1] : [mo, d];
    if (mm >= 0 && mm < 12 && dd >= 1 && dd <= 31) {
      if (m[3]) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return { date: iso(Date.UTC(y, mm, dd)), text: m[0] }; }
      return { date: nextMonthDay(today, mm, dd), text: m[0] };
    }
  }
  if ((m = s.match(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/))) {
    const t = new Date(toDay(today)), d = +m[1];
    let cand = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), d);
    if (cand < toDay(today)) cand = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, d);
    return { date: iso(cand), text: m[0] };
  }
  if ((m = s.match(/\b(?:in|for)\s+(\d+|a|an|one|two|three|four|five|six|a couple of|couple of|a few|few)\s+(day|week|month)s?\b/))) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : NUM_WORDS[m[1].replace(/^a\s+|\s+of$/g, "").trim()] || 2;
    const date = m[2] === "day" ? addDays(today, n) : m[2] === "week" ? addDays(today, 7 * n) : (() => { const t = new Date(toDay(today)); return iso(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + n, t.getUTCDate())); })();
    return { date, text: m[0] };
  }
  if ((m = s.match(/\bnext week\b/))) { const w = new Date(toDay(today)).getUTCDay(); return { date: addDays(today, ((8 - w) % 7) || 7), text: m[0] }; }
  if ((m = s.match(/\bnext month\b/))) { const t = new Date(toDay(today)); return { date: iso(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1)), text: m[0] }; }
  if ((m = s.match(/\b(?:next|new)\s+(?:fiscal\s+)?year\b|\bafter the (?:holidays|new year)\b|\bin the new year\b/))) { const y = new Date(toDay(today)).getUTCFullYear(); return { date: iso(Date.UTC(y + 1, 0, 6)), text: m[0] }; }
  if ((m = s.match(/\bq([1-4])\b/))) { const q = +m[1] - 1, t = new Date(toDay(today)); let y = t.getUTCFullYear(); if (Date.UTC(y, q * 3, 1) < toDay(today)) y++; return { date: iso(Date.UTC(y, q * 3, 1)), text: m[0] }; }
  if ((m = s.match(/\bnext quarter\b/))) { const t = new Date(toDay(today)); const q = Math.floor(t.getUTCMonth() / 3) + 1; return { date: iso(Date.UTC(t.getUTCFullYear(), q * 3, 1)), text: m[0] }; }
  if ((m = s.match(/\bend of (?:the )?(month|quarter|year)\b/))) {
    const t = new Date(toDay(today)), y = t.getUTCFullYear(), mo = t.getUTCMonth();
    const end = m[1] === "month" ? Date.UTC(y, mo + 1, 1) : m[1] === "quarter" ? Date.UTC(y, (Math.floor(mo / 3) + 1) * 3, 1) : Date.UTC(y + 1, 0, 1);
    return { date: iso(end), text: m[0] };
  }
  if ((m = s.match(/\b(spring|summer|fall|autumn|winter)\b/))) return { date: nextMonthDay(today, { spring: 2, summer: 5, fall: 8, autumn: 8, winter: 11 }[m[1]], 1), text: m[0] };
  if ((m = s.match(new RegExp(`\\b(?:in|after|until|till|around|by|early|mid|late)\\s+(?:early\\s+|mid\\s+|late\\s+)?${MONTH_RE}\\b`)))) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3)), after = /^(after|until|till)/.test(m[0]);
    return { date: nextMonthDay(today, after ? (mo + 1) % 12 : mo, 1), text: m[0] };
  }
  if ((m = s.match(/\b(?:on|until|till|back|returning)\s+(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    const want = WEEKDAYS.indexOf(m[1]), w = new Date(toDay(today)).getUTCDay();
    return { date: addDays(today, ((want - w + 7) % 7) || 7), text: m[0] };
  }
  return null;
}

// ---------- parsing ----------

const EMAIL_RE = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Remove quoted history and signatures so only what the person wrote is read. */
export function stripQuoted(body) {
  const lines = String(body).split(/\r?\n/);
  const out = [];
  const quoted = (l) => /^\s*>/.test(l);
  // "On <date>, <name> wrote:" can wrap over up to three lines ("...<a@b.c>wrote:" included).
  const attribution = (i) => {
    if (!/^\s*On\s.{3,120}/i.test(lines[i])) return 0;
    for (let n = 1; n <= 3 && i + n <= lines.length; n++) {
      if (/\bwrote:\s*$/i.test(lines.slice(i, i + n).join(" "))) return n;
    }
    return 0;
  };
  // Other languages ("schrieb:", "a écrit :", "написал:") have no fixed first word, so they count only when a quote follows.
  const WROTE = /(?:schrieb|a écrit|ha scritto|escribió|escreveu|schreef|skrev|kirjoitti|napisał|написал[аи]?|пишет|écrit)(?:\s[^:]{0,80})?\s*:\s*$/i;
  const foreignAttribution = (i) => {
    if (quoted(lines[i]) || !/[\d@]/.test(lines[i])) return 0; // an attribution names a date or an address
    for (let n = 1; n <= 3 && i + n <= lines.length; n++) {
      const joined = lines.slice(i, i + n).join(" ");
      if (joined.length > 200) break;
      if (WROTE.test(joined)) return n;
    }
    return 0;
  };
  const nextIsQuote = (i) => { while (i < lines.length && !lines[i].trim()) i++; return i < lines.length && quoted(lines[i]); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (quoted(line)) continue;
    let n = attribution(i);
    if (!n) { n = foreignAttribution(i); if (n && !nextIsQuote(i + n)) n = 0; }
    if (n) {
      // A reply typed under the quote (bottom-posted or between quoted paragraphs) is still the reply.
      if (nextIsQuote(i + n)) { i += n - 1; continue; }
      break;
    }
    if (/^-{2,}\s*(original|forwarded) message/i.test(line) || /^\s*[*_]*(From|Sent|De|Von)[*_]*:[*_]*\s.+/i.test(line) && out.some((l) => l.trim()) || /^-- ?$/.test(line) || /^_{5,}$/.test(line) || /^\s*-{5,}\s*$/.test(line) && out.some((l) => l.trim()) || /^Sent from my (iphone|ipad|android|phone|mobile)/i.test(line.trim())) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Split pasted replies into messages. Messages are separated by a line of three or more dashes, or each one starts
 * with a `From:` header. Headers read: From, Subject, Date. Returns [{ from, name, subject, date, body, raw }].
 */
export function parseReplies(text) {
  const src = String(text || "").replace(/\r\n/g, "\n");
  let blocks = src.split(/\n\s*-{3,}\s*\n/);
  if (blocks.length === 1) blocks = src.split(/\n(?=From:\s)/i);
  const out = [];
  for (const b of blocks) {
    const raw = b.trim();
    if (!raw) continue;
    const lines = raw.split("\n"), head = {};
    let i = 0;
    while (i < lines.length && /^(from|subject|date|to|cc|x-signal|x-failed-recipient):\s*/i.test(lines[i])) { const [, k, v] = lines[i].match(/^([\w-]+):\s*(.*)$/); head[k.toLowerCase()] = v.trim(); i++; }
    const body = stripQuoted(lines.slice(i).join("\n"));
    const from = (head.from || "").match(EMAIL_RE)?.[0]?.toLowerCase() || "";
    const name = (head.from || "").replace(/<[^>]*>/, "").replace(EMAIL_RE, "").replace(/["']/g, "").trim();
    out.push({ from, name, subject: head.subject || "", date: head.date || "", body, raw, ...(head["x-signal"] ? { signal: head["x-signal"] } : {}), ...(head["x-failed-recipient"] ? { failed: head["x-failed-recipient"].toLowerCase() } : {}) });
  }
  return out;
}

/** Small CSV reader: quoted fields, commas and newlines inside quotes. Returns rows of objects keyed by lower-case header. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  const s = String(text || "").replace(/^\uFEFF/, "");
  // Excel in many locales saves ";"-separated CSV: pick the separator that the header line uses more.
  const first = s.split(/\r?\n/)[0] || "";
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const clean = rows.filter((r) => r.some((c) => c.trim()));
  if (!clean.length) return [];
  const head = clean[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, j) => [h, (r[j] ?? "").trim()])));
}

// A cell that starts with = + - @ is run as a formula by spreadsheets; prefix it so it stays text.
const cell = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows, cols) => [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";

// ---------- triage ----------

const sentences = (t) => String(t).replace(/\s+/g, " ").split(/(?<=[.!?])\s+|\s+[-–—]\s+/).map((x) => x.trim()).filter(Boolean);
const P = (re) => new RegExp(re, "i");

const RULES = {
  unsubscribe: [
    P("\\bunsubscribed?\\b"), P("^\\s*remove\\.?\\s*$"), P("\\b(delete|remove|erase) (my|our) (contact )?(details|data|info|information|email|address|number)\\b"), P("\\bstop (sending|contacting|emailing|messaging)\\b"),
    P("\\bunsubscribe\\b"), P("\\bremove (me|us|my (email|address|name))\\b"), P("\\btake (me|us) off\\b"), P("\\b(stop|quit|cease) (emailing|contacting|messaging|sending|reaching out)\\b"),
    P("\\b(do not|don'?t|dont|never) (contact|email|e-mail|message|reach out to) (me|us|again)\\b"), P("\\bopt(ed)?[ -]?out\\b"), P("\\bopt (me|us) out\\b"), P("\\bremove (it|them|this|my \\w+|our \\w+) from\\b"), P("\\b(from|off) your (database|list|mailing list|system|crm)\\b"), P("^\\s*stop\\.?\\s*$"),
    P("\\b(don'?t|do not) (email|contact|write to) me\\b"), P("\\bno more (emails|messages)\\b"), P("\\bstop spamming\\b"), P("\\bthis is spam\\b"), P("\\bgdpr\\b.*\\b(delete|erase|erasure|remove)"),
    P("\\b(delete|erase) (my|our) (data|details|information)\\b"), P("\\bmark(ing)? (this|you) as spam\\b"), P("\\breport(ing)? (this|you) as spam\\b"), P("\\bnot interested,? (please )?(stop|remove)"),
    // Added 2026-10-25 after a fourth set missed 9 of 18 unsubscribes: bare "please stop", "leave me alone", "strike me from",
    // "don't write again", "never gave you permission", "unsub", and FR/DE/ES "no longer receive/send" phrasings.
    P("^\\s*(please )?stop( it| please)?[.!]*\\s*$"), P("\\bleave (me|us) alone\\b"), P("\\b(strike|drop|purge|scrub) (me|us|my \\w+) from\\b"), P("\\b(don'?t|do not|never) (write|call|text|bother) (to )?(me|us)?\\s*(again|anymore|any more)\\b"),
    P("\\b(never|didn'?t|did not) (gave|give|given|opt(ed)? in|sign(ed)? up|consent|agree)\\b.*\\b(permission|consent|to (this|your))"), P("\\bunsub\\b"), P("\\btake (it|my \\w+|this) off\\b"), P("\\bwhat(ever)? list you\\b"),
    P("\\bno (longer )?(wish|want)s? to (receive|get|hear)\\b"), P("\\bne souhaite plus recevoir\\b"), P("\\bplus recevoir (de |vos )?(messages|mails|courriels|e-?mails)\\b"), P("\\bkeine e-?mails mehr\\b"), P("\\bno quiero recibir\\b"),
    P("\\bunsolicited\\b.*\\b(remove|strike|delete|stop)\\b"),
    // Added 2026-10-26: non-English opt-outs and auto-replies fell to "unclear" in a probe (DE, FR, ES, IT, PT, NL). Written by the
    // agent from common phrasings, not scored on real mail. No \\b around accented letters: JS \\b is ASCII-only.
    P("entfernen sie mich"), P("aus (ihrem|dem|ihrer) (e-?mail-?)?(verteiler|liste|datenbank)"), P("\\b(abmelden|austragen|abbestellen)\\b"), P("\\bnicht mehr (per )?(e-?mail )?(zu)?(kontaktier|anschreib|belästig|beläst)"), P("l[öo]schen sie (meine|unsere) (daten|e-?mail|adresse)"),
    P("ne m'?envoyez plus"), P("d[ée]sabonn"), P("d[ée]sinscri"), P("ne plus recevoir"), P("retirez[- ]moi"), P("supprimez (mon|mes|notre|nos)\\b"),
    P("darme de baja"), P("no me (env[ií]en?|manden?|escriban?|contacten?) m[aá]s"), P("elimin(e|en|ar) (mi|mis|nuestro)\\b.*(correo|datos|lista|direcci)"), P("cancelar (la |mi )?suscripci"), P("\\bdarse de baja\\b"),
    P("\\b(cancellatemi|rimuovetemi|toglietemi|disiscriv)"), P("non (voglio|vogliamo) pi[uù] ricevere"),
    P("n[ãa]o (me )?(envie|mande|escreva|contate)n? mais"), P("remov(a|am|er) (meu|minha|o meu)\\b"), P("cancelar (a )?inscri"),
    P("\\b(schrijf|schrijven) (mij|me|ons) uit\\b"), P("\\buitschrijven\\b"), P("verwijder (mij|me|mijn|ons)\\b"), P("mail (mij|ons) (niet|nooit) meer"),
    P("\\bcease and desist\\b"), P("\\bcease (all )?(further )?(email|e-mail|communication|contact)"),
    // Other languages (added after the third eval set; unverified beyond one example each): FR, DE, ES, IT opt-out phrasings.
    P("\\bne (me )?contactez plus\\b"), P("\\b(retirer|supprimer) (de|mon|mes|mon adresse)\\b.*\\b(liste|diffusion|donn[ée]es)"), P("\\b(kontaktieren|anschreiben|schreiben)( sie)? mich nicht mehr\\b"), P("\\bnicht mehr (kontaktieren|anschreiben|schreiben)\\b"), P("\\bsc?hreiben sie mir nicht mehr\\b"), P("\\bno me (vuelvan a )?(escrib|contact)"), P("\\bnon (mi |ci )?contatt\\w* pi[uù]\\b"), P("\\bnon contattatemi\\b"),
  ],
  bounce: [
    P("\\bdelivery (status notification|has failed|failure)\\b"), P("\\bundeliverable\\b"), P("\\bmail delivery (subsystem|failed|system)\\b"), P("\\baddress (not found|couldn'?t be found|rejected)\\b"),
    P("\\b55[0-4][ -]5\\.\\d\\.\\d\\b"), P("\\bmailbox (unavailable|not found|does not exist|is full)\\b"), P("\\buser unknown\\b"), P("\\bno such user\\b"), P("\\brecipient address rejected\\b"), P("\\bmessage (wasn'?t|was not|could not be) delivered\\b"),
    P("\\breturned mail\\b"), P("\\bautomatically rejected\\b"), P("\\b(cannot|can'?t|could ?n[o']?t|unable to) be delivered\\b"), P("\\bnot (be )?delivered to (the following|one or more)\\b"), P("\\b(mail|message) (rejected|undeliverable)\\b"), P("не может быть доставлен"),
  ],
  out_of_office: [
    P("\\bout of (the )?office\\b"), P("\\booo\\b"), P("\\bautomatic reply\\b"), P("\\bauto(matic)?[- ]?reply\\b"), P("\\bon (annual |parental |maternity |paternity |medical |sick )?leave\\b"), P("\\b(i am|i'?m) (currently )?(away|travell?ing|on vacation|on holiday|out)\\b"),
    P("\\b(limited|no) access to (my )?e-?mail\\b"), P("\\bwill (be back|return)\\b"), P("\\bback in the office\\b"), P("\\breturning (on|to the office)\\b"), P("\\baway from (the office|my desk)\\b"),

    // Added 2026-10-26, same caveat as the opt-outs above: DE, FR, ES, IT, PT, NL auto-reply phrasings.
    P("abwesenheit"), P("\\bnicht (im|in meinem|im meinem) b[üu]ro\\b"), P("\\bau(ß|ss)er haus\\b"), P("\\bbin (bis|vom|ab) .{0,40}(abwesend|im urlaub|nicht erreichbar)"), P("automatische antwort"), P("\\bim urlaub\\b"),
    P("r[ée]ponse automatique"), P("message d'?absence"), P("\\b(absent|absente) (du bureau|jusqu)"), P("\\ben cong[ée]s?\\b"), P("\\bde retour (le|lundi|mardi|mercredi|jeudi|vendredi|d[èe]s)\\b"), P("hors du bureau"),
    P("respuesta autom[áa]tica"), P("fuera de (la )?oficina"), P("\\bestar[ée] (ausente|de vacaciones|fuera)\\b"), P("\\bde vacaciones\\b"), P("mensaje autom[áa]tico"),
    P("risposta automatica"), P("fuori (dall')?ufficio"), P("\\bsono (in ferie|assente)\\b"),
    P("resposta autom[áa]tica"), P("fora do escrit[óo]rio"), P("\\best(ou|arei) (ausente|de f[ée]rias)\\b"),
    P("automatisch antwoord"), P("automatisch bericht"), P("\\bafwezig\\b"), P("niet (aanwezig|op kantoor)"), P("buiten kantoor"),
  ],
  left_company: [
    P("\\b(doesn'?t|does not|don'?t|do not|no longer) work(s|ing)? (here|there|for|at)\\b"), P("\\bno longer at\\b"), P("\\b(i|we) (don'?t|do not) (handle|deal with|look after|manage) (this|that|these|purchasing|software)\\b"), P("\\b(would be|is) the (one|person|right one) to (talk|speak) to\\b"), P("\\breplacement is\\b"), P("\\bmoved (on|to a new role|to another company)\\b"),
    P("\\bno longer (with|at|work(s|ing)? (for|at)|employed)\\b"), P("\\b(has|have) left (the company|\\w+)\\b"), P("\\b(i'?m|i am) not the right (person|contact)\\b"), P("\\bthe right (person|contact) (is|would be)\\b"), P("\\bwrong (person|contact)\\b"),
    P("\\b(please|you should|better to|try) (contact|reach out to|email|speak (to|with))\\b.*(@|\\b[A-Z][a-z]+\\b)"), P("\\bthis (mailbox|address) is (no longer|not) (monitored|in use)\\b"), P("\\bretired\\b"), P("\\bhandles? (this|that|these|purchasing|procurement)\\b"),
  ],
  not_now: [
    P("\\b(ask|try|contact|ping|email|call) (me|us) (again )?(in|after|next|around|later|down the line|then)\\b"), P("\\btry again (in|after|next|later)\\b"), P("\\bhold off\\b"), P("\\blet you know when\\b"), P("\\bdown the (line|road)\\b"), P("\\bnot this (year|quarter|month)\\b"), P("\\bin the (spring|summer|fall|autumn|winter)\\b"), P("\\b(in the )?(middle|midst) of (a|an|our)\\b"),
    P("\\bnot (right )?now\\b"), P("\\bnot at (this|the moment)\\b"), P("\\b(circle|check|touch) back\\b"), P("\\breach (back )?out (again )?(in|after|next|around)\\b"), P("\\b(follow up|get back to me|try (me|us) again|ping me) (in|after|next|around)\\b"),
    P("\\bnot (a|the) (top )?priority (right now|at the moment|this (quarter|year))\\b"), P("\\b(maybe|perhaps|possibly) (in|next|after|later)\\b"), P("\\bbudget (is |has been )?(frozen|locked|spent|set)\\b"), P("\\b(timing|the timing) (isn'?t|is not) (right|great|good)\\b"),
    P("\\b(revisit|reconsider|look at (this|it)) (in|next|after|later)\\b"), P("\\b(too busy|swamped|slammed) (right now|at the moment|this (month|quarter))\\b"), P("\\bnext (quarter|year|fiscal year)\\b"), P("\\b(later|end of) (this|the) year\\b"), P("\\bafter (the )?(holidays|new year)\\b"),
  ],
  not_interested: [
    P("^\\s*(nope|no|nah)\\.?\\s*$"), P("\\bnot (be )?moving forward\\b"), P("\\bnot relevant\\b"), P("\\b(we|i) (don'?t|do not) need (this|it|that|you|your)\\b"),
    P("\\bnot interested\\b"), P("\\bno,? thanks?( you)?\\b"), P("\\bno thank you\\b"), P("\\b(we'?re|we are) (all )?(set|good|fine)\\b"), P("\\b(don'?t|do not) (have a |see a )?need\\b"), P("\\bno need\\b"), P("\\b(i'?ll|i will|we'?ll|we will) pass\\b"), P("\\bnot (a )?(good )?fit\\b"), P("\\b(isn'?t|is not|wouldn'?t be) (a )?(good |great )?fit\\b"),
    P("\\bnot for (us|me)\\b"), P("\\bnot something (we|i)'?(re| are| am)? (looking|interested)\\b"), P("\\bnot looking (for|to)\\b"), P("\\bplease don'?t follow up\\b"), P("\\bwe'?ll never\\b"),
  ],
  objection_price: [
    P("\\b(over|beyond|outside|above) (what (we|i) can (spend|afford|pay)|our (budget|range|price range))\\b"), P("\\bmoney is tight\\b"), P("\\bhard to justify\\b"), P("\\b(cost|price|pricing|quote)s?\\b.*\\b(too high|way over|steep|out of reach)\\b"),P("\\btoo (expensive|pricey|costly|much)\\b"), P("\\b(can'?t|cannot|couldn'?t) afford\\b"), P("\\b(no|don'?t have (the |a )?|out of) budget\\b"), P("\\bprice is (too )?(high|steep)\\b"), P("\\bcheaper\\b")],
  objection_competitor: [
    P("\\bswitched to\\b"), P("\\b(no|not) plan(s|ning)? to (change|switch|move)\\b"), P("\\balready (does|handles|covers|has|do)\\b"),P("\\b(we|i) (already )?(use|have|work with|are using|'?re using|rely on)\\b.*\\b(already|currently|happy|for (this|that))\\b"), P("\\balready (have|use|using|work with|got)\\b"), P("\\bhappy with (our|what|the)\\b"), P("\\b(locked|signed) (in|into)\\b.*\\bcontract\\b"), P("\\bin a contract\\b"), P("\\bbuilt (it|this|our own) (in[- ]house|ourselves)\\b"), P("\\bbuilt (our|my) own\\b"), P("\\bin[- ]house\\b"), P("\\bin[- ]house (solution|tool|team)\\b")],
  objection_authority: [
    P("\\b(need|get|have) (approval|sign[- ]?off)\\b"), P("\\bsign[- ]?off from\\b"),P("\\bnot my (decision|call|department|area)\\b"), P("\\b(need|have) to (check with|check|run it by|ask|talk to) (my|our|the) (boss|manager|team|cfo|ceo|partner|director|head)\\b"), P("\\b(above|outside) my (pay grade|remit)\\b")],
  objection_need: [
    P("\\bwhy would (we|i) need\\b"), P("\\b(already )?know (their|our|the) routes\\b"),P("\\b(don'?t|do not) see (the|how|why)\\b"), P("\\bwhat makes (you|this|it) different\\b"), P("\\bsounds like (every|all the) other\\b"), P("\\bhow is (this|it) different\\b"), P("\\bnot convinced\\b"), P("\\bskeptical\\b")],
  meeting: [
    P("\\b(would|'d) love (a|to see|to learn|to hear)\\b"), P("\\byes,? please\\b"), P("\\bcount (me|us) in\\b"), P("\\bwhat are (the )?next steps\\b"), P("\\bi can do (a call|monday|tuesday|wednesday|thursday|friday|tomorrow)\\b"), P("\\bmy calendar is\\b"), P("\\bfind (\\d+ minutes|some time|a time|time)\\b"), P("\\bforward(ing|ed)? (this |you )?to\\b"), P("\\bover to you\\b"), P("\\bwhen can you (show|demo|walk)\\b"),
    P("\\b(let'?s|happy to|glad to|would love to|i'?d (like|love) to|open to|keen to|could|can) (set up|schedule|book|jump on|hop on|have) (a )?(call|chat|meeting|demo|time|conversation)\\b"), P("\\b(send|share) (me |over )?(some |a few )?(times|slots|availability|your calendar|a (calendar )?link|a link)\\b"),
    P("\\b(book|grab|find|pick) (a )?(time|slot)\\b"), P("\\bhow (about|does) (monday|tuesday|wednesday|thursday|friday|next week|tomorrow)\\b"), P("\\b(free|available|works for me) (on |at )?(monday|tuesday|wednesday|thursday|friday|tomorrow|next week|this week|\\d)\\b"),
    P("\\b(i'?m|we'?re|i am|we are) (interested|keen|curious)\\b"), P("\\b(set up|schedule|book) (a )?(demo|call|meeting|time)\\b"), P("\\bcalendly\\b"), P("\\b(happy|glad|open|keen|willing) to (take a look|learn more|hear more|chat|talk|connect)\\b"), P("\\b(tell|show) me more\\b"), P("\\bsend (me |over )?(more info|details|the deck|a proposal|pricing)\\b"),
    P("\\bsounds (interesting|good|great|promising)\\b"), P("\\b(let'?s|lets) (talk|chat|connect)\\b"), P("\\bcan we (talk|chat|meet|speak|connect|jump on|hop on)\\b"), P("\\bwhen (are|is) (you|a good time)\\b"), P("\\bloop(ing)? in\\b"),
  ],
};

function hits(list, s) { for (const re of list) { const m = s.match(re); if (m) return m; } return null; }

/**
 * Classify one reply. Returns { category, subtype, confidence: "clear" | "weak", evidence, date, referral, why }.
 * Order matters and is the policy: anything that asks for less contact beats anything that asks for more, so
 * "interested, but please take me off this list" is an unsubscribe.
 */
export function triage(reply, today) {
  const body = typeof reply === "string" ? reply : reply.body;
  const subject = typeof reply === "string" ? "" : reply.subject || "";
  const from = typeof reply === "string" ? "" : reply.from || "";
  const all = [subject, ...sentences(body)];
  const find = (key) => { for (const s of all) { const m = hits(RULES[key], s); if (m) return { s, m: m[0] }; } return null; };
  const res = (category, ev, extra = {}) => ({ category, subtype: null, confidence: "clear", evidence: ev ? ev.s : "", matched: ev ? ev.m : "", date: null, referral: null, ...extra });

  let ev;
  // Header signals (RFC 3464 / 3834) are standards, not phrasing: they beat the word rules when present.
  const signal = typeof reply === "string" ? "" : reply.signal || "";
  if (signal === "dsn-permanent") return res("bounce", { s: "delivery status Status 5.x.x", m: "5.x.x" }, { why: "the receiving server reported a permanent failure" });
  if (signal === "dsn-temporary") return res("out_of_office", { s: "delivery status Status 4.x.x", m: "4.x.x" }, { subtype: "delivery_delayed", why: "delivery delayed, not failed; no address change" });
  if (!signal && /\b(mail delivery warning|has been postponed|continue to try to deliver)\b/i.test(all.join("\n")) && /^(mailer-daemon|postmaster)@|delivery/i.test(from + subject)) return res("out_of_office", { s: all.find((x) => /postponed|delivery warning|continue to try/i.test(x)) || subject, m: "delivery delayed" }, { subtype: "delivery_delayed", why: "delivery delayed, not failed; no address change" });
  if (signal === "auto-reply" && !find("bounce") && !/^(mailer-daemon|postmaster)@/i.test(from)) { const d = (() => { for (const s of all) { const f = findDate(s, today); if (f && /\b(back|return|until|till|away|leave|office)\b/i.test(s)) return f; } return null; })(); return res("out_of_office", { s: "Auto-Submitted header", m: "auto-replied" }, { date: d?.date || null, dateText: d?.text || null, why: "sent by an auto-responder (header), not a person" }); }
  if ((ev = find("bounce")) || /^(mailer-daemon|postmaster)@/i.test(from)) return res("bounce", ev || { s: from, m: from }, { why: "a delivery failure, not a person" });
  if ((ev = find("unsubscribe"))) return res("unsubscribe", ev, { why: "asked not to be contacted" });

  const referral = (() => {
    for (const s of sentences(body)) {
      const email = s.match(EMAIL_RE)?.[0];
      if (email && email.toLowerCase() !== from && /\b(contact|reach|email|speak|talk|try|cc|loop|handles?|responsible|right person|in charge|forward)/i.test(s)) return { email: email.toLowerCase(), text: s };
    }
    return null;
  })();

  if ((ev = find("out_of_office"))) {
    const d = (() => { for (const s of all) { if (/\b(back|return|returning|until|till|away|leave|office|reply)\b/i.test(s)) { const f = findDate(s, today); if (f) return f; } } return null; })();
    return res("out_of_office", ev, { date: d?.date || null, dateText: d?.text || null, referral, why: d ? `away until ${d.date}` : "away, no return date given" });
  }
  if ((ev = find("left_company"))) return res("left_company", ev, { referral, why: referral ? `points you to ${referral.email}` : "not the right contact" });

  // A sentence that asks to meet anywhere in the reply counts, not only the first positive one ("Sounds interesting.
  // Could you send times?" is an explicit ask).
  const EXPLICIT = /(set up|schedule|book|times|slots|availability|calendar|link|calendly|can we|i can do|find|next steps|count|yes|love|forward|over to you|when can you|monday|tuesday|wednesday|thursday|friday|tomorrow|next week|this week|demo|jump on|hop on)/i;
  let meet = null, explicitMeeting = false;
  for (const s of all) { const m = hits(RULES.meeting, s); if (m) { const ex = EXPLICIT.test(m[0]); if (!meet || (ex && !explicitMeeting)) { meet = { s, m: m[0] }; explicitMeeting = ex; } if (ex) break; } }
  const notNow = find("not_now");
  const notInt = find("not_interested");

  if (notNow && !explicitMeeting) {
    let d = null;
    for (const s of all) { const f = findDate(s, today); if (f) { d = f; break; } }
    return res("not_now", notNow, { date: d?.date || addDays(today, 90), dateText: d?.text || null, confidence: d ? "clear" : "weak", why: d ? `come back ${d.date}` : "no date given: 90 days by default" });
  }
  if (notInt && !explicitMeeting) return res("not_interested", notInt, { why: "declined" });

  for (const sub of ["price", "competitor", "authority", "need"]) {
    const o = find(`objection_${sub}`);
    if (o && !explicitMeeting) return res("objection", o, { subtype: sub, referral, why: `${sub} objection` });
  }
  if (meet) return res("interested", meet, { confidence: explicitMeeting ? "clear" : "weak", why: explicitMeeting ? "asked to meet or for times" : "positive, no meeting asked for yet" });
  const q = sentences(body).find((s) => /\?\s*$/.test(s) && /[a-z]{2,}.*\s.*[a-z]/i.test(s) && !/\b(who (is|are) (this|you)|how did you get)\b/i.test(s));
  if (q) return res("question", { s: q, m: q }, { confidence: "weak", why: "asked a question" });
  return res("unclear", null, { confidence: "weak", why: "no rule matched; read it yourself" });
}

// ---------- drafting and checks ----------

export const firstName = (p) => String(p.first_name || p.name || "").trim().split(/\s+/)[0] || "there";
export const footer = (offer) => [
  "",
  offer.sender || "[your name]",
  offer.company ? offer.company : null,
  offer.address || "[your postal address]",
  "If you would rather not hear from me again, reply \"unsubscribe\" and I will stop.",
].filter((x) => x != null).join("\n");

/**
 * Draft a reply for an outbound category, from templates that state only what the user typed into `offer`
 * ({ sender, company, address, product, booking_link, value, proof }). Returns { subject, body } or null.
 */
export function draftReply(t, prospect, reply, offer = {}) {
  const hi = `Hi ${firstName(prospect)},`;
  const subject = reply.subject ? (/^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`) : `Re: ${offer.product || "my note"}`;
  const book = offer.booking_link ? `Here is a link to pick a time that suits you: ${offer.booking_link}` : "Could you send two or three times that suit you next week? I will fit around them.";
  let lines;
  switch (t.category) {
    case "interested":
      lines = [hi, "", "Thanks for getting back to me.", book, "", offer.value ? `On the call I will show how ${offer.product || "it"} ${offer.value}, and leave plenty of time for your questions.` : "On the call I will keep it short and leave plenty of time for your questions."];
      break;
    case "question":
      lines = [hi, "", "Thanks for the question.", "", `[Answer: "${t.evidence}"]`, "", offer.booking_link ? `If it is easier to talk it through, you can pick a time here: ${offer.booking_link}` : "Happy to talk it through on a short call if that is easier."];
      break;
    case "not_now":
      lines = [hi, "", `Understood, thanks for letting me know. I will leave it until ${t.dateText ? t.dateText.replace(/^(in|after|until|till|around|by)\s+/, "") : "later in the year"} and check in then.`, "", "If anything changes before that, just reply here."];
      break;
    case "objection": {
      const body = {
        price: ["Thanks for being straight with me about budget.", offer.value ? `For what it is worth, the teams who use ${offer.product || "it"} do so because it ${offer.value}.` : "", "Would it help if I sent a short note on what it costs and what it replaces, so you can judge for yourself?"],
        competitor: ["Makes sense, thanks for telling me what you use today.", "I am not asking you to switch. If there is ever a gap in what you have now, I would be glad to show how we handle it on a short call.", "If not, no problem at all."],
        authority: ["Thanks, that is helpful.", "Who would be the right person to talk to? If you are comfortable making an introduction I would appreciate it, and if not, no problem."],
        need: ["Fair question.", offer.value ? `In one line: ${offer.product || "it"} ${offer.value}.` : "[In one line, what is different about what you offer]", offer.proof ? offer.proof : "", "Happy to show you rather than tell you, if a short call is useful."],
      }[t.subtype] || ["Thanks for the reply."];
      lines = [hi, "", ...body.filter(Boolean)];
      break;
    }
    default:
      return null;
  }
  return { subject, body: [...lines, footer(offer)].join("\n") };
}

const NUM_RE = /(?:[$€£]\s?\d[\d,.]*(?:\s?[km]\b)?|\b\d[\d,.]*\s?%|\b\d{2,}[\d,.]*\b)/gi;
const SPAMMY = [[/\bguarantee[ds]?\b/i, "promises a guarantee"], [/\b(risk[- ]free|100% (free|safe|guaranteed))\b/i, "absolute claim"], [/\b(act now|limited time|expires (today|tonight)|last chance|only \d+ (left|spots))\b/i, "fake urgency"], [/\bfree money\b|\bdouble your\b/i, "spam phrase"]];

/**
 * Check a draft before it can be approved. `facts` is every text the draft may quote numbers from (the user's offer
 * fields and the prospect's own reply). Errors block approval; warnings are shown.
 */
export function checkDraft(draft, facts = "") {
  const errors = [], warnings = [];
  const body = String(draft?.body || ""), subject = String(draft?.subject || "");
  const known = String(facts).toLowerCase().replace(/\s+/g, "");
  for (const n of new Set((body.match(NUM_RE) || []).map((x) => x.trim()))) {
    const bare = n.toLowerCase().replace(/\s+/g, "");
    if (!known.includes(bare) && !/^20\d\d$/.test(bare)) errors.push(`States "${n}", which is not in your offer details or their reply`);
  }
  for (const [re, why] of SPAMMY) if (re.test(body) || re.test(subject)) errors.push(`Remove: ${why} ("${(body.match(re) || subject.match(re))[0]}")`);
  const ph = body.match(/\[[^\]]{2,}\]/);
  if (ph) errors.push(`Fill in or delete the placeholder ${ph[0].slice(0, 60)}${ph[0].length > 60 ? "…" : ""}`);
  if (!/unsubscribe|opt[- ]?out|not hear from me|stop (emailing|contacting)/i.test(body)) errors.push("Needs a way to opt out (CAN-SPAM, PECR, CASL)");
  if (/^re:/i.test(subject) && draft?.fakeRe) errors.push("Subject starts with Re: but this is not a reply");
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > 180) warnings.push(`${words} words; replies under 120 get read`);
  if (/\b(just (checking|following|circling)|bumping this)\b/i.test(body)) warnings.push("\"Just checking in\" adds nothing; say why you are writing");
  return { ok: !errors.length, errors, warnings };
}

// ---------- the agent ----------

const PROSPECT_COLS = ["email", "first_name", "last_name", "company", "status", "paused_until", "stage", "last_reply", "note"];

/**
 * Run the inbox agent once.
 *   input: { replies: text, prospects: csv text, suppression: text, offer: {...}, today: "YYYY-MM-DD" }
 * Returns { items, prospects, suppression, deals, tasks, summary }:
 *   - items: one per reply, with the triage, what was applied automatically, and the draft awaiting approval
 *   - prospects: the updated prospect table (status, paused_until, stage)
 *   - suppression: rows to add to your suppression list (with the reason and the sentence, as a consent record)
 *   - deals: rows for deal-keeper (id,name,stage,status,created,last_activity,next_step)
 *   - tasks: things only you can do (answer a question, add a referred contact, fix an address)
 * Nothing is sent. Pass `triageFn` to replace the rules (ai.mjs does, under mergeTriage's limits).
 */
export function runInbox(input, { triageFn = triage, guessFn = nbGuess } = {}) {
  const today = input.today || iso(Date.now());
  const offer = input.offer || {};
  const replies = Array.isArray(input.replies) ? input.replies : parseReplies(input.replies);
  const table = Array.isArray(input.prospects) ? input.prospects.map((p) => ({ ...p })) : parseCsv(input.prospects);
  const byEmail = new Map(table.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
  const suppressed = new Set(String(input.suppression || "").split(/[\n,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@")));
  const items = [], suppression = [], deals = [], tasks = [];
  const factsBase = Object.values(offer).join(" \n ");

  for (const [i, reply] of replies.entries()) {
    const known = byEmail.get(reply.failed || reply.from);
    const p = known || { email: reply.failed || reply.from, first_name: reply.name.split(/\s+/)[0] || "", company: "", status: "" };
    if (!known && p.email) { table.push(p); byEmail.set(p.email, p); }
    const t = triageFn(reply, today);
    const applied = [];
    let draft = null;
    const set = (k, v, why) => { if (p[k] !== v) { p[k] = v; applied.push(why); } };
    p.last_reply = today;

    switch (t.category) {
      case "unsubscribe":
        set("status", "unsubscribed", "Stopped every touch to this person");
        if (reply.from && !suppressed.has(reply.from)) { suppressed.add(reply.from); suppression.push({ email: reply.from, reason: "asked to stop", date: today, evidence: t.evidence }); applied.push("Added to your suppression list, with their words as the record"); }
        break;
      case "bounce":
        set("status", "bounced", "Stopped email to this address");
        if (reply.failed || (reply.from && !/^(mailer-daemon|postmaster)@/i.test(reply.from))) tasks.push({ email: p.email, task: "Address bounced. Find the right one in your own records; do not guess." });
        else tasks.push({ email: "", task: "A delivery failure came back. Match it to the prospect it was sent to and mark that address bounced." });
        break;
      case "not_interested":
        set("status", "closed_lost", "Stopped the cadence");
        set("paused_until", addDays(today, 180), "Will not be suggested again for 180 days");
        deals.push({ id: p.email, name: p.company || p.email, stage: "lead", status: "lost", created: today, last_activity: today, next_step: "" });
        break;
      case "left_company":
        set("status", "left", "Stopped the cadence for this contact");
        if (t.referral) tasks.push({ email: t.referral.email, task: `${p.email} pointed you to ${t.referral.email}. Add them yourself if you want to; the agent does not start a cadence for someone who has not heard from you.` });
        break;
      case "out_of_office": {
        const back = t.date ? addBusinessDays(t.date, 1) : addDays(today, 7);
        set("status", "paused", "Paused the cadence");
        set("paused_until", back, t.date ? `Resumes ${back}, the business day after they are back` : `Resumes ${back} (no return date given: one week)`);
        if (t.referral) tasks.push({ email: t.referral.email, task: `Auto-reply names ${t.referral.email} as a contact while they are away. Only for urgent matters; usually wait.` });
        break;
      }
      case "not_now":
        set("status", "paused", "Paused the cadence");
        set("paused_until", t.date, `Comes back ${t.date}${t.dateText ? ` ("${t.dateText}")` : " (no date given: 90 days)"}`);
        draft = draftReply(t, p, reply, offer);
        break;
      case "objection":
        set("status", "paused", "Paused the cadence until you answer");
        draft = draftReply(t, p, reply, offer);
        if (t.subtype === "authority") tasks.push({ email: p.email, task: "They are not the decision maker. If they name someone, add that person yourself." });
        break;
      case "question":
        set("status", "paused", "Paused the cadence until you answer");
        draft = draftReply(t, p, reply, offer);
        tasks.push({ email: p.email, task: `Answer their question: "${t.evidence}"` });
        break;
      case "interested":
        set("status", "replied", "Stopped the automated cadence: a person takes it from here");
        set("stage", "qualified", "Moved to qualified");
        draft = draftReply(t, p, reply, offer);
        deals.push({ id: p.email, name: p.company || p.email, stage: "qualified", status: "open", created: today, last_activity: today, next_step: "Book the call" });
        break;
      default: {
        // Rules act; a guess only suggests. The prospect is paused, the guess and (for a reply category) a draft are
        // shown, and nothing else changes until the user picks the category.
        set("status", "paused", "Paused the cadence until you read it");
        const g = guessFn ? guessFn(reply) : null;
        if (g && g.category !== "unclear") {
          t.guess = g;
          if (CATEGORIES[g.category]?.outbound) draft = draftReply({ ...t, category: g.category, subtype: g.category === "objection" ? "need" : null, dateText: null, evidence: reply.body.split(/\n/)[0].slice(0, 160) }, p, reply, offer);
        }
        tasks.push({ email: p.email, task: g && g.category !== "unclear" ? `The rules could not read this reply. Best guess: ${CATEGORIES[g.category].label.toLowerCase()}. Check it before you act.` : "The agent could not tell what this reply means. Read it and decide." });
      }
    }
    const lint = draft ? checkDraft(draft, factsBase + "\n" + reply.body) : null;
    items.push({ n: i + 1, from: reply.from, name: reply.name, subject: reply.subject, body: reply.body, triage: t, applied, draft, lint, approval: draft ? (t.guess ? "guess_check_first" : "needs_approval") : "nothing_to_send", known: Boolean(known) });
  }
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, items.filter((x) => x.triage.category === k).length]));
  return {
    today, items, deals, tasks,
    prospects: table,
    suppression,
    summary: { replies: items.length, drafts: items.filter((x) => x.draft).length, readyToApprove: items.filter((x) => x.lint?.ok).length, suppressed: suppression.length, paused: items.filter((x) => x.triage.category === "out_of_office" || x.triage.category === "not_now").length, tasks: tasks.length, counts },
  };
}

export const csv = {
  prospects: (r) => toCsv(r.prospects, [...new Set([...PROSPECT_COLS, ...r.prospects.flatMap((p) => Object.keys(p))])]),
  suppression: (r) => toCsv(r.suppression, ["email", "reason", "date", "evidence"]),
  deals: (r) => toCsv(r.deals, ["id", "name", "stage", "status", "created", "last_activity", "next_step"]),
  tasks: (r) => toCsv(r.tasks, ["email", "task"]),
};

export const SAMPLE_PROSPECTS = `email,first_name,company,status
dana@brightline.example,Dana,Brightline Logistics,active
li.wei@harbourfoods.example,Li,Harbour Foods,active
omar@peakdental.example,Omar,Peak Dental Group,active
jess@northwindfreight.example,Jess,Northwind Freight,active
priya@cobaltlabs.example,Priya,Cobalt Labs,active
tom@riverbendhvac.example,Tom,Riverbend HVAC,active
`;

export const SAMPLE_REPLIES = `From: Dana Reyes <dana@brightline.example>
Subject: Re: route planning for Brightline
This sounds interesting. Could you send over a few times next week for a quick call?
---
From: Li Wei <li.wei@harbourfoods.example>
Subject: Automatic reply: route planning
I am out of the office until March 3 with limited access to email. For urgent matters please contact ops@harbourfoods.example.
---
From: Omar Haddad <omar@peakdental.example>
Subject: Re: scheduling for Peak Dental
Please remove me from your list.
---
From: Jess Moran <jess@northwindfreight.example>
Subject: Re: route planning
Not right now, we are mid-migration. Try me again in Q1.
---
From: Priya Nair <priya@cobaltlabs.example>
Subject: Re: quick question
We already use RouteWorks and we're happy with it.
---
From: Tom Becker <tom@riverbendhvac.example>
Subject: Re: route planning
Does it work with QuickBooks Online?
`;

export const SAMPLE_OFFER = { sender: "Sam Ortiz", company: "Example Routing Co.", address: "100 Example St, Springfield, IL 62701", product: "Example Routing", booking_link: "", value: "builds next-day routes from a spreadsheet in minutes", proof: "" };
