import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildSchedule, readSpec, teamSchedule, roundRobin, countBreaks, validateSchedule, dayLabel, parseDate } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-make-a-round-robin-schedule.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any league/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("JSON-LD blocks parse and every FAQ question is on the page", () => {
  for (const name of ["index.html", GUIDE]) {
    const html = page(name);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, name);
    for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    for (const q of faq.mainEntity) assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const app = JSON.parse(page("index.html").match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>League Schedule Generator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /round robin schedule generator/i);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 15);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module scripts import only local files, and the inline script parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s/m);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every name the inline script imports is exported by calc.mjs", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const name of names) assert.ok(name in calc, name);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 25);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  for (const id of ["teams", "double", "start", "minutes", "seed", "skip", "blackouts", "courts", "times", "playoff", "playoffDouble", "playoffThird", "results", "team"]) assert.ok(ids.has(id), id);
  for (let i = 0; i < 7; i++) assert.ok(ids.has(`wd${i}`), `wd${i}`);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["schedule_built", "example_loaded", "csv_downloaded", "ics_downloaded", "text_shared", "link_shared", "link_opened", "next_season"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE and VENTURE.yaml exist and carry the screening notes", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  const y = page("VENTURE.yaml");
  assert.match(y, /^name: league-schedule-generator$/m);
  assert.match(y, /duplicate_check\.py: closest row was shift-cover-optimizer 0\.11/);
  assert.match(y, /r\/pickleball, r\/youthsports and r\/chess/);
  assert.match(y, /No payments, no accounts/);
});

test("related-tool links point at ventures that exist, and the sibling links resolve", () => {
  for (const name of ["index.html", GUIDE]) {
    for (const m of page(name).matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(existsSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);
  }
  assert.match(page("index.html"), /href="\.\/how-to-make-a-round-robin-schedule\.html"/);
  assert.match(page("sitemap.xml"), /how-to-make-a-round-robin-schedule\.html/);
});

test("the guide's worked example matches the generator", () => {
  const guide = page(GUIDE);
  assert.match(guide, /No warranty/);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, /<link rel="canonical" href="\.\/how-to-make-a-round-robin-schedule\.html">/);
  assert.match(guide, /href="\.\/"/);
  const { spec } = readSpec({ teams: "Aces\nBolts\nComets\nDinks\nEagles", start: "2026-10-06", weekdays: ["Tue"], courts: "Court 1, Court 2", seed: 1 });
  const s = buildSchedule(spec);
  const short = (d) => `${Number(d.slice(8))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1]}`;
  s.rounds.forEach((r, i) => {
    const cell = (court) => {
      const m = r.matches.find((x) => x.court === court);
      return `${m.homeName} v ${m.awayName}`;
    };
    const iso = new Date(r.day * 86400000).toISOString().slice(0, 10);
    const row = `<tr><td>${i + 1}</td><td>${short(iso)}</td><td>${cell("Court 1")}</td><td>${cell("Court 2")}</td><td>${s.teams[r.bye]}</td></tr>`;
    assert.ok(guide.includes(row), row);
  });
  for (let t = 0; t < 5; t++) {
    const rows = teamSchedule(s, t).filter((r) => !r.bye);
    assert.equal(rows.filter((r) => r.venue === "Home").length, 2);
    assert.equal(new Set(rows.map((r) => r.court)).size, 2);
  }
  assert.equal(s.stats.totalBreaks, 0);
  assert.equal(s.stats.matches, 10);
});

test("shift-cover-optimizer links here", () => {
  assert.match(readFileSync(new URL("../shift-cover-optimizer/index.html", import.meta.url), "utf8"), /href="\.\.\/league-schedule-generator\/"/);
});

test("the team-count page's table matches roundRobin", () => {
  const html = page("round-robin-schedule-by-number-of-teams.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/round-robin-schedule-by-number-of-teams\.html">/);
  assert.match(page("sitemap.xml"), /round-robin-schedule-by-number-of-teams\.html/);
  assert.match(page("index.html"), /href="\.\/round-robin-schedule-by-number-of-teams\.html"/);
  for (let n = 3; n <= 16; n++) {
    const rr = roundRobin(n);
    const sch = { teams: Array.from({ length: n }, (_, i) => i), rounds: rr.map((r) => ({ matches: r.matches.map(([home, away]) => ({ home, away })) })) };
    const breaks = countBreaks(sch).reduce((a, c) => a + c, 0);
    const total = (n * (n - 1)) / 2;
    const row = `<tr><td>${n}</td><td>${rr.length}</td><td>${Math.floor(n / 2)}</td><td>${total}</td><td>${rr.length * 2}</td><td>${total * 2}</td><td>${n % 2 ? "1 team" : "none"}</td><td>${breaks}</td></tr>`;
    assert.ok(html.includes(row), row);
    assert.equal(rr.reduce((a, r) => a + r.matches.length, 0), total);
    if (n % 2 === 0) assert.equal(breaks, n - 2);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) JSON.parse(m[1]);
});

