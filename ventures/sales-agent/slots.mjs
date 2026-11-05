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
  // "noon" is 12pm; "midday" too. Only the bare word, so "afternoon" is untouched.
  const out = [], src = String(text || "").replace(/\s+/g, " ").replace(/\b(?:at )?(?:noon|midday)\b/gi, "at 12pm")
    // "at 3pm on Thursday" reads as "Thursday at 3pm"
    .replace(new RegExp(`\\b(?:at )?(\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)) (?:on )?${DAY_RE}\\b`, "gi"), "$2 at $1")
    // "Friday 11/13": a numeric month/day that only reads one way becomes "Nov 13"; 11/12 could be either order, so it is left alone
    .replace(/\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,? )?(\d{1,2})\/(\d{1,2})\b(?!\/)/gi, (all, a, b) => {
      a = Number(a); b = Number(b);
      if (a >= 1 && a <= 12 && b > 12 && b <= 31) return `${MON_NAME[a - 1]} ${b}`;
      if (b >= 1 && b <= 12 && a > 12 && a <= 31) return `${MON_NAME[b - 1]} ${a}`;
      return all;
    })
    // "12 Nov, 9am" and "Nov 12, 9am" read as "... at 9am"
    .replace(new RegExp(`\\b((?:${MON_RE}\\.? \\d{1,2}|\\d{1,2}(?:st|nd|rd|th)?(?: of)? ${MON_RE})(?:st|nd|rd|th)?),? (\\d{1,2}(?::\\d{2})?\\s?(?:am|pm))\\b`, "gi"), "$1 at $4");
  const weekdayDate = (w) => {
    if (w === "tomorrow") return add(today, 1);
    const want = DAYS.findIndex((d) => d.startsWith(w.slice(0, 3))), have = new Date(`${today}T00:00:00Z`).getUTCDay();
    return add(today, ((want - have + 7) % 7) || 7);
  };
  const push = (o) => {
    if (out.some((x) => x.date === o.date && x.time === o.time && x.part === o.part)) return;
    // "Monday the 9th at 2pm" is one slot: the bare day it began with gives way to the timed one
    const i = out.findIndex((x) => x.date === o.date && !x.time && !x.after && !x.part && (o.time || o.part));
    if (i >= 0) out[i] = o; else out.push(o);
  };
  const bare = /\b(?:no|not|isn'?t|aren'?t|can'?t|cannot|unavailable|out)\b[^.?!]{0,25}$/i;
  // weekday (+ optional time or part of day)
  const re1 = new RegExp(`\\b(next |this )?${DAY_RE}\\b(?:,? ?(?:after |from )?(?:${PART}|${TIME_RE}))?`, "gi");
  for (const m of src.matchAll(re1)) {
    if (bare.test(src.slice(Math.max(0, m.index - 30), m.index))) continue; // "can't do Tuesday"
    const w = m[2].toLowerCase();
    if (w === "tomorrow" && /day after $/i.test(src.slice(Math.max(0, m.index - 10), m.index))) continue; // handled below
    // a bare number after a day ("Friday 2 people") counts only with am/pm, a colon or "at"
    const timed = m[4] && (m[6] || m[5] || /\b(at|around|about)\b|@/i.test(m[0]));
    const time = timed ? clock(m[4], m[5], m[6]) : null;
    if (timed && !time) continue;
    // "after 3" / "from 3" is a lower bound, never an exact time we could confirm
    const after = time && /\b(after|from)\b/i.test(m[0]) ? time : null;
    let date = weekdayDate(w), ambiguous = false;
    // "next Friday" said on a Wednesday could mean this Friday or the one after: take the following
    // calendar week (Monday start) and say it is a reading, so the draft names the date and a person sees it
    if (m[1] && m[1].toLowerCase() === "next " && w !== "tomorrow") {
      const wk = (d) => { const x = new Date(`${d}T00:00:00Z`); return add(d, -((x.getUTCDay() + 6) % 7)); };
      if (wk(date) === wk(today)) { date = add(date, 7); ambiguous = true; }
    }
    push({ text: m[0].trim(), date, weekday: DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()], time: after ? null : time, after, ambiguous, part: m[3] ? m[3].toLowerCase() : null });
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
    push({ text: m[0].trim(), date, weekday: DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()], time, after: null, ambiguous: false, part: null });
  }
  // day first: "12 Nov at 10:30", "the 12th of November"
  const re3 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?: of)? ${MON_RE}\\b\\.?(?:,? ?(?:at |@ )${TIME_RE.replace("(?:at |around |about |@ )?", "")})?`, "gi");
  for (const m of src.matchAll(re3)) {
    const d = Number(m[1]), mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (d < 1 || d > 31) continue;
    let y = Number(today.slice(0, 4)), date = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (date < today) date = `${y + 1}${date.slice(4)}`;
    if (new Date(`${date}T00:00:00Z`).getUTCDate() !== d) continue;
    const time = m[3] ? clock(m[3], m[4], m[5]) : null;
    push({ text: m[0].trim(), date, weekday: DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()], time, after: null, ambiguous: false, part: null });
  }
  // "the 14th at 3pm": a day of the month with no month names the next such day
  const re4 = /\b(?:on )?the (\d{1,2})(?:st|nd|rd|th)\b(?:,? ?(?:at |@ )(\d{1,2})(?::(\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)?)?(?! (?:of )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/gi;
  for (const m of src.matchAll(re4)) {
    const d = Number(m[1]);
    if (d < 1 || d > 31) continue;
    let [y, mo] = today.split("-").map(Number), date = null;
    for (let i = 0; i < 13 && !date; i++, mo++) {
      if (mo > 12) { mo = 1; y++; }
      const c = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (c >= today && new Date(`${c}T00:00:00Z`).getUTCDate() === d) date = c;
    }
    const time = m[2] ? clock(m[2], m[3], m[4]) : null;
    if (!date || (m[2] && !time)) continue;
    push({ text: m[0].trim(), date, weekday: DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()], time, after: null, ambiguous: false, part: null });
  }
  // "the day after tomorrow at 3pm": two days on
  const re5 = new RegExp(`\\b(?:the )?day after tomorrow\\b(?:,? ?(?:${PART}|${TIME_RE}))?`, "gi");
  for (const m of src.matchAll(re5)) {
    if (bare.test(src.slice(Math.max(0, m.index - 30), m.index))) continue;
    const timed = m[2] && (m[4] || m[3] || /\b(at|around|about)\b|@/i.test(m[0]));
    const time = timed ? clock(m[2], m[3], m[4]) : null;
    if (timed && !time) continue;
    const date = add(today, 2);
    push({ text: m[0].trim(), date, weekday: DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()], time, after: null, ambiguous: false, part: m[1] ? m[1].toLowerCase() : null });
  }
  // "today at 4pm", "later today after lunch": only with a time or part of day, since "how are you today" is not a slot
  const re6 = new RegExp(`\\b(?:later )?today,? ?(?:${PART}|${TIME_RE})`, "gi");
  for (const m of src.matchAll(re6)) {
    if (bare.test(src.slice(Math.max(0, m.index - 30), m.index))) continue;
    const timed = m[2] && (m[4] || m[3] || /\b(at|around|about)\b|@/i.test(m[0]));
    const time = timed ? clock(m[2], m[3], m[4]) : null;
    if (m[2] && !time) continue;
    if (!m[1] && !time) continue;
    push({ text: m[0].trim(), date: today, weekday: DAYS[new Date(`${today}T00:00:00Z`).getUTCDay()], time, after: null, ambiguous: false, part: m[1] ? m[1].toLowerCase() : null });
  }
  // "in 3 days", "in a week at 2pm"
  const NUMW = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  const re7 = new RegExp(`\\bin (a|one|two|three|four|five|six|seven|\\d{1,2}) (days?|weeks?)\\b(?:,? ?(?:${PART}|${TIME_RE}))?`, "gi");
  for (const m of src.matchAll(re7)) {
    if (bare.test(src.slice(Math.max(0, m.index - 30), m.index))) continue;
    const n = (NUMW[m[1].toLowerCase()] ?? Number(m[1])) * (/^w/i.test(m[2]) ? 7 : 1);
    if (!n || n > 14) continue;
    const timed = m[4] && (m[6] || m[5] || /\b(at|around|about)\b|@/i.test(m[0]));
    const time = timed ? clock(m[4], m[5], m[6]) : null;
    if (timed && !time) continue;
    const date = add(today, n);
    push({ text: m[0].trim(), date, weekday: DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()], time, after: null, ambiguous: false, part: m[3] ? m[3].toLowerCase() : null });
  }
  return out.slice(0, 3);
}

const MON_NAME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
export function describeSlot(s) {
  const [y, m, d] = s.date.split("-").map(Number);
  let t = `${cap(s.weekday)} ${d} ${MON_NAME[m - 1]}`;
  if (s.time) { const [h, mi] = s.time.split(":").map(Number); t += ` at ${((h + 11) % 12) + 1}${mi ? ":" + String(mi).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`; }
  else if (s.after) { const [h, mi] = s.after.split(":").map(Number); t += ` after ${((h + 11) % 12) + 1}${mi ? ":" + String(mi).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`; }
  else if (s.part) t += ` ${s.part}`;
  void y; return t;
}
