// Balanced teams from a player list: the draft a rec league, a coed league or an ultimate "hat"
// tournament does before a schedule can be built. Each player has a name, a rating (any scale the
// organiser likes; decimals allowed) and an optional tag (F/M for a coed league, G for a goalie, a
// position). Requests: `together: Ana, Ben` (friends or a carpool, kept on one team) and
// `apart: Cy, Dee` (never on the same team).
//
// Hard rules, kept whenever they can be: team sizes differ by at most one; every tag is spread so its
// count per team differs by at most one (so a coed league's women are split as evenly as they can be);
// together groups stay whole; apart pairs are split. Within those rules the search makes the team
// rating totals as close as it can (the spread is the strongest total minus the weakest), then the
// smallest sum of squared distances from the mean total. It returns a lower bound on the spread, so
// when the two meet the answer is proved the most even possible.
//
// Zero dependencies; runs in the browser and in Node. Deterministic for a given seed.

export const MAX_PLAYERS = 400;
export const MAX_TEAMS = 64;

const tidy = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const key = (s) => tidy(s).toLocaleLowerCase();

/** mulberry32: a small seeded PRNG, so a seed always gives the same teams. */
function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Parses the text box. One player per line: `Name, rating, tag` (commas or tabs; rating and tag
 * optional, so a spreadsheet's columns paste straight in). Lines starting `together:` or `apart:`
 * hold requests; `#` starts a comment. A header row whose second column is not a number is skipped.
 * Returns { players: [{ name, rating, tag }], together: [[names]], apart: [[a, b]], warnings, errors }.
 */
export function parsePlayers(text) {
  const players = [];
  const together = [];
  const apart = [];
  const warnings = [];
  const errors = [];
  const seen = new Map();
  const lines = String(text ?? "").split(/\r?\n/);
  let missing = [];
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const req = line.match(/^(together|apart)\s*:\s*(.*)$/i);
    if (req) {
      const names = req[2].split(/[,\t;]/).map(tidy).filter(Boolean);
      if (names.length < 2) { errors.push(`Line ${i + 1}: a ${req[1].toLowerCase()} request needs at least two names.`); return; }
      if (req[1].toLowerCase() === "together") together.push(names);
      else for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) apart.push([names[a], names[b]]);
      return;
    }
    const cells = line.split(/\t|,|;/).map(tidy);
    const name = cells[0];
    if (!name) { errors.push(`Line ${i + 1}: no name.`); return; }
    const rText = cells[1] ?? "";
    let rating = null;
    if (rText !== "") {
      const n = Number(rText);
      if (!Number.isFinite(n)) {
        if (players.length === 0 && i === lines.findIndex((l) => l.trim())) return; // header row
        errors.push(`Line ${i + 1}: "${rText}" is not a number (rating).`);
        return;
      }
      rating = n;
    }
    const tag = tidy(cells[2] ?? "").toUpperCase();
    if (seen.has(key(name))) { errors.push(`Line ${i + 1}: ${name} is listed twice (also line ${seen.get(key(name))}).`); return; }
    seen.set(key(name), i + 1);
    const p = { name, rating, tag };
    if (rating === null) missing.push(p);
    players.push(p);
  });
  if (players.length > MAX_PLAYERS) errors.push(`At most ${MAX_PLAYERS} players (got ${players.length}).`);
  if (missing.length && missing.length < players.length) {
    const given = players.filter((p) => p.rating !== null).map((p) => p.rating).sort((a, b) => a - b);
    const mid = given.length % 2 ? given[(given.length - 1) / 2] : (given[given.length / 2 - 1] + given[given.length / 2]) / 2;
    for (const p of missing) p.rating = mid;
    warnings.push(`${missing.length} player${missing.length === 1 ? " has" : "s have"} no rating, so ${missing.length === 1 ? "is" : "are"} counted at the middle rating (${mid}): ${missing.map((p) => p.name).join(", ")}.`);
  } else if (missing.length) {
    for (const p of missing) p.rating = 0;
    warnings.push("No ratings given, so teams are balanced on size and tags only.");
  }
  return { players, together, apart, warnings, errors };
}

