import test from "node:test";
import assert from "node:assert/strict";
import {
  glicko2Update, outcome, periodKey, createRater, rateSeason, createElo, eloratingsMargin,
  parseRatingLog, ratingsText, ratingsCsv,
} from "./season-ratings.mjs";

const S = 173.7178;

test("Glickman's worked example (glicko2.pdf): 1464.06, RD 151.52, volatility 0.05999", () => {
  const opp = (r, rd, s) => ({ mu: (r - 1500) / S, phi: rd / S, s });
  const up = glicko2Update(0, 200 / S, 0.06, [opp(1400, 30, 1), opp(1550, 100, 0), opp(1700, 300, 0)], 0.5);
  assert.ok(Math.abs(1500 + up.mu * S - 1464.06) < 0.01, `rating ${1500 + up.mu * S}`);
  assert.ok(Math.abs(up.phi * S - 151.52) < 0.01, `rd ${up.phi * S}`);
  assert.ok(Math.abs(up.sigma - 0.05999) < 0.00001, `vol ${up.sigma}`);
});

test("the same example through the rater: singles with set starting ratings", () => {
  const rater = createRater({ initial: { P: { rating: 1500, rd: 200 }, A: { rating: 1400, rd: 30 }, B: { rating: 1550, rd: 100 }, C: { rating: 1700, rd: 300 } } });
  rater.period([{ a: ["P"], b: ["A"], sa: 1, sb: 0 }, { a: ["P"], b: ["B"], sa: 0, sb: 1 }, { a: ["P"], b: ["C"], sa: 0, sb: 1 }]);
  const p = rater.table().find((r) => r.name === "P");
  assert.ok(Math.abs(p.rating - 1464.06) < 0.01);
  assert.ok(Math.abs(p.rd - 151.52) < 0.01);
  assert.equal(p.wins, 1);
  assert.equal(p.losses, 2);
});

test("outcome blends win and points share", () => {
  assert.equal(outcome(11, 9, 0), 1);
  assert.equal(outcome(2, 2, 0), 0.5);
  assert.ok(Math.abs(outcome(11, 9, 0.5) - (0.5 + 0.5 * 0.55)) < 1e-12);
  assert.ok(outcome(11, 2, 0.5) > outcome(11, 9, 0.5));
  assert.equal(outcome(0, 0, 0.5), 0.5);
});

test("doubles: a win next to a stronger partner is worth less", () => {
  const init = { Pro: { rating: 1900, rd: 60 }, Mid: { rating: 1500, rd: 60 }, Me: { rating: 1500, rd: 120 }, X: { rating: 1500, rd: 60 }, Y: { rating: 1500, rd: 60 } };
  const withPro = createRater({ initial: init });
  withPro.period([{ a: ["Me", "Pro"], b: ["X", "Y"], sa: 11, sb: 7 }]);
  const withMid = createRater({ initial: init });
  withMid.period([{ a: ["Me", "Mid"], b: ["X", "Y"], sa: 11, sb: 7 }]);
  const gain = (r) => r.table().find((t) => t.name === "Me").rating - 1500;
  assert.ok(gain(withPro) > 0 && gain(withMid) > gain(withPro), `${gain(withPro)} vs ${gain(withMid)}`);
});

test("sitting out periods grows RD; playing shrinks it", () => {
  const rater = createRater();
  rater.period([{ a: ["A"], b: ["B"], sa: 1, sb: 0 }]);
  const rd1 = rater.table().find((r) => r.name === "B").rd;
  for (let i = 0; i < 10; i++) rater.period([{ a: ["A"], b: ["C"], sa: 1, sb: 0 }]);
  const t = rater.table();
  assert.ok(t.find((r) => r.name === "B").rd > rd1);
  assert.ok(t.find((r) => r.name === "A").rd < rd1);
});

test("home advantage moves the prediction", () => {
  const rater = createRater({ home: 100, rd: 50 });
  assert.equal(rater.predict(["A"], ["B"]), 0.5);
  assert.ok(rater.predict(["A"], ["B"], { home: true }) > 0.6);
});

test("periodKey: ISO weeks, dates, months", () => {
  assert.equal(periodKey("2026-01-01", 0, "week"), "2026-W01");
  assert.equal(periodKey("2024-12-30", 0, "week"), "2025-W01");
  assert.equal(periodKey("2021-01-03", 0, "week"), "2020-W53");
  assert.equal(periodKey("2026-11-24", 0, "month"), "2026-11");
  assert.equal(periodKey("2026-11-24", 3, "game"), "g3");
  assert.equal(periodKey(null, 4, "week"), "g4");
});

