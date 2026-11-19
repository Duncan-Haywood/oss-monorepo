// Play-off results fill the bracket: playBracket on single and double elimination, the page's
// text, the league page and the self-hosted server's field.
import test from "node:test";
import assert from "node:assert/strict";
import { playoffBracket, doubleEliminationBracket, playBracket, bracketText, leaguePageHtml, sampleFields, encodeFields, decodeFields } from "./calc.mjs";
import { buildLeague } from "./server.mjs";

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Play a bracket out with random winners, writing each game as a typed line, in bracket order. */
function playOut(bracket, rand, styles = true) {
  const lines = [];
  for (let guard = 0; guard < 200; guard++) {
    const p = playBracket(bracket, lines.join("\n"));
    assert.deepEqual(p.errors, []);
    if (!p.next.length) return { lines, played: p };
    const m = p.next[0];
    const [a, b] = m.teams;
    const aWins = rand() < 0.5;
    const r = rand();
    const w = aWins ? a.name : b.name, l = aWins ? b.name : a.name;
    if (!styles || r < 0.4) lines.push(`${a.name} ${aWins ? 3 : 1} - ${aWins ? 1 : 3} ${b.name}`);
    else if (r < 0.6) lines.push(`${w} beat ${l}`);
    else if (r < 0.75) lines.push(`${b.name.toUpperCase()} 2:2 ${a.name} (${w} on penalties)`);
    else if (r < 0.85) lines.push(`${w} w/o ${l}`);
    else lines.push(`${l} lost to ${w} 0-2`);
  }
  throw new Error("bracket never finished");
}

/** Shuffle lines, keeping lines between the same pair in their typed order. */
function shuffleKeepingPairs(lines, rand, names) {
  const pairOf = (line) => names.filter((n) => line.toLowerCase().includes(n.toLowerCase())).sort().join("|");
  const idx = lines.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const out = idx.map((i) => lines[i]);
  const byPair = new Map();
  lines.forEach((l) => { const k = pairOf(l); if (!byPair.has(k)) byPair.set(k, []); byPair.get(k).push(l); });
  const seen = new Map();
  return out.map((l) => { const k = pairOf(l); const n = seen.get(k) || 0; seen.set(k, n + 1); return byPair.get(k)[n]; });
}

const teamNames = (k) => Array.from({ length: k }, (_, i) => `T${String.fromCharCode(65 + i)}x`);

test("a single-elimination bracket played out: one champion, every other team loses once", () => {
  const rand = rng(7);
  for (let k = 2; k <= 24; k++) for (const thirdPlace of [false, true]) {
    const b = playoffBracket(teamNames(k), { thirdPlace });
    const { lines, played } = playOut(b, rand);
    const games = b.games;
    assert.equal(lines.length, games, `${k} teams: every game played once`);
    assert.ok(played.champion, `${k} teams: a champion`);
    const losses = new Map();
    for (const r of played.rounds) for (const m of r.matches) if (m.winner) losses.set(m.loser.name, (losses.get(m.loser.name) || 0) + 1);
    assert.equal(losses.get(played.champion.name), undefined);
    for (const n of teamNames(k)) if (n !== played.champion.name) assert.equal(losses.get(n), thirdPlace && k >= 4 && (n !== played.third.name) && played.rounds.at(-1).matches.find((m) => m.id === "3P").loser.name === n ? 2 : 1, `${k} teams: ${n}`);
    // Typed in any order (pairs meet once here), the same bracket comes out.
    const again = playBracket(b, shuffleKeepingPairs(lines, rand, teamNames(k)).join("\n"));
    assert.deepEqual(again.errors, []);
    assert.equal(again.champion.name, played.champion.name);
    assert.equal(bracketText(again), bracketText(played));
  }
});

test("a double-elimination bracket played out: everyone but the champion loses twice, the reset only when needed", () => {
  const rand = rng(11);
  let resets = 0, noResets = 0;
  for (let k = 3; k <= 20; k++) for (let rep = 0; rep < 6; rep++) {
    const b = doubleEliminationBracket(teamNames(k));
    const { lines, played } = playOut(b, rand);
    const gf2 = played.rounds.at(-1).matches[0];
    if (gf2.skipped) { noResets++; assert.equal(lines.length, b.games); } else { resets++; assert.equal(lines.length, b.maxGames); }
    const losses = new Map();
    for (const r of played.rounds) for (const m of r.matches) if (m.winner) losses.set(m.loser.name, (losses.get(m.loser.name) || 0) + 1);
    for (const n of teamNames(k)) {
      if (n === played.champion.name) assert.ok((losses.get(n) || 0) <= 1, `${k} teams: champion ${n} lost at most once`);
      else assert.equal(losses.get(n), 2, `${k} teams: ${n} out after two losses`);
    }
    const again = playBracket(b, shuffleKeepingPairs(lines, rand, teamNames(k)).join("\n"));
    assert.deepEqual(again.errors, []);
    assert.equal(again.champion.name, played.champion.name, `${k} teams: same champion when typed in another order`);
  }
  assert.ok(resets > 5 && noResets > 5, `both grand-final outcomes seen (${resets} resets, ${noResets} not)`);
});

