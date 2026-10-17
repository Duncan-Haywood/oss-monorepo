import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildSchedule, readSpec, teamSchedule, roundRobin, countBreaks } from "./calc.mjs";

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
  for (const id of ["teams", "double", "start", "minutes", "seed", "skip", "blackouts", "courts", "times", "playoff", "playoffDouble", "results", "team"]) assert.ok(ids.has(id), id);
  for (let i = 0; i < 7; i++) assert.ok(ids.has(`wd${i}`), `wd${i}`);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["schedule_built", "example_loaded", "csv_downloaded", "ics_downloaded", "text_shared", "link_shared", "link_opened"]) {
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
