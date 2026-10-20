#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { PATTERN_KEYS, buildDays, stats, compare, toIcs, renderText } from "./rotation.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

try {
  if (args.includes("--compare")) {
    for (const r of compare(0)) console.log(`${r.pattern.padEnd(26)} ${String(r.hoursPerWeek).padStart(5)} h/wk  worst7 ${r.maxHoursIn7Days}h  off/yr ${r.daysOffPerYear}  weekends ${r.fullWeekendsOffPerYear}`);
  } else {
    const key = opt("pattern");
    if (!key) throw new Error(`Usage: node cli.mjs --pattern <${PATTERN_KEYS.join("|")}> --crew A --anchor YYYY-MM-DD [--days 56] [--ics file.ics] | --compare`);
    const crew = opt("crew", "A");
    const anchor = opt("anchor", new Date().toISOString().slice(0, 10));
    const days = buildDays(key, crew, anchor, opt("from", anchor), Number(opt("days", "56")));
    const s = stats(key, crew);
    console.log(`${s.pattern}, crew ${s.crew}: ${s.hoursPerWeek} h/week average, most ${s.maxHoursIn7Days} h in any 7 days, ${s.fullWeekendsOffPerYear} full weekends off a year\n`);
    const ics = opt("ics");
    if (ics) {
      writeFileSync(ics, toIcs(days, { patternKey: key, crewName: s.crew, dayStart: opt("day-start", "07:00"), nightStart: opt("night-start", "19:00") }));
      console.log(`Wrote ${ics}`);
    } else console.log(renderText(days));
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
