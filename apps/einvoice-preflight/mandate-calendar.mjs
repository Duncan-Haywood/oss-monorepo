// Turns the "Key dates" column of e-invoicing-mandates-by-country.html into
// a JSON list and an iCalendar feed of dated mandate milestones, so the
// hub table is the one source and the feed cannot drift from it.
//   node mandate-calendar.mjs            write mandate-dates.json and mandate-calendar.ics
//   node mandate-calendar.mjs --check    exit 1 if the written files are stale
//   node mandate-calendar.mjs --upcoming [YYYY-MM-DD]   print what starts next
// Only full day-month-year dates become events. A month alone ("Sep 2026")
// is not a day, so it is left out rather than guessed. No warranty: dates
// come from the country pages, which cite public guidance; confirm with the
// tax authority.
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(`./${f}`, import.meta.url));
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const DATE_RE = /\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})\b/g;
const HOST = "https://example.invalid/einvoice-preflight/";

const decode = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();

// Split at semicolons and sentence ends outside brackets. A clause that holds
// several dates is split again at commas and " and ", so each date keeps only
// its own words.
export function splitClauses(text) {
  const cut = (str, re) => {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === "(") depth++;
      else if (c === ")") depth = Math.max(0, depth - 1);
      else if (depth === 0) {
        const m = str.slice(i).match(re);
        if (m && m.index === 0) { out.push(str.slice(start, i)); start = i + m[0].length; i = start - 1; }
      }
    }
    out.push(str.slice(start));
    return out.map((x) => x.trim()).filter(Boolean);
  };
  const count = (x) => (x.match(DATE_RE) || []).length;
  return cut(text, /^(;\s+|\.\s+(?=[A-Z]))/).flatMap((c) => {
    if (count(c) < 2) return [c];
    const prefix = c.match(/^[A-Za-z ]+:\s/)?.[0] ?? "";
    return cut(c, /^(,\s+|\s+and\s+(?=[A-Za-z]*\s*\d))/).map((x, i) => (i === 0 || !prefix ? x : prefix + x));
  });
}

export function parseHub(html) {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  const rows = [...body.matchAll(/<tr><th scope="row"><a href="([^"]+)">([^<]+)<\/a><\/th><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td>/g)];
  const events = [];
  for (const [, page, countryRaw, datesRaw, statusRaw] of rows) {
    const country = decode(countryRaw);
    const text = decode(datesRaw);
    const clauses = splitClauses(text);
    const seen = new Set();
    for (const clause of clauses) {
      for (const m of clause.matchAll(DATE_RE)) {
        const iso = `${m[3]}-${String(MONTHS[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        const key = `${iso}|${clause}`;
        if (seen.has(key)) continue;
        seen.add(key);
        events.push({ date: iso, country, page, note: clause.trim(), status: decode(statusRaw) });
      }
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));
}

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 73) {
    let cut = 73;
    while (Buffer.byteLength(rest.slice(0, cut)) > 73) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out;
}
const compact = (iso) => iso.replace(/-/g, "");
const nextDay = (iso) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

export function toIcs(events) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//einvoice-preflight//mandate calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:E-invoicing mandate dates", "X-WR-CALDESC:Dated e-invoicing mandate milestones by country. Not legal or tax advice\\; confirm with the tax authority."];
  for (const e of events) {
    const uid = crypto.createHash("sha1").update(`${e.country}|${e.date}|${e.note}`).digest("hex").slice(0, 16) + "@einvoice-preflight";
    const summary = `${e.country}: ${e.note.length > 90 ? e.note.slice(0, 87) + "..." : e.note}`;
    lines.push("BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20260101T000000Z", `DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`,
      `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(`${e.country} (${e.status}). ${e.note}. Detail and sources: ${HOST}${e.page}. Not legal or tax advice.`)}`, `URL:${HOST}${e.page}`, "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.flatMap(fold).join("\r\n") + "\r\n";
}

export function build() {
  const events = parseHub(fs.readFileSync(here("e-invoicing-mandates-by-country.html"), "utf8"));
  return { json: JSON.stringify({ source: "e-invoicing-mandates-by-country.html", note: "Full day-month-year dates only. Not legal or tax advice.", events }, null, 1) + "\n", ics: toIcs(events), events };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { json, ics, events } = build();
  const arg = process.argv[2];
  if (arg === "--check") {
    const stale = fs.readFileSync(here("mandate-dates.json"), "utf8") !== json || fs.readFileSync(here("mandate-calendar.ics"), "utf8") !== ics;
    if (stale) { console.error("mandate-dates.json / mandate-calendar.ics are stale: run node mandate-calendar.mjs"); process.exit(1); }
  } else if (arg === "--upcoming") {
    const from = process.argv[3] ?? new Date().toISOString().slice(0, 10);
    for (const e of events.filter((x) => x.date >= from).slice(0, 25)) console.log(`${e.date}  ${e.country}: ${e.note}`);
  } else {
    fs.writeFileSync(here("mandate-dates.json"), json);
    fs.writeFileSync(here("mandate-calendar.ics"), ics);
    console.log(`${events.length} dated milestones from ${new Set(events.map((e) => e.country)).size} countries`);
  }
}
