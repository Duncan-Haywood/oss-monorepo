// Sales Agent, milestone 1: the inbox agent. It reads the replies your outreach got back, decides what each one
// means, applies the changes that only ever reduce contact (suppress, stop, pause) and queues everything that would
// contact someone (a reply draft, a new contact) for you to approve. One principle runs through the code:
//
//   The agent may always do less on its own. It may never do more without you.
//
// No network, no dependencies; the same file runs in a page, in Node and in a server. ai.mjs adds an optional model
// on the user's own key, under the same rules.
import { findSlots, describeSlot } from "./slots.mjs";
import { guess as nbGuess } from "./learn.mjs";
import { suppressionIndex, emailKey } from "./suppression.mjs";

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
const ORDINAL_WORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth", "twenty-first", "twenty-second", "twenty-third", "twenty-fourth", "twenty-fifth", "twenty-sixth", "twenty-seventh", "twenty-eighth", "twenty-ninth", "thirtieth", "thirty-first"];
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2, few: 3 };

// The next date on or after `today` with this month and day (year rolls forward if it has passed).
function nextMonthDay(today, m, d) {
  const y = new Date(toDay(today)).getUTCFullYear();
  // A day the month does not have ("31 February") is not a date: Date.UTC would roll it into March. Leap days wait for a leap year.
  for (const yr of [y, y + 1, y + 2, y + 3, y + 4]) { const t = Date.UTC(yr, m, d); if (new Date(t).getUTCMonth() === m && t >= toDay(today)) return iso(t); }
  return null;
}

/**
 * Find a "come back" date in a sentence, relative to `today`. Returns { date, text } or null. Understands month and
 * day ("March 3", "3 March", "the 14th"), numeric dates (3/14, 2026-03-14), weekdays ("Monday"), "next week",
 * "in two weeks/months", "next month", "next quarter", "Q1".."Q4", a bare month ("in January", "after June"),
 * "next year", "after the holidays" and "end of the month/quarter/year".
 */
// Month names in German, French, Spanish, Portuguese, Italian and Dutch, mapped to the English words the date reader
// knows (added 2026-11-02; out-of-office replies in those languages named a return date nobody read).
const FOREIGN_MONTHS = {
  jan: "januar|janvier|enero|janeiro|gennaio|januari", feb: "februar|f[eé]vrier|febrero|fevereiro|febbraio|februari",
  mar: "m[aä]e?rz|mars|marzo|mar[cç]o|maart", apr: "avril|aprile", may: "mai|mayo|maio|maggio|mei",
  jun: "juni|juin|junio|junho|giugno", jul: "juli|juillet|julio|julho|luglio", aug: "ao[uû]t|agosto",
  sep: "septembre|septiembre|setiembre|setembro|settembre", oct: "oktober|octobre|octubre|outubro|ottobre",
  nov: "novembre|noviembre|novembro", dec: "dezember|d[eé]cembre|diciembre|dezembro|dicembre",
};
const FOREIGN_RE = new RegExp(`(\\d{1,2})(?:\\.|\\s*[ºo°]|er)?\\s+(?:de\\s+|d['’]\\s*)?(${Object.values(FOREIGN_MONTHS).join("|")})\\b\\.?`, "i");
function foreignToEnglish(text) {
  return String(text).replace(new RegExp(`\\b(\\d{1,2})\\.\\s+(?=${MONTH_RE}\\b)`, "gi"), "$1 ").replace(new RegExp(FOREIGN_RE.source, "gi"), (all, day, name) => {
    const mon = Object.keys(FOREIGN_MONTHS).find((k) => new RegExp(`^(?:${FOREIGN_MONTHS[k]})$`, "i").test(name));
    return mon ? `${day} ${mon}` : all;
  });
}

export function findDate(text, today) {
  const orig = String(text);
  text = foreignToEnglish(text);
  const r = findDateLower(text, today);
  if (!r || !r.date) return null;
  const at = String(text).toLowerCase().indexOf(r.text); // report the words as the person wrote them ("Q1", "March 3")
  return text !== orig ? { ...r, text: r.text } : at < 0 ? r : { ...r, text: String(text).slice(at, at + r.text.length) };
}

