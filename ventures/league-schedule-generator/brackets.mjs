// League schedule generator, brackets.mjs: Play-off brackets: seed order, single and double elimination, typed bracket results and text.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { nextPlayDay, dayLabel } from "./dates.mjs";
import { teamIndex } from "./names.mjs";
import { parseResults } from "./standings.mjs";

const nextPow2 = (k) => { let p = 1; while (p < k) p *= 2; return p; };

/** Standard single-elimination seed order for a bracket of `size` (1 v size, 2 v size-1, ...). */
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const len = order.length * 2;
    order = order.flatMap((s) => [s, len + 1 - s]);
  }
  return order;
}

function roundName(matchesInRound) {
  return { 1: "Final", 2: "Semifinals", 4: "Quarterfinals", 8: "Round of 16", 16: "Round of 32" }[matchesInRound] || `Round of ${matchesInRound * 2}`;
}

/**
 * Single-elimination bracket for the seeds given in order (best first). A non-power-of-two
 * field gives the top seeds a first-round bye. Later-round slots name the match they come
 * from. Optional dates continue after `afterDay` on the league's weekdays.
 */
export function playoffBracket(seedNames, { afterDay = null, weekdays = [], skipDays = [], thirdPlace = false } = {}) {
  const k = seedNames.length;
  if (k < 2) throw new Error("A play-off needs at least two teams.");
  const size = nextPow2(k);
  const order = seedOrder(size);
  const seedTeam = (s) => (s <= k ? { seed: s, name: seedNames[s - 1] } : null);
  const rounds = [];
  let current = [];
  for (let i = 0; i < size; i += 2) {
    const a = seedTeam(order[i]);
    const b = seedTeam(order[i + 1]);
    current.push({ id: `R1M${i / 2 + 1}`, a, b, bye: !a || !b });
  }
  rounds.push({ name: roundName(size / 2), matches: current });
  let level = 2;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const slot = (m) => (m.bye ? m.a || m.b : { from: m.id });
      next.push({ id: `R${level}M${i / 2 + 1}`, a: slot(current[i]), b: slot(current[i + 1]), bye: false });
    }
    rounds.push({ name: roundName(next.length), matches: next });
    current = next;
    level++;
  }
  if (afterDay !== null && weekdays.length) {
    const wd = new Set(weekdays);
    const skip = new Set(skipDays);
    let d = afterDay + 1;
    for (const r of rounds) {
      if (r.matches.every((m) => m.bye)) continue;
      d = nextPlayDay(d, wd, skip);
      if (d === null) break;
      r.day = d;
      d++;
    }
  }
  if (thirdPlace && k >= 4) {
    const semis = rounds[rounds.length - 2].matches;
    rounds[rounds.length - 1].matches.push({ id: "3P", a: { loserOf: semis[0].id }, b: { loserOf: semis[1].id }, bye: false });
  }
  const games = rounds.reduce((s, r) => s + r.matches.filter((m) => !m.bye).length, 0);
  return { size, teams: k, rounds, games };
}

const NONE = { none: true };

function deMatch(id, a, b) {
  const dead = !!(a.none && b.none);
  return { id, a, b, dead, bye: !dead && !!(a.none || b.none) };
}
const deWinner = (m) => (m.dead ? NONE : m.bye ? (m.a.none ? m.b : m.a) : { from: m.id });
const deLoser = (m) => (m.dead || m.bye ? NONE : { loserOf: m.id });

/**
 * Double-elimination bracket for the seeds given in order (best first): everyone must lose
 * twice to go out. A non-power-of-two field gives the top seeds a first-round bye, and the
 * losers' bracket skips every match a bye leaves without an opponent. Winners rounds come
 * first, then losers rounds, then the grand final and a reset game that is played only if
 * the losers-bracket team wins the grand final. Slots name the match they come from
 * (`from`: its winner, `loserOf`: its loser). Optional dates continue after `afterDay`.
 */
