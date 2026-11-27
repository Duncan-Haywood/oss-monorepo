// SPRS calculator: the same worked examples as apps/cmmc/src/shared/controls/scoring.test.ts, plus the
// Worker path that writes the result into the static page.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { browserSprs, build, SPRS_SCRIPT } from "../src/build.mjs";
import { launchState } from "../src/launch.mjs";
import {
  applyToPage,
  MIN_SCORE,
  parseQuery,
  REQUIREMENTS,
  RESULT_MARKER,
  score,
} from "../src/sprs.mjs";
import worker from "../src/worker.mjs";

const q = (nm = [], pc = []) =>
  parseQuery(new URLSearchParams([...nm.map((v) => ["nm", v]), ...pc.map((v) => ["pc", v])]));
const all = REQUIREMENTS.map((r) => r.nistId);

test("110 requirements; 42 five-point, 14 three-point (plus 2 partial-credit fives), 51 one-point, 3.12.4 none", () => {
  assert.equal(REQUIREMENTS.length, 110);
  const count = (w) => REQUIREMENTS.filter((r) => r.weight === w).length;
  assert.deepEqual([count(5), count(3), count(1), count(0)], [44, 14, 51, 1]);
  assert.equal(REQUIREMENTS.find((r) => r.nistId === "3.12.4").weight, 0);
  assert.equal(MIN_SCORE, -203);
});

test("nothing ticked: 110, all met", () => {
  const r = score(q());
  assert.equal(r.score, 110);
  assert.ok(r.allMet);
});

test("everything open except the SSP: -203", () => {
  assert.equal(score(q(all.filter((n) => n !== "3.12.4"))).score, -203);
});

test("no SSP: no score, provisional arithmetic kept", () => {
  const r = score(q(["3.12.4"]));
  assert.equal(r.score, null);
  assert.equal(r.provisional, 110);
  assert.equal(r.conditional.meets, false);
});

test("one 5, one 3 and two 1-point gaps: 100", () => {
  assert.equal(score(q(["3.1.1", "3.3.2", "3.1.8", "3.1.9"])).score, 100);
});

test("partial credits subtract 3, only for their own requirement and only when ticked", () => {
  assert.equal(score(q(["3.5.3"], ["3.5.3"])).score, 107);
  assert.equal(score(q(["3.5.3"])).score, 105);
  assert.equal(score(q(["3.13.11"], ["3.13.11"])).score, 107);
  assert.equal(score(q(["3.13.11"])).score, 105);
  assert.equal(score(q([], ["3.5.3"])).score, 110, "partial without not-met is ignored");
  assert.equal(score(q(["3.1.1"], ["3.1.1"])).score, 105, "no partial credit on other ids");
});

test("POA&M rules: 1-point gaps at 100 qualify; 87 does not; a 5-point gap blocks; 3.13.11 not-FIPS qualifies", () => {
  assert.ok(score(q(["3.1.8", "3.1.9"])).conditional.meets);
  const ones = REQUIREMENTS.filter(
    (r) => r.weight === 1 && !["3.1.20", "3.1.22", "3.10.3", "3.10.4", "3.10.5"].includes(r.nistId),
  );
  const r87 = score(q(ones.slice(0, 23).map((r) => r.nistId)));
  assert.equal(r87.score, 87);
  assert.equal(r87.conditional.meets, false);
  const r105 = score(q(["3.1.1"]));
  assert.equal(r105.score, 105);
  assert.equal(r105.conditional.meets, false);
  assert.ok(score(q(["3.13.11"], ["3.13.11"])).conditional.meets);
  assert.equal(score(q(["3.10.3"])).conditional.meets, false, "excluded 1-pointer");
});

test("unknown and repeated ids are ignored", () => {
  assert.equal(score(q(["3.1.1", "3.1.1", "9.9.9", "<script>"])).score, 105);
});

// The Worker-served (early-access) build: no scripts, the Worker scores the query.
const out = mkdtempSync(join(tmpdir(), "cmmc-sprs-"));
build({ outDir: out, launch: launchState({ appUrl: null }) });
const page = readFileSync(join(out, "sprs-score-calculator.html"), "utf8");

// The static (open) build: the same form, plus the browser copy of these functions.
const openOut = mkdtempSync(join(tmpdir(), "cmmc-sprs-open-"));
const openFiles = build({
  outDir: openOut,
  launch: launchState({ appUrl: "https://cmmc.example.com" }),
});
const openPage = openFiles["sprs-score-calculator.html"];