/** Joins overlapping together-requests into groups of player indices; unknown names are reported. */
function groupsFrom(players, together, problems) {
  const idx = new Map(players.map((p, i) => [key(p.name), i]));
  const parent = players.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const names of together) {
    const ids = [];
    for (const n of names) {
      if (!idx.has(key(n))) problems.push(`together: "${n}" is not in the player list.`);
      else ids.push(idx.get(key(n)));
    }
    for (let j = 1; j < ids.length; j++) parent[find(ids[j])] = find(ids[0]);
  }
  const by = new Map();
  players.forEach((_, i) => { const r = find(i); by.set(r, [...(by.get(r) ?? []), i]); });
  return [...by.values()];
}

/** Lower bound on the spread of team totals. Integer ratings: totals are integers, so if the total
 *  does not divide by k, at least one team is above and one below the mean. A single unit (player or
 *  together group) stronger than the mean total also forces a gap. */
export function spreadLowerBound(units, k) {
  const T = units.reduce((s, u) => s + u.rating, 0);
  let lb = 0;
  if (units.every((u) => Number.isInteger(u.rating))) lb = T % k === 0 ? 0 : 1;
  const big = Math.max(...units.map((u) => u.rating));
  // The team holding the biggest unit totals at least `big`; the other k-1 share at most T - big,
  // so the weakest holds at most (T - big) / (k - 1).
  if (k > 1) lb = Math.max(lb, big - (T - big) / (k - 1));
  return lb;
}

/**
 * Builds k teams. `opts`: { seed = 1, iterations (moves per restart), restarts }.
 * Returns { teams: [{ name, players: [{name, rating, tag}], total, average, tags: {tag: count} }],
 *   spread, lowerBound, proved, broken: [messages for rules that could not all be kept], warnings }.
 */
