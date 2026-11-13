// Pins the print fixes found by eval/print-check.mjs (2026-11-13): short columns never wrap, no
// empty Official column, rounds kept whole, no page break after the last sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSchedule, readSpec, scoreSheetsHtml, leaguePageHtml, assignOfficials, parseOfficials } from "./calc.mjs";
import { buildDivisions, readDivisionsSpec, divisionsScoreSheetsHtml } from "./divisions.mjs";
import { printPackHtml } from "./printpack.mjs";

const spec = readSpec({ teams: "Hawks\nOwls\nLynx\nOtters\nFoxes\nWolves", start: "2026-10-06", weekdays: "Tue", times: "18:00, 19:30", courts: "Court 1, Court 2" });
const s = buildSchedule(spec.spec ?? spec);

test("score sheets drop the Official column when nobody is assigned", () => {
  const html = scoreSheetsHtml(s);
  assert.ok(!html.includes("<th>Official</th>"));
  const withOff = assignOfficials(s, parseOfficials("Sam Lee\nPat", s.teams).officials).schedule;
  const h2 = scoreSheetsHtml(withOff);
  assert.equal(h2.split("<th>Official</th>").length - 1, s.rounds.length);
  // every match row has the same number of cells as the header (8 with the two score boxes)
  for (const row of h2.match(/<tr><td class="s">[^]*?<\/tr>/g)) assert.equal(row.split("<td").length - 1, 8);
});

test("time and court cells never wrap, and the last sheet ends without a page break", () => {
  for (const html of [scoreSheetsHtml(s), leaguePageHtml(s), printPackHtml(s, { league: "L" })]) {
    assert.match(html, /\.s\{white-space:nowrap\}/);
    assert.ok(html.includes(`<td class="s">${s.rounds[0].matches[0].court}</td>`));
  }
  assert.match(scoreSheetsHtml(s), /\.sheet:last-child\{page-break-after:auto\}/);
  assert.match(leaguePageHtml(s), /@media print\{[^}]*\}\.round\{break-inside:avoid\}/);
});

test("multi-division score sheets split the two lines and keep a venue's table whole", () => {
  const d = readDivisionsSpec(JSON.parse(readFileSync(new URL("./example-divisions.json", import.meta.url), "utf8")));
  const html = divisionsScoreSheetsHtml(buildDivisions(d.spec ?? d));
  assert.ok(html.includes('<p class="sig">Notes (injuries, protests, rainouts)'));
  assert.match(html, /table\{break-inside:avoid\}/);
  assert.match(html, /\.sheet:last-child\{page-break-after:auto\}/);
});
