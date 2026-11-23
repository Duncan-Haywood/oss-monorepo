// League schedule generator, names.mjs: Team names: read a pasted list (lines, commas, a spreadsheet column) and find a typed name in it.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

export const MAX_TEAMS = 64;

/**
 * Team names from whatever the organiser pasted: one per line, a single
 * comma/semicolon list, a spreadsheet column (extra tab columns dropped), with
 * list numbering or bullets and surrounding quotes removed. A multi-line list
 * keeps its commas, so "Smith, J. XI" stays one team.
 */
function teamLines(text) {
  let lines = String(text ?? "").split(/\r?\n/).map((l) => l.split("\t")[0].replace(/\s+/g, " ").trim()).filter(Boolean);
  if (lines.length === 1 && /[,;]/.test(lines[0])) lines = lines[0].split(/[,;]/).map((l) => l.trim()).filter(Boolean);
  const marker = /^(\d{1,3}[.)]|[-•*–])\s+/;
  if (lines.length > 1 && lines.every((l) => marker.test(l))) lines = lines.map((l) => l.replace(marker, ""));
  return lines.map((l) => l.replace(/^(["“'])(.+)(["”'])$/, "$2").trim()).filter(Boolean);
}

export function parseTeams(text) {
  const teams = [];
  const errors = [];
  const seen = new Map();
  for (const name of teamLines(text)) {
    const key = name.toLowerCase();
    if (seen.has(key)) { errors.push(`"${name}" is listed twice.`); continue; }
    seen.set(key, teams.length);
    teams.push(name);
  }
  if (teams.length < 2) errors.push("Enter at least two teams, one per line (a comma-separated list also works).");
  if (teams.length > MAX_TEAMS) errors.push(`Up to ${MAX_TEAMS} teams are supported.`);
  return { teams, errors };
}

function teamIndex(teams, name) {
  const key = name.replace(/\s+/g, " ").trim().toLowerCase();
  const exact = teams.findIndex((t) => t.toLowerCase() === key);
  if (exact >= 0) return exact;
  // Result lines drop a trailing full stop ("... 1 - 0 Volodin Alexandr E."), so a name that ends in
  // one ("Volodin Alexandr E.", "Bay Area F.C.") also matches without it, when only one name does.
  const bare = (s) => s.replace(/\s+/g, " ").trim().toLowerCase().replace(/[.\s]+$/, "");
  const k = bare(key);
  const hits = teams.reduce((a, t, i) => (bare(t) === k ? [...a, i] : a), []);
  return hits.length === 1 ? hits[0] : -1;
}

export { teamIndex };