export function balanceTeams(parsed, k, opts = {}) {
  const { players, together = [], apart = [] } = parsed;
  const warnings = [...(parsed.warnings ?? [])];
  if (!Number.isInteger(k) || k < 2) throw new Error("Make at least 2 teams.");
  if (k > MAX_TEAMS) throw new Error(`At most ${MAX_TEAMS} teams.`);
  if (players.length < k) throw new Error(`${players.length} players cannot fill ${k} teams.`);
  const problems = [];
  const groups = groupsFrom(players, together, problems);
  const n = players.length;
  const tags = [...new Set(players.map((p) => p.tag).filter(Boolean))].sort();
  const units = groups.map((ids) => {
    const tagCount = tags.map((t) => ids.filter((i) => players[i].tag === t).length);
    return { ids, size: ids.length, rating: ids.reduce((s, i) => s + players[i].rating, 0), tagCount };
  });
  const unitOf = new Array(n);
  units.forEach((u, ui) => u.ids.forEach((i) => (unitOf[i] = ui)));
  const idx = new Map(players.map((p, i) => [key(p.name), i]));
  const apartUnits = [];
  for (const [a, b] of apart) {
    if (!idx.has(key(a)) || !idx.has(key(b))) { problems.push(`apart: "${idx.has(key(a)) ? b : a}" is not in the player list.`); continue; }
    const ua = unitOf[idx.get(key(a))], ub = unitOf[idx.get(key(b))];
    if (ua === ub) { problems.push(`${a} and ${b} are asked to be together and apart; together wins.`); continue; }
    apartUnits.push([ua, ub, a, b]);
  }
  const sizeLo = Math.floor(n / k), sizeHi = Math.ceil(n / k);
  const tagLo = tags.map((t, j) => Math.floor(players.filter((p) => p.tag === t).length / k));
  const tagHi = tags.map((t, j) => Math.ceil(players.filter((p) => p.tag === t).length / k));
  const maxGroup = Math.max(...units.map((u) => u.size));
  if (maxGroup > sizeHi) problems.push(`A together group of ${maxGroup} is bigger than a team (${sizeHi}).`);

  const mean = units.reduce((s, u) => s + u.rating, 0) / k;
  const scale = Math.max(1, ...units.map((u) => Math.abs(u.rating)));
  const BIG = 1e3 * scale * k;

  // State: team of each unit, with per-team size, total and tag counts kept incrementally.
  const team = new Int32Array(units.length);
  const size = new Float64Array(k), total = new Float64Array(k);
  const tc = tags.map(() => new Float64Array(k));
  const partners = units.map(() => []);
  for (const [ua, ub] of apartUnits) { partners[ua].push(ub); partners[ub].push(ua); }

  const viol = () => {
    let v = 0;
    for (let t = 0; t < k; t++) {
      v += Math.max(0, size[t] - sizeHi) + Math.max(0, sizeLo - size[t]);
      for (let j = 0; j < tags.length; j++) v += Math.max(0, tc[j][t] - tagHi[j]) + Math.max(0, tagLo[j] - tc[j][t]);
    }
    for (const [ua, ub] of apartUnits) if (team[ua] === team[ub]) v++;
    return v;
  };
  const cost = () => {
    let hi = -Infinity, lo = Infinity, ss = 0;
    for (let t = 0; t < k; t++) { hi = Math.max(hi, total[t]); lo = Math.min(lo, total[t]); ss += (total[t] - mean) ** 2; }
    return { v: viol(), spread: hi - lo, ss };
  };
  const score = (c) => c.v * BIG + c.spread * k + c.ss / (scale * k);
  const place = (u, t, sign) => {
    const U = units[u];
    size[t] += sign * U.size; total[t] += sign * U.rating;
    for (let j = 0; j < tags.length; j++) tc[j][t] += sign * U.tagCount[j];
  };
  const assign = (u, t) => { team[u] = t; place(u, t, 1); };
  const move = (u, t) => { place(u, team[u], -1); team[u] = t; place(u, t, 1); };

  // Start: per tag (biggest units first) a snake draft to the team that is lightest on that tag,
  // then on size, then on total; units whose apart partner is already there go elsewhere if they can.
  const order = units.map((_, i) => i).sort((a, b) => units[b].size - units[a].size || units[b].rating - units[a].rating || a - b);
  const startTeams = (r) => {
    size.fill(0); total.fill(0); tc.forEach((x) => x.fill(0));
    for (const u of order) {
      let best = -1, bestKey = null;
      for (let t = 0; t < k; t++) {
        const clash = partners[u].some((p) => team[p] === t && placed[p]) ? 1 : 0;
        const over = size[t] + units[u].size > sizeHi ? 1 : 0;
        const tagLoad = units[u].tagCount.reduce((s, c, j) => s + (c ? tc[j][t] : 0), 0);
        const kk = [over, clash, tagLoad, size[t], total[t], r()];
        if (!bestKey || lexLess(kk, bestKey)) { best = t; bestKey = kk; }
      }
      assign(u, best); placed[u] = true;
    }
  };
  const placed = new Array(units.length).fill(false);

  const iters = opts.iterations ?? Math.min(200000, 4000 + 400 * units.length);
  const restarts = opts.restarts ?? 6;
  const rand = rng(opts.seed ?? 1);
  let best = null;
  for (let rs = 0; rs < restarts; rs++) {
    placed.fill(false);
    startTeams(rand);
    let cur = score(cost());
    let local = { s: cur, team: Int32Array.from(team) };
    let temp = scale * 0.5;
    const cool = Math.pow(1e-4, 1 / iters);
    for (let it = 0; it < iters; it++) {
      const u = Math.floor(rand() * units.length);
      const from = team[u];
      if (rand() < 0.75) {
        // swap with a unit on another team
        const w = Math.floor(rand() * units.length);
        const to = team[w];
        if (to === from) continue;
        move(u, to); move(w, from);
        const s = score(cost());
        if (s <= cur || rand() < Math.exp((cur - s) / temp)) cur = s; else { move(u, from); move(w, to); }
      } else {
        const to = Math.floor(rand() * k);
        if (to === from) continue;
        move(u, to);
        const s = score(cost());
        if (s <= cur || rand() < Math.exp((cur - s) / temp)) cur = s; else move(u, from);
      }
      if (cur < local.s - 1e-12) local = { s: cur, team: Int32Array.from(team) };
      temp *= cool;
    }
    if (!best || local.s < best.s - 1e-12) best = local;
  }
  // Rebuild the best state.
  const rebuild = (teamOfUnit) => {
    size.fill(0); total.fill(0); tc.forEach((x) => x.fill(0));
    teamOfUnit.forEach((t, u) => assign(u, t));
    return cost();
  };
  let final = rebuild(best.team);
  // Small lists: an exhaustive search settles it (the annealing missed the least spread on 4 of 357
  // random lists of 8-14 players, eval/balanced-teams-exact.txt). Capped, so a big list never waits.
  let exhaustive = false;
  const lb0 = spreadLowerBound(units, k);
  if (n <= (opts.exactUpTo ?? 16) && (final.v > 0 || final.spread > lb0 + 1e-9)) {
    const ex = exactTeams(parsed, k, lb0, opts.exactNodes ?? 3e6);
    if (ex && (final.v > 0 || ex.spread < final.spread - 1e-9)) {
      final = rebuild(units.map((U) => ex.team[U.ids[0]]));
    }
    exhaustive = Boolean(ex && ex.complete) || (ex === null && !problems.length);
  }

  const broken = [...problems];
  for (let t = 0; t < k; t++) {
    if (size[t] > sizeHi || size[t] < sizeLo) broken.push(`Team ${t + 1} has ${size[t]} players (others ${sizeLo}-${sizeHi}): a together group did not fit evenly.`);
    for (let j = 0; j < tags.length; j++) if (tc[j][t] > tagHi[j] || tc[j][t] < tagLo[j]) broken.push(`Team ${t + 1} has ${tc[j][t]} tagged ${tags[j]} (even split is ${tagLo[j]}-${tagHi[j]}).`);
  }
  for (const [ua, ub, a, b] of apartUnits) if (team[ua] === team[ub]) broken.push(`${a} and ${b} are on the same team: keeping them apart broke a size or tag rule.`);

  const teamList = Array.from({ length: k }, (_, t) => ({ name: `Team ${t + 1}`, players: [] }));
  units.forEach((U, u) => U.ids.forEach((i) => teamList[team[u]].players.push(players[i])));
  for (const T of teamList) {
    T.players.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
    T.total = round(T.players.reduce((s, p) => s + p.rating, 0));
    T.average = round(T.total / T.players.length);
    T.tags = Object.fromEntries(tags.map((tg) => [tg, T.players.filter((p) => p.tag === tg).length]));
  }
  // Strongest first, so "Team 1" is not a hint of anything; then renumber.
  teamList.sort((a, b) => b.total - a.total);
  teamList.forEach((T, i) => (T.name = `Team ${i + 1}`));
  const spread = round(final.spread);
  // A finished exhaustive search is its own proof: nothing under the hard rules beats this spread.
  const lowerBound = exhaustive && final.v === 0 ? spread : round(lb0);
  return { teams: teamList, spread, lowerBound, proved: final.v === 0 && broken.length === 0 && spread <= lowerBound + 1e-9, exhaustive, broken, warnings, tags };
}