test("rateSeason recovers the true order of a synthetic doubles ladder", () => {
  let s = 7 >>> 0; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const truth = Array.from({ length: 12 }, (_, i) => ({ name: `P${i}`, skill: 1200 + i * 60 }));
  const games = [];
  for (let night = 0; night < 10; night++) {
    const date = `2026-0${1 + Math.floor(night / 4)}-${String(1 + (night % 4) * 7).padStart(2, "0")}`;
    for (let r = 0; r < 6; r++) {
      const p = [...truth].sort(() => rnd() - 0.5);
      for (let c = 0; c < 3; c++) {
        const [a1, a2, b1, b2] = p.slice(c * 4, c * 4 + 4);
        const pa = 1 / (1 + 10 ** (((b1.skill + b2.skill) - (a1.skill + a2.skill)) / 800));
        const aw = rnd() < pa;
        games.push({ date, a: [a1.name, a2.name], b: [b1.name, b2.name], sa: aw ? 11 : 6, sb: aw ? 6 : 11 });
      }
    }
  }
  const { table } = rateSeason(games, { period: "date" });
  const rank = new Map(table.map((r, i) => [r.name, i]));
  // Spearman correlation between rating order and true order.
  let d2 = 0;
  truth.forEach((t, i) => { d2 += (rank.get(t.name) - (11 - i)) ** 2; });
  const rho = 1 - (6 * d2) / (12 * (144 - 1));
  assert.ok(rho > 0.8, `rho ${rho}`);
});

test("Elo baseline and the eloratings margin", () => {
  const e = createElo({ k: 20, home: 100, marginMultiplier: eloratingsMargin });
  assert.equal(e.predict("A", "B"), 0.5);
  e.game("A", "B", 3, 0);
  assert.ok(Math.abs(e.ratings.get("A") - 1500 - 20 * 1.75 * 0.5) < 1e-9);
  assert.equal(eloratingsMargin(1), 1);
  assert.equal(eloratingsMargin(2), 1.5);
});

test("parseRatingLog reads doubles, singles, beat lines and dates", () => {
  const { games, errors } = parseRatingLog(`# week 1
2026-01-06 Ana & Ben 11-7 Cy / Dee
Ana 3-1 Cy
2026-01-13
Ben beat Dee
Ana and Cy 9:11 Ben + Dee
nonsense line
Ana & Ana 11-2 Ben & Cy`);
  assert.equal(games.length, 4);
  assert.deepEqual(games[0], { date: "2026-01-06", a: ["Ana", "Ben"], b: ["Cy", "Dee"], sa: 11, sb: 7, line: 2 });
  assert.equal(games[1].date, "2026-01-06");
  assert.equal(games[2].date, "2026-01-13");
  assert.deepEqual([games[2].sa, games[2].sb], [1, 0]);
  assert.deepEqual(games[3].a, ["Ana", "Cy"]);
  assert.equal(errors.length, 2);
});

test("text and CSV outputs", () => {
  const { table } = rateSeason(parseRatingLog("2026-01-06 Ana 11-3 Ben\nAna 11-5 Cy").games, { margin: 0.5 });
  assert.equal(table[0].name, "Ana");
  assert.match(ratingsText(table), /^Ratings\n1\. Ana  \d+ ±\d+  \(2-0\)  provisional/);
  const csv = ratingsCsv(table).split("\n");
  assert.equal(csv.length, 4);
  assert.match(csv[1], /^1,Ana,/);
  const evil = ratingsCsv(rateSeason(parseRatingLog("=SUM(A1) 11-3 Ben").games).table);
  assert.match(evil, /,'=SUM\(A1\),/);
});

test("player-ratings.html: disclaimer, privacy, FAQ matches the page, events listed", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./player-ratings.html", import.meta.url), "utf8");
  assert.match(html, /No warranty/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/player-ratings\.html">/);
  const faq = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  for (const ev of html.matchAll(/record\("(\w+)"\)/g)) assert.ok(html.includes(`<code>${ev[1]}</code>`), ev[1]);
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /player-ratings\.html/);
});

test("fitSeason: order-free, doubles-aware, priors respected, RD shrinks with games", async () => {
  const { fitSeason, fittedChance } = await import("./season-ratings.mjs");
  const games = [
    { a: ["A"], b: ["B"], sa: 11, sb: 5 }, { a: ["B"], b: ["C"], sa: 11, sb: 6 }, { a: ["A"], b: ["C"], sa: 11, sb: 3 },
    { a: ["A", "C"], b: ["B", "D"], sa: 11, sb: 9 }, { a: ["D"], b: ["C"], sa: 11, sb: 8 },
  ];
  const t1 = fitSeason(games, { margin: 0.5 });
  const t2 = fitSeason([...games].reverse(), { margin: 0.5 });
  assert.deepEqual(t1.map((r) => r.name), t2.map((r) => r.name));
  t1.forEach((r, i) => assert.ok(Math.abs(r.rating - t2[i].rating) < 1e-6));
  assert.equal(t1[0].name, "A");
  assert.ok(fittedChance(t1, ["A"], ["C"]) > 0.6);
  // mean rating stays near the prior mean when every prior is equal
  const mean = t1.reduce((s, r) => s + r.rating, 0) / t1.length;
  assert.ok(Math.abs(mean - 1500) < 1e-6, `mean ${mean}`);
  // a strong prior holds a player near it
  const t3 = fitSeason(games, { margin: 0.5, initial: { D: { rating: 1900, rd: 20 } } });
  assert.ok(Math.abs(t3.find((r) => r.name === "D").rating - 1900) < 20);
  // more games, smaller RD
  const many = Array.from({ length: 40 }, (_, i) => ({ a: ["X"], b: ["Y"], sa: i % 3 ? 11 : 7, sb: i % 3 ? 7 : 11 }));
  const few = fitSeason(many.slice(0, 4)).find((r) => r.name === "X").rd;
  const lots = fitSeason(many).find((r) => r.name === "X").rd;
  assert.ok(lots < few, `${lots} vs ${few}`);
});
