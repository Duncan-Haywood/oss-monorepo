// Real Chromium: a club page on another origin pastes the admin page's snippet; the embed must load in
// the frame (CSP frame-ancestors *), report its height, and the snippet must grow the iframe to fit.
// Also checks the embed's own CSP blocks nothing it needs (no console CSP errors) and the dark theme applies.
//   node eval/embed-browser.mjs > eval/embed-browser.txt
import http from "node:http";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { handler, emptyState, buildLeague } from "../server.mjs";
import { embedKey, embedSnippet } from "../embed.mjs";

const state = emptyState();
state.published = true;
const teams = buildLeague(state.fields).schedule.teams;
state.fields.results = `${teams[0]} 3 - 1 ${teams[1]}\n${teams[2]} 2 - 2 ${teams[3]}`;
const league = http.createServer(handler(state, () => {}, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }, () => Date.UTC(2026, 9, 1)));
await new Promise((r) => league.listen(0, "127.0.0.1", r));
const leagueBase = `http://127.0.0.1:${league.address().port}`;
const key = embedKey("adm");
const out = [];
for (const [label, q] of [["whole league", ""], ["one team, dark, club colour", "team=1&theme=dark&accent=c8102e&title=Spring%20League"], ["season view", "show=season"]]) {
  const club = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(`<!doctype html><title>Club</title><h1>Riverside Sports Club</h1><p>Our league:</p>${embedSnippet(leagueBase, key, q)}<p id="after">Footer</p>`); });
  // "localhost" vs 127.0.0.1: a different origin, as a real club site would be.
  await new Promise((r) => club.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${club.address().port}/`);
  const frame = page.frameLocator("iframe[data-lsg-embed]");
  await frame.locator("footer").waitFor();
  await page.waitForFunction(() => document.querySelector("iframe").style.height !== "600px", null, { timeout: 5000 }).catch(() => {});
  const h = await page.$eval("iframe", (f) => f.style.height);
  const inner = await frame.locator("html").evaluate((el) => el.scrollHeight - el.clientHeight);
  const headings = await frame.locator("h2").allTextContents();
  const bg = await frame.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
  const scrolls = await frame.locator("html").evaluate((el) => el.scrollWidth > el.clientWidth);
  out.push(`${label}: iframe ${h}, inner scroll ${inner}px; sections: ${headings.join(" | ")}; background ${bg}; sideways scroll ${scrolls ? "YES" : "no"}; console errors: ${errors.length ? errors.join("; ") : "none"}`);
  await browser.close();
  club.close();
}
league.close();
console.log(out.join("\n"));