test("the round-robin duration page's slot table matches roundRobin and it is linked", () => {
  const html = page("how-long-does-a-round-robin-tournament-take.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-long-does-a-round-robin-tournament-take\.html">/);
  assert.match(page("sitemap.xml"), /how-long-does-a-round-robin-tournament-take\.html/);
  for (const f of ["index.html", "round-robin-schedule-by-number-of-teams.html"]) assert.match(page(f), /href="\.\/how-long-does-a-round-robin-tournament-take\.html"/);
  for (let n = 4; n <= 16; n++) {
    const rr = roundRobin(n);
    const m = Math.floor(n / 2);
    const cells = [1, 2, 3, 4].map((c) => `<td>${rr.length * Math.ceil(m / c)}</td>`).join("");
    const row = `<tr><td>${n}</td><td>${(n * (n - 1)) / 2}</td><td>${m}</td>${cells}</tr>`;
    assert.ok(html.includes(row), row);
  }
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
});

test("the fixture-template page's rows match roundRobin and it is linked and in the sitemap", () => {
  const html = page("round-robin-schedule-template.html");
  assert.match(html, /No warranty/);
  assert.match(html, /<link rel="canonical" href="\.\/round-robin-schedule-template\.html">/);
  assert.match(page("sitemap.xml"), /round-robin-schedule-template\.html/);
  assert.match(page("index.html"), /href="\.\/round-robin-schedule-template\.html"/);
  assert.match(page("round-robin-schedule-by-number-of-teams.html"), /href="\.\/round-robin-schedule-template\.html"/);
  for (const n of [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16]) {
    const rr = roundRobin(n);
    assert.ok(html.includes(`<h2 id="teams-${n}">${n} team round robin schedule</h2>`));
    rr.forEach((r, i) => {
      const row = `<tr><td>${i + 1}</td><td>${r.matches.map(([a, b]) => `${a + 1} v ${b + 1}`).join(", ")}</td><td>${r.bye === null ? "&ndash;" : r.bye + 1}</td></tr>`;
      assert.ok(html.includes(row), row);
    });
    const pairs = new Set(rr.flatMap((r) => r.matches.map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join("-"))));
    assert.equal(pairs.size, (n * (n - 1)) / 2);
  }
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
});

