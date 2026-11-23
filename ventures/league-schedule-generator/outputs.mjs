// League schedule generator, outputs.mjs: Views and exports of a finished schedule: team views, CSV (plain, calendar, TeamSnap, SportsEngine),
// .ics feeds, group-chat messages, the season grid, text and printable HTML.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { dayIso, WEEKDAYS, dayOfWeek, dayLabel } from "./dates.mjs";
import { bracketText } from "./brackets.mjs";

export function teamSchedule(schedule, teamIdx) {
  const rows = [];
  for (const r of schedule.rounds) {
    const mine = r.matches.filter((x) => x.home === teamIdx || x.away === teamIdx);
    for (const m of mine) {
      const home = m.home === teamIdx;
      rows.push({ round: r.label, day: r.day, time: m.time, court: m.court, opponent: schedule.teams[home ? m.away : m.home], venue: home ? "Home" : "Away", bye: false });
    }
    if (mine.length) continue;
    if (r.bye === teamIdx) {
      rows.push({ round: r.label, day: r.day, time: "", court: "", opponent: "", venue: "", bye: true });
    }
  }
  return rows;
}

export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; // never let a team name run as a spreadsheet formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function scheduleCsv(schedule) {
  const withOfficial = schedule.rounds.some((r) => r.matches.some((m) => m.official !== undefined));
  const lines = [["Round", "Date", "Day", "Time", "Court", "Home", "Away", ...(withOfficial ? ["Official"] : [])].join(",")];
  for (const r of schedule.rounds) {
    for (const m of r.matches) {
      lines.push([r.label, dayIso(r.day), WEEKDAYS[dayOfWeek(r.day)], m.time, m.court, m.homeName, m.awayName, ...(withOfficial ? [m.official || ""] : [])].map(csvCell).join(","));
    }
    if (r.bye !== null && r.bye !== undefined) lines.push([r.label, dayIso(r.day), WEEKDAYS[dayOfWeek(r.day)], "", "", schedule.teams[r.bye], "BYE"].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/**
 * The schedule as a Google Calendar / Outlook import CSV (Subject, Start Date, Start Time, End Date,
 * End Time, All Day Event, Description, Location, Private), for a calendar that will not take .ics.
 * Dates are MM/DD/YYYY and times 12-hour, the layout both calendars document. `teamIdx` keeps one team's matches.
 */
export function scheduleCalendarCsv(schedule, teamIdx = null) {
  const minutes = schedule.config.minutes || 60;
  const us = (day) => { const [y, m, d] = dayIso(day).split("-"); return `${m}/${d}/${y}`; };
  const clock = (min) => { const h = Math.floor(min / 60) % 24; return `${h % 12 || 12}:${String(min % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  const lines = ["Subject,Start Date,Start Time,End Date,End Time,All Day Event,Description,Location,Private"];
  for (const r of schedule.rounds) {
    for (const m of r.matches) {
      if (teamIdx !== null && m.home !== teamIdx && m.away !== teamIdx) continue;
      const subject = teamIdx === null ? `${m.homeName} vs ${m.awayName}`
        : `${schedule.teams[teamIdx]} vs ${schedule.teams[m.home === teamIdx ? m.away : m.home]} (${m.home === teamIdx ? "home" : "away"})`;
      let row;
      if (m.time) {
        const [hh, mm] = m.time.split(":").map(Number);
        const end = hh * 60 + mm + minutes;
        row = [subject, us(r.day), clock(hh * 60 + mm), us(r.day + Math.floor(end / 1440)), clock(end % 1440), "False", r.label, m.court, "False"];
      } else {
        row = [subject, us(r.day), "", us(r.day), "", "True", r.label, m.court, "False"];
      }
      lines.push(row.map(csvCell).join(","));
    }
  }
  return lines.join("\r\n") + "\r\n";
}

/*
 * League platforms' own schedule import files, so an organiser who runs registration and team messaging on
 * TeamSnap or SportsEngine can build the season here and load it there in one upload instead of keying in
 * every game. Column names, order and formats are copied from the platforms' published templates (read
 * 2026-11-17; README "Import into TeamSnap or SportsEngine"):
 *  - TeamSnap's organisation schedule template, TeamSnap-SportsOrg-Schedule-Import-Template.csv:
 *    Date (MM/DD/YYYY), Start Time and End Time (h:mm AM/PM), Arrival Time (minutes before the start),
 *    Short Label, Event Type, Division, Home Team, Away Team, Location, Location Details. TeamSnap says
 *    End Time, Arrival Time, Short Label, Event Type and Location Details may be deleted and every other
 *    column is required; names must match TeamSnap exactly and symbols such as % @ # * can trip the import.
 *  - SportsEngine HQ's Schedule Upload Template.csv (28 columns, Start_Date ... Division_Override) and its
 *    fields guide: MM/DD/YYYY dates, 24-hour HH:MM or TBD start times, Event_Type "Game" makes the team
 *    columns required, Team1_ID / Team2_ID are HQ's own team IDs, Team1_Is_Home 1 or 0, and the columns
 *    after Tags must stay even when blank.
 * Both return { csv, errors, warnings }: errors say why the platform would refuse the file (the csv is
 * still written, so the organiser sees what is missing), warnings are what may trip it.
 */
const PLATFORM_SYMBOLS = /[%@#*]/;
const usDate = (day) => { const [y, m, d] = dayIso(day).split("-"); return `${m}/${d}/${y}`; };
const clock12 = (min) => { const h = Math.floor(min / 60) % 24; return `${h % 12 || 12}:${String(min % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const clock24 = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const startMinutes = (time) => { const [hh, mm] = time.split(":").map(Number); return hh * 60 + mm; };
const platformMatches = (schedule) => schedule.rounds.flatMap((r) => r.matches.map((m) => ({ r, m })));

export const TEAMSNAP_COLUMNS = ["Date", "Start Time", "End Time", "Arrival Time", "Short Label", "Event Type", "Division", "Home Team", "Away Team", "Location", "Location Details"];

/**
 * TeamSnap organisation schedule import. `division` is the TeamSnap division name (required), `location` the
 * TeamSnap location name; without it each game's court is its Location. `arrival` (whole minutes, 0-1440)
 * fills Arrival Time; without it that optional column is left out, as TeamSnap allows.
 */
export function teamSnapCsv(schedule, { division = "", location = "", arrival = null } = {}) {
  const errors = [];
  const warnings = [];
  division = String(division).trim();
  location = String(location).trim();
  if (!division) errors.push("TeamSnap needs the Division column: type the division name exactly as it is in TeamSnap.");
  const withArrival = arrival !== null && arrival !== "";
  if (withArrival && !(Number.isInteger(Number(arrival)) && Number(arrival) >= 0 && Number(arrival) <= 1440)) {
    errors.push("Arrival time must be a whole number of minutes before the start, 0 to 1440.");
  }
  const cols = TEAMSNAP_COLUMNS.filter((c) => withArrival || c !== "Arrival Time");
  const minutes = schedule.config.minutes || 60;
  const lines = [cols.join(",")];
  const noTime = [];
  const noPlace = [];
  for (const { r, m } of platformMatches(schedule)) {
    let start = "";
    let end = "";
    if (m.time) {
      const s = startMinutes(m.time);
      start = clock12(s);
      end = clock12(s + minutes);
      // TeamSnap's template has no end date: a game past midnight would end before it starts.
      if (s + minutes >= 1440) warnings.push(`${r.label}: ${m.homeName} v ${m.awayName} ends after midnight; TeamSnap has no end date, so check its end time after the import.`);
    } else noTime.push(r.label);
    const place = location || m.court || "";
    if (!place) noPlace.push(r.label);
    const row = {
      Date: usDate(r.day), "Start Time": start, "End Time": end, "Arrival Time": withArrival ? String(Number(arrival)) : "",
      "Short Label": r.label, "Event Type": "Game", Division: division, "Home Team": m.homeName, "Away Team": m.awayName,
      Location: place, "Location Details": location ? (m.court || "") : "",
    };
    lines.push(cols.map((c) => csvCell(row[c])).join(","));
  }
  if (noTime.length) errors.push(`TeamSnap requires a start time, and ${noTime.length} game(s) have none (${[...new Set(noTime)].slice(0, 3).join(", ")}${noTime.length > 3 ? ", ..." : ""}): list time slots, like 18:00, then build again.`);
  if (noPlace.length) errors.push("TeamSnap requires a Location: type the location name as it is in TeamSnap, or list courts.");
  const symbolNames = [...schedule.teams, division, location].filter((t) => t && PLATFORM_SYMBOLS.test(t));
  if (symbolNames.length) warnings.push(`TeamSnap says symbols such as % @ # * can make an import fail: ${symbolNames.join(", ")}.`);
  if (!location) warnings.push("With no location name typed, each game's court name is its Location; TeamSnap needs a location of that name.");
  warnings.push("Team, division and location names must match TeamSnap exactly, capitals included.");
  return { csv: lines.join("\r\n") + "\r\n", errors, warnings };
}

export const SPORTSENGINE_COLUMNS = ["Start_Date", "Start_Time", "End_Date", "End_Time", "Title", "Description", "Location", "Location_URL", "Location_Details", "All_Day_Event", "Event_Type", "Tags", "Team1_ID", "Team1_Division_ID", "Team1_Is_Home", "Team2_ID", "Team2_Division_ID", "Team2_Name", "Custom_Opponent", "Event_ID", "Game_ID", "Affects_Standings", "Points_Win", "Points_Loss", "Points_Tie", "Points_OT_Win", "Points_OT_Loss", "Division_Override"];

/** Lines like "Hawks = 2270996_271208", "Hawks: 22" or "Hawks, 22": each team's SportsEngine HQ team ID. */
export function parseTeamIds(text, teams) {
  const ids = new Array(teams.length).fill(null);
  const errors = [];
  const byName = new Map(teams.map((t, i) => [t.toLowerCase(), i]));
  String(text || "").split(/\r?\n/).forEach((raw, n) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^(.*?)\s*[=:,\t]\s*([A-Za-z0-9_-]+)$/);
    if (!m) { errors.push(`Team ID line ${n + 1}: write it as "Team name = ID".`); return; }
    const idx = byName.get(m[1].trim().toLowerCase());
    if (idx === undefined) { errors.push(`Team ID line ${n + 1}: "${m[1].trim()}" is not one of the teams.`); return; }
    ids[idx] = m[2];
  });
  return { ids, errors };
}

/**
 * SportsEngine HQ schedule upload. `ids` is the text of team IDs (parseTeamIds); `location` the venue name,
 * without which each game's court is its Location. A game with no time is uploaded with Start_Time TBD.
 */
export function sportsEngineCsv(schedule, { ids = "", location = "" } = {}) {
  const parsed = parseTeamIds(ids, schedule.teams);
  const errors = [...parsed.errors];
  const warnings = [];
  location = String(location).trim();
  const missing = schedule.teams.filter((_, i) => parsed.ids[i] === null);
  if (missing.length) errors.push(`SportsEngine needs each team's HQ team ID (Event_Type Game requires Team1_ID and Team2_ID); missing for ${missing.join(", ")}. HQ lists them in the template's Team/Division ID tab.`);
  const minutes = schedule.config.minutes || 60;
  const lines = [SPORTSENGINE_COLUMNS.join(",")];
  for (const { r, m } of platformMatches(schedule)) {
    let start = "TBD";
    let end = "";
    let endDay = r.day;
    if (m.time) {
      const s = startMinutes(m.time);
      start = clock24(s);
      end = clock24((s + minutes) % 1440);
      endDay = r.day + Math.floor((s + minutes) / 1440);
    }
    const row = {
      Start_Date: usDate(r.day), Start_Time: start, End_Date: usDate(endDay), End_Time: end, Description: r.label,
      Location: location || m.court || "", Location_Details: location ? (m.court || "") : "", All_Day_Event: "0", Event_Type: "Game",
      Team1_ID: parsed.ids[m.home] ?? "", Team1_Is_Home: "1", Team2_ID: parsed.ids[m.away] ?? "", Custom_Opponent: "0",
    };
    lines.push(SPORTSENGINE_COLUMNS.map((c) => csvCell(row[c] ?? "")).join(","));
  }
  if (platformMatches(schedule).some(({ m }) => !m.time)) warnings.push("Games with no time slot go up with Start_Time TBD; set the time in HQ later, or list time slots and build again.");
  return { csv: lines.join("\r\n") + "\r\n", errors, warnings };
}

/** The standings table as a CSV (rank, team, played, won, drawn, lost, goals for/against, goal difference, points). */
export function standingsCsv(table) {
  const lines = [["Rank", "Team", "Played", "Won", "Drawn", "Lost", "For", "Against", "GD", "Points"].join(",")];
  for (const r of table) lines.push([r.rank, r.name, r.played, r.won, r.drawn, r.lost, r.gf, r.ga, r.gd, r.points].map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** VALARM lines for a reminder `minutes` before an event, or none when `minutes` is not a whole number from 1 to 10080 (a week). */
export function icsAlarm(minutes, text) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) return [];
  return ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(text)}`, `TRIGGER:-PT${minutes}M`, "END:VALARM"];
}

export function icsFold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.map((l, i) => (i ? " " + l : l)).join("\r\n");
}

const compactDate = (day) => dayIso(day).replace(/-/g, "");

/** A fixture's calendar id: stable across rainouts and pins when the match carries `fixture`. */
function icsUid(m, day = null, i = 0, role = "") {
  return m.fixture ? `fixture-${m.fixture}${role}@league-schedule-generator` : `${m.home}-${m.away}-${compactDate(day)}-${i}@league-schedule-generator`;
}
function icsWhen(day, time, minutes) {
  if (!time) return [`DTSTART;VALUE=DATE:${compactDate(day)}`, `DTEND;VALUE=DATE:${compactDate(day + 1)}`];
  const [hh, mm] = time.split(":").map(Number);
  const endMin = hh * 60 + mm + minutes;
  const endDay = day + Math.floor(endMin / 1440), em = endMin % 1440;
  return [`DTSTART:${compactDate(day)}T${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}00`,
    `DTEND:${compactDate(endDay)}T${String(Math.floor(em / 60)).padStart(2, "0")}${String(em % 60).padStart(2, "0")}00`];
}

/**
 * An iCalendar file for one team (teamIdx) or every match (teamIdx omitted).
 * Times are floating local times, so a phone shows them as written at the venue.
 * `stamp` (YYYYMMDDTHHMMSSZ) is injectable so the output is reproducible in tests.
 * `official` (a name set by assignOfficials) keeps only the matches that person works, for a referee's own calendar.
 * `alarmMinutes` (1 to 10080) adds a reminder that many minutes before each timed match; all-day matches get none.
 */
export function scheduleIcs(schedule, teamIdx = null, stamp = null, official = null, alarmMinutes = null) {
  const dtstamp = stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const minutes = schedule.config.minutes || 60;
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//league-schedule-generator//EN", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(official !== null ? `${official} officiating` : teamIdx === null ? "League schedule" : `${schedule.teams[teamIdx]} schedule`)}`];
  for (const r of schedule.rounds) {
    r.matches.forEach((m, i) => {
      if (teamIdx !== null && m.home !== teamIdx && m.away !== teamIdx) return;
      if (official !== null && m.official !== official) return;
      const summary = official !== null ? `Officiate: ${m.homeName} vs ${m.awayName}` : teamIdx === null
        ? `${m.homeName} vs ${m.awayName}`
        : `${schedule.teams[teamIdx]} vs ${schedule.teams[m.home === teamIdx ? m.away : m.home]} (${m.home === teamIdx ? "home" : "away"})`;
      out.push("BEGIN:VEVENT", `UID:${icsUid(m, r.day, i, official !== null ? "-official" : "")}`, `DTSTAMP:${dtstamp}`, `SEQUENCE:${m.moves || 0}`, ...icsWhen(r.day, m.time, minutes));
      out.push(`SUMMARY:${icsEscape(summary)}`, `LOCATION:${icsEscape(m.court)}`, `DESCRIPTION:${icsEscape(r.label)}`);
      if (m.time) out.push(...icsAlarm(alarmMinutes, summary));
      out.push("END:VEVENT");
    });
  }
  // A withdrawn team's removed fixtures go out as cancelled events under the same ids, so a file
  // imported before the withdrawal drops them on re-import (a subscribed feed drops them anyway).
  if (official === null) {
    for (const w of schedule.withdrawals || []) for (const x of w.removed || []) {
      if (!x.fixture || (teamIdx !== null && x.home !== teamIdx && x.away !== teamIdx)) continue;
      const hn = schedule.teams[x.home], an = schedule.teams[x.away];
      const summary = teamIdx === null ? `${hn} vs ${an}` : `${schedule.teams[teamIdx]} vs ${schedule.teams[x.home === teamIdx ? x.away : x.home]} (${x.home === teamIdx ? "home" : "away"})`;
      out.push("BEGIN:VEVENT", `UID:${icsUid(x)}`, `DTSTAMP:${dtstamp}`, `SEQUENCE:${(x.moves || 0) + 1}`, ...icsWhen(x.day, x.time, minutes),
        "STATUS:CANCELLED", `SUMMARY:${icsEscape("Cancelled: " + summary)}`, `LOCATION:${icsEscape(x.court)}`,
        `DESCRIPTION:${icsEscape(`${schedule.teams[w.team]} withdrew from the league.`)}`, "END:VEVENT");
    }
  }
  out.push("END:VCALENDAR");
  return out.map(icsFold).join("\r\n") + "\r\n";
}

/**
 * One ready-to-paste message per team ("Hi Hawks, your fixtures: ..."), so a coordinator can
 * message each team its own dates instead of forwarding the whole league. Uses teamSchedule.
 */
export function teamMessages(schedule) {
  return schedule.teams.map((name, idx) => {
    const rows = teamSchedule(schedule, idx);
    const lines = [`Hi ${name}, your fixtures:`];
    for (const r of rows) {
      if (r.bye) lines.push(`${r.round} - ${dayLabel(r.day)}: bye (no game)`);
      else lines.push(`${r.round} - ${dayLabel(r.day)}${r.time ? " " + r.time : ""}${r.court ? ", " + r.court : ""}: ${r.venue} vs ${r.opponent}`);
    }
    lines.push("Check the dates before you plan around them.");
    return { team: name, text: lines.join("\n") };
  });
}

/**
 * One ready-to-paste note per official (set by assignOfficials): the matches they work, with date, time, court and the
 * two teams, in schedule order. Officials with no match are left out. Returns [{ official, matches, text }].
 */
export function officialMessages(schedule) {
  const by = new Map();
  for (const r of schedule.rounds) {
    for (const m of r.matches) {
      if (!m.official) continue;
      if (!by.has(m.official)) by.set(m.official, []);
      by.get(m.official).push(`${r.label} - ${dayLabel(r.day)}${m.time ? " " + m.time : ""}${m.court ? ", " + m.court : ""}: ${m.homeName} vs ${m.awayName}`);
    }
  }
  return [...by].map(([official, lines]) => ({
    official,
    matches: lines.length,
    text: [`Hi ${official}, the matches you are officiating (${lines.length}):`, ...lines, "Check the dates before you plan around them."].join("\n"),
  }));
}

// Teams down the side, dates across the top: one cell per team per round, "v Opp" at
// home, "@ Opp" away, "BYE" for a bye, blank when the team has no game that round.
export function seasonGrid(schedule) {
  const header = ["Team", ...schedule.rounds.map((r) => `${r.label} ${dayIso(r.day)}`)];
  const rows = schedule.teams.map((name, i) => {
    const cells = schedule.rounds.map((r) => {
      const ms = r.matches.filter((x) => x.home === i || x.away === i);
      if (ms.length) return ms.map((m) => (m.home === i ? `v ${m.awayName}` : `@ ${m.homeName}`)).join(" / ");
      return r.bye === i ? "BYE" : "";
    });
    return [name, ...cells];
  });
  return { header, rows };
}

export function seasonGridCsv(schedule) {
  const { header, rows } = seasonGrid(schedule);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function scheduleText(schedule, bracket = null) {
  const n = schedule.teams.length;
  const lines = [`${n}-team ${schedule.config.double ? "double" : "single"} round robin`, ""];
  for (const r of schedule.rounds) {
    lines.push(`${r.label} - ${dayLabel(r.day)}`);
    for (const m of r.matches) lines.push(`  ${m.time ? m.time + " " : ""}${m.court}: ${m.homeName} (home) vs ${m.awayName}${m.official ? " [official: " + m.official + "]" : ""}`);
    if (r.bye !== null && r.bye !== undefined) lines.push(`  Bye: ${schedule.teams[r.bye]}`);
    if (r.sitOut && r.sitOut.length) lines.push(`  One game fewer tonight: ${r.sitOut.map((t) => schedule.teams[t]).join(", ")}`);
    lines.push("");
  }
  if (bracket) lines.push(bracketText(bracket));
  lines.push("Made with the free league schedule generator. Check the dates before you send them round.");
  return lines.join("\n");
}

export const htmlEsc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * One self-contained web page for the league: schedule with a pick-your-team filter, standings and
 * play-off bracket when given. No external requests, so an organiser can drop it on any static host
 * (GitHub Pages, Netlify, a school site) or email it. Every typed name is escaped.
 */
export function leaguePageHtml(schedule, { title = "League schedule", table = null, bracket = null } = {}) {
  const teams = schedule.teams;
  const t = htmlEsc(title);
  const rounds = schedule.rounds.map((r) => {
    const rows = r.matches.map((m) => `<tr data-t="${m.home} ${m.away}"><td class="s">${htmlEsc(m.time)}</td><td class="s">${htmlEsc(m.court)}</td><td>${htmlEsc(m.homeName)}</td><td>${htmlEsc(m.awayName)}</td>${m.official !== undefined ? `<td>${htmlEsc(m.official)}</td>` : ""}</tr>`);
    if (r.bye !== null && r.bye !== undefined) rows.push(`<tr data-t="${r.bye}" class="bye"><td colspan="4">Bye: ${htmlEsc(teams[r.bye])}</td></tr>`);
    return `<section class="round"><h3>${htmlEsc(r.label)} <span>${htmlEsc(dayLabel(r.day))}</span></h3><table><thead><tr><th>Time</th><th>Court</th><th>Home</th><th>Away</th>${r.matches.some((m) => m.official !== undefined) ? "<th>Official</th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table></section>`;
  }).join("\n");
  const stand = table ? `<h2>Standings</h2><table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>${table.map((r) => `<tr><td>${r.rank}</td><td>${htmlEsc(r.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gd}</td><td>${r.points}</td></tr>`).join("")}</tbody></table>` : "";
  const brk = bracket ? `<h2>Play-offs</h2><pre>${htmlEsc(bracketText(bracket))}</pre>` : "";
  const opts = teams.map((n, i) => `<option value="${i}">${htmlEsc(n)}</option>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem;color:#1a1a1a;background:#fff}table{border-collapse:collapse;width:100%;margin-bottom:1rem}th,td{text-align:left;padding:.3rem .5rem;border-bottom:1px solid #ddd}h3 span{font-weight:400;color:#555}select{font:inherit;padding:.3rem}.bye td{color:#555;font-style:italic}pre{background:#f5f5f5;padding:.75rem;overflow:auto}footer{color:#555;font-size:.85rem;margin-top:2rem}.s{white-space:nowrap}@media print{select,label{display:none}.round{break-inside:avoid}h2,h3{break-after:avoid}}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}th,td{border-color:#333}pre{background:#1c1c1c}h3 span,.bye td,footer{color:#aaa}}</style></head>
<body><h1>${t}</h1>
<p><label>Show only <select id="f"><option value="">Everyone</option>${opts}</select></label></p>
${rounds}
${stand}
${brk}
<footer>Made with the free league schedule generator. Check dates and venues with your organiser.</footer>
<script>(function(){var f=document.getElementById("f");function a(){var v=f.value;document.querySelectorAll("tr[data-t]").forEach(function(r){r.hidden=v!==""&&r.getAttribute("data-t").split(" ").indexOf(v)<0});document.querySelectorAll(".round").forEach(function(s){s.hidden=!s.querySelector("tr[data-t]:not([hidden])")})}f.addEventListener("change",a)})();</script>
</body></html>
`;
}

/**
 * Printable game-night score sheets: one page per round with every match, blank score boxes, a
 * forfeit tick and a signature line, so the person at the table can write results down and the
 * organiser can type them in afterwards (lines like "Hawks 3 - 2 Owls"). Self-contained, every
 * typed name escaped, no external requests.
 */
export function scoreSheetsHtml(schedule, { title = "League score sheets" } = {}) {
  const t = htmlEsc(title);
  // An Official column only when someone is assigned: an empty column takes width from the team names.
  const withOfficial = schedule.rounds.some((r) => r.matches.some((m) => m.official));
  const pages = schedule.rounds.map((r) => {
    const rows = r.matches.map((m) => `<tr><td class="s">${htmlEsc(m.time)}</td><td class="s">${htmlEsc(m.court)}</td><td class="n">${htmlEsc(m.homeName)}</td><td class="b"></td><td class="b"></td><td class="n">${htmlEsc(m.awayName)}</td><td class="f">&#9744;</td>${withOfficial ? `<td class="s">${htmlEsc(m.official ?? "")}</td>` : ""}</tr>`);
    const bye = r.bye !== null && r.bye !== undefined ? `<p class="bye">Bye: ${htmlEsc(schedule.teams[r.bye])}</p>` : "";
    return `<section class="sheet"><h2>${htmlEsc(r.label)} <span>${htmlEsc(dayLabel(r.day))}</span></h2><table><thead><tr><th>Time</th><th>Court</th><th>Home</th><th colspan="2">Score</th><th>Away</th><th>Forfeit</th>${withOfficial ? "<th>Official</th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table>${bye}<p class="sig">Scorekeeper: ____________________________</p><p class="sig">Notes (injuries, protests, rainouts): ______________________________________</p></section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:56rem;padding:1rem;color:#1a1a1a;background:#fff}h2 span{font-weight:400;color:#555}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:.5rem;text-align:left}td.b{width:3.5rem;height:2.4rem}td.n{font-weight:600}td.f{text-align:center;font-size:1.3rem}.s{white-space:nowrap}.sheet{page-break-after:always;margin-bottom:2rem}.sheet:last-child{page-break-after:auto}.sig{margin-top:1.5rem}.bye{color:#555;font-style:italic}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}th,td{border-color:#666}h2 span,.bye{color:#aaa}}@media print{body{background:#fff;color:#000;padding:0}th,td{padding:.4rem .35rem}}</style></head>
<body><h1>${t}</h1>
${pages}
</body></html>
`;
}
