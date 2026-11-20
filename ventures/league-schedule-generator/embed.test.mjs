import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { embedKey, embedKeyOk, parseEmbedOptions, nextGames, latestResults, embedHtml, embedSnippet, adminEmbedHtml, EMBED_HEADERS } from "./embed.mjs";
import { handler, emptyState, buildLeague } from "./server.mjs";
import { toDay, dayLabel } from "./calc.mjs";

const env = { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" };

test("the embed key is stable, distinct from the player and captain secrets, and checked exactly", () => {
  const k = embedKey("adm");
  assert.equal(k, embedKey("adm"));
  assert.equal(k.length, 22);
  assert.notEqual(k, embedKey("adm2"));
  assert.ok(embedKeyOk("adm", k));
  assert.ok(!embedKeyOk("adm", k.slice(0, 21)));
  assert.ok(!embedKeyOk("adm", ""));
  assert.ok(!embedKeyOk("adm", null));
  assert.ok(!embedKeyOk("adm", "tok"));
});

test("options: defaults, clamps, team by index or name, and junk ignored", () => {
  const teams = ["Hawks", "Owls", "Net Ninjas"];
  const d = parseEmbedOptions(new URLSearchParams(""), teams);
  assert.deepEqual(d, { show: ["next", "results", "table"], team: null, nights: 3, results: 5, theme: "auto", accent: null, title: "" });
  const o = parseEmbedOptions(new URLSearchParams("show=table,bogus,next,table&team=net%20ninjas&nights=99&results=-4&theme=dark&accent=%23C8102E&title=Spring%20%3Cb%3E"), teams);
  assert.deepEqual(o.show, ["table", "next"]);
  assert.equal(o.team, 2);
  assert.equal(o.nights, 20);
  assert.equal(o.results, 0);
  assert.equal(o.theme, "dark");
  assert.equal(o.accent, "#c8102e");
  assert.equal(o.title, "Spring <b>");
  assert.equal(parseEmbedOptions(new URLSearchParams("team=1"), teams).team, 1);
  assert.equal(parseEmbedOptions(new URLSearchParams("team=7"), teams).team, null);
  assert.equal(parseEmbedOptions(new URLSearchParams("accent=red;}body{x"), teams).accent, null);
  assert.equal(parseEmbedOptions(new URLSearchParams("theme=neon&nights=1.5"), teams).theme, "auto");
  assert.equal(parseEmbedOptions(new URLSearchParams("nights=1.5"), teams).nights, 3);
});

// A small hand-made schedule: two rounds on one date (a doubleheader), then two more dates.
const sched = {
  teams: ["Hawks", "Owls", "Wrens", "Kites"],
  rounds: [
    { day: 10, label: "Round 1", matches: [{ home: 0, away: 1, homeName: "Hawks", awayName: "Owls", time: "18:00", court: "A" }, { home: 2, away: 3, homeName: "Wrens", awayName: "Kites", time: "18:00", court: "B" }], bye: null },
    { day: 17, label: "Round 2", matches: [{ home: 0, away: 2, homeName: "Hawks", awayName: "Wrens", time: "18:00", court: "A" }], bye: 3 },
    { day: 17, label: "Round 3", matches: [{ home: 1, away: 3, homeName: "Owls", awayName: "Kites", time: "19:00", court: "A" }], bye: null },
    { day: 24, label: "Round 4", matches: [{ home: 3, away: 0, homeName: "Kites", awayName: "Hawks", time: "18:00", court: "A" }], bye: null },
  ],
};

test("next games count match days, not rounds, and follow one team with its byes", () => {
  assert.deepEqual(nextGames(sched, 11, 1).map((r) => r.label), ["Round 2", "Round 3"]);
  assert.deepEqual(nextGames(sched, 11, 2).map((r) => r.label), ["Round 2", "Round 3", "Round 4"]);
  assert.deepEqual(nextGames(sched, 10, 1).map((r) => r.label), ["Round 1"]);
  const kites = nextGames(sched, 11, 5, 3);
  assert.deepEqual(kites.map((r) => [r.label, r.matches.length, r.bye]), [["Round 2", 0, 3], ["Round 3", 1, null], ["Round 4", 1, null]]);
  assert.deepEqual(nextGames(sched, 25, 3), []);
});

test("latest results are newest first and can follow one team", () => {
  const res = [{ a: 0, b: 1, ga: 3, gb: 1 }, { a: 2, b: 3, ga: 0, gb: 0 }, { a: 0, b: 2, ga: 1, gb: 2 }];
  assert.deepEqual(latestResults(res, 2), [res[2], res[1]]);
  assert.deepEqual(latestResults(res, 5, 0), [res[2], res[0]]);
  assert.deepEqual(latestResults(res, 0), []);
});

test("the page escapes every typed name, marks the followed team and loads nothing from elsewhere", () => {
  const s = { ...sched, teams: ["<script>x</script>", "Owls", "Wrens", "Kites"], rounds: sched.rounds.map((r) => ({ ...r, matches: r.matches.map((m) => ({ ...m, homeName: m.home === 0 ? "<script>x</script>" : m.homeName })) })) };
  const table = [{ index: 0, rank: 1, name: "<script>x</script>", played: 1, won: 1, drawn: 0, lost: 0, gd: 2, points: 3 }];
  const html = embedHtml({ schedule: s, table }, [{ a: 0, b: 1, ga: 3, gb: 1, walkover: true }], parseEmbedOptions(new URLSearchParams("team=0&title=<i>T</i>&show=next,results,table,season"), s.teams), 11);
  assert.ok(!html.includes("<script>x"));
  assert.ok(!html.includes("<i>T"));
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /class="lsg-mine"/);
  assert.match(html, /w\/o/);
  assert.match(html, /\+2/);
  assert.match(html, /<h2>Season for /);
  assert.match(html, /lsgEmbedHeight/);
  assert.ok(!/(src|href)="(https?:)?\/\/(?!marisstella\.app\/league-schedule-generator\/)/.test(html), "only the credit link points elsewhere");
  // One script: the page's height reporter.
  assert.equal((html.match(/<script>/g) || []).length, 1);
  const light = embedHtml({ schedule: sched, table: null }, [], parseEmbedOptions(new URLSearchParams("theme=light&results=0"), sched.teams), 30);
  assert.ok(!light.includes("prefers-color-scheme"));
  assert.match(light, /No more games scheduled/);
  assert.match(light, /The table starts with the first result/);
  assert.ok(!light.includes("Latest results"));
});

test("snippet and admin section carry the read-only key, never the player token or admin key", () => {
  const sn = embedSnippet("https://league.example.org", embedKey("adm"), "team=1");
  assert.match(sn, /src="https:\/\/league\.example\.org\/embed\?k=[\w-]{22}&amp;team=1"/);
  assert.match(sn, /data-lsg-embed/);
  const admin = adminEmbedHtml("adm", "https://league.example.org", ["Hawks", "Owls"]);
  assert.ok(!admin.includes("tok") && !admin.includes("key=adm"));
  assert.equal((admin.match(/&lt;iframe/g) || []).length, 3);
  assert.match(adminEmbedHtml("adm", null, ["Hawks"]), /Set PUBLIC_URL/);
  assert.match(EMBED_HEADERS["content-security-policy"], /frame-ancestors \*/);
  assert.match(EMBED_HEADERS["content-security-policy"], /form-action 'none'/);
});

async function boot() {
  const state = emptyState();
  const srv = http.createServer(handler(state, () => {}, env, () => Date.UTC(2026, 0, 1)));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

test("server: /embed needs the embed key, is framable, read-only, and follows results as they are posted", async () => {
  const s = await boot();
  const k = embedKey("adm");
  try {
    assert.equal((await fetch(`${s.base}/embed`)).status, 401);
    assert.equal((await fetch(`${s.base}/embed?k=tok`)).status, 401, "the player token is not an embed key");
    assert.equal((await fetch(`${s.base}/embed?k=adm`)).status, 401, "nor is the admin key");
    const before = await fetch(`${s.base}/embed?k=${k}`);
    assert.equal(before.status, 200);
    assert.match(await before.text(), /not published yet/);
    assert.equal((await fetch(`${s.base}/embed?k=${k}`, { method: "POST" })).status, 405);
    s.state.published = true;
    const teams = buildLeague(s.state.fields).schedule.teams;
    s.state.fields.results = `${teams[0]} 4 - 2 ${teams[1]}`;
    const r = await fetch(`${s.base}/embed?k=${k}&show=results,table`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-security-policy"), /frame-ancestors \*/);
    assert.equal(r.headers.get("x-frame-options"), null);
    const html = await r.text();
    assert.match(html, /Latest results/);
    assert.match(html, /4 - 2/);
    assert.match(html, /Standings/);
    assert.ok(!html.includes("<form"), "nothing in the embed can send anything");
    assert.ok(!html.includes("tok"), "the player token never appears");
    // The embed key opens nothing else.
    assert.equal((await fetch(`${s.base}/league?t=${k}`)).status, 401);
    assert.equal((await fetch(`${s.base}/admin?key=${k}`)).status, 401);
    // The admin page offers the snippet once the league is published.
    const admin = await (await fetch(`${s.base}/admin?key=adm`)).text();
    assert.match(admin, /On your club&#39;s website|On your club's website/);
    assert.ok(admin.includes(`/embed?k=${k}`));
  } finally { s.close(); }
});

test("server: the embed's 'next games' follows the server clock", async () => {
  const s = await boot();
  try {
    s.state.published = true;
    const out = buildLeague(s.state.fields);
    const days = [...new Set(out.schedule.rounds.map((r) => r.day))].sort((a, b) => a - b);
    // The clock is 2026-01-01, before the sample season: one night shows its first match day only.
    assert.ok(days[0] > toDay(2026, 1, 1));
    const html = await (await fetch(`${s.base}/embed?k=${embedKey("adm")}&show=next&nights=1`)).text();
    assert.ok(html.includes(dayLabel(days[0])));
    assert.ok(!html.includes(dayLabel(days[1])));
  } finally { s.close(); }
});

test("the embed guide's FAQ matches its page, names the real options and is linked and in the sitemap", async () => {
  const fs = await import("node:fs");
  const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
  const name = "how-to-put-a-league-schedule-on-your-website.html";
  const html = read(name);
  assert.match(html, /No warranty/);
  assert.match(html, new RegExp(`<link rel="canonical" href="\\./${name.replace(/\./g, "\\.")}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  // Every option the guide names is one parseEmbedOptions() reads, with the effect it claims.
  const o = parseEmbedOptions(new URLSearchParams("show=next,results,table,season&team=Hawks&accent=c8102e&theme=dark&title=Spring%20League"), ["Hawks"]);
  assert.deepEqual([o.show.length, o.team, o.accent, o.theme, o.title], [4, 0, "#c8102e", "dark", "Spring League"]);
  assert.match(html, /next 3 match days \(up to 20\)/);
  assert.match(html, /newest 5 results \(up to 20\)/);
  assert.match(read("sitemap.xml"), new RegExp(name));
  assert.match(read("index.html"), new RegExp(`href="\\./${name}"`));
  assert.match(read("llms.txt"), new RegExp(name));
});
