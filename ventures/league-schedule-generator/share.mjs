// League schedule generator, share.mjs: The share link (every field in the URL, read back safely), the example league and next season's fields.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { WEEKDAYS, parseDate, dayOfWeek, dayIso } from "./dates.mjs";

// ---------------------------------------------------------------- share link

const SHARE_KEYS = ["teams", "double", "reverseLeg", "carryOver", "carryOverPick", "carryOverKeep", "start", "weekdays", "skip", "blackouts", "timeLimits", "courtLimits", "courtClosures", "courts", "times", "seed", "minutes", "rounds", "balanceSeeds", "gamesPerNight", "results", "playoff", "playoffDouble", "playoffThird", "playoffResults", "pins", "rainouts", "withdrawals", "lateTeams", "finishBy", "officials", "grounds", "linked", "scoring", "duties", "sheetTitle", "sheetContact", "platformLocation", "teamSnapDivision", "teamSnapArrival", "sportsEngineIds"];

/** Page fields -> URL-safe text for the `#` part of a link. The fragment is never sent to a server. */
export function encodeFields(f) {
  const o = {};
  for (const k of SHARE_KEYS) if (f[k] !== undefined && f[k] !== "" && f[k] !== false) o[k] = f[k];
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of encodeFields. Returns null for anything that is not a valid share fragment. */
export function decodeFields(text) {
  try {
    const t = String(text || "").replace(/^#s=?/, "").replace(/^#/, "");
    if (!t || t.length > 20000 || !/^[A-Za-z0-9_-]+$/.test(t)) return null;
    const bin = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const str = (v) => (typeof v === "string" ? v : "");
    const wd = Array.isArray(o.weekdays) ? o.weekdays.filter((d) => WEEKDAYS.includes(d)) : [];
    return {
      teams: str(o.teams), double: o.double === true, reverseLeg: o.reverseLeg === true, carryOver: o.carryOver === true, carryOverPick: ["fair", "balanced", "breaks", "fewest"].includes(o.carryOverPick) ? o.carryOverPick : "balanced", carryOverKeep: /^\d{1,3}@\d{1,3}[ds]-?\d{1,12}$/.test(str(o.carryOverKeep)) ? o.carryOverKeep : "", start: str(o.start), weekdays: wd,
      skip: str(o.skip), blackouts: str(o.blackouts), timeLimits: str(o.timeLimits), courtLimits: str(o.courtLimits), courtClosures: str(o.courtClosures), courts: str(o.courts), times: str(o.times),
      seed: Number.isFinite(Number(o.seed)) ? Math.trunc(Number(o.seed)) : 1,
      minutes: Number.isFinite(Number(o.minutes)) ? Number(o.minutes) : 60,
      rounds: o.rounds === undefined || o.rounds === "" ? "" : String(o.rounds).slice(0, 4), balanceSeeds: o.balanceSeeds === true,
      gamesPerNight: /^[1-4]$/.test(String(o.gamesPerNight ?? "")) ? String(o.gamesPerNight) : "",
      results: str(o.results), playoff: Number.isFinite(Number(o.playoff)) ? Math.trunc(Number(o.playoff)) : 0,
      playoffDouble: o.playoffDouble === true, playoffThird: o.playoffThird === true, playoffResults: str(o.playoffResults),
      pins: str(o.pins), rainouts: str(o.rainouts), withdrawals: str(o.withdrawals), lateTeams: str(o.lateTeams), finishBy: /^\d{4}-\d{2}-\d{2}$/.test(str(o.finishBy)) ? o.finishBy : "", officials: str(o.officials), grounds: str(o.grounds), linked: str(o.linked), scoring: str(o.scoring),
      duties: str(o.duties), sheetTitle: str(o.sheetTitle), sheetContact: str(o.sheetContact),
      platformLocation: str(o.platformLocation), teamSnapDivision: str(o.teamSnapDivision), teamSnapArrival: str(o.teamSnapArrival), sportsEngineIds: str(o.sportsEngineIds),
    };
  } catch { return null; }
}

// ---------------------------------------------------------------- example

export function sampleFields() {
  return {
    teams: "Net Ninjas\nDink Dynasty\nKitchen Kings\nLob Squad\nSpin Doctors\nThird Shot Drops",
    double: false,
    start: "2026-10-06",
    weekdays: ["Tue"],
    skip: "2026-11-24",
    blackouts: "Dink Dynasty: 2026-10-20",
    courts: "Court 1\nCourt 2",
    times: "18:00, 19:00",
    seed: 1,
    minutes: 60,
    results: "",
    playoff: 4,
  };
}

/**
 * Roll a league's form fields over to the next season: same teams, courts, times, weekdays and
 * per-team time and court limits; the old season's dated inputs (skip dates, blackouts, results, rainouts, withdrawals,
 * late entries, deadline) are cleared; teams that withdrew are dropped and late entrants kept;
 * the start moves to the first chosen weekday on or after `lastDay` + `gapWeeks` weeks (or a year
 * after the old start when the old season was not built); the seed moves on so home and away
 * and court draws are not a copy of last season's.
 */
export function nextSeasonFields(fields, { lastDay = null, gapWeeks = 8 } = {}) {
  const f = { ...fields };
  const lineTeam = (line) => line.replace(/^\s*\d{4}-\d{1,2}-\d{1,2}\s*[:,-]?\s*/, "").replace(/\s*(?:->|=>|\u2192)\s*.*$/, "").trim();
  const gone = new Set(String(f.withdrawals || "").split(/\n+/).map(lineTeam).filter(Boolean).map((t) => t.toLowerCase()));
  const late = String(f.lateTeams || "").split(/\n+/).map(lineTeam).filter(Boolean);
  const kept = String(f.teams || "").split(/\n+/).map((t) => t.trim()).filter((t) => t && !gone.has(t.toLowerCase()));
  for (const t of late) if (!kept.some((k) => k.toLowerCase() === t.toLowerCase())) kept.push(t);
  f.teams = kept.join("\n");
  const old = parseDate(f.start);
  let day = lastDay != null ? lastDay + gapWeeks * 7 : old != null ? old + 364 : null;
  if (day != null) {
    const wanted = (f.weekdays || []).map((w) => WEEKDAYS.indexOf(w)).filter((i) => i >= 0);
    if (wanted.length) for (let i = 0; i < 7 && !wanted.includes(dayOfWeek(day)); i++) day++;
    f.start = dayIso(day);
  }
  f.seed = (Number(f.seed) || 0) + 1;
  for (const k of ["skip", "blackouts", "results", "playoffResults", "pins", "rainouts", "withdrawals", "lateTeams", "finishBy"]) if (k in f) f[k] = "";
  const dropped = String(fields.teams || "").split(/\n+/).map((t) => t.trim()).filter((t) => t && gone.has(t.toLowerCase()));
  return { fields: f, dropped, added: late.filter((t) => kept.includes(t)) };
}
