// Repeat floats in big opens (FIDE Dutch C.14-C.17), bracket pairing with the rule on, for one or
// two builds of the pairer: node eval/swiss-big-field-floats.mjs [seeds] [module ...]
// Each module is a path to a swiss.mjs (default ../swiss.mjs). The same simulated events (Elo-style
// results with draws, as eval/swiss-repeat-floats.mjs) go through each, so the columns compare
// like with like. Up2/down2 = a player floating the same way as two rounds before (C.16, C.17);
// up1/down1 = as the round before (C.14, C.15). eval/swiss-stage-b-radix.txt keeps the 2026-11-22 run.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

function play(lib, n, rounds, seed) {
  const { swissPairings, floatHistory } = lib;
  const r = rng(seed);
  const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  const rating = players.map((_, i) => 2400 - i * (800 / n) + (r() - 0.5) * 120);
  const games = [];
  const byes = [];
  const m = { rounds: 0, failed: 0, ms: 0 };
  for (let k = 0; k < rounds; k++) {
    let round;
    const t0 = performance.now();
    try { round = swissPairings(players, games, byes, [], { repeatFloats: true, pairing: "bracket" }); } catch { m.failed = 1; break; }
    m.ms += performance.now() - t0;
    m.rounds++;
    for (const p of round.pairs) {
      const e = 1 / (1 + 10 ** ((rating[p.black] - rating[p.white] - 35) / 400));
      const u = r();
      const res = u < e - 0.125 ? [1, 0] : u < e + 0.125 ? [1, 1] : [0, 1];
      games.push({ a: p.white, b: p.black, ga: res[0], gb: res[1] });
    }
    if (round.bye !== null) byes.push(round.bye);
  }
  const { history } = floatHistory(players, games, byes);
  m.rd1 = 0; m.ru1 = 0; m.rd2 = 0; m.ru2 = 0; m.floats = 0;
  for (const h of history.values()) {
    for (let t = 0; t < h.length; t++) {
      if (h[t] === "up" || h[t] === "down") m.floats++;
      if (t >= 1 && h[t] === "down" && h[t - 1] === "down") m.rd1++;
      if (t >= 1 && h[t] === "up" && h[t - 1] === "up") m.ru1++;
      if (t >= 2 && h[t] === "down" && h[t - 2] === "down") m.rd2++;
      if (t >= 2 && h[t] === "up" && h[t - 2] === "up") m.ru2++;
    }
  }
  return m;
}

const args = process.argv.slice(2);
const SEEDS = Number(args[0] ?? 10);
const mods = args.slice(1).length ? args.slice(1) : [new URL("../swiss.mjs", import.meta.url).pathname];
const libs = [];
for (const p of mods) libs.push([p, await import(pathToFileURL(resolve(p)).href)]);
const SIZES = [[101, 9], [151, 9], [201, 9], [301, 9]];
const KEYS = ["rd1", "ru1", "rd2", "ru2", "floats", "ms", "rounds", "failed"];
const fmt = (x, d = 2) => x.toFixed(d).padStart(8);
console.log(`Repeat floats per event, ${SEEDS} seeds per size, bracket pairing, repeat-float rule on.`);
console.log("players rounds  build                    failed  down1/ev   up1/ev  down2/ev   up2/ev floats/ev    ms/rd");
for (const [n, rounds] of SIZES) {
  for (const [name, lib] of libs) {
    const acc = Object.fromEntries(KEYS.map((k) => [k, 0]));
    for (let s = 0; s < SEEDS; s++) {
      const m = play(lib, n, rounds, 7000 * n + s);
      for (const k of KEYS) acc[k] += m[k];
    }
    const label = name.split("/").slice(-2).join("/").slice(-24).padEnd(24);
    console.log(`${String(n).padStart(7)} ${String(rounds).padStart(6)}  ${label} ${String(acc.failed).padStart(6)} ${fmt(acc.rd1 / SEEDS)} ${fmt(acc.ru1 / SEEDS)} ${fmt(acc.rd2 / SEEDS)} ${fmt(acc.ru2 / SEEDS)} ${fmt(acc.floats / SEEDS)} ${fmt(acc.ms / Math.max(1, acc.rounds), 0)}`);
  }
}