function findDateLower(text, today) {
  const s = String(text).toLowerCase();
  let m;
  if ((m = s.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/))) return { date: `${m[1]}-${m[2]}-${m[3]}`, text: m[0] };
  if ((m = s.match(/\b(20\d\d)[\/.](\d{1,2})[\/.](\d{1,2})\b/)) && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return { date: iso(Date.UTC(+m[1], +m[2] - 1, +m[3])), text: m[0] };
  if ((m = s.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d\d|\d\d)\b/)) && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) return { date: iso(Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1])), text: m[0] }; // day.month.year, the European way
  if ((m = s.match(new RegExp(`\\b(${ORDINAL_WORDS.join("|")})\\s+of\\s+${MONTH_RE}\\b`)))) return { date: nextMonthDay(today, MONTHS.indexOf(m[2].slice(0, 3)), ORDINAL_WORDS.indexOf(m[1]) + 1), text: m[0] };
  if ((m = s.match(/\bday after tomorrow\b/))) return { date: addDays(today, 2), text: m[0] };
  if ((m = s.match(/\btomorrow\b/))) return { date: addDays(today, 1), text: m[0] };
  if ((m = s.match(new RegExp(`\\b(start|beginning|middle|end)\\s+of\\s+${MONTH_RE}\\b|\\bmid[-\\s]${MONTH_RE}\\b`)))) {
    const mid = m[1] === "middle" || !m[1], mo = MONTHS.indexOf((m[2] || m[3]).slice(0, 3));
    if (m[1] === "end") return { date: nextMonthDay(today, (mo + 1) % 12, 1), text: m[0] }; // the 1st after the month, like "end of the month"
    return { date: nextMonthDay(today, mo, mid ? 15 : 1), text: m[0] };
  }
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
  if ((m = s.match(/\b(?:in|for)\s+(\d+|a|an|one|two|three|four|five|six|a couple of|couple of|a few|few)\s+(day|week|wk|month|mo)s?\b/))) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : NUM_WORDS[m[1].replace(/^a\s+|\s+of$/g, "").trim()] || 2;
    const date = m[2] === "day" ? addDays(today, n) : (m[2] === "week" || m[2] === "wk") ? addDays(today, 7 * n) : (() => { const t = new Date(toDay(today)); return iso(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + n, t.getUTCDate())); })();
    return { date, text: m[0] };
  }
  if ((m = s.match(/\b(?:in|for)\s+(?:a|one|two)\s+fortnight\b|\ba fortnight\b/))) return { date: addDays(today, /two/.test(m[0]) ? 28 : 14), text: m[0] };
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
  if ((m = s.match(/\b(?:on|until|till|back|returning|next|this)\s+(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)\b/))) {
    const want = WEEKDAYS.findIndex((d) => d.startsWith(m[1].slice(0, 3))), w = new Date(toDay(today)).getUTCDay();
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
  // Lotus Notes and Outlook-for-Notes quote headers (found on real mail, eval/enron.mjs, 2026-11-11): no "wrote:", no ">",
  // just a name line and a time stamp ("Jane Doe@ECT" / "09/26/2000 11:19 AM", or '"Doe, Jane" <j@x> on 11/03/2000
  // 03:18:19 PM') with a "To:" line a few lines below. Everything from there down is the earlier message.
  const STAMP = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}(:\d{2})?\s*([AP]M)?\s*$/i;
  const notesHeader = (i) => {
    if (!STAMP.test(lines[i]) || lines[i].length > 160) return false;
    for (let k = i + 1; k < Math.min(lines.length, i + 7); k++) if (/^\s*To:\s/i.test(lines[k])) return true;
    return false;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (quoted(line)) continue;
    if (/^\s*-{2,}\s*Forwarded by\b/i.test(line)) break;
    if (notesHeader(i)) {
      // A stamp on its own line has the sender's name on the line above ("Pat Doe@ECT"): that is the header too.
      if (/^\s*\d/.test(line)) { let k = out.length - 1; while (k >= 0 && !out[k].trim()) k--; if (k >= 0 && out[k].trim().length < 80 && !/[.!?:,;]\s*$/.test(out[k])) out.length = k; }
      break;
    }
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
 * Split at each `From:` line that opens a new message. A `From:` that opens quoted history is not a new message: it
 * follows an "Original Message" / "Forwarded message" divider or an underscore rule, or is followed by `Sent:`
 * (Outlook's quote header, also Gesendet / Envoyé / Enviado). Otherwise our own earlier email, quoted under a
 * top-posted reply, would be read as a second reply (found 2026-11-03: it was triaged as an unsubscribe).
 */
function splitAtFromHeaders(src) {
  const lines = src.split("\n"), blocks = [];
  let cur = [], prev = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^From:\s/i.test(l)) {
      const divider = /^\s*-{2,}\s*(original|forwarded|reply|ursprüngliche|message d'origine)/i.test(prev) || /^\s*_{5,}\s*$/.test(prev) || /^\s*-{5,}[^-]*-{5,}\s*$/.test(prev);
      const outlook = /^\s*[*_]*(Sent|Gesendet|Envoyé|Enviado|Inviato)[*_]*\s*:/i.test(lines[i + 1] || "");
      if (cur.length && !divider && !outlook) { blocks.push(cur.join("\n")); cur = []; }
    }
    cur.push(l);
    if (l.trim()) prev = l;
  }
  if (cur.length) blocks.push(cur.join("\n"));
  return blocks;
}

/**
 * Split pasted replies into messages. Messages are separated by a line of three or more dashes, or each one starts
 * with a `From:` header. Headers read: From, Subject, Date. Returns [{ from, name, subject, date, body, raw }].
 */
export function parseReplies(text) {
  const src = String(text || "").replace(/\r\n/g, "\n");
  let blocks = src.split(/\n\s*-{3,}\s*\n/);
  if (blocks.length === 1) blocks = splitAtFromHeaders(src);
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

const sentences = (t) => String(t).replace(/\s+/g, " ").split(/(?<=[.!?])(?<!\b\d{1,2}\.)(?<!\b[Nn][Oo]\.(?=\s+\d))\s+|\s+[-–—]\s+/).map((x) => x.trim()).filter(Boolean);
const P = (re) => new RegExp(re, "i");

const RULES = {
  unsubscribe: [
    // 2026-11-11: "stop following up" / "no more follow-ups" are opt-outs too (fresh-2026-11-11.jsonl).
    P("\\b(stop|quit|cease) (following up|chasing|pestering|bothering|spamming)\\b"), P("\\bno more (follow[- ]?ups?|emails?|messages?|reminders?)\\b"), P("\\b(do not|don'?t|never) (follow up|chase|bother|spam) (with )?(me|us|again)\\b"),
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
    // Added 2026-10-30 after a fifth set (eval/fresh-2026-10-30.jsonl) missed 4 of 10 opt-outs: "take this address off", "cease all
    // correspondence", "struck my name from", and a CCPA delete/do-not-sell request.
    P("\\btake (this|my|our) (address|email|name|number) off\\b"), P("\\bcease (all )?(correspondence|communication|contact)\\b"), P("\\bstruck (my|our) (name|email|address)\\b"), P("\\bccpa\\b.*\\b(delete|do not sell|opt)"), P("\\bdo not sell\\b"),
    // Added 2026-10-26: non-English opt-outs and auto-replies fell to "unclear" in a probe (DE, FR, ES, IT, PT, NL). Written by the
    // agent from common phrasings, not scored on real mail. No \\b around accented letters: JS \\b is ASCII-only.
    // Added 2026-11-08 (eval/fresh-2026-11-08.jsonl): Dutch "haal me van je lijst af", "geen mails meer".
    P("\\bhaal (me|mij|ons) (van|uit) (je|uw|jullie|de) (lijst|mailinglijst|verzendlijst)"), P("\\bgeen (mails|e-?mails|berichten) meer\\b"),
    P("entfernen sie mich"), P("aus (ihrem|dem|ihrer) (e-?mail-?)?(verteiler|liste|datenbank)"), P("\\b(abmelden|austragen|abbestellen)\\b"), P("\\bnicht mehr (per )?(e-?mail )?(zu)?(kontaktier|anschreib|belästig|beläst)"), P("l[öo]schen sie (meine|unsere) (daten|e-?mail|adresse)"),
    P("ne m'?envoyez plus"), P("d[ée]sabonn"), P("d[ée]sinscri"), P("ne plus recevoir"), P("retirez[- ]moi"), P("supprimez (mon|mes|notre|nos)\\b"),
    P("darme de baja"), P("no me (env[ií]en?|manden?|escriban?|contacten?) m[aá]s"), P("elimin(e|en|ar) (mi|mis|nuestro)\\b.*(correo|datos|lista|direcci)"), P("cancelar (la |mi )?suscripci"), P("\\bdarse de baja\\b"),
    // Added 2026-11-02 after a probe of 40 short non-English phrasings missed the ones below (FR/ES infinitives and imperatives, PT, NL). Agent-written, unscored on real mail.
    P("ne plus me (contacter|[ée]crire|solliciter)"), P("ne me (contactez|[ée]crivez|sollicitez) plus"), P("(quitame|qu[ií]tame|s[aá]came|borra(me)?|b[óo]rrame) (de|mis)\\b"), P("no (quiero|deseo) (m[aá]s|seguir recibiendo)"),
    P("(remova|retire|tire|exclua) (o )?(meu|me|nosso)\\b"), P("n[ãa]o (quero|desejo) (mais )?receber"), P("pare de (me )?(enviar|mandar|escrever)"),
    P("stuur (mij|ons) (geen|niet meer)"), P("geen (e-?mails|mailtjes|berichten) meer"), P("verwijder (mij|ons|mijn)\\b"), P("schrijf (mij|me) uit"),
    P("\\b(cancellatemi|rimuovetemi|toglietemi|disiscriv)"), P("non (voglio|vogliamo) pi[uù] ricevere"),
    P("n[ãa]o (me )?(envie|mande|escreva|contate)n? mais"), P("remov(a|am|er) (meu|minha|o meu)\\b"), P("cancelar (a )?inscri"),
    // Added 2026-11-10 (eval/fresh-2026-11-10.jsonl): Turkish "listenizden çıkarın".
    P("listenizden [cç][ıi]kar"), P("poista minut"),
    P("\\b(schrijf|schrijven) (mij|me|ons) uit\\b"), P("\\buitschrijven\\b"), P("verwijder (mij|me|mijn|ons)\\b"), P("mail (mij|ons) (niet|nooit) meer"),
    // Added 2026-11-04 after a probe of 24 more phrasings in SV, DA, NO, PL, TR, FI, CS, RO missed 13 (agent-written, unscored on real mail):
    // cancel/unsubscribe verbs, "no more mails", "stop sending", "remove me from the list", "don't write to me again".
    P("avsluta (min|mitt) (prenumeration|abonnemang)"), P("\\b(afmeld|afmelde) (mig|os)\\b"), P("(stop|hold op) med at (sende|skrive)"), P("(ikke|ingen) (have |få |ønske )?(flere|mere) (mails?|e-?mails?|mejl)"),
    P("slutt (å|med å) (sende|skrive)"), P("fjern meg\\b"), P("(ønsker|vil) ikke (ha )?flere (e-?poster|eposter|meldinger)"),
    P("nie chc[eę] (otrzymywa[ćc]|dostawa[ćc]) wi[eę]cej"), P("zaprzesta(nia|nie|ć|j) (wysy[łl]ania|pisania)"), P("\\bwypisz (mnie|nas)\\b"), P("\\bpoista(kaa|a) (minut|meid[äa]t)\\b"),
    P("(už|již) mi (nepi[šs]te|nevolejte|nepos[ií]lejte)"), P("(să|sa) m[ăa] scoate[țt]i"), P("nu mai (trimite[țt]i|scrie[țt]i)"),
    // Added 2026-11-03 after eval/fresh-2026-11-03.jsonl missed 5 of 16 opt-outs: "remove it immediately" (address), "ne m'écrivez plus",
    // "non contattarmi più", a GDPR Article 21 objection, and "I don't want to hear from you again".
    P("\\bremove (it|this|that)( (address|email))? (immediately|now|asap)\\b"), P("\\bne m.[ée]crivez plus\\b"), P("\\bnon contattarmi\\b"), P("\\b(cease|stop) processing my (personal )?data\\b"), P("\\bgdpr\\b.*\\b(article 21|object|erasure|delete)"), P("\\b(i )?(don'?t|do not|never) want to (hear|receive|get)\\b.*\\b(from you|again|more)\\b"),
    // Added 2026-11-03 after eval/fresh-2026-11-03c.jsonl (agent-written, 24 opt-outs) missed 10: "add this address to your do-not-contact list",
    // "refrain from further correspondence", "no-solicitation policy", "rather you didn't contact me", "leave our company out", "don't ever contact",
    // "don't send me anything else", and ES/FR/IT phrasings. Unscored on real mail.
    P("\\bdo[- ]not[- ](contact|call|email|mail)\\b"), P("\\b(i'?d|i would|i'?ll|we'?d) (much )?(rather|prefer to) not (get|receive|hear|have)\\b"), P("\\bnot (to )?(get|receive) any more\\b"), P("\\brefrain from (any )?(further|more|future)? ?(correspondence|contact|communication|emails?|messages?)"), P("\\bno[- ]solicitation\\b"),
    P("\\b(rather|prefer) (that )?you (didn'?t|did not|not|wouldn'?t|would not) (contact|email|write|message|call)"), P("\\bleave (me|us|our \\w+|my \\w+) out of\\b"), P("\\b(don'?t|do not|never) ever (contact|email|write|message|call)"),
    P("\\b(don'?t|dont|do not) send (me|us) (anything|any ?more|more)\\b"), P("\\b(contact|email|write to|message) (me|us) (anymore|any more|again)\\b.*\\b(don'?t|do not|please don)"),
    P("supprimiez (mon|mes|notre|nos)\\b"), P("deja de (enviar|mandar|escribir)(me|nos)?\\b"), P("\\bnon (scrivetemi|scrivermi|inviatemi|mandatemi)\\b"),
    P("\\bcease and desist\\b"), P("\\bcease (all )?(further )?(email|e-mail|communication|contact)"),
    // Added 2026-11-04: a probe found "delete all my personal data under GDPR Article 17" went to unclear; erasure asks with "all (of)" or
    // "personal" before the noun, and "right to erasure / be forgotten", now stop contact. Agent-written, unscored on real mail.
    P("\\b(delete|remove|erase|purge) (all )?(of )?(my|our) (personal |contact |stored )*(details|data|info|information|records?|profile)\\b"), P("\\bright to (erasure|be forgotten)\\b"),
    // Added 2026-11-04 (second probe): threats and "stop mailing me" went to unclear or past the rules; a legal threat or a block/report
    // threat is an opt-out, never a reason to draft. Agent-written, unscored on real mail.
    P("\\b(my|our) (lawyer|attorney|solicitor|legal (team|counsel|department)) (will|is going to|are going to|shall|has been (told|notified|informed))\\b"), P("\\b(involve|involving|call|calling|contact|contacting|notify|notifying|inform|informing) (my|our) (lawyer|attorney|solicitor|legal (team|counsel|department))\\b"), P("\\b(legal action|sue you|take (legal|further) action|report you to)\\b"), P("\\b(block|blacklist|blocklist|ban) (you|your (domain|address|emails?|messages))\\b"),
    P("\\bstop (mailing|calling|texting|pinging|bugging|harassing)\\b"), P("\\bsmettete di (contattarmi|scrivermi|mandarmi)\\b"), P("\\bsmetti di (contattarmi|scrivermi)\\b"),
    // Other languages (added after the third eval set; unverified beyond one example each): FR, DE, ES, IT opt-out phrasings.
    P("\\bne (me )?contactez plus\\b"), P("\\b(retirer|supprimer) (de|mon|mes|mon adresse)\\b.*\\b(liste|diffusion|donn[ée]es)"), P("\\b(kontaktieren|anschreiben|schreiben)( sie)? mich nicht mehr\\b"), P("\\bnicht mehr (kontaktieren|anschreiben|schreiben)\\b"), P("\\bsc?hreiben sie mir nicht mehr\\b"), P("\\bno me (vuelvan a )?(escrib|contact)"), P("\\bnon (mi |ci )?contatt\\w* pi[uù]\\b"), P("\\bnon contattatemi\\b"),
    // Added 2026-11-02 (second probe): SV, DA, NO, PL, FI, TR, CS, HU, RO, RU, JA, ZH and DE/EN gaps; 27 of 37 short phrasings went to "unclear". Agent-written, unscored on real mail.
    // No \\b around non-ASCII letters (JS \\b is ASCII-only).
    P("ta bort mig fr[åa]n"), P("sluta (skicka|maila|mejla)"), P("avregistrera"), P("inte ha fler (mejl|mail|e-?post)"), P("fjern mig fra"), P("send (mig )?ikke flere"), P("slett meg fra"), P("ikke send meg"),
    P("usun[ąa][ćc] mnie"), P("usun[ąa][ćc] (m[óo]j|nasz) adres"), P("\\bhow many times (do|must|should|will) (i|we) (need|have) to (say|ask|tell|repeat)\\b"), P("\\bout\\W+of\\W+your\\W+(database|list|crm|system)\\b"), P("nie (przesy[łl]a|wysy[łl]a|piszcie)\\w* (mi )?wi[ęe]cej"), P("wypisa(nie|ć)"), P("poista minut"), P("[äa]lk[äa][äa] l[äa]hett[äa]k[öo]"),
    P("beni (listenizden|listeden) [çc][ıi]kar"), P("bir daha (e-?posta|mail|mesaj) g[öo]nderme"), P("abonelikten [çc][ıi]k"),
    P("odhla[šs]te m[ěe]"), P("nepi[šs]te mi"), P("t[öo]r[öo]ljenek"), P("[șşs]terge[țţt]i-?m[ăa]"), P("m[ăa] [șşs]terge[țţt]i"), P("nu (mai )?trimite[țţt]i"),
    P("не (пишите|присылайте|отправляйте) (мне )?больше"), P("удалите меня"), P("отпишите меня"), P("отписаться"),
    P("配信を?停止"), P("配信解除"), P("退订"), P("取消订阅"), P("不要再(给我)?发"), P("请勿再(给我)?发"),
    P("\\b(refrain|desist) from (emailing|contacting|writing|messaging|reaching out)"), P("\\bstop (reaching out|contacting|emailing|writing|messaging)\\b"), P("\\btake me off\\b"),
    P("keine (werbung|weiteren (nachrichten|e-?mails|mails)|mails mehr)"), P("aus dem verteiler"), P("streichen sie mich"),
    // Added 2026-11-10 from the first real opt-out recall set (eval/optout-recall.mjs, Enron 2*-f*; 103 of 113 caught before):
    // "Please get me off.", "get me off whatever distribution list", "get my name taken off", "delete me from the list",
    // "delete my name off the mailing list", "Please do not send me these charts", "do not send me any other solicitation".
    P("\\bget (me|us) off\\b(?! (the |this |my |that )?(phone|hook|plane|bus|train|call|line|ground|couch))"), P("\\bget (my|our) (name|names|address|email|e-?mail address) (taken )?off\\b"),
    P("\\bdel(e|ea)te (me|us|myself) (from|off)\\b"), P("\\bdel(e|ea)te (my|our) (name|names|address|email|e-?mail address) (from|off)\\b"),
    P("\\b(do not|don'?t|dont) send (me|us) (these|this|those|any (other|more|further)|more|anything)\\b"),
    // Third round, 2026-11-11: "this employee no longer works for me...please discontinue sending me these requests" (Enron 2*).
    P("\\bdiscontinue (sending|e-?mailing|mailing|forwarding) (me|us)\\b"),
  ],
  bounce: [
    P("\\bdelivery (status notification|has failed|failure)\\b"), P("\\bundeliverable\\b"), P("\\bmail delivery (subsystem|failed|system)\\b"), P("\\baddress (not found|couldn'?t be found|rejected)\\b"),
    P("\\b55[0-4][ -]5\\.\\d\\.\\d\\b"), P("\\bmailbox (unavailable|not found|does not exist|is full)\\b"), P("\\buser unknown\\b"), P("\\bno such user\\b"), P("\\brecipient address rejected\\b"), P("\\bmessage (wasn'?t|was not|could not be) delivered\\b"),
    P("\\breturned mail\\b"), P("\\bautomatically rejected\\b"), P("\\b(cannot|can'?t|could ?n[o']?t|unable to) be delivered\\b"), P("\\bnot (be )?delivered to (the following|one or more)\\b"), P("\\b(mail|message) (rejected|undeliverable)\\b"), P("не может быть доставлен"),
  ],
  out_of_office: [
    P("(?<!\\b(?:was|were|been|being)(?: \\w+ly)? )(?<!\\bhad been )\\bout of (the )?office\\b"), P("\\booo\\b"), P("\\bautomatic reply\\b"), P("\\bauto(matic)?[- ]?reply\\b"), P("\\bon (annual |parental |maternity |paternity |medical |sick )?leave\\b"), P("\\b(i am|i'?m) (currently )?on (a )?sabbatical\\b"), P("\\bmessages (are|is) not (being )?monitored\\b"), P("\\b(i am|i'?m) (currently )?(away|travell?ing|on vacation|on holiday)\\b"), P("\\b(i am|i'?m) (currently )?out (of (the )?(office|town|country)|of state|starting|most of|later today|for (the )?(next|rest|remainder)|the (rest|remainder)|until|till|through|thru|on (leave|vacation|holiday|pto|a|an|sick|medical|parental|maternity|paternity|business)|today|tomorrow|this week|(all )?next \\w+|all (week|weekend|day)|from|for the (day|week|rest)|with (limited|no)|and will)\\b"),
    P("\\b(limited|no) access to (my )?e-?mail\\b"), P("\\bwill (be back|return)\\b"), P("\\bback in the office\\b"), P("\\breturning (on|to the office)\\b"), P("\\baway from (the office|my desk)\\b"),

    // Added 2026-10-26, same caveat as the opt-outs above: DE, FR, ES, IT, PT, NL auto-reply phrasings.
    P("abwesenheit"), P("\\bnicht (im|in meinem|im meinem) b[üu]ro\\b"), P("\\bau(ß|ss)er haus\\b"), P("\\bbin (bis|vom|ab) .{0,40}(abwesend|im urlaub|nicht erreichbar)"), P("automatische antwort"), P("\\bim urlaub\\b"),
    P("r[ée]ponse automatique"), P("message d'?absence"), P("\\b(absent|absente) (du bureau|jusqu)"), P("\\ben cong[ée]s?\\b"), P("\\bde retour (le|lundi|mardi|mercredi|jeudi|vendredi|d[èe]s)\\b"), P("hors du bureau"),
    P("respuesta autom[áa]tica"), P("fuera de (la )?oficina"), P("\\bestar[ée] (ausente|de vacaciones|fuera)\\b"), P("\\bde vacaciones\\b"), P("mensaje autom[áa]tico"),
    P("risposta automatica"), P("fuori (dall')?ufficio"), P("\\bfuori sede\\b"), P("\\bsono (in ferie|assente)\\b"),
    P("resposta autom[áa]tica"), P("fora do escrit[óo]rio"), P("\\best(ou|arei) (ausente|de f[ée]rias)\\b"),
    P("jag [äa]r p[åa] semester"), P("semester (till|fram till) "), P("automatisch antwoord"), P("automatisch bericht"), P("\\bafwezig\\b"), P("niet (aanwezig|op kantoor)"), P("buiten kantoor"),
  ],
  left_company: [
    P("\\b[a-z]+ left (the company|the firm|the business|us)\\b"),
    P("\\b(doesn'?t|does not|don'?t|do not|no longer) work(s|ing)? (here|there|for|at)\\b"), P("\\bno longer at\\b"), P("\\b(i|we) (don'?t|do not) (handle|deal with|look after|manage) (this|that|these|purchasing|software)\\b"), P("\\b(would be|is) the (one|person|right one) to (talk|speak) to\\b"), P("\\breplacement is\\b"), P("\\bmoved (on|to a new role|to another company)\\b"),
    P("\\bno longer (with|at|work(s|ing)? (for|at)|employed)\\b"), P("\\b(i'?ve|i have) moved (to|on|into)\\b.{0,40}\\bno longer\\b"), P("\\bno longer (handle|manage|own|deal with|look after)\\b"), /\b(has|have|had|Has|Have|Had) left ([Tt]he ([Cc]ompany|[Ff]irm|[Bb]usiness|[Oo]rgani[sz]ation)|[A-Z][\w&.'-]*)(?! (a|an|the|you|me|him|her) )/, P("\\b(i'?m|i am) not the right (person|contact)\\b"), P("\\bnot the (right|best|correct) (person|contact|one)\\b"),P("\\bthe right (person|contact) (is|would be)\\b"), P("\\bwrong (person|contact)\\b"), P("\\b(inbox|mailbox|address|account) (is )?(no longer|not) (monitored|checked|in use|active|staffed)\\b"),
    // The name must follow the verb and be capitalised (case-sensitive; with the i flag "[A-Z][a-z]+" matched any word, so
    // "Please email the form back to me" was a referral, Enron 2026-11-11).
    /\b([Pp]lease|PLEASE|[Yy]ou should|[Bb]etter to|[Tt]ry) (contact|reach out to|e-?mail|speak (to|with)) (my |our )?(colleague |replacement |manager |boss )?(\S+@\S+|[A-Z][a-z]+( [A-Z][a-z]+)?\b)/, P("\\bthis (mailbox|address) is (no longer|not) (monitored|in use)\\b"), P("(?<!\\b(could|would|should|might|may) have )\\b(has|have|had|i|i'?ve|we|she|he|they|just|recently) (just |recently )?retired\\b"), P("\\bhandles (this|that|these|purchasing|procurement)\\b"),
    // 2026-11-02: referrals phrased around who owns the decision, and the same "wrong person" in six languages.
    P("\\b(i|we)('ve| have)? (quit|resigned from)\\b"),
    // "I left Acme in March", "I have left the firm"; not "I left you a message", "I left at noon", "I left Cindy a note" (Enron, 2026-11-11).
    /\b(I|i|We|we)('ve| have)? left ([Tt]he ([Cc]ompany|[Ff]irm|[Bb]usiness|[Oo]rgani[sz]ation|[Aa]gency|[Pp]ractice)|my (job|role|position|post)|[A-Z][\w&.'-]*( [A-Z][\w&.'-]*){0,2})(?=\s+(in|last|at the end|back in|earlier|this (year|month|spring|summer|fall|autumn|winter)|over|about|two|three|several|recently|on \w+day|a (few|couple|while|month|year))\b|\s*[,.;!]|\s*$)/, P("\\bwho (owns|runs|decides|handles|manages|is responsible for) (this|that|these|it)\\b"), P("\\b(direct|send|route|address) (all |any )?(inquiries|enquiries|requests|questions) to\\b"), P("\\b(speak|talk) (to|with) our (head|director|vp|manager|owner|cfo|cto|ceo|coo|procurement|ops)\\b"),
    P("\\btook over (from me|for me|this|my)\\b"), P("\\b(this|that) goes to\\b"), P("\\b(passed|handed|delegated) (this|your (note|email|message)|it) (on |over )?to\\b"),
    // 2026-11-04: "forwarding this to our head of logistics" reads as interest to the rules; it is a handover, so a person decides.
    P("\\b(forward(ed|ing)?|pass(ed|ing)?|send(ing)?|sent|hand(ed|ing)?) (this|it|your (note|email|message|mail))( on| along| over)? to (our|my|the) (head|director|vp|manager|owner|cfo|cto|ceo|coo|team|colleague|boss|procurement|ops|\\w+ lead)\\b"),
    P("no soy (la persona|el contacto|el responsable)"), P("je ne suis pas (la bonne personne|le bon contact|la personne)"), P("ich bin (nicht zust[äa]ndig|nicht der richtige|nicht die richtige)"), P("non sono (la persona giusta|il referente|io il responsabile)"), P("n[ãa]o sou (a pessoa|o respons[áa]vel|o contato)"), P("ik ben niet de juiste (persoon|contactpersoon)"),
  ],
  not_now: [
    P("\\b(ask|try|contact|ping|email|call) (me|us) (again )?(in|after|next|around|later(?! (today|this (morning|afternoon|evening)))|down the line|then)\\b"), P("\\btry again (in|after|next|later)\\b"), P("\\bhold off\\b"), P("\\blet you know when\\b"), P("\\bdown the (line|road)\\b"), P("\\bnot this (year|quarter|month)\\b"), P("\\bin the (spring|summer|fall|autumn|winter)\\b"), P("\\b(in the )?(middle|midst) of (a|an|our)\\b"),
    P("\\bcome back (then|in|after|next|around)\\b"),
    P("\\bnot (right )?now\\b"), P("\\bnot at (this|the moment)\\b"), P("\\b(circle|check|touch) back\\b"), P("\\breach (back )?out (again )?(in|after|next|around)\\b"), P("\\b(follow up|get back to me|try (me|us) again|ping me) (in|after|next|around)\\b"),
    P("\\bnot (a|the) (top )?priority (right now|at the moment|this (quarter|year))\\b"), P("\\b(maybe|perhaps|possibly) (in|next|after|later)\\b"), P("\\bbudget (is |has been )?(frozen|locked|spent|set)\\b"), P("\\b(timing|the timing) (isn'?t|is not) (right|great|good)\\b"),
    P("\\b(revisit|reconsider|look at (this|it)) (in|next|after|later)\\b"), P("\\b(too busy|swamped|slammed) (right now|at the moment|this (month|quarter))\\b"), P("\\bnext (quarter|year|fiscal year)\\b"), P("\\b(later|end of) (this|the) year\\b"), P("\\bafter (the )?(holidays|new year)\\b"),
    // Added 2026-11-04 after eval/fresh-2026-11-04b.jsonl (agent-written, 30 mixed replies) went 23/30 with 0 overreach: "check in again in six months", "not a priority this half".
    // Added 2026-11-08: "once we close our funding round, probably spring" (a condition, then a season).
    P("\\bonce (we|i|the) (close|finish|complete|wrap|launch|ship)\\b.{0,40}\\b(spring|summer|fall|autumn|winter|q[1-4]|january|february|march|april|may|june|july|august|september|october|november|december)\\b"),
    P("\\breach (back )?out again once\\b"), P("\\btry me (the )?(week|month|day)s? after\\b"),
    P("\\bcheck in (again )?(in|after|next|around)\\b"), P("\\bnot a (top )?priority (this|for the|for this) (half|period|stretch)\\b"),
  ],
  not_interested: [
    // Added 2026-11-03 (eval/fresh-2026-11-03b.jsonl, 13 of 50 missed): bare "pass", "different direction", "isn't relevant", "not looking at", "so no".
    P("^\\s*pass[.!]*\\s*$"), P("\\b(different|another) direction\\b"), P("\\b(isn'?t|is not|aren'?t|are not) (really )?relevant\\b"), P("\\bnot looking at\\b"), P("\\bso no[.!]*\\s*$"),
    P("^\\s*(nope|no|nah)\\.?\\s*$"), P("\\bnot (be )?moving forward\\b"), P("\\bnot relevant\\b"), P("\\b(we|i) (don'?t|do not) need (this|it|that|you|your)\\b"),
    P("\\bnot interested\\b"), P("\\bno,? thanks?( you)?\\b"), P("\\bno thank you\\b"), P("\\b(we['’]re|we are|we re) (all )?(set|good|fine)\\b"), P("\\b(don'?t|do not) (have a |see a )?need\\b"), P("\\bno need\\b"), P("\\b(i'?ll|i will|we'?ll|we will) pass\\b"), P("\\bnot (a )?(good )?fit\\b"), P("\\b(isn'?t|is not|wouldn'?t be) (a )?(good |great )?fit\\b"),
    // Added 2026-11-02 after a probe: "not interested" in PT, DE, FR, ES, IT, NL went to "unclear". Agent-written, unscored on real mail.
    P("n[ãa]o (tenho|temos|estou|estamos) interess"), P("sem interesse"), P("kein(e)? (interesse|bedarf)"), P("\\bnicht interessiert\\b"), P("pas (int[ée]ress[ée]|besoin)"), P("ne nous int[ée]resse pas"), P("ça ne m'int[ée]resse pas"),
    P("no (me |nos )?interesa\\b"), P("no (estoy|estamos) interesad"), P("non (sono|siamo) interessat"), P("non ci interessa"), P("geen (interesse|behoefte)"), P("niet ge[ïi]nteresseerd"),
    P("\\bnot for (us|me)\\b"), P("\\b(this|that|it) (isn'?t|is not) for (us|me)\\b"), P("\\bdecided against (it|this|that)\\b"), P("\\bstill the same answer\\b"), P("\\bya tenemos (una )?soluci[óo]n\\b"), P("\\b(we'?re|we are) not the right (company|business|fit|org|organi[sz]ation)\\b"), P("\\bnot something (we|i)'?(re| are| am)? (looking|interested)\\b"), P("\\bnot looking (for|to)\\b"), P("\\bplease don'?t follow up\\b"), P("\\bwe'?ll never\\b"),
    // Added 2026-11-04 after eval/fresh-2026-11-04b.jsonl (agent-written, 30 mixed replies) went 23/30 with 0 overreach: "isn't something we'd ever need".
    P("\\b(isn'?t|is not) something (we|i)('d| would)? ever (need|use|want)\\b"),
    // Added 2026-11-08 after the sixteenth set (eval/fresh-2026-11-08c.jsonl, a false-"interested" probe): a decline that also sounds polite.
    P("\\bclose (the|our|this) (file|ticket|thread|opportunity)\\b"), P("\\b(won'?t|will not|are not going to|aren'?t going to) be (buying|purchasing|signing|moving forward)\\b"), P("\\bno (call|demo|meeting) (is )?(needed|necessary)\\b"), P("\\bno need to (schedule|book|set up)\\b"), P("\\bfroze all new\\b.{0,30}\\bfor good\\b"),
    // Added 2026-11-10: "not something we'd ever buy".
    P("\\bnot something (we|i)('d| would)? ever (buy|purchase|pay for)\\b"),
  ],
  objection_price: [
    P("\\b(over|beyond|outside|above) (what (we|i) can (spend|afford|pay)|our (budget|range|price range))\\b"), P("\\bmoney is tight\\b"), P("\\bhard to justify\\b"), P("\\b(cost|price|pricing|quote)s?\\b.*\\b(too high|way over|steep|out of reach)\\b"),P("\\btoo (expensive|pricey|costly|much)\\b"), P("\\bsounds (expensive|pricey|costly)\\b"), P("\\b(can'?t|cannot|couldn'?t) afford\\b"), P("\\b(no|don'?t have (the |a )?|out of) budget\\b"), P("\\bprice is (too )?(high|steep)\\b"), P("\\bcheaper\\b"), P("\\bdouble what (we|i) (pay|spend)\\b"), P("\\b(costs?|priced) (more|higher) than\\b")],
  objection_competitor: [
    P("\\b(under |in a |have a |signed a )?(contract|agreement) with\\b.*\\b(until|through|expires|renew)"), P("\\blocked (in|into)\\b"), P("\\balready (pay|paying|use|using|subscribe|subscribed)\\b.{0,12}\\b(for|to)\\b"),
    P("\\bswitched to\\b"), P("\\b(just |recently |last (week|month) )?(signed|went|gone|renewed) with\\b"), P("\\b(chose|selected|picked|went for) (another|a different|a competitor|\\w+ instead)\\b"),P("\\b(no|not) plan(s|ning)? to (change|switch|move)\\b"), P("\\balready (does|handles|covers|has|do)\\b"),P("\\b(we|i) (already )?(use|have|work with|are using|'?re using|rely on)\\b.*\\b(already|currently|happy|for (this|that))\\b"), P("\\balready (have|use|using|work with|got)\\b"), P("\\bhappy with (our|what|the)\\b"), P("\\b(locked|signed) (in|into)\\b.*\\bcontract\\b"), P("\\bin a contract\\b"), P("\\bbuilt (it|this|our own) (in[- ]house|ourselves)\\b"), P("\\bbuilt (our|my) own\\b"), P("\\bin[- ]house\\b"), P("\\bin[- ]house (solution|tool|team)\\b")],
  objection_authority: [
    P("\\b(legal|security|compliance|it|infosec|procurement) (team |department )?(would|will|won'?t|wouldn'?t)( never| not)? (approve|allow|sign off|permit)"),
    P("\\b(legal|security|compliance|it|infosec|procurement) (team |department )?(won'?t|wouldn'?t|will not|would not) let (us|me)\\b"), P("\\b(need|get|have) (approval|sign[- ]?off)\\b"), P("\\bsign[- ]?off from\\b"),P("\\bnot my (decision|call|department|area)\\b"), P("\\b(need|have) to (check with|check|run it by|ask|talk to) (my|our|the) (boss|manager|team|cfo|ceo|partner|director|head)\\b"), P("\\b(above|outside) my (pay grade|remit)\\b")],
  objection_need: [
    P("\\bunless you\\b"),
    P("\\bwhy would (we|i) need\\b"), P("\\b(already )?know (their|our|the) routes\\b"),P("\\b(don'?t|do not) see (the|how|why)\\b"), P("\\bwhat makes (you|this|it) different\\b"), P("\\bsounds like (every|all the) other\\b"), P("\\bhow is (this|it) different\\b"), P("\\bnot convinced\\b"), P("\\b(don'?t|do not) trust (ai|automat|a robot|a bot|machines?)\\b"), P("\\b(customers|clients|people|prospects) can (tell|smell)\\b"), P("\\bskeptical\\b"),
    // Added 2026-11-04 after eval/fresh-2026-11-04b.jsonl (agent-written, 30 mixed replies) went 23/30 with 0 overreach: "won't adopt another app, we tried that".
    P("\\b(drivers|reps|staff|team|people|users|crew)\\b.{0,30}\\bwon'?t (adopt|use|switch)\\b"), P("\\b(reps|staff|team|people|users|crew|drivers)\\b.{0,15}\\b(hate|dislike|resent)\\b.{0,30}\\b(click|extra|another|app|tool|step)"), P("\\bwe tried (that|this|something (like|similar))\\b.*\\b(fail|didn'?t work|flopped)"), 
    // Added 2026-11-07: a deliverability worry ("spam our prospects", "hurt our domain reputation") is an objection, not a reply to read.
    // Added 2026-11-08: "sends spam under our name", "we got burned by that before".
    // Added 2026-11-10 (eval/fresh-2026-11-13.jsonl, a question/objection/interest probe): "tried something similar ... a mess, sceptical",
    // "doesn't fit a business our size".
    P("\\b(we|i) tried (that|this|something (like|similar))\\b.{0,60}\\b(mess|messy|sceptical|skeptical|waste|useless|poor)\\b"), P("\\b(sceptical|skeptical)\\b"),
    P("\\b(don'?t|doesn'?t|do not|does not) (think (this|it) )?fits? (a |our )?(business|company|team|firm)\\b"),
    P("\\bspam\\b.{0,30}\\bunder (our|my) name\\b"), P("\\b(we|i)('ve| have)? (got|been|were|was) burned\\b"),
    P("\\b(spam|annoy|irritate) (our|my|the) (prospects|customers|clients|leads)\\b"), P("\\b(hurt|damage|harm|ruin) (our|my|the) (domain|sender|email|brand) (reputation|score)\\b")],
  meeting: [
    // 2026-11-11: a direct ask to meet ("Can you do Wednesday at 10?", "call me later today") is interest.
    P("\\bcan you do (monday|tuesday|wednesday|thursday|friday|tomorrow|next week|this week|today)\\b"), P("\\bcall me (later )?(today|tomorrow|this (morning|afternoon|evening)|around \\d)"),
    // 2026-11-03: "are you free next Tuesday", "set up 20 minutes", "book something with me", "walk me through", "curious to learn".
    P("\\bare you (free|available)\\b"), P("\\b(set up|schedule|book|grab) (\\d+ (min|minutes)|something|some time|time)\\b"), P("\\bcan we (set up|schedule|book)\\b"), P("\\bwalk me through\\b"), P("\\bwalk my team through\\b"), P("\\bsend me a time\\b"), P("\\bmy calendar:"), P("\\b(curious|keen|eager) to (learn|hear|know|see)\\b"), P("\\bplease (book|schedule|set up)\\b"), P("\\bsee a demo\\b"),
    P("\\b(would|'d) love (a|to see|to learn|to hear)\\b"), P("\\byes,? please\\b"), P("\\bcount (me|us) in\\b"), P("\\bwhat are (the )?next steps\\b"), P("\\bi can do (a call|monday|tuesday|wednesday|thursday|friday|tomorrow)\\b"), P("\\bmy calendar is\\b"), P("\\bfind (\\d+ minutes|some time|a time|time)\\b"), P("\\bforward(ing|ed)? (this |you )?to\\b"), P("\\bover to you\\b"), P("\\bwhen can you (show|demo|walk)\\b"),
    P("\\b(let'?s|happy to|glad to|would love to|i'?d (like|love) to|open to|keen to|could|can) (set up|schedule|book|jump on|hop on|have) (a )?(call|chat|meeting|demo|time|conversation)\\b"), P("\\b(send|share) (me |over )?(some |a few )?(times|slots|availability|your calendar|a (calendar )?link|a link)\\b"),
    P("\\b(book|grab|find|pick) (a )?(time|slot)\\b"), P("\\bhow (about|does) (monday|tuesday|wednesday|thursday|friday|next week|tomorrow)\\b"), P("\\b(free|available|works for me) (on |at )?(monday|tuesday|wednesday|thursday|friday|tomorrow|next week|this week|\\d)\\b"),
    P("\\b(i'?m|we'?re|i am|we are) (interested|keen|curious)\\b"), P("\\b(set up|schedule|book) (a )?(demo|call|meeting|time)\\b"), P("\\bcalendly\\b"), P("\\b(happy|glad|open|keen|willing) to (take a look|learn more|hear more|chat|talk|connect)\\b"), P("\\b(tell|show) me more\\b"), P("\\bsend (me |over )?(more info|details|the deck|a proposal|pricing)\\b"),
    P("\\bsounds (interesting|good|great|promising|useful)\\b"), P("^\\s*intrigued\\b"), P("\\bcall me (on|at)\\b"), P("\\b(send|share|give) (me )?(\\d|two|three|a few|some)\\S*( or \\d| to \\d)?\\s*(times|slots|options)\\b"), P("\\b(let'?s|lets) (talk|chat|connect)\\b"), P("\\bcan we (talk|chat|meet|speak|connect|jump on|hop on)\\b"), P("\\bwhen (are|is) (you|a good time)\\b"), P("\\bloop(ing)? in\\b"),
    // Added 2026-11-10: "send over a short deck", "we've been looking for something like this".
    P("\\bsend (me |over )?(a |the )?(short |quick )?deck\\b"), P("\\b(we|i)('ve| have) (actually )?been looking for (something|a way|a tool)\\b"),
    // Added 2026-11-04 after eval/fresh-2026-11-04b.jsonl (agent-written, 30 mixed replies) went 23/30 with 0 overreach: "book me in", "open to a quick intro call", "Does Friday morning work?".
    P("\\b(book|sign|put) (me|us) (in|up|down)\\b"), P("\\bopen to (a|an) (quick |short )?(intro |introductory )?(call|chat|demo|meeting)\\b"), P("\\bdoes (monday|tuesday|wednesday|thursday|friday|tomorrow|next week)( \\w+)? work\\b"),
    // Added 2026-11-07 after eval/fresh-2026-11-07.jsonl (agent-written) missed these: "a quick call tomorrow", "who should I talk to to get started".
    P("\\b(can|could|shall) we (do|have|get) (a |an )?(quick |short |brief )?(call|chat|catch[- ]?up)\\b"), P("\\bwho (should|do|can) (i|we) (talk|speak) (to|with)\\b.{0,25}\\b(start|started|begin)\\b"), P("\\bwant to see (this|it|a demo)\\b|\\bwould like to see (this|it|a demo)\\b|\\bi'?d like to see (this|it)\\b"),
  ],
};

function hits(list, s) { for (const re of list) { const m = s.match(re); if (m) return m; } return null; }

/**
 * Sentences that use a stop word without asking for a stop, found on real mail (eval/enron.mjs, 2026-11-10: 9,534 real
 * Enron replies, 399 stops fired, most of them wrong). A sentence that matches its category's veto is skipped for that
 * category only. Narrow on purpose; each line names the real phrasing it answers.
 */
// Confidentiality notices ("if you have received this in error ... delete this message from your system") ask nothing.
const DISCLAIMER = /\bdelete (this|the) (message|e-?mail|communication)\b.{0,40}\bfrom your (system|computer)|\b(intended recipient|in error|by mistake|received this (e-?mail|message|communication)|confidential(ity)? (notice|information)|privileged)\b/i;
// List and newsletter footers: an instruction with a mechanism ("To unsubscribe from this group, send an email to",
// "click here to unsubscribe"), not a person asking.
const LIST_FOOTER = /\b(to|how to|you can|you may) (unsubscribe|opt[- ]?out|be removed)\b|\bunsubscribe\b.{0,80}\b(click|send an? e-?mail|send a message|visit|go to|link|mailto|in the (subject|title|body)|reply with|at any time)\b|\b(click|follow) (here|this link|the link)\b.{0,40}\bunsubscribe\b|\bno longer wish to (receive|subscribe)\b.{0,80}\b(click|forward|send|visit|e-?mail)\b|\b-unsubscribe@|\bleave-[\w-]+@/i;
const VETO = {
  unsubscribe: [DISCLAIMER, LIST_FOOTER,
    // "an opt-out clause", "opt-out program", "optout language", "a mutual no solicitation provision".
    /\bopt[- ]?out (clause|program|programme|language|provision|period|right|option|form|election)s?\b|\b(re|fw|fwd): .*\boptout\b|\bno[- ]solicitation"? provisions?\b/i,
    // "take legal action against generators" in a forwarded news story: a threat to us names us ("you", "your company").
    /\blegal action\b(?!.{0,40}\b(you|your)\b)/i,
    // Second round, 2026-11-11 (both earlier Enron halves; eval/README.md "Second round"): someone else is told to stop
    // ("christian needs to stop sending these", "Please do not email this to John", "Do not call him!"), a to-do list
    // ("one thing to cross off your list"), opting out of a programme ("Voluntary Opt Out of Rate Freeze").
    /\b(needs? to|should|has to|have to|must) stop sending\b|\b(do not|don'?t) (e-?mail|send|forward) (this|it|that|these) to\b|\b(do not|don'?t) call (him|her|them)\b|\bcross (\w+ )?off\b|\bopt[- ]?out of (?!(this|these|your|our|the (list|mailing|e-?mails?|newsletter|distribution)|future|all|e-?mails?|communications?|marketing|mailings?|further|any)\b)/i],
  left_company: [DISCLAIMER,
    // "I left you a voicemail", "I've left messages at CDEC", "I have left Coralina a message", "when I left", "we left it out".
    /\bleft (you |him |her |them |\w+ |\w+ \w+ )?(a |two |several |some |another )?(voice[- ]?mails?|vms?|messages?|notes?|word|blank)\b|\b(as soon as|when|since|before|after|until|once|by the time) (i|we|he|she|they) left\b|\b(i|we) left (it|that|this|them|the (meeting|office|details|tax|room)|early|there|a little)\b|\b(has|have) left (me|us) (speechless|brain|with)\b|\bwhat do we have left\b|\bhave left (that|it|this) to\b|\bleft (out|off)\b/i,
    // Sign-off contact lines: "If you have any questions, please contact me at x5702", "please contact Sherri Sera for the
    // dial-in number", "please email me the draft". A referral away from the writer names someone else for *this*.
    /\b(if|should|in the event|in the interim|any (questions|queries)|questions|further (information|concerns)|additional information|for the (weekly|dial|number)|to (schedule|arrange|register|make|confirm)|regarding|re this|as soon as possible)\b.{0,200}\b(please )?(contact|e-?mail|call)\b|\b(please )?(contact|e-?mail|call) .{0,120}\b(if|should you|with (any|questions|your)|for (the|a|more|further)|to (schedule|arrange|make|discuss|confirm)|regarding|re this|before|when it is)\b/i,
    /\bplease (contact|e-?mail|email|call) (me|us|my office|our office|him|her|them|one of us)\b/i,
    // "how you would like us to handle this", "able to handle this", "before this goes to VEPCO", "if you do not work for".
    // Second round, 2026-11-11: a condition about someone else ("if he is no longer with Enron", "If you're not the right
    // person, could you please pass it on"), an object that moved ("will be moved on/off the next business day").
    /\bif (he|she|they|you|you'?re|he'?s|she'?s)( are| is)? (no longer|not the right)\b|\bmoved on\/|\bcould have retired\b/i,
    /\b(to|me|us|we|i|you) handle (this|that|these)\b|\b(before|after|when|until|once) this goes to\b|\bif you (do not|don'?t) work\b|\buntil (he|she) retired\b/i],
  not_interested: [DISCLAIMER,
    // Second round, 2026-11-11: "we don't need to confirm any of these deals", "We do not need to limit ourselves", "no need to
    // do anything more", "No need for thanks", "Not for us to contact the ISOs", "I'll pass the good news on to the trader",
    // "I think we are good to go", "If you've gotten them from Vicky, then we're set". Not "no need to follow up" or "we
    // don't need to talk", which stay stops.
    /\b(don'?t|do not) need to (?!(talk|speak|hear|meet|buy|switch|change|look|add|hire|chat|discuss|be (contacted|on))\b)\w+|\bno need (to (?!(follow|reach|contact|call|e-?mail|write|keep|schedule|book|set up|meet|demo|talk|speak|chat|hop|jump|send (me|us)|check back|circle back)\b)\w+|for (thanks|thank|that,? thanks))\b|\bnot for us to\b|\b(i'?ll|i will|we'?ll|we will) pass (the |your |this |that )?(\w+ ){1,3}on to\b|\bgood to go\b|\bif\b.{0,80}\b(we'?re|we are) (all )?(set|good|fine)\b/i,
    // "there is no need to e-dash the deal", "no need to thank me", "no need for the attitude", "ENA Tax says we don't need to
    // register", "they don't need to check the bill", "files we don't need".
    /\bthere('?s| is| was| will be)( really)? no need\b|\bno need (to (thank|get|take|reiterate|make|review|send me)|for (the|a|an|this|additional|formal|exhibit))\b|\b(they|you|he|she|it|tax|counsel) (don'?t|do not|doesn'?t|does not) need\b|\b(don'?t|do not) need (to (register|wait|check|tell|worry|sign)|board|outside|an? \w+ one|credit|tickets)\b|\bwe (don'?t|do not) need\.?\s*$|\b(files|anything) we (don'?t|do not) need\b/i,
    // "I'll pass on SMU news to Chris", "I will pass it along", "I will pass your comments on", "pass it by your desk".
    /\b(i'?ll|i will|we'?ll|we will) pass (it|this|that|them|your|the) (on|along|to|by)\b|\b(i'?ll|i will|we'?ll|we will) pass (it |this |that |them |your \w+ |the \w+ )?(on|along)\b.{0,60}\bto\b|\bpass (it|this|that) along\b/i,
    // "the counterparty is not interested", "tell them you're not interested", "I will assume that you are not interested".
    /\b(is|are|you'?re|your|they'?re|he'?s|she'?s|assume (that )?\w+ (is|are)) not interested\b/i,
    // "we are fine with changing", "were fine with it", "we're all set on the language".
    /\b(we'?re|we are|were) (all )?(fine|good) with (?!(our|what we|the (current|one|tool|system|vendor|provider)))|\b(we'?re|we are|were) (all )?set on\b|\b\w+(,| and) \w+,? and \w+ were fine\b|\bwere set up\b/i],
  out_of_office: [DISCLAIMER,
    // Someone else, a plan or a condition, not an away notice: "Please advise if you are planning to be out of the office",
    // "slipped out of the office", "calling in from out of the office", "when he gets back in the office", "I'm out of here".
    /\b(if|whether) (you|i|i'?m|i am|he|she|they)\b.{0,30}\b(out|back)\b|\bwhen (he|she|they) (gets?|is|are|comes?) back\b|\bwhen i am out\b|\b(planning|plan) to be out of the office\b|\b(stepped|slipped|step|slip) out of the office\b|\bfrom out of the office\b|\bpipelines are out\b|\bout of here\b|\bfirst day back\b|\bdays you are\b/i,
    // "I will return same to you", "will return a fully executed copy", "will return (and goes beyond 3/31/02)".
    /\bwill return (a|the|it|same|your|this|that|my|copies|copy|to you|countersigned|fully|\(|and)\b|\bwill be back to you\b/i,
    // "$800,ooo".
    /[\d,']ooo\b/i,
    // Second round, 2026-11-11: someone else's return ("the assistant told me that you will be back on Friday", "He is not sure
    // when he will be back"), being back already ("now that I'm back in the office", "I am back in the office if anyone needs
    // me"), past absences ("i have been out of the office with no access to e-mail"), and "will be back in touch".
    /\b(you|he|she|they|it) will be back\b|\bwill be back (in touch|at full|to (work|you))\b|\b(now that|since) (i'?m|i am) back\b|\b(i'?m|i am) back in the office\b|\b(have|has|had) been out\b|\btime out of the office\b|\bwill return to (my|his|her) (?!office|desk|work)\w+|\b(while|when|whenever|if) (i'?m|i am) out\b|\b(who is|who are) (out )?on leave\b/i],
  bounce: [
    // A person mentioning a failure ("I tried to send this to your home email, but it was undeliverable", "This came back to me
    // as undeliverable", "you had the delivery failure").
    /\b(i|we|you) (tried|had|got)\b.{0,80}\b(undeliverable|delivery failure)\b|\bcame back( to me)? as undeliverable\b/i],
};
// Third round, 2026-11-11 (eval/README.md "Third round"): written from the stops still wrong on the 0*, 1* and 2* Enron
// halves, scored once on the unread 3* half. Each line quotes the real phrasing it answers.
// A named person or he/she/they is away, not the writer ("Mike is out of the office this week, but I'll follow up", "Both
// are out of the office right now", "Mike McConnell will be out of town January 2nd through the 4th"). A wrong veto here
// sends the reply to a person instead of pausing the lead, the cheaper direction. Pronouns and names only; "I"/"We" and
// sentence openers ("This", "Unfortunately") are not a third person.
const THIRD_AWAY = /(?:\b(?:[Hh]e|[Ss]he|[Tt]hey|[Bb]oth(?: of them)?)|(?:^|[,;:]\s+|\b(?:that|and|believe|think|but|so)\s+)(?!(?:I|We|This|That|It|Our|My|Your|Please|Also|And|But|Currently|Today|Tomorrow|Unfortunately|Note|Hi|Hello|Dear|Sorry|Thanks|Yes|No|Just|If|When|As|The)\b)[A-Z][a-zA-Z'-]+(?: [A-Z][a-zA-Z'-]+)?)(?: (?:is|are|'s|will be|should be|has been|would be|was|will))(?: (?:all|currently|still|also|now|probably|both))? (?:out|back|away|return|travell?ing|on (?:vacation|holiday|leave|maternity leave))\b/;
VETO.out_of_office.push(THIRD_AWAY,
  // Back already or away in the past: "I just got back in the office today", "I've been away from the office sick".
  /\b(just |finally )?got back (in|into|to) (the )?office\b|\b(i'?ve|i have|been) (been )?away from\b/i,
  // Here now and acting: "I'm traveling today but I'll call you back", "I'm out of town now, but I believe either the 8th or
  // 9th would be great", "I'm out of the office at a meeting right now so I will get back to you". Not an away notice's
  // "but I will reply on my return".
  /\b(today|now|right now|at the moment)\b,? (but|so) (i'?ll|i will|i believe|i think|i can|i'?d)\b(?!.{0,40}\b(on my return|when i (return|am back|get back)|upon my return|respond|reply)\b)/i,
  // "Jeff will return one fully executed original to you", "about 3-4 weeks away from leaving on maternity leave".
  /\bwill return (one|two|both|all|an|signed|executed|original)\b|\baway from leaving\b/i);
VETO.not_interested.push(
  // Forwarding: "I will pass this information along to both Zina and Carrie", "Thanks, I'll pass along your comments".
  /\bpass along\b|\bpass (this|that|the|your|these|those|it) (\w+ ){0,2}along\b/i,
  // Someone else's fit or choice: "he is not a great fit because of his lack of legal experience", "Kristopher Wahlers is
  // not a good fit for our position", "When I asked Celeste about it back then she decided against it".
  /\b([Hh]e|[Ss]he|[Tt]hey|(?!(?:This|That|It|We|Our|Your|I)\b)[A-Z][a-z]+ [A-Z][a-z]+) (is|are|was|were|would be|isn'?t) not (a |the )?(good |great |right )?fit\b|\b(he|she|they) decided against\b/,
  // Past tense and plans: "since we have some available and were not looking to expand there"; "we're all set to move
  // forward starting 9/1/01".
  /\b(were|was) not looking\b|\ball set to\b/i,
  // A file to close or a need with a condition: "You will probably need to close the file before you attach", "We do not
  // need access until Monday morning", "We don't need her if we aren't going to discuss the loan", "I don't need the whole
  // document, only the portion relative to credit".
  /\bclose the file (before|first|when|after|and)\b|\b(don'?t|do not) need\b.{0,40}\b(until|if|as long as|only|just) /i,
  // A third party named, or a check about someone else's need: "No need to call Lone Star", "Please verify that both ENA
  // and ECI do not need the Securities Loan Agreement".
  /\b[Nn]o need to (call|contact|e-?mail|write to) (?!(?:me|us|Me|Us)\b)[A-Z][a-z]+|\b(verify|confirm|check|make sure|ensure) (that|whether|if)\b.{0,80}\b(don'?t|do not) need\b/);
VETO.left_company.push(
  // A third person in a relative clause: "let's omit the guys who left the company", "Kyle Etter, who has left the company",
  // "those who had retired in the last several months".
  /\bwho (has |have |had )?(just |recently )?(left|retired)\b/i,
  // The reader asked to contact or forward: "Nadia, would you please contact Patti and set up a time", "Can you forward it".
  /\b(would|could|can|will) you (please |kindly )?(contact|e-?mail|email|call|forward|reach out to)\b/i,
  // "I left Terry, the attorney a note"; "Saturday doesn't work for me"; "They have moved on to plan B", "the volumes that are
  // moved on the negotiated price deal".
  /\bleft [A-Z][a-z]+,? .{0,40}\b(a|an) (note|message|voice ?mail|vm)\b/,
  /\b(that|this|it|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|the (time|date|day|week))\s+(doesn'?t|does not|won'?t|will not) work( for)?\b/i,
  /\bmoved on (to (plan|the next)|the|a|an|this|that|these)\b|\b(are|is|were|was|be|been|being) moved on\b/i);
VETO.unsubscribe.push(
  // "tell them to stop sending invoices to you"; "I will not get any more e-mails today"; "I did not agree to this $50,000 pmt";
  // "I will remove it from John's calendar"; "remove me from such consideration"; "How many times do I have to say EMAIL IT?"
  /\b(tell|ask|told|asked) (them|him|her|[A-Z][a-z]+) to stop\b|\bany more e-?mails? (today|tonight|this (morning|afternoon|evening))\b/i,
  /\bdid not agree to (this|that|the) (\$|\d|payment|pmt|price|amount|deal|change|term)/i,
  /\bremove (it|this|that) from (\w+'s|his|her|their|the (calendar|schedule|agenda|draft|file|report))\b|\bremove me from (such |this |that |the )?(consideration|project|committee|panel|team)\b/i,
  /\bhow many times (do|must|should|will) (i|we) (need|have) to (say|tell you) (e-?mail|send|call|fax|print|file|sign)\b/i);
VETO.bounce.push(
  // A person narrating: "The following message that was originally sent with three attachments was returned as undeliverable."
  /\b(that|which) (was|i) (originally )?sent\b.{0,80}\b(returned|came back)\b/i);
// Fourth round, 2026-11-11 (eval/README.md "Fourth round"): written from the stops still wrong on the 0*-3* Enron halves
// (17 + 17 + 30 + 81 under the round-3 rules), frozen, then scored once on the unread 4* half. Each line quotes the real
// phrasing it answers.
//
// Whose absence: the last subject before the away phrase. "Craver, Edison's CEO, is traveling and won't be back in the office
// until Wednesday", "the person she needs to talk to is out of the office", "One of those guys should be back in the office",
// "Somehow her Out of Office notification stopped working", "the plane the Whalley's will be returning on Sunday", "We hope
// you will return soon to our site". When the nearest subject before the phrase is not the writer (I, me, my, we) the writer
// is not away. Sentence openers, days, months and words after a preposition ("I am in SF today but will be back") are not
// subjects. A wrong veto sends an away notice to a person instead of pausing the lead, the cheaper direction.
const AWAY_AT = /\bout of (the )?office\b|\bwill (be back|return)\b|\bback in the office\b|\breturning (on|to the office)\b|\b(away|travell?ing|on (vacation|holiday|leave))\b|\bout (today|tomorrow|until|till|through|this|next|all)\b/i;
const NOT_A_SUBJECT = new Set("I We This That It Our My Your Please Also And But Currently Today Tomorrow Tonight Unfortunately Note Hi Hello Hey Dear Sorry Thanks Thank Yes No Just If When As The Greetings Regards Actually Again Re RE FYI PS Out Away Office Back Automatic Reply Vacation Holiday Leave However Will Due Until From Through Starting Beginning On In At For Regarding Morning Afternoon Evening Good Monday Tuesday Wednesday Thursday Friday Saturday Sunday Mon Tue Wed Thu Fri Sat Sun January February March April May June July August September October November December Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec Ok OK Okay Well So Then Now While Should Could Would Can Let Let's Best Kind Cheers Enron".split(" "));
const awayIsSomeoneElse = (s) => {
  const m = s.match(AWAY_AT);
  if (!m) return false;
  const words = s.slice(0, m.index).split(/[\s,;:()"]+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i].replace(/[.!?'’]+$/, ""), lw = w.toLowerCase(), prev = (words[i - 1] || "").toLowerCase();
    if (/^(i|i'?m|i'?ll|i'?ve|i'?d|me|my|we|we'?re|we'?ll|we'?ve|us|our)$/.test(lw.replace(/’/g, "'"))) return false;
    if (/^(he|she|they|he'?s|she'?s|they'?re|him|her|his|their|them|you|you'?re|your|it|it'?s|guys|person|people|someone|everyone|members|team|who)$/.test(lw.replace(/’/g, "'"))) return true;
    if (/^[A-Z][\w&'’-]*$/.test(w) && !NOT_A_SUBJECT.has(w.replace(/['’]s$/, "")) && !/^(in|at|to|from|of|with|for|on|into|near|via|by)$/.test(prev)) return true;
  }
  return false;
};
VETO.out_of_office.push({ test: awayIsSomeoneElse },
  // Away for part of a day and here the rest of the week: "I will be out of the office on Friday, but will be in all next
  // week", "I will be out of the office this afternoon but in all day tomorrow".
  /\bbut (i'?ll |i will |will )?(be )?in (all|the office all)\b/i,
  // Not an absence: "My mom had some surgery last week and I was in and out of the office", "It is amazing what two days out of
  // the office will do to my workload", "Sorry I am traveling a bunch", "am not sure when I will be back up", "There is a good
  // chance that I will return to PDX".
  // (Case-insensitive, except the capitalised place; the frozen round-4 rules had them in one case-sensitive pattern, so the
  // first four missed capitalised text: fixed after the 4* score, README "Fourth round".)
  /\bin and out of the office\b|\b(days?|weeks?|hours?) out of the office\b|\btravell?ing (a bunch|a lot|so much|constantly)\b|\b(not sure|unsure|don'?t know) when (i|we) will be back\b/i,
  /\bwill return to (?!(the |my )?(office|desk|work)\b)[A-Z]/);
VETO.not_interested.push(
  // "We're all fine, but very busy!!!" (how are you, not a decline); "We are set for closing at 10:00 AM today".
  /\b(we'?re|we are) (all )?(fine|good|well),? but (very |really |pretty |so |super )?(busy|tired|hectic|swamped)\b|\b(we'?re|we are) (all )?set for (the )?(closing|close|signing|meeting|call|trip|deal|\d|today|tomorrow|monday|tuesday|wednesday|thursday|friday)\b/i,
  // Forwarding: "I'll pass on any other articles on the transportation industry".
  /\b(i'?ll|i will|we'?ll|we will) pass on (any|other|all|some|more|articles|info|information|news|comments|feedback|the (articles?|info|information|news|comments|feedback|word|message))\b/i,
  // A need with a reason or a condition: "I guess we don't need the talking points, but we should still try", "if you get
  // comfortable with the direction these emails are going, then we do NOT need to meet", "We don't need three different
  // people obtaining the same information", "I don't need Stokes & Bartholemew to serve as lobbyists".
  /\b(don'?t|do not) need\b.{0,60}\bbut (we|i|you) (should|will|still|need|can|must)\b|\bif\b.{0,140}\bthen (we|i) (don'?t|do not) need\b|\bneed (two|three|four|five|several|multiple|both) (different |separate )?\w+/i,
  /\b(don'?t|do not|DON'?T|NOT) need [A-Z][\w&]*( (&|and) [A-Z][\w&]*)? to [a-z]+/,
  // Technical relevance, not a decline: "it isn't really relevant for purposes of the Guarantor", "comparables ... is not
  // relevant when his business is clearly different", "capacity not relevant and self serving".
  /\brelevant for (the )?purposes\b|\bnot relevant (when|and self)\b/i,
  // "But no need to set up a formal agenda"; "Maximum Daily Delivery Point Quantity does not fit in a Deficiency Default".
  /\bno need (to \w+ (up )?)?(a |an )?formal\b|\bnot fit (in|into|within|inside) (a|an|the)\b/i);
VETO.unsubscribe.push(
  // "If you need to take it off, take it as vacation", "Could we really sell MarketPoint to a single entity ... and take it off the
  // market?"; "I would rather not get into the habit", "I would rather not have that process further delay".
  /\btake it off\b.{0,40}\b(as|for) (vacation|pto|holiday|a (personal|sick) day)\b|\btake (it|this|that) off the (market|table|books|agenda)\b/i,
  /\brather not (get into|have (that|this|the) \w+ (further|delay))\b/i,
  // Someone else leaving the writer alone: "At least they leave me alone", "if jeff would just give it up and please leave me
  // alone", "so he will leave me alone". "No more email for you today."
  /\b(they|he|she|it) (\w+ ){0,2}leave me alone\b|\bwould just\b.{0,40}\bleave me alone\b|\bwill leave me alone\b|\bno more e-?mails? for (you|him|her|them)\b/i,
  // "the TW Unsubscribed Capacity" (a pipeline report); "If you have any legal questions feel free to call our lawyer".
  /\bunsubscribed (capacity|page|transport|firm|volume|report)\b|\bfeel free to (call|contact) our (lawyer|attorney|counsel)\b/i);
VETO.left_company.push(
  // "the agreement ... has a fairly tight confidentiality provision that goes to internal communication", "There is one that goes
  // to Vallejo"; "now that Randy Baker has left Reliant"; "Turns out I was just asking the wrong person".
  /\b(provision|one|clause|section|line|road|route|bus|train|flight|pipeline|payment) that goes to\b/i,
  /\b([Nn]ow that|[Ss]ince|[Aa]fter|[Bb]ecause) [A-Z][a-z]+( [A-Z][a-z]+)? (has |had )?left\b/,
  /\b(i was|i'?ve been|i am|i'?m) (just )?(asking|calling|e-?mailing|talking to) the wrong person\b/i);
// A bare "No." starts many replies that go on to answer a question ("No. I don't think I know him. I had another contact there",
// "No - they pay you just for being you!", "no. go out after you're done at work"). It is a decline when it is the whole reply,
// or the rest is a sign-off, or the rest also declines. Applied in triage(), which sees the whole body.
const BARE_NO = /^\s*(nope|no|nah)\.?\s*$/i;
// Fifth round (eval/README.md "Fifth round"): the round-4 list counted any "not", "n't", "need" or "thanks" in the rest as a
// decline, so "NO. I need to know how many beds there are", "No. I do not have any contact information for them" and "no - I
// never heard back" stayed declines. Now the rest must decline in words that mean it.
const REST_DECLINES = /\b(not interested|no longer|stop|remove|unsubscribe|(i'?ll|we'?ll|i will|we will) pass|happy with (our|what|the)|already (have|use|using|work with)|no,? thanks?|not (for (us|me)|a (good )?fit|now|right now|at this time)|(don'?t|do not) (need|want) (it|this|that|one|any|anything|your|you)\b|(we'?re|we are) (all )?(set|good|fine)|take (me|us) off|leave (me|us) alone|please don'?t|not something|(never|ever) (buy|use|need|want|switch|pay))\b/i;
const REST_TALKS = /\b(i|i'?m|i'?ll|i'?ve|we|we'?ll|you|you'?re|he|she|it|they|is|are|was|were|have|has|had|do|does|did|will|can|could|should|would|think|know|go|let'?s|what|why|how|tell)\b/i;
// Fifth round, 2026-11-11 (eval/README.md "Fifth round"): written from the stops still wrong on the 0*-4* Enron halves under
// the round-4 rules (10 + 9 + 14 + 39 + 48), frozen, then scored once on the unread 5* half. Each line quotes the real phrasing.
VETO.left_company.push(
  // Someone else passed a task along, told after the fact: "Mr. Lay had passed this on to Joe Hirko in Enron Broadband Services",
  // "She said that she passed it on to Fred Boas", "Jaesoo modified jump calibration code and passed it to IT". The writer's own
  // handover ("I've passed this to our CTO") still files as left/wrong person with a person deciding, as designed 2026-11-04.
  /\b(she|he|they|[A-Z][a-z]+) (said (that )?(she|he|they) )?(had |has |have )?(passed|handed|forwarded|sent) (this|it|that)( on| over| along)? to\b/,
  /\b(modified|updated|fixed|wrote|finished|reviewed|signed) [\w ,-]{0,40}\band (passed|handed|sent) it (on |over )?to\b/i,
  // Quitting a habit, not a job: "I've quit predicting", "I quit hanging out with him"; "Broadband has taken 5 guys out of East
  // Power and left us short"; a plan that does not suit: "Faxing drafts does not work for me", "the timing does not work for me".
  /\bquit [a-z]+ing\b/i, /\bleft us (short|hanging|in the lurch|with)\b/i, /\b(doesn'?t|does not|won'?t|will not) work for me\b/i);
VETO.not_interested.push(
  // Reported speech about a third party: "So I told her I was not interested for now"; "actually they are not looking at us".
  /\btold (him|her|them|[A-Z][a-z]+) (that )?(i|we) (was|were|am|are|wasn'?t|weren'?t) not interested\b/i,
  /\b(they|he|she) (are|is|was|were) not looking\b/i);
VETO.unsubscribe.push(
  // A statute's or a programme's opt-out, not the writer's: "gives customers the opportunity to &opt-out8 of the program"; "Sure
  // wish I had a Diet Coke to take my mind off the intense pain"; "The only item from your list that I need further clarification".
  /\b(opportunity|right|option|ability|choice|chance) to\W{0,3}opt[- ]?out\b/i, /\btake (my|his|her|your|our|their) mind off\b/i,
  /\b(item|items|entry|entries|thing|things|line|lines) (from|on) your list\b/i);
// A "don't need the X" or "we're set" next to a request of the reader is scoping work, not a decline: "we do not need the extra
// night - is it ok to cancel the extra night ... please send a new confirm", "I don't need your map inserted ... Can you center
// the one I already have", "We don't need recorded phones. Also please lay out a schematic", "i don't need the value. I just need
// the sitara transport report", "we don't need an RTO, we need to fix the transmission rules", "we are all set ... Give me a call".
// Only the need/set phrasings; "not interested", "no thanks" and "not a fit" still decline whatever else the reply asks.
const SOFT_NO = /\b(don'?t|do not) (really )?need\b|\bno need\b|\b(we['’]re|we are) (all )?(set|good|fine)\b/i;
const ASKS_READER = /\?|\b(can|could|would|will) you\b|\bplease (send|fax|provide|cancel|center|call|let me know|confirm|forward|check|add|change|update|review|schedule|lay out|give|get|book|order|make|print|file)\b|\bis it (ok|okay|alright)\b|\b(give me|call me|let me know)\b|\b(i|we) (just |only |still |really )?need (the|a|an|to|your|you)\b/i;
// An absence mentioned inside a working reply (the hard case rounds 3 and 4 left): "I have asked Bob Superty, Kim Theriot and
// Mechelle Stevens to attend ... I will be out of the office that day", "Ron - Mary has asked that the document ... be faxed to
// her ... I will be out of the office Friday", "I am out of town on Thursday & Friday; I will touch base with you on Monday" after
// a paragraph on credit terms. A real away notice is about the absence: its other sentences are about returning, cover, contact
// or are footer boilerplate. Two or more sentences of other substance (five or more words, none of that vocabulary) mean a person
// wrote a reply and mentioned being out; it reaches a person instead of pausing the lead. Header auto-replies never get here.
const AWAY_TALK = /\b(office|away|back|return(ing|s)?|vacation|holiday|leave|travel\w*|out|absen\w+|until|till|contact\w*|reach(ed)?|urgent\w*|assist\w*|e-?mail\w*|voice ?mail|cell|phone|mobile|messages?|respond|reply|access|limited|regards|thanks?|cheers|sincerely|confidential\w*|intended|recipient|privilege\w*|disclaim\w*|virus|https?|www|unauthori[sz]ed|distribut\w*|delete|notify|sender|attachments?|conference|meeting|training|available|availability|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i;
// Only a short absence, a day or part of one ("out of the office Friday", "traveling tomorrow", "that day", "this afternoon"). A
// longer one ("until November 12th", "next week", "for the rest of the week") still pauses the lead: the earlier labels and the
// later readers disagree on these (eval/README.md "Fifth round"), and a pause until a stated date is what the reply asks for.
const SHORT_ABSENCE = (s) => /\b(today|tomorrow|tonight|this (morning|afternoon|evening)|that day|(on )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|the \d{1,2}(st|nd|rd|th))\b/i.test(s) && !/\b(back|return|returns|until|till|thru|through|returning|next week|weeks?\b|rest of|remainder|beginning|starting|from \w+ to|vacation|leave)\b|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.{0,40}\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.{0,20}\b(back|return)/i.test(s);
const absenceInWorkTalk = (body) => sentences(body).filter((x) => x.split(/\s+/).length >= 5 && !AWAY_TALK.test(x)).length >= 2;
const vetoed = (key, s) => (VETO[key] || []).some((re) => re.test(s));

/**
 * Classify one reply. Returns { category, subtype, confidence: "clear" | "weak", evidence, date, referral, why }.
 * Order matters and is the policy: anything that asks for less contact beats anything that asks for more, so
 * "interested, but please take me off this list" is an unsubscribe.
 */
const signal0 = (r) => (typeof r === "string" ? "" : r.signal || "");
export function triage(reply, today) {
  const body = typeof reply === "string" ? reply : reply.body;
  const subject = typeof reply === "string" ? "" : reply.subject || "";
  const from = typeof reply === "string" ? "" : reply.from || "";
  const all = [subject, ...sentences(body)];
  // Added 2026-11-08 after the seventeenth set (eval/fresh-2026-11-08d.jsonl, a false-bounce and false-away probe): a
  // person writing to us who happens to mention a bounce, a return, or an away notice (a question, a "let's", "ping me")
  // is not a machine. Real away notices and delivery failures carry no ask; a header signal or a daemon sender still wins.
  const human = !signal0(reply) && !/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)\b/i.test(from) && /\?|\b(let'?s|can we|could we|would love|i'?d (love|like)|send me|ping me|no thanks|no appetite|free (on|for|tomorrow)|please close)\b/i.test(typeof reply === "string" ? reply : body);
  // "RE: Fw: Undeliverable: Fw: Last schedule" from a person: the bounce is in the subject they replied to (2026-11-10).
  const replySubject = /^\s*(re|fw|fwd|aw|wg|tr)\s*:/i.test(subject) && !signal0(reply) && !/^(mailer-daemon|postmaster)@/i.test(from);
  const all0 = all;
  // A "Re:"/"Fw:" subject is the thread's subject, usually the one we wrote, not the reply's words: "RE: TW Unsubscribed
  // Capacity", "Re: Louise Kitchen - out of office", "Re: Bobette Riner is no longer at TNE" (Enron, third round, 2026-11-11).
  // Auto-replies keep their own subjects ("Out of Office: ...", "Automatic reply: ..."), which do not start with Re:.
  // Fourth round: a bare "No." stands as a decline when the rest of the reply is empty, a sign-off, or declines too.
  const bareNoStands = (s) => { const rest = sentences(body).filter((x) => x !== s).join(" "); return !REST_TALKS.test(rest.replace(/\b(thanks|thank you|thx|cheers|regards)\b/gi, "")) || REST_DECLINES.test(rest); };
  // Fifth round: an absence inside a working reply is a person writing, not an away notice (see absenceInWorkTalk).
  // Only under a reply subject: a subject that is itself the notice ("Out of Office: ...", "Automatic reply: ...", "Out of office --
  // Dec. 4 and 5") keeps the away reading however long the body runs.
  const workTalk = !signal0(reply) && /^\s*(re|fw|fwd|aw|wg|tr)\s*:/i.test(subject) && absenceInWorkTalk(body);
  const SUBJECT_SKIP = new Set(["unsubscribe", "left_company", "not_interested", "out_of_office"]);
  const find = (key) => { if (human && (key === "bounce" || key === "out_of_office")) return null; if (key === "bounce" && replySubject) { for (const s of all0.slice(1)) { if (vetoed("bounce", s)) continue; const m = hits(RULES.bounce, s); if (m) return { s, m: m[0] }; } return null; } for (const s of (replySubject && SUBJECT_SKIP.has(key) ? all.slice(1) : all)) { if (vetoed(key, s)) continue; const m = hits(RULES[key], s); if (m && key === "not_interested" && BARE_NO.test(s) && !bareNoStands(s)) continue; if (m && key === "not_interested" && SOFT_NO.test(m[0]) && ASKS_READER.test(body.replace(/\s+/g, " "))) continue; if (m && key === "out_of_office" && workTalk && SHORT_ABSENCE(s)) continue; if (m) return { s, m: m[0] }; } return null; };
  const res = (category, ev, extra = {}) => ({ category, subtype: null, confidence: "clear", evidence: ev ? ev.s : "", matched: ev ? ev.m : "", date: null, referral: null, ...extra });

  let ev;
  // Header signals (RFC 3464 / 3834) are standards, not phrasing: they beat the word rules when present.
  const signal = typeof reply === "string" ? "" : reply.signal || "";
  if (signal === "dsn-permanent") return res("bounce", { s: "delivery status Status 5.x.x", m: "5.x.x" }, { why: "the receiving server reported a permanent failure" });
  if (signal === "dsn-temporary") return res("out_of_office", { s: "delivery status Status 4.x.x", m: "4.x.x" }, { subtype: "delivery_delayed", why: "delivery delayed, not failed; no address change" });
  if (!signal && /\b(mail delivery warning|has been postponed|continue to try to deliver)\b/i.test(all.join("\n")) && /^(mailer-daemon|postmaster)@|delivery/i.test(from + subject)) return res("out_of_office", { s: all.find((x) => /postponed|delivery warning|continue to try/i.test(x)) || subject, m: "delivery delayed" }, { subtype: "delivery_delayed", why: "delivery delayed, not failed; no address change" });
  if (signal === "auto-reply" && !find("bounce") && !/^(mailer-daemon|postmaster)@/i.test(from)) { const d = (() => { for (const s of all) { const f = findDate(s, today); if (f && /\b(back|return|until|till|away|leave|office)\b/i.test(s)) return f; } return null; })(); return res("out_of_office", { s: "Auto-Submitted header", m: "auto-replied" }, { date: d?.date || null, dateText: d?.text || null, why: "sent by an auto-responder (header), not a person" }); }
  // Some servers send auto-replies from postmaster@ (real: "Auto Reply to your message ...", "The following text is an
  // automated response ... I am on maternity leave", eval/enron.mjs 2026-11-10). With no failure wording it is an away notice.
  const autoFromPostmaster = /^(mailer-daemon|postmaster)@/i.test(from) && /\b(auto(matic|mated)?[- ]?(reply|response)|out of (the )?office)\b/i.test(subject + "\n" + body) && !find("bounce");
  if (!autoFromPostmaster && ((ev = find("bounce")) || /^(mailer-daemon|postmaster)@/i.test(from))) return res("bounce", ev || { s: from, m: from }, { subtype: /\b(mailbox|inbox|account|disk) (is )?(full|over (its )?quota)|\bquota exceeded\b|\bover quota\b|\btoo much mail\b|\bdisk quota\b/i.test(all.join("\n")) && !/\b(user unknown|no such user|does not exist|address (not found|rejected)|5\.1\.[01])\b/i.test(all.join("\n")) ? "mailbox_full" : null, why: "a delivery failure, not a person" });
  // Footer boilerplate ("To stop these messages unsubscribe in settings", "To unsubscribe click here") inside an auto-reply is
  // the sender's mail system talking, not an opt-out; with no first-person ask it does not outrank the away notice (2026-11-04).
  const boiler = (e) => e && /\b(to|how to) (stop|unsubscribe)\b|\bunsubscribe (in|from|via|using|at|here|link)\b|\bclick (here|the link)\b/i.test(e.s) && !/\bunsubscribe (me|us)\b|\b(remove|take|delete) (me|us|my|our)\b|\bplease (stop|unsubscribe|remove)\b/i.test(e.s);
  // Added 2026-11-08 (eval/fresh-2026-11-08b.jsonl, a false-opt-out probe): a stop word that is negated ("don't stop sending",
  // "don't take me off the shortlist", "not unsubscribing"), asked about as a feature ("do you handle unsubscribe links?") or
  // about someone else's list ("unsubscribe from a different vendor") is not an ask to stop. Narrow on purpose: "how do I
  // unsubscribe?" still stops, because a person asking that usually wants out and a wrong suppression costs one lead.
  const NOT_AN_ASK = /\b(don'?t|do not|never|won'?t|not) (stop|take (me|us) off|remove (me|us)|unsubscrib\w*)\b|\b(different|another|other|your competitor'?s|a) (vendor|supplier|company|sender)'?s? (emails?|list|newsletters?)\b|\bnot yours\b|^(do|does|can|will|is|are) (you|your|the|it)\b[^?]*\b(unsubscribe|opt[- ]?out|suppression)\b[^?]*\?$/i;
  const askAll = replySubject ? sentences(body) : [subject, ...sentences(body)];
  let uev = null;
  for (const s of askAll) { if (vetoed("unsubscribe", s)) continue; const m = hits(RULES.unsubscribe, s); if (m && !(NOT_AN_ASK.test(s) && !/\b(please )?(stop|unsubscribe|remove|take) (me|us) (off|from)\b|\bunsubscribe (me|us)\b/i.test(s.replace(/\b(don'?t|do not|never|won'?t|not) (stop|take (me|us) off|remove (me|us)|unsubscrib\w*)\b/ig, "")))) { uev = { s, m: m[0] }; break; } }
  ev = uev;
  if (ev && !(boiler(ev) && find("out_of_office"))) return res("unsubscribe", ev, { why: "asked not to be contacted" });

  const referral = (() => {
    for (const s of sentences(body)) {
      const email = s.match(EMAIL_RE)?.[0];
      if (email && email.toLowerCase() !== from && /\b(contact|reach|email|speak|talk|try|cc|loop|handles?|responsible|right person|in charge|forward|direct|replacement|took over|owns|runs|decides|goes to|passed|handed)|escrib|contactez|wenden|scriv|contate|escreva|neem contact/i.test(s)) return { email: email.toLowerCase(), text: s };
    }
    return null;
  })();

  if ((ev = find("out_of_office"))) {
    const d = (() => { for (const s of all) { if (/\b(back|return|returning|until|till|away|leave|office|reply|jusqu|retour|hasta|vuelta|at[ée]|volto|bis|zur[üu]ck|fino|tot)\b/i.test(s)) { const f = findDate(s, today); if (f) return f; } } return null; })();
    return res("out_of_office", ev, { date: d?.date || null, dateText: d?.text || null, referral, why: d ? `away until ${d.date}` : "away, no return date given" });
  }
  // Added 2026-11-08 (eighteenth set, a false-not-now and wrong-person probe): "not later, not ever", "no need to check back",
  // "close the file" are a final no, whatever "not now" or "wrong person" sits beside them.
  const finalNo = /\b(not (later|ever)(?! (than|get|be|been|have|has|had|seen|again)\b)|no need to (check back|follow up|circle back)|(don'?t|do not) (follow up|check back|circle back)|close the file(?! (before|first|when|after|and)\b))\b/i.test(body);
  // Added 2026-11-11 (eval/fresh-2026-11-11.jsonl, a false not-now and wrong-person probe): "I'm not the right person for budget
  // but I'd use it, Friday?", "my colleague left but I've taken over, what are you offering?", "wrong time, not wrong person" and
  // "the wrong person to convince" are live leads or objections, not a departed contact. A left-company notice with a referral
  // address stays one; without one, a question or a go-ahead in the same reply means a person is still here and engaged.
  const stillHere = !referral && (/\?|\b(let'?s (talk|chat|set|do|schedule|have)|yes,|happy to (see|chat|talk|take)|i do now|(i'?ve|i have) (now )?taken over|(i'?m|i am) the one who)\b/i.test(body) || /\b(not|isn'?t) (the |a )?wrong person\b|\bwrong (person|one) to (convince|sell|pitch|persuade)\b|\bwrong time\b/i.test(body));
  if (!finalNo && !stillHere && (ev = find("left_company"))) return res("left_company", ev, { referral, why: referral ? `points you to ${referral.email}` : "not the right contact" });

  // A sentence that asks to meet anywhere in the reply counts, not only the first positive one ("Sounds interesting.
  // Could you send times?" is an explicit ask).
  const EXPLICIT = /(are you (free|available)|walk me through|please (book|schedule)|see a demo|set up|schedule|book|times|slots|availability|calendar|link|calendly|can we|i can do|find|next steps|count|yes|love|forward|over to you|when can you|monday|tuesday|wednesday|thursday|friday|tomorrow|next week|this week|demo|jump on|hop on)/i;
  let meet = null, explicitMeeting = false;
  for (const s of all) { const m = hits(RULES.meeting, s); if (m) { const ex = EXPLICIT.test(m[0]); if (!meet || (ex && !explicitMeeting)) { meet = { s, m: m[0] }; explicitMeeting = ex; } if (ex) break; } }
  // "I'd have said not now last month, but things changed" and "not now and not later either" are not a deferral (2026-11-11).
  let notNow = /\b(would|'d) have said (not|no)\b|\bnow is (actually )?(a )?(perfect|good|great|the right) time\b|\bnot (right )?now,? (and|or|but) not (later|ever|in the future)|\bnot (now|later),? (not|nor) (ever|later)\b/i.test(body) ? null : find("not_now");
  // A question about the product beside "in the middle of a migration" is a question; "timing isn't right because the price is
  // double" and "budget is set, your tool costs more" are price objections, not a date to come back (2026-11-08).
  if (notNow && /\b(middle|midst) of\b/i.test(notNow.m) && /\?/.test(body)) notNow = null;
  if (notNow && find("objection_price") && !findDate(notNow.s, today)) notNow = null;
  const notInt = find("not_interested");
  if (finalNo && !meet) { const ev2 = notInt || notNow; return res("not_interested", ev2, { why: "declined for good" }); }

  // "Open to a demo after our fiscal year ends ... come back then" is a date, not a request for times (2026-11-08).
  const futureOnly = meet && notNow && /\b(after|once|until|when) (our|the|we|i|my)\b/i.test(meet.s);
  if (notNow && (!explicitMeeting || futureOnly)) {
    let d = null;
    for (const s of all) { const f = findDate(s, today); if (f) { d = f; break; } }
    return res("not_now", notNow, { date: d?.date || addDays(today, 90), dateText: d?.text || null, confidence: d ? "clear" : "weak", why: d ? `come back ${d.date}` : "no date given: 90 days by default" });
  }
  // A partial "no" ("not interested in the other plan") next to a proposed time is not a decline (2026-11-08).
  const proposesTime = notInt && findSlots(body, today).length > 0;
  if (notInt && !explicitMeeting && !proposesTime && !/\bunless\b/i.test(notInt.s)) return res("not_interested", notInt, { why: "declined" });

  for (const sub of ["price", "competitor", "authority", "need"]) {
    const o = find(`objection_${sub}`);
    if (o && !explicitMeeting) return res("objection", o, { subtype: sub, referral, why: `${sub} objection` });
  }
  if (meet) return res("interested", meet, { slots: findSlots(body, today), confidence: explicitMeeting ? "clear" : "weak", why: explicitMeeting ? "asked to meet or for times" : "positive, no meeting asked for yet" });
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
      if (t.slots?.length) {
        const first = describeSlot(t.slots[0]), more = t.slots.slice(1).map(describeSlot);
        lines = [hi, "", `Thanks for getting back to me. ${first} works for me${more.length ? `, and so would ${more.join(" or ")} if that is easier` : ""}.`, t.slots.some((x) => x.ambiguous) ? `I read "${t.slots.find((x) => x.ambiguous).text}" as ${first}; tell me if you meant a different day.` : "", "Which time zone are you in, so I send the invite for the right hour?", offer.booking_link ? `If those change, you can also pick a time here: ${offer.booking_link}` : "", "", offer.value ? `On the call I will show how ${offer.product || "it"} ${offer.value}, and leave plenty of time for your questions.` : "On the call I will keep it short and leave plenty of time for your questions."].filter((x, i, a) => x !== "" || a[i - 1] !== "");
        break;
      }
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
  const suppressedBy = suppressionIndex(input.suppression), suppressedNow = new Set();
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

    // A stop is sticky (2026-11-02). Someone who asked to stop, or whose address bounced, earlier in this batch, in
    // the table or on the suppression list stays stopped: a later auto-reply must not un-stop them, and a later
    // "tell me more" gets no draft until a person has read both messages.
    const key = emailKey(reply.from || p.email);
    const stopped = !(t.category === "unsubscribe" || t.category === "bounce") && (p.status === "unsubscribed" || p.status === "bounced" || (key && (suppressedNow.has(key) || suppressedBy(reply.from))));
    if (stopped) {
      const reopens = t.category === "interested" || t.category === "question" || t.category === "objection";
      if (reopens) tasks.push({ email: p.email, task: `${p.email} asked to stop (or bounced) and has now written again: "${t.evidence || reply.body.split(/\n/)[0].slice(0, 120)}". Nothing was drafted and nothing was sent. Read both messages and decide; honour the first request unless they clearly asked to hear from you.` });
      items.push({ n: i + 1, from: reply.from, name: reply.name, subject: reply.subject, body: reply.body, triage: t, applied: ["Left as stopped: they asked to stop (or bounced) earlier, and nothing in this message changes that"], draft: null, lint: null, approval: "nothing_to_send", known: Boolean(known) });
      continue;
    }

    switch (t.category) {
      case "unsubscribe":
        set("status", "unsubscribed", "Stopped every touch to this person");
        if (reply.from && !suppressedBy(reply.from) && !suppressedNow.has(emailKey(reply.from))) { suppressedNow.add(emailKey(reply.from)); suppression.push({ email: reply.from, reason: "asked to stop", date: today, evidence: t.evidence }); applied.push("Added to your suppression list, with their words as the record"); }
        break;
      case "bounce":
        set("status", "bounced", "Stopped email to this address");
        if (t.subtype === "mailbox_full") tasks.push({ email: p.email, task: "Their mailbox is full, so the address is probably still real (a hard bounce, but not a dead address). Email stopped here; try once more in a week through another channel (phone, LinkedIn, a second address from your own records) before dropping this contact." });
        else if (reply.failed || (reply.from && !/^(mailer-daemon|postmaster)@/i.test(reply.from))) tasks.push({ email: p.email, task: "Address bounced. Find the right one in your own records; do not guess." });
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