test("lines that fit no game are named, and the bracket keeps what it can", () => {
  const b = playoffBracket(["Hawks", "Owls", "Lynx", "Bears"]);
  const p = playBracket(b, ["Hawks 2 - 0 Bears", "Hawks 1 - 0 Owls", "Owls 1 - 1 Lynx", "Zed 1 - 0 Owls", "Lynx 3 - 0 Owls", "Hawks 1 - 0 Bears", "nonsense"].join("\n"));
  assert.equal(p.errors.length, 5);
  assert.match(p.errors[0], /^Play-off line 3: a play-off game needs a winner/);
  assert.match(p.errors[1], /^Play-off line 4: "Zed" is not in the play-off/);
  assert.match(p.errors[2], /^Play-off line 7:/);
  assert.match(p.errors.join("\n"), /line 2: no game between Hawks and Owls is due/);
  assert.match(p.errors.join("\n"), /line 6: no game between Hawks and Bears is due/);
  assert.equal(p.champion, null);
  assert.deepEqual(p.next.map((m) => m.id), ["R2M1"]);
  assert.match(bracketText(p), /R2M1: #1 Hawks vs #3 Lynx/);
  assert.match(bracketText(p), /Next up: R2M1 Hawks vs Lynx\./);
});

test("the third-place game and penalties read as typed; the champion shows on the league page", () => {
  const b = playoffBracket(["Hawks", "Owls", "Lynx", "Bears"], { thirdPlace: true });
  const p = playBracket(b, "Bears 2-1 Hawks\nOwls 1 - 1 Lynx (Lynx won on penalties)\nhawks beat owls\nLynx 0 - 2 Bears");
  assert.deepEqual(p.errors, []);
  assert.equal(p.champion.name, "Bears");
  assert.equal(p.runnerUp.name, "Lynx");
  assert.equal(p.third.name, "Hawks");
  const t = bracketText(p);
  assert.match(t, /R1M1: #1 Hawks 1 - 2 #4 Bears -> Bears/);
  assert.match(t, /R1M2: #2 Owls 1 - 1 #3 Lynx \(Lynx won on penalties\) -> Lynx/);
  assert.match(t, /3P: #1 Hawks v #2 Owls -> Hawks \(third place\)/);
  assert.match(t, /R2M1: #4 Bears 2 - 0 #3 Lynx -> Bears \(champion\)/);
  assert.match(t, /Champion: Bears\. Runner-up: Lynx\. Third: Hawks\./);
  // An untouched bracket prints as before.
  assert.equal(bracketText(playBracket(b, "")), bracketText(b).replace(/\n?$/, ""));
});

test("the share link carries play-off results", () => {
  const f = { ...sampleFields(), playoff: 4, playoffResults: "Hawks 2 - 1 Owls" };
  assert.equal(decodeFields(encodeFields(f)).playoffResults, "Hawks 2 - 1 Owls");
});

test("the self-hosted league fills its bracket from the play-off results field", () => {
  const f = { ...sampleFields() };
  const base = buildLeague({ ...f, playoff: 4 });
  assert.ok(base.bracket, "a bracket");
  const [s1, s2, s3, s4] = base.bracket.rounds[0].matches.flatMap((m) => [m.a, m.b]).map((x) => x.name);
  const out = buildLeague({ ...f, playoff: 4, playoffResults: `${s1} 3 - 0 ${s2}\n${s3} beat ${s4}\nZed 1-0 ${s1}` });
  assert.equal(out.bracket.played, 2);
  assert.ok(out.warnings.some((w) => /Play-off line 3: "Zed"/.test(w)));
  const html = leaguePageHtml(out.schedule, { bracket: out.bracket });
  assert.match(html, new RegExp(`Next up: R2M1 ${s1} vs ${s3}`));
});
