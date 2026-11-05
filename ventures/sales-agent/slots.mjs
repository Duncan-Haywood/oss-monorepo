// Proposed meeting times in a prospect's reply ("Tuesday at 2pm", "Friday morning", "Nov 12 at 10:30", "tomorrow at 3").
// Rules only, no model. Returns what the prospect wrote plus a resolved date; it never invents a time the reply does not
// give, and it never guesses a time zone: the draft asks the prospect to confirm theirs. today is "YYYY-MM-DD".
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_RE = "(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|tomorrow)";
const MON_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const TIME_RE = "(?:at |around |about |@ )?(\\d{1,2})(?::(\\d{2}))?\\s?(am|pm|a\\.m\\.|p\\.m\\.)?";
const PART = "(morning|afternoon|evening|first thing|after lunch)";
const iso = (d) => d.toISOString().slice(0, 10);
const add = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

function clock(h, m, ap) {
  h = Number(h); m = m == null ? 0 : Number(m);
  if (m > 59 || h > 23 || h < 1) return null;
  if (ap) { ap = ap[0].toLowerCase(); if (h > 12) return null; if (ap === "p" && h < 12) h += 12; if (ap === "a" && h === 12) h = 0; }
  else if (h <= 7) h += 12; // a bare "at 2" in a business reply means 14:00; bare 8 to 12 stay as written
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** @returns {{ text:string, date:string|null, weekday:string|null, time:string|null, part:string|null }[]} */
export function findSlots(text, today) {
  const out = [], src = String(text || "").replace(/\s+/g, " ");
  const weekdayDate = (w) => {
    if (w === "tomorrow") return add(today, 1);
    const want = DAYS.findIndex((d) => d.startsWith(w.slice(0, 3))), have = new Date(`${today}T00:00:00Z`).getUTCDay();
    return add(today, ((want - have + 7) % 7) || 7);
  };
  const push = (o) => { if (!out.some((x) => x.date === o.date && x.time === o.time && x.part === o.part)) out.push(o); };
  const bare = /\b(?:no|not|isn'?t|aren'?t|can'?t|cannot|unavailable|out)\b[^.?!]{0,25}$/i;
  // weekday (+ optional time or part of day)
  const re1 = new RegExp(`\\b(?:next |this )?${DAY_RE}\\b(?:,? ?(?:${PART}|${TIME_RE}))?`, "gi");
  for (const m of src.matchAll(re1)) {
    if (bare.test(src.slice(Math.max(0, m.index - 30), m.index))) continue; // "can't do Tuesday"
    const w = m[1].toLowerCase();
    // a bare number after a day ("Friday 2 people") counts only with am/pm, a colon or "at"
    const timed = m[3] && (m[5] || m[4] || /\b(at|around|about)\b|@/i.test(m[0]));
    const time = timed ? clock(m[3], m[4], m[5]) : null;
    if (timed && !time) continue;
    let date = weekdayDate(w), alt = null;
    // "next Friday" said on a Wednesday: the nearest Friday is this week's, which many people call "this Friday".
    // Read it as the following week's and keep the nearer date so the draft can say which one it chose.
    if (w !== "tomorrow" && /\bnext $/i.test(src.slice(Math.max(0, m.index - 5), m.index) + (m[0].match(/^next /i) ? "next " : "")) || (w !== "tomorrow" && /^next /i.test(m[0]))) {
      const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7, ahead = Math.round((Date.parse(date) - Date.parse(today)) / 864e5);
      if (dow + ahead < 7) { alt = date; date = add(date, 7); }
    }
    push({ text: m[0].trim(), date, weekday: DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()], time, part: m[2] ? m[2].toLowerCase() : null, ...(alt ? { alt } : {}) });
  }
  // month day (+ time)
  const re2 = new RegExp(`\\b${MON_RE}\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b(?:,? ?(?:at |@ )${TIME_RE.replace("(?:at |around |about |@ )?", "")})?`, "gi");
  for (const m of src.matchAll(re2)) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), d = Number(m[2]);
    if (d < 1 || d > 31) continue;
    let y = Number(today.slice(0, 4)), date = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (date < today) date = `${y + 1}${date.slice(4)}`;
    if (new Date(`${date}T00:00:00Z`).getUTCDate() !== d) continue;
    const time = m[3] ? clock(m[3], m[4], m[5]) : null;
    push({ text: m[0].trim(), date, weekday: DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()], time, part: null });
  }
  return out.slice(0, 3);
}

const MON_NAME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
export function describeSlot(s) {
  const [y, m, d] = s.date.split("-").map(Number);
  let t = `${cap(s.weekday)} ${d} ${MON_NAME[m - 1]}`;
  if (s.time) { const [h, mi] = s.time.split(":").map(Number); t += ` at ${((h + 11) % 12) + 1}${mi ? ":" + String(mi).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`; }
  else if (s.part) t += ` ${s.part}`;
  void y; return t;
}
