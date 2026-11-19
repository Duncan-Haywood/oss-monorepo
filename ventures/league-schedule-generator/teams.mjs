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

/** A tag cell may hold several tags: `F G`, `F/G`, `F+G` or `F|G` (a woman who keeps goal). Each one is
 *  spread across teams on its own. */
export function splitTags(s) {
  return [...new Set(tidy(s).toUpperCase().split(/[\s/+|&]+/).filter(Boolean))];
}
/** A player's tags, whether it came from parsePlayers (`tags`) or was built by hand with one `tag`. */
const tagsOf = (p) => (Array.isArray(p.tags) ? p.tags : splitTags(p.tag ?? ""));

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
 * optional, so a spreadsheet's columns paste straight in). The tag cell may hold two or more tags
 * (`F G`, `F/G`). Lines starting `together:` or `apart:` hold requests, `drop:` names players who left
 * (used when adding late sign-ups to announced teams); `#` starts a comment. A header row whose second
 * column is not a number is skipped.
 * Returns { players: [{ name, rating, tag, tags }], together: [[names]], apart: [[a, b]], drop: [names],
 *   warnings, errors }.
 */
export function parsePlayers(text) {
  const players = [];
  const together = [];
  const apart = [];
  const drop = [];
  const warnings = [];
  const errors = [];
  const seen = new Map();
  const lines = String(text ?? "").split(/\r?\n/);
  let missing = [];
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const req = line.match(/^(together|apart|drop)\s*:\s*(.*)$/i);
    if (req) {
      const names = req[2].split(/[,\t;]/).map(tidy).filter(Boolean);
      if (req[1].toLowerCase() === "drop") {
        if (!names.length) errors.push(`Line ${i + 1}: a drop line needs a name.`);
        drop.push(...names);
        return;
      }
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
    const tags = splitTags(cells[2] ?? "");
    const tag = tags.join(" ");
    if (seen.has(key(name))) { errors.push(`Line ${i + 1}: ${name} is listed twice (also line ${seen.get(key(name))}).`); return; }
    seen.set(key(name), i + 1);
    const p = { name, rating, tag, tags };
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
  return { players, together, apart, drop, warnings, errors };
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
 * Late sign-ups: `opts.fixed` gives, per player index, the team index the player is already on (or -1
 * for a new player); `opts.maxMoves` (default 0) is how many of those players may change team, and
 * `opts.teamNames` keeps the announced names and order. addLateSignups builds these from a teams CSV.
 * `opts.capacity` (an array, one number per team) caps each team's size: a hard rule like the others,
 * for a league page whose organiser fills rosters only up to a set size (freeagents.mjs).
 * Returns { teams: [{ name, players: [{name, rating, tag}], total, average, tags: {tag: count} }],
 *   spread, lowerBound, proved, broken: [messages for rules that could not all be kept], warnings,
 *   moved: [{ name, from, to }], late: [{ name, team }] (both empty without `fixed`) }.
 */
export function balanceTeams(parsed, k, opts = {}) {
  const { players, together = [], apart = [] } = parsed;
  const warnings = [...(parsed.warnings ?? [])];
  if (!Number.isInteger(k) || k < 2) throw new Error("Make at least 2 teams.");
  if (k > MAX_TEAMS) throw new Error(`At most ${MAX_TEAMS} teams.`);
  const fixedIn = opts.fixed ?? null;
  if (!fixedIn && players.length < k) throw new Error(`${players.length} players cannot fill ${k} teams.`);
  const maxMoves = fixedIn ? Math.max(0, Math.trunc(opts.maxMoves ?? 0)) : 0;
  const cap = Array.from({ length: k }, (_, t) => (Number.isFinite(opts.capacity?.[t]) ? opts.capacity[t] : Infinity));
  const problems = [];
  const model = buildModel(parsed, k, fixedIn, problems);
  const { units, tags, apartUnits, sizeLo, sizeHi, tagLo, tagHi, pinCount, pinTotal, pinned } = model;
  const n = players.length;
  const maxGroup = Math.max(...units.map((u) => u.size));
  if (maxGroup > sizeHi) problems.push(`A together group of ${maxGroup} is bigger than a team (${sizeHi}).`);

  const mean = units.reduce((s, u) => s + u.rating, 0) / k;
  const scale = Math.max(1, ...units.map((u) => Math.abs(u.rating)));
  const BIG = 1e3 * scale * k;
  // With late sign-ups the order is: rules, then the least spread, then the fewest moved players,
  // then the squared distances. A move weighs far less than one point of spread.
  const moveW = 1e-3 * scale * k;
  const ssW = pinned ? 1e-3 / (scale * k) : 1 / (scale * k);

  // State: team of each unit, with per-team size, total and tag counts kept incrementally.
  const team = new Int32Array(units.length);
  const size = new Float64Array(k), total = new Float64Array(k);
  const tc = tags.map(() => new Float64Array(k));
  let moved = 0;
  const partners = units.map(() => []);
  for (const [ua, ub] of apartUnits) { partners[ua].push(ub); partners[ub].push(ua); }

  const viol = () => {
    let v = 0;
    for (let t = 0; t < k; t++) {
      v += Math.max(0, size[t] - sizeHi) + Math.max(0, sizeLo - size[t]) + Math.max(0, size[t] - cap[t]);
      for (let j = 0; j < tags.length; j++) v += Math.max(0, tc[j][t] - tagHi[j]) + Math.max(0, tagLo[j] - tc[j][t]);
    }
    for (const [ua, ub] of apartUnits) if (team[ua] === team[ub]) v++;
    return v + Math.max(0, moved - maxMoves);
  };
  const cost = () => {
    let hi = -Infinity, lo = Infinity, ss = 0;
    for (let t = 0; t < k; t++) { hi = Math.max(hi, total[t]); lo = Math.min(lo, total[t]); ss += (total[t] - mean) ** 2; }
    return { v: viol(), spread: hi - lo, ss, moved };
  };
  const score = (c) => c.v * BIG + c.spread * k + c.moved * moveW + c.ss * ssW;
  const place = (u, t, sign) => {
    const U = units[u];
    size[t] += sign * U.size; total[t] += sign * U.rating;
    for (let j = 0; j < tags.length; j++) tc[j][t] += sign * U.tagCount[j];
    if (pinTotal[u]) moved += sign * (pinTotal[u] - pinCount[u][t]);
  };
  const assign = (u, t) => { team[u] = t; place(u, t, 1); };
  const move = (u, t) => { place(u, team[u], -1); team[u] = t; place(u, t, 1); };
  const reset = () => { size.fill(0); total.fill(0); tc.forEach((x) => x.fill(0)); moved = 0; };

  // Start: announced players on their own teams; then, per tag (biggest units first), a snake draft
  // to the team that is lightest on that tag, then on size, then on total; units whose apart partner
  // is already there go elsewhere if they can.
  const home = (u) => pinCount[u].indexOf(Math.max(...pinCount[u]));
  const order = units.map((_, i) => i).sort((a, b) => units[b].size - units[a].size || units[b].rating - units[a].rating || a - b);
  const placed = new Array(units.length).fill(false);
  const startTeams = (r) => {
    reset();
    for (let u = 0; u < units.length; u++) if (pinTotal[u]) { assign(u, home(u)); placed[u] = true; }
    for (const u of order) {
      if (placed[u]) continue;
      let best = -1, bestKey = null;
      for (let t = 0; t < k; t++) {
        const clash = partners[u].some((p) => team[p] === t && placed[p]) ? 1 : 0;
        const over = size[t] + units[u].size > Math.min(sizeHi, cap[t]) ? 1 : 0;
        const tagLoad = units[u].tagCount.reduce((s, c, j) => s + (c ? tc[j][t] : 0), 0);
        const kk = [over, clash, tagLoad, size[t], total[t], r()];
        if (!bestKey || lexLess(kk, bestKey)) { best = t; bestKey = kk; }
      }
      assign(u, best); placed[u] = true;
    }
  };

  // Units the search may move: all of them, except announced players when no moves are allowed.
  const movable = units.map((_, u) => u).filter((u) => !pinTotal[u] || maxMoves > 0);
  const iters = movable.length ? opts.iterations ?? Math.min(200000, 4000 + 400 * units.length) : 0;
  const restarts = movable.length ? opts.restarts ?? 6 : 1;
  const rand = rng(opts.seed ?? 1);
  const pick = () => movable[Math.floor(rand() * movable.length)];
  let best = null;
  for (let rs = 0; rs < restarts; rs++) {
    placed.fill(false);
    startTeams(rand);
    let cur = score(cost());
    let local = { s: cur, team: Int32Array.from(team) };
    let temp = scale * 0.5;
    const cool = Math.pow(1e-4, 1 / Math.max(1, iters));
    for (let it = 0; it < iters; it++) {
      const u = pick();
      const from = team[u];
      if (rand() < 0.75) {
        // swap with a unit on another team
        const w = pick();
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
    reset();
    teamOfUnit.forEach((t, u) => assign(u, t));
    return cost();
  };
  let final = rebuild(best.team);
  // Small lists: an exhaustive search settles it (the annealing missed the least spread on 4 of 357
  // random lists of 8-14 players, eval/balanced-teams-exact.txt). Capped, so a big list never waits.
  let exhaustive = false;
  const lb0 = spreadLowerBound(units, k);
  if (n <= (opts.exactUpTo ?? 16) && (final.v > 0 || final.spread > lb0 + 1e-9 || final.moved > 0)) {
    const ex = exactTeams(parsed, k, lb0, opts.exactNodes ?? 3e6, fixedIn, maxMoves, cap);
    if (ex && (final.v > 0 || ex.spread < final.spread - 1e-9 || (Math.abs(ex.spread - final.spread) < 1e-9 && ex.moved < final.moved))) {
      final = rebuild(units.map((U) => ex.team[U.ids[0]]));
    }
    exhaustive = Boolean(ex && ex.complete) || (ex === null && !problems.length);
  }

  const names = Array.from({ length: k }, (_, t) => (opts.teamNames?.[t] != null ? tidy(opts.teamNames[t]) : `Team ${t + 1}`));
  const broken = [...problems];
  for (let t = 0; t < k; t++) {
    if (size[t] > cap[t]) broken.push(`${names[t]} has ${size[t]} players, over its cap of ${cap[t]}.`);
    if (size[t] > sizeHi || size[t] < sizeLo) broken.push(`${names[t]} has ${size[t]} players (others ${sizeLo}-${sizeHi}): ${pinned ? "the announced teams and the moves allowed" : "a together group"} did not fit evenly.`);
    for (let j = 0; j < tags.length; j++) if (tc[j][t] > tagHi[j] || tc[j][t] < tagLo[j]) broken.push(`${names[t]} has ${tc[j][t]} tagged ${tags[j]} (even split is ${tagLo[j]}-${tagHi[j]}).`);
  }
  for (const [ua, ub, a, b] of apartUnits) if (team[ua] === team[ub]) broken.push(`${a} and ${b} are on the same team: keeping them apart broke a size or tag rule.`);

  const teamList = names.map((name) => ({ name, players: [] }));
  units.forEach((U, u) => U.ids.forEach((i) => teamList[team[u]].players.push(players[i])));
  for (const T of teamList) {
    T.players.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
    T.total = round(T.players.reduce((s, p) => s + p.rating, 0));
    T.average = T.players.length ? round(T.total / T.players.length) : 0;
    T.tags = Object.fromEntries(tags.map((tg) => [tg, T.players.filter((p) => tagsOf(p).includes(tg)).length]));
  }
  const movedList = [], late = [];
  if (pinned) {
    units.forEach((U, u) => U.ids.forEach((i) => {
      const h = fixedIn[i];
      if (h == null || h < 0) late.push({ name: players[i].name, team: names[team[u]] });
      else if (h !== team[u]) movedList.push({ name: players[i].name, from: names[h], to: names[team[u]] });
    }));
  } else {
    // Strongest first, so "Team 1" is not a hint of anything; then renumber.
    teamList.sort((a, b) => b.total - a.total);
    teamList.forEach((T, i) => (T.name = opts.teamNames?.[i] != null ? tidy(opts.teamNames[i]) : `Team ${i + 1}`));
  }
  const spread = round(final.spread);
  // A finished exhaustive search is its own proof: nothing under the hard rules beats this spread.
  const lowerBound = exhaustive && final.v === 0 ? spread : round(lb0);
  return { teams: teamList, spread, lowerBound, proved: final.v === 0 && broken.length === 0 && spread <= lowerBound + 1e-9, exhaustive, broken, warnings, tags, moved: movedList, late, maxMoves };
}

/** Units (together groups), tag bounds, apart pairs and, for late sign-ups, where each unit's announced
 *  players already are. Shared by the search and the exhaustive check so both read the rules alike. */
function buildModel(parsed, k, fixed, problems) {
  const { players, apart = [] } = parsed;
  const groups = groupsFrom(players, parsed.together ?? [], problems);
  const n = players.length;
  const ptags = players.map(tagsOf);
  const tags = [...new Set(ptags.flat())].sort();
  const units = groups.map((ids) => ({
    ids, size: ids.length, rating: ids.reduce((s, i) => s + players[i].rating, 0),
    tagCount: tags.map((t) => ids.filter((i) => ptags[i].includes(t)).length),
  }));
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
  const tagN = tags.map((t) => ptags.filter((x) => x.includes(t)).length);
  const tagLo = tagN.map((c) => Math.floor(c / k));
  const tagHi = tagN.map((c) => Math.ceil(c / k));
  const pinCount = units.map((U) => {
    const c = new Array(k).fill(0);
    if (fixed) for (const i of U.ids) if (fixed[i] != null && fixed[i] >= 0) c[fixed[i]]++;
    return c;
  });
  const pinTotal = pinCount.map((c) => c.reduce((a, b) => a + b, 0));
  return { units, tags, apartUnits, sizeLo, sizeHi, tagLo, tagHi, pinCount, pinTotal, pinned: pinTotal.some(Boolean) || Boolean(fixed) };
}

const round = (x) => Math.round(x * 1000) / 1000;
function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** Every hard rule checked again from the output alone. Returns a list of faults (empty = valid).
 *  With `before` (the announced teams, from parseTeamsCsv) it also counts the announced players now on
 *  another team and faults more than `result.maxMoves` of them, and any announced team renamed or lost. */
export function checkTeams(parsed, result, before = null) {
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
    const c = result.teams.map((T) => T.players.filter((p) => tagsOf(p).includes(tg)).length);
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
  if (before) {
    const names = result.teams.map((T) => T.name);
    if (before.teams.map((T) => T.name).join("\n") !== names.join("\n")) faults.push("The announced teams were renamed or reordered.");
    let switched = 0;
    before.teams.forEach((T, t) => T.players.forEach((p) => {
      if (where.has(key(p.name)) && where.get(key(p.name)) !== t) switched++;
    }));
    if (switched > (result.maxMoves ?? 0)) faults.push(`${switched} announced players changed team (at most ${result.maxMoves ?? 0} allowed).`);
    if (switched !== (result.moved ?? []).length) faults.push(`The page lists ${(result.moved ?? []).length} moved players but ${switched} changed team.`);
  }
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
  for (const T of result.teams) for (const p of T.players) rows.push([T.name, p.name, p.rating, tagsOf(p).join(" ")]);
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

/** Exhaustive search with its assignment: { spread, moved, team (team index per player), complete } or
 *  null. Stops early once the spread meets `stopAt` with nobody moved. With `fixed` (late sign-ups) the
 *  teams are told apart, so the symmetry cut is off, and at most `maxMoves` announced players move;
 *  among equal spreads it keeps the fewest moved. */
function exactTeams(parsed, k, stopAt = -1, nodeCap = Infinity, fixed = null, maxMoves = 0, cap = null) {
  const { players } = parsed;
  const n = players.length;
  const { units, tags, apartUnits, sizeLo, sizeHi, tagLo, tagHi, pinCount, pinTotal, pinned } = buildModel(parsed, k, fixed, []);
  const apartU = apartUnits.map(([a, b]) => [a, b]);
  const team = new Array(units.length).fill(-1);
  const size = new Array(k).fill(0), total = new Array(k).fill(0), tc = tags.map(() => new Array(k).fill(0));
  let best = Infinity, bestMoved = Infinity, bestTeam = null, nodes = 0, movedNow = 0;
  const rec = (u, used) => {
    if ((best <= stopAt + 1e-9 && bestMoved === 0) || ++nodes > nodeCap) return;
    if (u === units.length) {
      for (let t = 0; t < k; t++) {
        if (size[t] < sizeLo) return;
        for (let j = 0; j < tags.length; j++) if (tc[j][t] < tagLo[j]) return;
      }
      const sp = Math.max(...total) - Math.min(...total);
      if (sp < best - 1e-9 || (sp < best + 1e-9 && movedNow < bestMoved)) { best = sp; bestMoved = movedNow; bestTeam = team.slice(); }
      return;
    }
    const U = units[u];
    for (let t = 0; t < (pinned ? k : Math.min(k, used + 1)); t++) { // symmetry: a new team only in order
      const m = pinTotal[u] - pinCount[u][t];
      if (movedNow + m > maxMoves && pinTotal[u]) continue;
      if (size[t] + U.size > sizeHi || (cap && size[t] + U.size > cap[t])) continue;
      if (U.tagCount.some((c, j) => tc[j][t] + c > tagHi[j])) continue;
      if (apartU.some(([a, b]) => (a === u && team[b] === t) || (b === u && team[a] === t))) continue;
      team[u] = t; size[t] += U.size; total[t] += U.rating; U.tagCount.forEach((c, j) => (tc[j][t] += c)); movedNow += m;
      rec(u + 1, Math.max(used, t + 1));
      team[u] = -1; size[t] -= U.size; total[t] -= U.rating; U.tagCount.forEach((c, j) => (tc[j][t] -= c)); movedNow -= m;
    }
  };
  rec(0, 0);
  if (best === Infinity) return null;
  const perPlayer = new Array(n);
  units.forEach((U, u) => U.ids.forEach((i) => (perPlayer[i] = bestTeam[u])));
  return { spread: round(best), moved: bestMoved, team: perPlayer, complete: nodes <= nodeCap };
}

/** Splits one CSV line, honouring double quotes. */
function csvCells(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t" || c === ";") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(tidy);
}

/**
 * Reads teams that were already announced: the CSV this page downloads (`Team, Player, Rating, Tag`),
 * or any sheet with those four columns in that order (a header row is skipped). The apostrophe the
 * download adds in front of a formula-like cell is taken off again. Team order is first appearance.
 * Returns { teams: [{ name, players: [{ name, rating, tag, tags }] }], errors }.
 */
export function parseTeamsCsv(text) {
  const teams = [];
  const byName = new Map();
  const seen = new Map();
  const errors = [];
  const unq = (s) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim() || /^\s*#/.test(raw)) return;
    const cells = csvCells(raw).map(unq);
    if (i === 0 && /^team$/i.test(cells[0]) && /^(player|name)$/i.test(cells[1] ?? "")) return;
    const [tName, name, rText = "", tagText = ""] = cells;
    if (!tName || !name) { errors.push(`Teams line ${i + 1}: needs a team and a player.`); return; }
    let rating = 0;
    if (rText !== "") {
      rating = Number(rText);
      if (!Number.isFinite(rating)) { errors.push(`Teams line ${i + 1}: "${rText}" is not a number (rating).`); return; }
    }
    if (seen.has(key(name))) { errors.push(`Teams line ${i + 1}: ${name} is on two teams (also line ${seen.get(key(name))}).`); return; }
    seen.set(key(name), i + 1);
    if (!byName.has(key(tName))) { const T = { name: tName, players: [] }; byName.set(key(tName), T); teams.push(T); }
    const tags = splitTags(tagText);
    byName.get(key(tName)).players.push({ name, rating, tag: tags.join(" "), tags });
  });
  if (teams.length > MAX_TEAMS) errors.push(`At most ${MAX_TEAMS} teams (got ${teams.length}).`);
  return { teams, errors };
}

/**
 * Late sign-ups: places the players in `box` (parsePlayers output) who are not on an announced team
 * onto `before` (parseTeamsCsv output), keeping the same rules and objective as a fresh draft. A box
 * line for an announced player updates that player's rating and tags; `drop:` names leave. At most
 * `opts.maxMoves` announced players change team (default 0: nobody already told their team moves).
 * Returns balanceTeams' result for the merged list, plus `parsed` (the merged list, for checkTeams),
 * `dropped` and `before` (the announced teams after the drops).
 */
export function addLateSignups(box, before, opts = {}) {
  const k = before.teams.length;
  if (k < 2) throw new Error("Paste at least two announced teams.");
  const warnings = [...(box.warnings ?? [])];
  const boxBy = new Map(box.players.map((p) => [key(p.name), p]));
  const dropKeys = new Set((box.drop ?? []).map(key));
  const known = new Set(before.teams.flatMap((T) => T.players.map((p) => key(p.name))));
  for (const d of box.drop ?? []) if (!known.has(key(d)) && !boxBy.has(key(d))) warnings.push(`drop: "${d}" is not on a team.`);
  const players = [], fixed = [], dropped = [];
  const after = { teams: before.teams.map((T) => ({ name: T.name, players: [] })) };
  before.teams.forEach((T, t) => T.players.forEach((p) => {
    if (dropKeys.has(key(p.name))) { dropped.push({ name: p.name, team: T.name }); return; }
    const q = boxBy.get(key(p.name));
    const pl = q ? { name: p.name, rating: q.rating, tag: q.tag, tags: tagsOf(q) } : p;
    players.push(pl); fixed.push(t); after.teams[t].players.push(pl);
  }));
  for (const p of box.players) {
    if (known.has(key(p.name)) || dropKeys.has(key(p.name))) continue;
    players.push(p); fixed.push(-1);
  }
  if (players.length > MAX_PLAYERS) throw new Error(`At most ${MAX_PLAYERS} players (got ${players.length}).`);
  const parsed = { players, together: box.together ?? [], apart: box.apart ?? [], warnings };
  const res = balanceTeams(parsed, k, { ...opts, fixed, maxMoves: opts.maxMoves ?? 0, teamNames: before.teams.map((T) => T.name) });
  return { ...res, parsed, dropped, before: after };
}