test("static build: the page loads sprs-page.js, which imports the built sprs.js", () => {
  assert.ok(openPage.includes(SPRS_SCRIPT));
  assert.equal((openPage.match(/name="nm"/g) ?? []).length, 110);
  assert.ok(openPage.includes(RESULT_MARKER));
  assert.match(openFiles["sprs-page.js"], /from "\.\/sprs\.js"/);
  assert.equal(openFiles["sprs.js"], browserSprs());
  assert.doesNotMatch(openFiles["sprs.js"], /^import /m, "no imports left: the data is inlined");
  // The submit button sends calc=1, so "nothing ticked" still has a query to score.
  assert.match(openPage, /<button type="submit" class="button" name="calc" value="1">/);
  for (const name of ["index.html", "pricing.html"])
    assert.ok(!openFiles[name].includes(SPRS_SCRIPT), `${name} loads no calculator script`);
});

test("the browser sprs.js scores exactly like sprs.mjs", async () => {
  const url = `data:text/javascript;base64,${Buffer.from(openFiles["sprs.js"]).toString("base64")}`;
  const browser = await import(url);
  assert.equal(browser.REQUIREMENTS.length, REQUIREMENTS.length);
  assert.equal(browser.MIN_SCORE, MIN_SCORE);
  for (const query of [
    "calc=1",
    "nm=3.5.3&pc=3.5.3&nm=3.1.8&calc=1",
    "nm=3.12.4",
    REQUIREMENTS.map((r) => `nm=${r.nistId}`).join("&"),
    "nm=3.13.11&pc=3.13.11&nm=3.1.20",
  ]) {
    const params = new URLSearchParams(query);
    const a = score(parseQuery(params));
    const b = browser.score(browser.parseQuery(params));
    assert.equal(b.score, a.score, query);
    assert.equal(
      browser.renderResult(b),
      applyToPage(RESULT_MARKER, params).replace(/\n<meta name="robots"[^>]*>/, ""),
      query,
    );
  }
});

test("nothing ticked still scores: calc=1 gives 110 with no POA&M needed", () => {
  const html = applyToPage(page, new URLSearchParams("calc=1"));
  assert.match(html, /<p class="score">110 /);
  assert.match(html, /a Final Level 2 \(Self\) self-assessment would need no POA&amp;M/);
});

test("built page: one checkbox per requirement, the marker, a GET form under the base path, no scripts", () => {
  assert.equal((page.match(/name="nm"/g) ?? []).length, 110);
  assert.equal((page.match(/name="pc"/g) ?? []).length, 2);
  assert.ok(page.includes(RESULT_MARKER));
  assert.match(
    page,
    /<form class="sprs" method="get" action="\/cmmc\/sprs-score-calculator#result">/,
  );
  assert.doesNotMatch(
    page.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ""),
    /<script/,
  );
});

test("applyToPage ticks the boxes, writes the result, adds noindex", () => {
  const html = applyToPage(page, new URLSearchParams("nm=3.5.3&pc=3.5.3&nm=3.1.8"));
  assert.match(html, /name="nm" value="3.5.3" checked>/);
  assert.match(html, /name="pc" value="3.5.3" checked>/);
  assert.match(html, /name="nm" value="3.1.8" checked>/);
  assert.doesNotMatch(html, /name="nm" value="3.1.1" checked>/);
  assert.match(html, /<p class="score">106 /);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.ok(!html.includes(RESULT_MARKER));
});

const env = {
  BASE_PATH: "/cmmc",
  SITE_URL: "https://marisstella.app/cmmc",
  ASSETS: {
    fetch: async (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/sprs-score-calculator")
        return new Response(page, { headers: { "Content-Type": "text/html", ETag: '"x"' } });
      return new Response("nope", { status: 404 });
    },
  },
};

test("Worker: query scored into the page, not cached, CSP kept; bare URL served as built", async () => {
  const res = await worker.fetch(
    new Request("https://marisstella.app/cmmc/sprs-score-calculator?nm=3.12.4"),
    env,
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("ETag"), null);
  assert.match(res.headers.get("Content-Security-Policy"), /default-src 'none'/);
  const body = await res.text();
  assert.match(body, /No score yet/);
  const bare = await worker.fetch(
    new Request("https://marisstella.app/cmmc/sprs-score-calculator"),
    env,
  );
  assert.equal(await bare.text(), page);
});