export function doubleEliminationBracket(seedNames, { afterDay = null, weekdays = [], skipDays = [] } = {}) {
  const k = seedNames.length;
  if (k < 3) throw new Error("A double-elimination play-off needs at least three teams.");
  const size = nextPow2(k);
  const order = seedOrder(size);
  const seedSlot = (s) => (s <= k ? { seed: s, name: seedNames[s - 1] } : NONE);
  const rounds = [];
  const wb = [];
  let cur = [];
  for (let i = 0; i < size; i += 2) cur.push(deMatch(`W1M${i / 2 + 1}`, seedSlot(order[i]), seedSlot(order[i + 1])));
  wb.push(cur);
  rounds.push({ name: `Winners ${roundName(cur.length)}`, bracket: "winners", matches: cur });
  for (let r = 2; cur.length > 1; r++) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(deMatch(`W${r}M${i / 2 + 1}`, deWinner(cur[i]), deWinner(cur[i + 1])));
    wb.push(next);
    rounds.push({ name: `Winners ${roundName(next.length)}`, bracket: "winners", matches: next });
    cur = next;
  }
  const p = wb.length;
  let lb = [];
  let lr = 1;
  const pushLb = (matches, label) => {
    rounds.push({ name: `Losers round ${lr}${label ? " (" + label + ")" : ""}`, bracket: "losers", matches });
    lb = matches;
    lr++;
  };
  const first = [];
  for (let i = 0; i < wb[0].length; i += 2) first.push(deMatch(`L${lr}M${i / 2 + 1}`, deLoser(wb[0][i]), deLoser(wb[0][i + 1])));
  pushLb(first, "first losses");
  for (let j = 1; j < p; j++) {
    const drops = wb[j];
    const drop = lb.map((m, i) => deMatch(`L${lr}M${i + 1}`, deWinner(m), deLoser(drops[lb.length - 1 - i])));
    pushLb(drop, "WB drop-downs");
    if (j < p - 1) {
      const cons = [];
      for (let i = 0; i < lb.length; i += 2) cons.push(deMatch(`L${lr}M${i / 2 + 1}`, deWinner(lb[i]), deWinner(lb[i + 1])));
      pushLb(cons);
    }
  }
  const gf = deMatch("GF1", deWinner(wb[p - 1][0]), deWinner(lb[0]));
  rounds.push({ name: "Grand final", bracket: "final", matches: [gf] });
  const reset = deMatch("GF2", { from: "GF1" }, { loserOf: "GF1" });
  rounds.push({ name: "Grand final reset (only if the losers-bracket team wins GF1)", bracket: "final", conditional: true, matches: [reset] });
  if (afterDay !== null && weekdays.length) {
    const wd = new Set(weekdays);
    const skip = new Set(skipDays);
    let d = afterDay + 1;
    for (const r of rounds) {
      if (r.matches.every((m) => m.bye || m.dead)) continue;
      d = nextPlayDay(d, wd, skip);
      if (d === null) break;
      r.day = d;
      d++;
    }
  }
  const games = rounds.filter((r) => !r.conditional).reduce((n, r) => n + r.matches.filter((m) => !m.bye && !m.dead).length, 0);
  return { size, teams: k, type: "double", rounds, games, maxGames: games + 1 };
}

function slotText(s) {
  if (!s || s.none) return "BYE";
  if (s.loserOf) return `loser of ${s.loserOf}`;
  if (s.from) return `winner of ${s.from}`;
  return `#${s.seed} ${s.name}`;
}

/**
 * Read one play-off result line against the bracket's teams. A play-off game needs a winner, so
 * besides the league formats ("Hawks 3 - 1 Owls", "Hawks beat Owls 3-1", "Hawks w/o Owls") it takes
 * "Hawks beat Owls" with no score, and a level score with the winner named in brackets:
 * "Hawks 2 - 2 Owls (Hawks on penalties)". Returns { a, b, winner, score } (indexes into names) or { error }.
 */