const round = (x) => Math.round(x * 1000) / 1000;
function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** Every hard rule checked again from the output alone. Returns a list of faults (empty = valid). */
export function checkTeams(parsed, result) {
  const faults = [];
  const where = new Map();
  result.teams.forEach((T, t) => T.players.forEach((p) => {
    if (where.has(key(p.name))) faults.push(`${p.name} is on two teams.`);
    where.set(key(p.name), t);
  }));
  for (const p of parsed.players) if (!where.has(key(p.name))) faults.push(`${p.name} is on no team.`);
  const k = result.teams.length, n = parsed.players.length;
  const sizes = result.teams.map((T) => T.players.length);
  if (Math.max(...sizes) - Math.min(...sizes) > 1) faults.push(`Team sizes ${sizes.join(", ")} differ by more than one.`);
  for (const tg of result.tags) {
    const c = result.teams.map((T) => T.players.filter((p) => p.tag === tg).length);
    if (Math.max(...c) - Math.min(...c) > 1) faults.push(`Tag ${tg} split ${c.join(", ")}.`);
  }
  for (const g of parsed.together ?? []) {
    const ts = new Set(g.filter((nm) => where.has(key(nm))).map((nm) => where.get(key(nm))));
    if (ts.size > 1) faults.push(`together: ${g.join(", ")} are split.`);
  }
  // A pair asked both together and apart is kept together (balanceTeams reports it), so not a fault.
  const groupOf = new Map();
  groupsFrom(parsed.players, parsed.together ?? [], []).forEach((g, gi) => g.forEach((i) => groupOf.set(key(parsed.players[i].name), gi)));
  for (const [a, b] of parsed.apart ?? []) {
    if (groupOf.has(key(a)) && groupOf.get(key(a)) === groupOf.get(key(b))) continue;
    if (where.has(key(a)) && where.get(key(a)) === where.get(key(b))) faults.push(`apart: ${a} and ${b} share a team.`);
  }
  const totals = result.teams.map((T) => T.total);
  if (Math.abs(round(Math.max(...totals) - Math.min(...totals)) - result.spread) > 1e-6) faults.push("Reported spread does not match the totals.");
  if (n && k && sizes.reduce((a, b) => a + b, 0) !== n) faults.push("Player count does not add up.");
  return faults;
}

