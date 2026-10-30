// Random leagues through the exports: every iCalendar file (whole league, each team) must be
// well-formed RFC 5545 text, and the CSV exports must have one row per match (plus one per bye) with a constant column count.
// Usage: node eval/fuzz-exports.mjs [count] [seed]
import { readSpec, buildSchedule, scheduleIcs, scheduleCsv, seasonGridCsv, mulberry32 } from "../calc.mjs";
import { makeRandomForm } from "./random-league.mjs";

const count = Number(process.argv[2] || 100);
const rnd = mulberry32(Number(process.argv[3] || 7));
const randomForm = makeRandomForm(rnd);
const enc = new TextEncoder();

function icsProblems(text) {
  const p = [];
  if (!text.endsWith("\r\n")) p.push("no final CRLF");
  if (/[^\r]\n/.test(text)) p.push("bare LF");
  const raw = text.split("\r\n").slice(0, -1);
  for (const l of raw) if (enc.encode(l).length > 75) p.push("line over 75 octets: " + l.slice(0, 40));
  const lines = [];
  for (const l of raw) { if (/^[ \t]/.test(l) && lines.length) lines[lines.length - 1] += l.slice(1); else lines.push(l); }
  if (lines[0] !== "BEGIN:VCALENDAR" || lines.at(-1) !== "END:VCALENDAR") p.push("calendar not wrapped");
  const uids = new Set();
  let ev = null;
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") { if (ev) p.push("nested VEVENT"); ev = {}; continue; }
    if (l === "END:VEVENT") {
      if (!ev) { p.push("stray END:VEVENT"); continue; }
      for (const k of ["UID", "DTSTAMP", "SUMMARY"]) if (!ev[k]) p.push("event without " + k);
      if (ev.UID) { if (uids.has(ev.UID)) p.push("duplicate UID " + ev.UID); uids.add(ev.UID); }
      const s = Object.keys(ev).find((k) => k.startsWith("DTSTART")), e = Object.keys(ev).find((k) => k.startsWith("DTEND"));
      if (!s || !e) p.push("event without DTSTART/DTEND");
      else if (ev[e] <= ev[s]) p.push(`DTEND ${ev[e]} not after DTSTART ${ev[s]}`);
      ev = null; continue;
    }
    if (ev) { const i = l.indexOf(":"); ev[l.slice(0, i)] = l.slice(i + 1); }
  }
  if (ev) p.push("unclosed VEVENT");
  return p;
}

let built = 0, bad = [];
for (let i = 0; i < count; i++) {
  const form = randomForm();
  const { errors, spec } = readSpec(form);
  if (errors.length) continue;
  let s; try { s = buildSchedule(spec); } catch { continue; }
  built++;
  const stamp = "20260101T000000Z";
  const problems = [...icsProblems(scheduleIcs(s, null, stamp)).map((x) => "league ics: " + x)];
  for (let t = 0; t < s.teams.length; t++) problems.push(...icsProblems(scheduleIcs(s, t, stamp)).map((x) => `team ${t} ics: ${x}`));
  const matches = s.rounds.reduce((a, r) => a + r.matches.length + (r.bye != null ? 1 : 0), 0); // a bye is its own row
  const csvRows = scheduleCsv(s).trim().split("\r\n").length - 1;
  if (csvRows !== matches) problems.push(`schedule csv has ${csvRows} rows for ${matches} matches`);
  const grid = seasonGridCsv(s).trim().split("\r\n");
  if (grid.length !== s.teams.length + 1) problems.push(`season grid has ${grid.length} rows for ${s.teams.length} teams`);
  if (problems.length) bad.push({ form, problems: problems.slice(0, 5) });
}
console.log(`built ${built}, invalid ${bad.length}`);
for (const b of bad.slice(0, 3)) console.log(JSON.stringify(b, null, 1).slice(0, 1500));
process.exit(bad.length ? 1 : 0);