export function readPlayoffLine(line, names) {
  const plain = line.replace(/[\u2212\u2012\u2013\u2014]/g, "-").replace(/[.\s]+$/, "");
  const note = plain.match(/^(.*?)\s*\(([^()]*)\)$/);
  const noScore = (note ? note[1] : plain).match(/^(.*?)\s+(?:beat|beats|defeated|def\.?|won against|knocked out)\s+(.*)$/i);
  if (noScore && !/\d+\s*[-:]\s*\d+\s*$/.test(noScore[2])) {
    const a = teamIndex(names, noScore[1]), b = teamIndex(names, noScore[2]);
    if (a < 0 || b < 0) return { error: `"${a < 0 ? noScore[1] : noScore[2]}" is not in the play-off.` };
    if (a === b) return { error: "a team cannot play itself." };
    return { a, b, winner: a, score: null };
  }
  const pr = parseResults(plain, names, { walkover: [1, 0] });
  if (pr.errors.length) return { error: pr.errors[0].replace(/^Result line \d+: /, "").replace(/"([^"]*)" is not one of the teams\./, '"$1" is not in the play-off.') };
  if (!pr.results.length) return { error: 'write it like "Hawks 3 - 1 Owls" or "Hawks beat Owls".' };
  const r = pr.results[0];
  const score = r.walkover && r.ga === 1 && r.gb === 0 && /w\/o|walkover|\bwo\b/i.test(plain) ? "w/o" : `${r.ga} - ${r.gb}`;
  if (r.ga !== r.gb) return { a: r.a, b: r.b, winner: r.ga > r.gb ? r.a : r.b, score };
  const named = note ? [r.a, r.b].filter((t) => new RegExp(`(^|[^a-z0-9])${names[t].toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(note[2].toLowerCase())) : [];
  if (named.length !== 1) return { error: `a play-off game needs a winner: add it in brackets, like "${names[r.a]} ${r.ga} - ${r.gb} ${names[r.b]} (${names[r.a]} on penalties)".` };
  return { a: r.a, b: r.b, winner: named[0], score: `${score} (${note[2].trim()})` };
}

/**
 * Play the bracket forward from typed results, one game per line, in any order. Each line is matched
 * to the earliest game in the bracket whose two teams are known and are the two named, so a pair that
 * meets twice (a double-elimination final, or the grand final and its reset) takes its lines in the
 * order typed. Winners and losers fill the slots that name their game; in double elimination the
 * reset game is dropped when the winners-bracket team takes the grand final.
 * Returns a copy of the bracket whose matches carry `teams` ([slot, slot], a slot null while
 * unknown), `winner`/`loser` (slots) and `score`, plus `champion`, `runnerUp`, `third` (slots or null),
 * `next` (games ready to play) and `errors` (lines that match no game due, with their line numbers).
 */
export function playBracket(bracket, text) {
  const out = { ...bracket, rounds: bracket.rounds.map((r) => ({ ...r, matches: r.matches.map((m) => ({ ...m })) })) };
  const all = out.rounds.flatMap((r) => r.matches);
  const byId = new Map(all.map((m) => [m.id, m]));
  const names = [];
  for (const m of all) for (const s of [m.a, m.b]) if (s && s.name && !names.includes(s.name)) names.push(s.name);
  const errors = [];
  const lines = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const r = readPlayoffLine(line, names);
    if (r.error) errors.push(`Play-off line ${i + 1}: ${r.error}`);
    else lines.push({ ...r, n: i + 1, used: false });
  }
  const resolve = (s) => {
    if (!s || s.none) return null;
    if (s.from) { const m = byId.get(s.from); return m && m.winner ? m.winner : null; }
    if (s.loserOf) { const m = byId.get(s.loserOf); return m && m.loser ? m.loser : null; }
    return s;
  };
  for (const m of all) {
    if (m.bye || m.dead) continue;
    m.teams = [resolve(m.a), resolve(m.b)];
    if (m.id === "GF2") {
      const gf = byId.get("GF1");
      if (gf && gf.winner && gf.teams && gf.winner === gf.teams[0]) { m.skipped = true; continue; }
    }
    const [ta, tb] = m.teams;
    if (!ta || !tb) continue;
    const ia = names.indexOf(ta.name), ib = names.indexOf(tb.name);
    const hit = lines.find((l) => !l.used && ((l.a === ia && l.b === ib) || (l.a === ib && l.b === ia)));
    if (!hit) continue;
    hit.used = true;
    const aWon = hit.winner === ia;
    m.winner = aWon ? ta : tb;
    m.loser = aWon ? tb : ta;
    m.score = hit.score === null ? null : hit.a === ia ? hit.score : hit.score.replace(/^(\d+) - (\d+)/, "$2 - $1");
    m.line = hit.n;
  }
  for (const l of lines) if (!l.used) errors.push(`Play-off line ${l.n}: no game between ${names[l.a]} and ${names[l.b]} is due in the bracket (check the earlier rounds' results and the spelling).`);
  let final = null;
  if (bracket.type === "double") {
    const gf2 = byId.get("GF2"), gf1 = byId.get("GF1");
    final = gf2 && !gf2.skipped && gf2.winner ? gf2 : gf1 && gf1.winner && gf2 && gf2.skipped ? gf1 : null;
  } else {
    const last = out.rounds[out.rounds.length - 1].matches.find((m) => m.id !== "3P");
    final = last && last.winner ? last : null;
  }
  const tp = byId.get("3P");
  out.finalId = final ? final.id : null;
  out.champion = final ? final.winner : null;
  out.runnerUp = final ? final.loser : null;
  out.third = tp && tp.winner ? tp.winner : null;
  out.next = all.filter((m) => !m.bye && !m.dead && !m.skipped && !m.winner && m.teams && m.teams[0] && m.teams[1]);
  out.errors = errors;
  out.played = all.filter((m) => m.winner).length;
  return out;
}

/** A slot for display once the bracket is played: the team when known, else what it waits on. */
function playedSlotText(m, side) {
  const t = m.teams ? m.teams[side] : null;
  return t ? `#${t.seed} ${t.name}` : slotText(side ? m.b : m.a);
}

export function bracketText(bracket) {
  const lines = [`Play-offs (${bracket.teams} teams, ${bracket.type === "double" ? "double" : "single"} elimination)`];
  for (const r of bracket.rounds) {
    const real = r.matches.filter((m) => !m.bye && !m.dead);
    if (real.length) lines.push(`${r.name}${r.day ? " - " + dayLabel(r.day) : ""}`);
    for (const m of real) {
      if (m.skipped) { lines.push(`  ${m.id}: not needed (${m.teams[0].name} won GF1)`); continue; }
      if (m.winner) {
        const [a, b] = m.teams;
        const sc = !m.score ? "v" : m.score.startsWith("w/o") ? "w/o" : m.score.replace(/ \(.*$/, "");
        const note = m.score && / \(/.test(m.score) ? " " + m.score.replace(/^[^(]*/, "") : "";
        lines.push(`  ${m.id}: #${a.seed} ${a.name} ${sc} #${b.seed} ${b.name}${note} -> ${m.winner.name}${m.id === "3P" ? " (third place)" : m.id === bracket.finalId ? " (champion)" : ""}`);
        continue;
      }
      lines.push(`  ${m.id}: ${m.teams ? playedSlotText(m, 0) : slotText(m.a)} vs ${m.teams ? playedSlotText(m, 1) : slotText(m.b)}`);
    }
    for (const m of r.matches.filter((x) => x.bye)) lines.push(`  Bye: ${slotText(!m.a || m.a.none ? m.b : m.a)}`);
  }
  if (bracket.champion) lines.push(`Champion: ${bracket.champion.name}. Runner-up: ${bracket.runnerUp.name}.${bracket.third ? ` Third: ${bracket.third.name}.` : ""}`);
  else if (bracket.next && bracket.played) lines.push(`Next up: ${bracket.next.map((m) => `${m.id} ${m.teams[0].name} vs ${m.teams[1].name}`).join("; ")}.`);
  return lines.join("\n");
}

export { nextPow2 };