/** CSV: Team, Player, Rating, Tag. */
export function teamsCsv(result) {
  // Formula-injection guard: a cell a spreadsheet would run (=, +, -, @, tab, CR) gets an apostrophe,
  // except a plain number such as a negative rating.
  const q = (c) => {
    let s = String(c);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Team", "Player", "Rating", "Tag"]];
  for (const T of result.teams) for (const p of T.players) rows.push([T.name, p.name, p.rating, p.tag]);
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

/** Plain text to paste into a group chat or email. */
export function teamsText(result) {
  const out = [];
  for (const T of result.teams) {
    const tagBits = Object.entries(T.tags).map(([t, c]) => `${c} ${t}`).join(", ");
    out.push(`${T.name} (${T.players.length} players${tagBits ? `, ${tagBits}` : ""}; total ${T.total})`);
    for (const p of T.players) out.push(`  ${p.name}`);
    out.push("");
  }
  out.push(`Strongest minus weakest team total: ${result.spread}${result.proved ? " (the most even possible)" : ` (no split can be under ${result.lowerBound})`}.`);
  return out.join("\n");
}

/**
 * Exact search for small lists (tests and eval): tries every assignment of units to teams that keeps
 * the hard rules and returns the least spread, or null when no assignment keeps them.
 * Exponential; use with up to about 14 players.
 */
export function exactLeastSpread(parsed, k) {
  const r = exactTeams(parsed, k);
  return r ? r.spread : null;
}

/** Exhaustive search with its assignment: { spread, team (team index per player) } or null. Stops early
 *  once the spread meets `stopAt`. */
function exactTeams(parsed, k, stopAt = -1, nodeCap = Infinity) {
  const { players } = parsed;
  const problems = [];
  const groups = groupsFrom(players, parsed.together ?? [], problems);
  const n = players.length;
  const tags = [...new Set(players.map((p) => p.tag).filter(Boolean))];
  const units = groups.map((ids) => ({ ids, size: ids.length, rating: ids.reduce((s, i) => s + players[i].rating, 0), tagCount: tags.map((t) => ids.filter((i) => players[i].tag === t).length) }));
  const unitOf = new Array(n); units.forEach((u, ui) => u.ids.forEach((i) => (unitOf[i] = ui)));
  const idx = new Map(players.map((p, i) => [key(p.name), i]));
  const apartU = (parsed.apart ?? []).map(([a, b]) => [unitOf[idx.get(key(a))], unitOf[idx.get(key(b))]]).filter(([a, b]) => a !== b);
  const sizeLo = Math.floor(n / k), sizeHi = Math.ceil(n / k);
  const tagLo = tags.map((t) => Math.floor(players.filter((p) => p.tag === t).length / k));
  const tagHi = tags.map((t) => Math.ceil(players.filter((p) => p.tag === t).length / k));
  const team = new Array(units.length).fill(-1);
  const size = new Array(k).fill(0), total = new Array(k).fill(0), tc = tags.map(() => new Array(k).fill(0));
  let best = Infinity, bestTeam = null, nodes = 0;
  const rec = (u, used) => {
    if (best <= stopAt + 1e-9 || ++nodes > nodeCap) return;
    if (u === units.length) {
      for (let t = 0; t < k; t++) {
        if (size[t] < sizeLo) return;
        for (let j = 0; j < tags.length; j++) if (tc[j][t] < tagLo[j]) return;
      }
      const sp = Math.max(...total) - Math.min(...total);
      if (sp < best - 1e-9) { best = sp; bestTeam = team.slice(); }
      return;
    }
    for (let t = 0; t < Math.min(k, used + 1); t++) { // symmetry: a new team only in order
      const U = units[u];
      if (size[t] + U.size > sizeHi) continue;
      if (U.tagCount.some((c, j) => tc[j][t] + c > tagHi[j])) continue;
      if (apartU.some(([a, b]) => (a === u && team[b] === t) || (b === u && team[a] === t))) continue;
      team[u] = t; size[t] += U.size; total[t] += U.rating; U.tagCount.forEach((c, j) => (tc[j][t] += c));
      rec(u + 1, Math.max(used, t + 1));
      team[u] = -1; size[t] -= U.size; total[t] -= U.rating; U.tagCount.forEach((c, j) => (tc[j][t] -= c));
    }
  };
  rec(0, 0);
  if (best === Infinity) return null;
  const perPlayer = new Array(n);
  units.forEach((U, u) => U.ids.forEach((i) => (perPlayer[i] = bestTeam[u])));
  return { spread: round(best), team: perPlayer, complete: nodes <= nodeCap };
}