test("the Swiss guide's worked example matches swissPairings and is linked and in the sitemap", async () => {
  const { swissPairings, swissRounds, parseSwissResults } = await import("./calc.mjs");
  const name = "how-to-run-a-swiss-tournament.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-run-a-swiss-tournament\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const P = ["Ana", "Ben", "Cy", "Dee", "Eli", "Fay"];
  assert.equal(swissRounds(6), 3);
  const rows = (round) => round.pairs.map((p, i) => `<tr><td>Board ${i + 1}</td><td>${P[p.white]}</td><td>${P[p.black]}</td></tr>`);
  for (const row of rows(swissPairings(P, [], []))) assert.ok(html.includes(row), row);
  const done = parseSwissResults("Ana 1 - 0 Dee\nBen 1 - 0 Eli\nCy 0 - 1 Fay", P);
  const r2 = swissPairings(P, done.games, done.byes);
  for (const row of rows(r2)) assert.ok(html.includes(row), row);
  assert.equal(r2.floaters, 1);
  assert.match(page("sitemap.xml"), /how-to-run-a-swiss-tournament\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-run-a-swiss-tournament\.html"/);
});

test("the Americano guide's worked example matches americano() and is linked and in the sitemap", async () => {
  const { americano, validateAmericano, americanoStats } = await import("./calc.mjs");
  const html = page("how-to-run-an-americano-tournament.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-run-an-americano-tournament\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const P = ["Ana", "Ben", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal"];
  const plan = americano(P, { courts: 2, rounds: 7, seed: 1 });
  assert.deepEqual(validateAmericano(P, plan), []);
  const st = americanoStats(P, plan);
  assert.equal(st.repeatPartners, 0);
  assert.equal(st.unmetPartners, 0);
  plan.rounds.forEach((r, i) => {
    for (const m of r.matches) {
      const row = `<tr><td>${i + 1}</td><td>${m.court}</td><td>${m.a.map((x) => P[x]).join(" & ")}</td><td>${m.b.map((x) => P[x]).join(" & ")}</td></tr>`;
      assert.ok(html.includes(row), row);
    }
  });
  assert.match(page("sitemap.xml"), /how-to-run-an-americano-tournament\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-run-an-americano-tournament\.html"/);
});

test("the Mexicano guide's worked example matches mexicanoNextRound() and is linked and in the sitemap", async () => {
  const { mexicanoNextRound, mexicanoStandings, parseMexicanoScores } = await import("./calc.mjs");
  const html = page("how-to-run-a-mexicano-tournament.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-run-a-mexicano-tournament\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const P = ["Ana", "Ben", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal"];
  const row = (r, m) => `<tr><td>${r}</td><td>${m.court}</td><td>${m.a.map((x) => P[x]).join(" & ")}</td><td>${m.b.map((x) => P[x]).join(" & ")}</td></tr>`;
  const r1 = mexicanoNextRound(P, [], { courts: 2, seed: 1 });
  r1.matches.forEach((m) => assert.ok(html.includes(row(1, m)), row(1, m)));
  const { games, errors } = parseMexicanoScores("Ben & Gus 21-14 Cy & Fay\nAna & Dee 17-21 Eli & Hal", P);
  assert.deepEqual(errors, []);
  for (const r of mexicanoStandings(P, games)) {
    const cells = `<tr><td>${r.rank}</td><td>${r.name}</td><td>${r.pf}</td><td>${r.diff >= 0 ? "+" : "-"}${Math.abs(r.diff)}</td></tr>`;
    assert.ok(html.includes(cells), cells);
  }
  const r2 = mexicanoNextRound(P, games, { courts: 2, seed: 1 });
  assert.equal(r2.repeatPartners, 0);
  r2.matches.forEach((m) => assert.ok(html.includes(row(2, m)), row(2, m)));
  assert.match(page("sitemap.xml"), /how-to-run-a-mexicano-tournament\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-run-a-mexicano-tournament\.html"/);
});

test("the double-elimination guide's worked example matches doubleEliminationBracket() and is linked and in the sitemap", async () => {
  const { doubleEliminationBracket } = await import("./calc.mjs");
  const html = page("how-to-run-a-double-elimination-tournament.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-run-a-double-elimination-tournament\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const s = (x) => (x.none ? "BYE" : x.loserOf ? `loser of ${x.loserOf}` : x.from ? `winner of ${x.from}` : `#${x.seed} ${x.name}`);
  const b = doubleEliminationBracket(["Hawks", "Owls", "Foxes", "Bears", "Lynx", "Wolves"]);
  assert.equal(b.games, 10);
  assert.equal(b.maxGames, 11);
  for (const r of b.rounds) for (const m of r.matches) {
    if (m.bye || m.dead) continue;
    const row = `<tr><td>${r.name}</td><td>${m.id}</td><td>${s(m.a)} vs ${s(m.b)}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  assert.match(page("sitemap.xml"), /how-to-run-a-double-elimination-tournament\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-run-a-double-elimination-tournament\.html"/);
});

test("the single-elimination guide's worked example matches playoffBracket() and is linked and in the sitemap", async () => {
  const { playoffBracket, seedOrder } = await import("./calc.mjs");
  const html = page("how-to-run-a-single-elimination-bracket.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-run-a-single-elimination-bracket\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const s = (x) => (x.from ? `winner of ${x.from}` : `#${x.seed} ${x.name}`);
  const b = playoffBracket(["Hawks", "Owls", "Foxes", "Bears", "Lynx", "Wolves"]);
  assert.equal(b.games, 5);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  for (const r of b.rounds) for (const m of r.matches) {
    if (m.bye) continue;
    const row = `<tr><td>${r.name}</td><td>${m.id}</td><td>${s(m.a)} vs ${s(m.b)}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  for (const n of [2, 3, 5, 6, 9, 12, 16]) assert.equal(playoffBracket(Array.from({ length: n }, (_, i) => `T${i}`)).games, n - 1);
  assert.match(page("sitemap.xml"), /how-to-run-a-single-elimination-bracket\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-run-a-single-elimination-bracket\.html"/);
});

test("the odd-team round robin guide's worked example matches roundRobin() and is linked and in the sitemap", () => {
  const html = page("how-to-schedule-a-round-robin-with-an-odd-number-of-teams.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-schedule-a-round-robin-with-an-odd-number-of-teams\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const names = ["Hawks", "Owls", "Foxes", "Bears", "Lynx"];
  const rounds = roundRobin(5);
  assert.equal(rounds.length, 5);
  assert.equal(new Set(rounds.map((r) => r.bye)).size, 5);
  rounds.forEach((r, i) => {
    const row = `<tr><td>${i + 1}</td><td>${r.matches.map(([h, a]) => `${names[h]} v ${names[a]}`).join(", ")}</td><td>${names[r.bye]}</td></tr>`;
    assert.ok(html.includes(row), row);
  });
  for (const n of [3, 5, 7, 9, 11]) {
    const rr = roundRobin(n);
    assert.equal(rr.length, n);
    assert.equal(rr.reduce((s, r) => s + r.matches.length, 0), (n * (n - 1)) / 2);
    assert.equal(new Set(rr.map((r) => r.bye)).size, n);
  }
  assert.match(page("sitemap.xml"), /how-to-schedule-a-round-robin-with-an-odd-number-of-teams.html/);
  assert.match(page("index.html"), /href="\.\/how-to-schedule-a-round-robin-with-an-odd-number-of-teams.html"/);
});

test("the home/away balance guide's worked example matches roundRobin() and countBreaks() and is linked and in the sitemap", () => {
  const name = "how-to-balance-home-and-away-games-in-a-round-robin.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const names = ["Hawks", "Owls", "Foxes", "Bears", "Lynx", "Wolves"];
  const wrap = (n, double) => ({ teams: Array(n).fill(0), rounds: roundRobin(n, { double }).map((r) => ({ matches: r.matches.map(([home, away]) => ({ home, away })) })) });
  const rr = roundRobin(6);
  const breaks = countBreaks(wrap(6, false));
  names.forEach((t, i) => {
    const pat = rr.map((r) => r.matches.some(([h]) => h === i) ? "H" : "A").join(" ");
    const row = `<tr><td>${t}</td><td>${pat}</td><td>${breaks[i]}</td></tr>`;
    assert.ok(html.includes(row), row);
  });
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  for (const n of [4, 6, 8, 10, 12, 16]) {
    assert.equal(sum(countBreaks(wrap(n, false))), n - 2);
    assert.equal(sum(countBreaks(wrap(n, true))), 3 * (n - 2));
  }
  for (const n of [5, 7, 9]) assert.equal(sum(countBreaks(wrap(n, false))), 0);
  assert.equal(Math.max(...countBreaks(wrap(6, true))), 3);
  assert.match(page("sitemap.xml"), /how-to-balance-home-and-away-games-in-a-round-robin\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-balance-home-and-away-games-in-a-round-robin\.html"/);
});

test("the courts-and-time-slots guide's worked example matches buildSchedule() and is linked and in the sitemap", () => {
  const name = "how-to-schedule-a-league-with-limited-courts-and-time-slots.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const { errors, spec } = readSpec({ teams: "Hawks\nOwls\nFoxes\nBears\nLynx\nWolves", start: "2026-10-06", weekdays: "Tue", courts: "Court A\nCourt B", times: "18:00\n19:00", seed: 1 });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.equal(s.rounds.length, 5);
  const early = {};
  s.rounds.forEach((r) => {
    const row = `<tr><td>${r.number}</td><td>${r.matches.map((m) => `${m.homeName} v ${m.awayName} (${m.court} ${m.time})`).join(", ")}</td></tr>`;
    assert.ok(html.includes(row), row);
    assert.equal(new Set(r.matches.map((m) => `${m.court}|${m.time}`)).size, r.matches.length);
    for (const m of r.matches) if (m.time === "18:00") for (const t of [m.homeName, m.awayName]) early[t] = (early[t] || 0) + 1;
  });
  assert.ok(Object.values(early).every((c) => c === 2 || c === 3));
  const tooFew = readSpec({ teams: "A\nB\nC\nD\nE\nF", start: "2026-10-06", weekdays: "Tue", courts: "Court A", times: "18:00", seed: 1 });
  assert.throws(() => buildSchedule(tooFew.spec), /3 matches a round, but 1 court\(s\) x 1 time slot\(s\) only fit 1/);
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});

test("play-off race table has a copy button wired to raceText", () => {
  const html = page("index.html");
  assert.match(html, /id="copy-race"/);
  assert.match(html, /import \{[^}]*\braceText\b[^}]*\} from "\.\/calc\.mjs"/);
  assert.match(html, /raceText\(last\.race\.rows, last\.race\.spots\)/);
});

test("the tie-break guide's worked example matches standings and is linked and in the sitemap", async () => {
  const { standings, parseResults } = await import("./calc.mjs");
  const name = "how-to-break-ties-in-league-standings.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-break-ties-in-league-standings\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const T = ["Owls", "Lynx", "Hawks", "Otters"];
  const games = [["Owls", 0, 1, "Lynx"], ["Owls", 6, 0, "Hawks"], ["Owls", 1, 0, "Otters"], ["Lynx", 0, 1, "Hawks"], ["Lynx", 1, 0, "Otters"], ["Hawks", 0, 0, "Otters"]];
  for (const [a, x, y, b] of games) assert.ok(html.includes(`<tr><td>${a} v ${b}</td><td>${x} - ${y}</td></tr>`), `${a} v ${b}`);
  const { results } = parseResults(games.map(([a, x, y, b]) => `${a} ${x} - ${y} ${b}`).join("\n"), T);
  const plain = standings(T, results).map((r) => r.name);
  const h2h = standings(T, results, { headToHead: true }).map((r) => r.name);
  assert.deepEqual(plain, ["Owls", "Lynx", "Hawks", "Otters"]);
  assert.deepEqual(h2h, ["Lynx", "Owls", "Hawks", "Otters"]);
  plain.forEach((n, i) => assert.ok(html.includes(`<tr><td>${i + 1}</td><td>${plain[i]}</td><td>${h2h[i]}</td></tr>`), n));
  assert.match(page("sitemap.xml"), /how-to-break-ties-in-league-standings\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-break-ties-in-league-standings\.html"/);
});

test("the rainout guide's worked example matches buildSchedule and applyRainouts and is linked and in the sitemap", async () => {
  const { applyRainouts, dayIso } = await import("./calc.mjs");
  const name = "how-to-reschedule-a-rained-out-league-game.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-reschedule-a-rained-out-league-game\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const { spec } = readSpec({ teams: "Owls\nLynx\nHawks\nOtters", start: "2026-10-06", weekdays: "Tue", courts: "Court 1\nCourt 2", times: "7pm" });
  const row = (r) => `<tr><td>${dayIso(r.day)}</td><td>${r.matches.map((m) => `${m.homeName} v ${m.awayName} (${m.court})`).join(", ")}</td></tr>`;
  const base = buildSchedule(spec);
  for (const r of base.rounds) assert.ok(html.includes(row(r)), row(r));
  const out = applyRainouts(base, "2026-10-13 Owls");
  assert.deepEqual(out.errors, []);
  assert.equal(out.moves.length, 1);
  assert.equal(dayIso(out.moves[0].to), "2026-10-27");
  assert.equal(`${out.moves[0].home} v ${out.moves[0].away} ${out.moves[0].court} ${out.moves[0].time}`, "Hawks v Owls Court 2 19:00");
  for (const r of out.schedule.rounds) assert.ok(html.includes(row(r)), row(r));
  assert.match(page("sitemap.xml"), /how-to-reschedule-a-rained-out-league-game\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-reschedule-a-rained-out-league-game\.html"/);
});

test("the bracket-by-teams page's rows match playoffBracket and doubleEliminationBracket and it is linked", async () => {
  const { playoffBracket, doubleEliminationBracket } = await import("./calc.mjs");
  const html = page("tournament-bracket-by-number-of-teams.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/tournament-bracket-by-number-of-teams\.html">/);
  assert.match(page("sitemap.xml"), /tournament-bracket-by-number-of-teams\.html/);
  assert.match(page("index.html"), /href="\.\/tournament-bracket-by-number-of-teams\.html"/);
  assert.match(page("round-robin-schedule-by-number-of-teams.html"), /href="\.\/tournament-bracket-by-number-of-teams\.html"/);
  for (let n = 3; n <= 32; n++) {
    const t = Array.from({ length: n }, (_, i) => `T${i + 1}`);
    const s = playoffBracket(t);
    const d = doubleEliminationBracket(t);
    assert.equal(s.games, n - 1);
    assert.equal(d.games, 2 * n - 2);
    const row = `<tr><td>${n}</td><td>${s.size}</td><td>${s.size - n}</td><td>${s.rounds.length}</td><td>${s.games}</td><td>${d.games}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) JSON.parse(m[1]);
});

test("links to the meeting-action-items sibling", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/meeting-action-items\/"/);
});

test("the schedule can be printed: a print stylesheet keeps only the report", () => {
  const html = page("index.html");
  const css = html.match(/@media print \{([\s\S]*?)\n    \}/)?.[1] ?? "";
  assert.match(css, /\.card:not\(#report\)/);
  assert.match(css, /button/);
  assert.match(html, /id="print-page"/);
  assert.match(html, /\$\("#print-page"\)\.addEventListener\("click", \(\) => \{ if \(!last\) return; window\.print\(\)/);
});

test("the standings row template has one cell for every header column", () => {
  const html = page("index.html");
  const head = html.match(/<table id="standings"><thead><tr>(.*?)<\/tr>/s)[1];
  const row = html.match(/\$\("#standings tbody"\)\.innerHTML = extra\.table\.map\(\(r\) => `<tr>(.*?)<\/tr>`\)/s)[1];
  const heads = [...head.matchAll(/<th\b/g)].length;
  const cells = [...row.matchAll(/<td\b/g)].length;
  assert.equal(cells, heads, "a header without a cell (or the reverse) shifts every later column");
  // Each value the table shows is rendered, in header order.
  const order = [...row.matchAll(/\$\{(?:esc\()?r\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(order, ["rank", "name", "played", "won", "drawn", "lost", "gd", "points", "left", "oppAvg", "form", "streak"]);
});

test("standings row template has one cell per header column", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const head = html.match(/<table id="standings"><thead><tr>(.*?)<\/tr>/)[1];
  const row = html.match(/\$\("#standings tbody"\)\.innerHTML = extra\.table\.map\(\(r\) => `<tr>(.*?)<\/tr>`/)[1];
  assert.equal((row.match(/<td/g) || []).length, (head.match(/<th/g) || []).length);
});

test("the ladder guide's worked example matches ladderStandings() and is linked and in the sitemap", async () => {
  const { ladderStandings, parseLadderResults } = await import("./calc.mjs");
  const html = page("how-to-run-a-ladder-league.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-run-a-ladder-league\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const P = ["Ana", "Ben", "Cy", "Dee", "Eli", "Fay"];
  const text = html.match(/<pre>(.*?)<\/pre>/s)[1];
  const { results, errors } = parseLadderResults(text, P);
  assert.deepEqual(errors, []);
  const s = ladderStandings(P, results, { reach: 2 });
  s.order.forEach((p, i) => assert.ok(html.includes(`<tr><td>${i + 1}</td><td>${P[p]}</td></tr>`), P[p]));
  assert.equal(s.outOfReach.length, 1);
  assert.match(page("sitemap.xml"), /how-to-run-a-ladder-league\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-run-a-ladder-league\.html"/);
  assert.match(page("index.html"), /id="build-ladder"/);
});

test("the referees guide's worked example matches assignOfficials() and is linked and in the sitemap", async () => {
  const { readSpec, buildSchedule, parseOfficials, assignOfficials, validateOfficials } = await import("./calc.mjs");
  const html = page("how-to-assign-referees-to-a-league-schedule.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-assign-referees-to-a-league-schedule\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const { spec, errors } = readSpec({ teams: "Hawks\nOwls\nWolves\nLynx", double: false, start: "2026-10-06", weekdays: ["Tue"], skip: "" });
  assert.deepEqual(errors, []);
  const o = parseOfficials(html.match(/<pre>(.*?)<\/pre>/s)[1], spec.teams);
  assert.deepEqual(o.errors, []);
  const a = assignOfficials(buildSchedule(spec), o.officials);
  assert.deepEqual(validateOfficials(a.schedule, o.officials), []);
  a.schedule.rounds.forEach((r, i) => r.matches.forEach((m) => assert.ok(html.includes(`<tr><td>${i + 1}</td><td>${m.homeName} v ${m.awayName}</td><td>${m.official}</td></tr>`), `${m.homeName} v ${m.awayName}`)));
  assert.match(page("sitemap.xml"), /how-to-assign-referees-to-a-league-schedule\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-assign-referees-to-a-league-schedule\.html"/);
});

test("the pickleball guide's worked example matches buildSchedule() and is linked and in the sitemap", () => {
  const name = "pickleball-league-schedule.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const { errors, spec } = readSpec({ teams: "Dinkers\nSpinners\nLobbers\nVolleys\nBangers\nDrop Shots\nKitchen Crew\nPaddle Pals", start: "2026-10-07", weekdays: ["Wed"], courts: "Court 1\nCourt 2", times: "18:00\n19:00" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.equal(s.rounds.length, 7);
  const early = {};
  s.rounds.forEach((r) => {
    const row = `<tr><td>${r.number}</td><td>${r.matches.map((m) => `${m.homeName} v ${m.awayName} (${m.court} ${m.time})`).join(", ")}</td></tr>`;
    assert.ok(html.includes(row), row);
    assert.equal(new Set(r.matches.map((m) => `${m.court}|${m.time}`)).size, r.matches.length);
    for (const m of r.matches) if (m.time === "18:00") for (const t of [m.homeName, m.awayName]) early[t] = (early[t] || 0) + 1;
  });
  assert.ok(Object.values(early).every((c) => c === 3 || c === 4));
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});

test("the youth soccer guide's 9-team example matches buildSchedule() and is linked and in the sitemap", () => {
  const name = "youth-soccer-league-schedule.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const teams = ["Rockets", "Falcons", "Tigers", "Comets", "Rangers", "Strikers", "Blazers", "Wolves", "Sharks"];
  const { errors, spec } = readSpec({ teams: teams.join("\n"), start: "2026-10-24", weekdays: ["Sat"], courts: "Field 1\nField 2", times: "09:00\n10:30" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.equal(s.rounds.length, 9);
  const byes = {};
  s.rounds.forEach((r) => {
    const playing = new Set(r.matches.flatMap((m) => [m.homeName, m.awayName]));
    const bye = teams.filter((t) => !playing.has(t));
    assert.equal(bye.length, 1);
    byes[bye[0]] = (byes[bye[0]] || 0) + 1;
    const row = `<tr><td>${r.number}</td><td>${r.matches.map((m) => `${m.homeName} v ${m.awayName} (${m.court} ${m.time})`).join(", ")}</td><td>${bye[0]}</td></tr>`;
    assert.ok(html.includes(row), row);
    assert.equal(new Set(r.matches.map((m) => `${m.court}|${m.time}`)).size, r.matches.length);
  });
  assert.ok(teams.every((t) => byes[t] === 1));
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});

test("the rec basketball guide's 10-team example matches buildSchedule() and is linked and in the sitemap", () => {
  const name = "rec-basketball-league-schedule.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const teams = ["Hoopers", "Bruisers", "Skyhooks", "Fastbreak", "Pivots", "Rim Riders", "Buzzers", "Dunkers", "Zone D", "Net Gains"];
  const { errors, spec } = readSpec({ teams: teams.join("\n"), start: "2026-11-04", weekdays: ["Wed"], courts: "Court A\nCourt B", times: "18:00\n19:00\n20:00" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.equal(s.rounds.length, 9);
  const early = {};
  s.rounds.forEach((r) => {
    const row = `<tr><td>${r.number}</td><td>${r.matches.map((m) => `${m.homeName} v ${m.awayName} (${m.court} ${m.time})`).join(", ")}</td></tr>`;
    assert.ok(html.includes(row), row);
    assert.equal(r.matches.length, 5);
    assert.equal(new Set(r.matches.map((m) => `${m.court}|${m.time}`)).size, 5);
    for (const m of r.matches) if (m.time === "18:00") for (const t of [m.homeName, m.awayName]) early[t] = (early[t] || 0) + 1;
  });
  assert.ok(teams.every((t) => early[t] === 3));
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});

test("the volleyball guide's closed-gym example matches buildSchedule() and is linked and in the sitemap", () => {
  const name = "volleyball-league-schedule.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const teams = ["Spikers", "Setters", "Diggers", "Blockers", "Aces", "Floaters"];
  const { errors, spec } = readSpec({ teams: teams.join("\n"), start: "2026-11-05", weekdays: ["Thu"], courts: "Gym 1\nGym 2", times: "19:00\n20:00", courtClosures: "Gym 2: 2026-11-19, 2026-11-26" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.ok(validateSchedule(s).ok);
  let played = 0;
  s.rounds.forEach((r) => {
    const night = new Date(r.day * 864e5).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    const row = `<tr><td>${r.label}</td><td>${night}</td><td>${r.matches.map((m) => `${m.homeName} v ${m.awayName} (${m.court} ${m.time})`).join(", ")}</td></tr>`;
    assert.ok(html.includes(row), row);
    played += r.matches.length;
    if (night === "Thu 19 Nov" || night === "Thu 26 Nov") assert.ok(r.matches.every((m) => m.court === "Gym 1"));
  });
  assert.equal(played, 15);
  assert.equal(s.rounds.filter((r) => r.makeup).length, 2);
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});

test("the fantasy football guide's 12-team, 14-week example matches buildSchedule() and is linked and in the sitemap", async () => {
  const { rematchReport } = await import("./calc.mjs");
  const html = page("how-to-make-a-fantasy-football-schedule.html");
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="\.\/how-to-make-a-fantasy-football-schedule\.html">/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const names = "Ace,Bolt,Colt,Dash,Echo,Fox,Gale,Hawk,Iris,Jinx,Kite,Lynx".split(",");
  assert.ok(html.includes(names.join(", ")));
  const { errors, spec } = readSpec({ teams: names.join("\n"), start: "2026-09-10", weekdays: "Thu", double: true, rounds: "14" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.equal(validateSchedule(s).ok, true);
  assert.equal(s.rounds.length, 14);
  const meets = new Map();
  for (const r of s.rounds) for (const m of r.matches) {
    const k = Math.min(m.home, m.away) + "-" + Math.max(m.home, m.away);
    meets.set(k, (meets.get(k) || 0) + 1);
  }
  assert.equal(meets.size, 66);
  assert.equal([...meets.values()].filter((v) => v === 2).length, 18);
  const rematches = Array(12).fill(0);
  for (const [k, v] of meets) if (v === 2) for (const t of k.split("-")) rematches[t]++;
  assert.ok(rematches.every((x) => x === 3));
  assert.equal(rematchReport(s).shortest, 77);
  assert.match(page("sitemap.xml"), /how-to-make-a-fantasy-football-schedule\.html/);
  assert.match(page("index.html"), /href="\.\/how-to-make-a-fantasy-football-schedule\.html"/);
});

test("the adult softball guide's 6-team example with a blackout matches buildSchedule() and is linked and in the sitemap", () => {
  const name = "adult-softball-league-schedule.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const teams = ["Bat Pack", "Dugout Dogs", "Foul Ballers", "Grand Slammers", "Pitch Perfect", "Walk-Offs"];
  const { errors, spec } = readSpec({ teams: teams.join("\n"), start: "2026-04-14", weekdays: ["Tue"], courts: "Diamond 1\nDiamond 2", times: "18:30\n20:00", blackouts: "Walk-Offs: 2026-05-05", minutes: 90 });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.equal(validateSchedule(s).ok, true);
  assert.equal(s.rounds.length, 6);
  let games = 0;
  s.rounds.forEach((r) => {
    const row = `<tr><td>${r.label}</td><td>${dayLabel(r.day)}</td><td>${r.matches.map((m) => `${m.homeName} v ${m.awayName} (${m.court} ${m.time})`).join(", ")}</td></tr>`;
    assert.ok(html.includes(row), row);
    assert.equal(new Set(r.matches.map((m) => `${m.court}|${m.time}`)).size, r.matches.length);
    games += r.matches.length;
  });
  assert.equal(games, 15);
  const blackedOut = s.rounds.find((r) => dayLabel(r.day) === "Tue 5 May 2026");
  assert.ok(blackedOut.matches.every((m) => m.homeName !== "Walk-Offs" && m.awayName !== "Walk-Offs"));
  assert.equal(s.rounds.filter((r) => r.makeup).length, 1);
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});

test("the darts guide's 6-pub double round robin matches buildSchedule() and is linked and in the sitemap", () => {
  const name = "darts-league-schedule.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const teams = ["Red Lion", "Kings Arms", "Royal Oak", "Black Horse", "Crown", "White Hart"];
  const { errors, spec } = readSpec({ teams: teams.join("\n"), start: "2026-09-10", weekdays: ["Thu"], double: true });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.ok(validateSchedule(s).ok);
  assert.equal(s.rounds.length, 10);
  const home = {};
  s.rounds.forEach((r) => {
    const row = `<tr><td>${r.label}</td><td>${dayLabel(r.day)}</td><td>${r.matches.map((m) => `${m.homeName} v ${m.awayName}`).join(", ")}</td></tr>`;
    assert.ok(html.includes(row), row);
    r.matches.forEach((m) => { home[m.homeName] = (home[m.homeName] || 0) + 1; });
  });
  assert.ok(teams.every((t) => home[t] === 5));
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});

test("the chess club guide's 7-player round robin matches buildSchedule() with one bye each and is linked and in the sitemap", () => {
  const name = "chess-club-round-robin-schedule.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const teams = ["Ana", "Ben", "Chloe", "Dev", "Ella", "Finn", "Gus"];
  const { errors, spec } = readSpec({ teams: teams.join("\n"), start: "2026-09-14", weekdays: ["Mon"], courts: "Board 1\nBoard 2\nBoard 3", times: "19:00" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.ok(validateSchedule(s).ok);
  assert.equal(s.rounds.length, 7);
  const byes = {}, white = {};
  s.rounds.forEach((r) => {
    const playing = new Set(r.matches.flatMap((m) => [m.homeName, m.awayName]));
    const bye = teams.find((t) => !playing.has(t));
    byes[bye] = (byes[bye] || 0) + 1;
    r.matches.forEach((m) => { white[m.homeName] = (white[m.homeName] || 0) + 1; });
    const row = `<tr><td>${r.label}</td><td>${dayLabel(r.day)}</td><td>${r.matches.map((m) => `${m.homeName} v ${m.awayName} (${m.court})`).join(", ")}; bye: ${bye}</td></tr>`;
    assert.ok(html.includes(row), row);
  });
  assert.ok(teams.every((t) => byes[t] === 1 && white[t] === 3));
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});

test("the cornhole guide's 8-team schedule with a skipped week matches buildSchedule() and is linked and in the sitemap", () => {
  const name = "cornhole-league-schedule.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const teams = ["Bag Daddies", "Hole Punchers", "Toss Bosses", "Sack Attack", "Board Meeting", "Corn Stars", "Slide Rules", "Airmailers"];
  const { errors, spec } = readSpec({ teams: teams.join("\n"), start: "2026-06-03", weekdays: ["Wed"], skip: "2026-07-01", courts: "Lane 1\nLane 2", times: "18:30\n19:30" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.ok(validateSchedule(s).ok);
  assert.equal(s.rounds.length, 7);
  assert.ok(s.rounds.every((r) => dayLabel(r.day) !== dayLabel(parseDate("2026-07-01"))));
  s.rounds.forEach((r) => {
    const row = `<tr><td>${r.label}</td><td>${dayLabel(r.day)}</td><td>${r.matches.map((m) => `${m.homeName} v ${m.awayName} (${m.court}${m.time ? " " + m.time : ""})`).join(", ")}</td></tr>`;
    assert.ok(html.includes(row), row);
  });
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});

test("multi-division page: disclaimer, imports, element ids, sitemap and link from the index", () => {
  const html = page("multi-division-league-schedule.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal or financial advice/i);
  assert.match(html, /never uploaded/);
  assert.match(html, /id="optout"/);
  assert.match(html, /<link rel="canonical" href="\.\/multi-division-league-schedule\.html">/);
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./divisions.mjs", "./usage.mjs"]);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("#([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  assert.match(page("sitemap.xml"), /multi-division-league-schedule\.html/);
  assert.match(page("index.html"), /href="\.\/multi-division-league-schedule\.html"/);
});

test("divisions.mjs guards its command-line entry so it loads in a browser", () => {
  assert.match(page("divisions.mjs"), /typeof process !== "undefined"/);
});

test("the multi-division page offers venue fairness and prints next season's history", () => {
  const html = page("multi-division-league-schedule.html");
  for (const id of ['id="venueFairness"', 'id="venueHistory"', 'id="next-history"']) assert.ok(html.includes(id), id);
  assert.match(html, /carryVenueHistory\(s\)/);
});

test("the multi-division page has the four make-up checkboxes and passes them to the rainout pass", () => {
  const html = page("multi-division-league-schedule.html");
  for (const id of ["balance", "flip", "relocate", "swapNights"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /applyDivisionRainouts\(s, f\.rainouts, rainoutOptions\(f\)\)/);
});

test("multi-division page: reminder box feeds divisionsIcs alarmMinutes", () => {
  const html = page("multi-division-league-schedule.html");
  assert.match(html, /id="ics-alarm"/);
  assert.match(html, /divisionsIcs\(last, \{ alarmMinutes:/);
});
