import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { buildSite, checkSite, THEMES, textPairs, contrast, themeFor, safeUrl, parseLines, toLines, pagesFor } from "./site.mjs";
import { DEMOS } from "./build.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const abbey = JSON.parse(read("examples/abbey.json"));
const sisters = JSON.parse(read("examples/sisters.json"));
const minimal = { community: { name: "Carmel of Saint Joseph", kind: "nuns" }, contact: { email: "carmel@example.org" } };
const html = (files) => [...files].filter(([n]) => n.endsWith(".html"));

test("every palette reaches WCAG AA contrast for every pair text is drawn in", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const [fg, bg, where] of textPairs(t)) assert.ok(contrast(fg, bg) >= 4.5, `${name} ${where}: ${contrast(fg, bg).toFixed(2)}`);
  }
});

test("contrast matches known values", () => {
  assert.equal(contrast("#000000", "#ffffff").toFixed(1), "21.0");
  assert.equal(contrast("#777777", "#ffffff").toFixed(2), "4.48");
});

test("a custom accent replaces the palette's and a weak one is flagged", () => {
  assert.equal(themeFor({ site: { theme: "marian", accent: "#123456" } }).accent, "#123456");
  const f = checkSite({ ...minimal, site: { accent: "#f5d76e" } });
  assert.ok(f.some((x) => x.level === "medium" && /contrast/.test(x.message)));
  assert.ok(!checkSite({ ...minimal, site: { accent: "#5a1a1a" } }).some((x) => /contrast/.test(x.message)));
});

test("the examples build every page, and each page is well formed", () => {
  for (const config of [abbey, sisters]) {
    const { files } = buildSite(config);
    for (const p of ["index.html", "about.html", "horarium.html", "vocations.html", "give.html", "visit.html", "prayer.html", "contact.html", "privacy.html", "404.html", "sitemap.xml", "robots.txt", "llms.txt"]) assert.ok(files.has(p), p);
    for (const [name, page] of html(files)) {
      assert.match(page, /^<!doctype html>\n<html lang="en">/, name);
      assert.match(page, /<meta name="viewport"/, name);
      const title = /<title>([^<]+)<\/title>/.exec(page)[1];
      assert.ok(title.length > 5 && title.length < 120, `${name} title`);
      const desc = /<meta name="description" content="([^"]*)"/.exec(page)[1];
      assert.ok(desc.length > 20 && desc.length <= 170, `${name} description ${desc.length}`);
      assert.equal((page.match(/<h1>/g) || []).length, 1, `${name} has one h1`);
      assert.match(page, /<main id="main">/, name);
    }
  }
});

test("every internal link and anchor resolves", () => {
  for (const config of [abbey, sisters, minimal]) {
    const { files } = buildSite(config);
    for (const [name, page] of html(files)) {
      for (const [, href] of page.matchAll(/href="([^"]+)"/g)) {
        if (/^(https?:|mailto:|tel:|data:)/.test(href)) continue;
        const [file, anchor] = href.split("#");
        const target = file || name;
        assert.ok(files.has(target), `${name} links to missing ${href}`);
        if (anchor) assert.match(files.get(target), new RegExp(`id="${anchor}"`), `${name} anchor ${href}`);
      }
    }
  }
});

test("every form control has a label and ids are unique on a page", () => {
  const { files } = buildSite(abbey);
  for (const [name, page] of html(files)) {
    const ids = [...page.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${name} duplicate ids`);
    for (const [, id] of page.matchAll(/<(?:input|select|textarea)[^>]* id="([^"]+)"/g)) {
      assert.ok(page.includes(`<label for="${id}"`) || new RegExp(`<label class="check"><input type="checkbox" id="${id}"`).test(page), `${name} ${id} unlabelled`);
    }
  }
});

test("structured data parses and describes the community, events and FAQ", () => {
  const { files } = buildSite(abbey);
  const blocks = (p) => [...files.get(p).matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const org = blocks("index.html")[0];
  assert.deepEqual(org["@type"], ["Organization", "PlaceOfWorship"]);
  assert.equal(org.name, "Saint Aelred's Abbey");
  assert.equal(org.address.addressLocality, "Larkspur Hollow");
  assert.equal(org.potentialAction["@type"], "DonateAction");
  const events = blocks("events.html");
  assert.equal(events.length, 3);
  assert.equal(events[0].startDate, "2026-12-05");
  const faq = blocks("vocations.html").find((b) => b["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, abbey.vocations.faq.length);
  // the FAQ answers in the data are the ones on the page
  for (const q of faq.mainEntity) assert.ok(files.get("vocations.html").includes(q.name.replace(/'/g, "&#39;")), q.name);
});

test("what a community types is escaped, and unsafe links are dropped", () => {
  const evil = {
    community: { name: `<script>alert("x")</script>`, tagline: `"><img src=x onerror=alert(1)>` },
    contact: { email: "a@example.org" },
    giving: { online: [{ label: "Give", url: "javascript:alert(1)" }] },
    social: [{ label: "x", url: "data:text/html,hi" }],
    news: [{ title: "</title><script>", date: "2026-01-01", body: ["<b>bold</b>"] }],
  };
  const { files } = buildSite(evil);
  for (const [name, page] of html(files)) {
    assert.ok(!page.includes(`<script>alert`), name);
    assert.ok(!page.includes("<img src=x"), name);
    assert.ok(!/<a href="(javascript|data):/.test(page), name);
    assert.ok(!page.includes("<b>bold</b>"), name);
  }
  const f = checkSite(evil);
  assert.ok(f.some((x) => x.level === "high" && /not a web address/.test(x.message)));
  assert.ok(f.some((x) => x.level === "high" && /url "data:/.test(x.message)));
  assert.equal(safeUrl("JavaScript:alert(1)"), "");
  assert.equal(safeUrl("//evil.example"), "");
  assert.equal(safeUrl("give.html#monthly"), "give.html#monthly");
});

test("generated pages load nothing from elsewhere: no scripts, styles or fonts by URL", () => {
  for (const config of [abbey, sisters]) {
    for (const [name, page] of html(buildSite(config).files)) {
      assert.doesNotMatch(page, /<script[^>]+src=/, name);
      assert.doesNotMatch(page, /<link[^>]+rel="stylesheet"/, name);
      assert.doesNotMatch(page, /@import|fonts\.googleapis/, name);
      assert.doesNotMatch(page, /document\.cookie|localStorage/, name);
    }
  }
});

test("a page with nothing to say is left out, and the essentials stay", () => {
  const paths = pagesFor(minimal).map((p) => p.path);
  assert.deepEqual(paths, ["index.html", "about.html", "vocations.html", "prayer.html", "give.html", "contact.html", "privacy.html"]);
  const off = pagesFor({ ...minimal, giving: false, vocations: false, prayer: false }).map((p) => p.path);
  assert.ok(!off.includes("give.html") && !off.includes("vocations.html") && !off.includes("prayer.html"));
  const { files } = buildSite({ ...minimal, giving: false });
  assert.ok(![...files.values()].some((p) => typeof p === "string" && p.includes('href="give.html"')));
});

test("forms post to a form service when one is set, and open email otherwise", () => {
  const mail = buildSite(abbey).files.get("vocations.html");
  assert.match(mail, /<form class="site card" id="vocation" action="mailto:vocations@example.org"[^>]*data-mailto="vocations@example.org"/);
  const svc = buildSite({ ...abbey, forms: { action: "https://forms.example.org/f/abc" } }).files.get("vocations.html");
  assert.match(svc, /id="vocation" action="https:\/\/forms.example.org\/f\/abc" method="post"/);
  assert.doesNotMatch(svc, /<form[^>]*data-mailto/);
  assert.match(svc, /name="_gotcha"/);
  assert.ok(checkSite({ ...minimal, forms: { action: "http://insecure.example.org" } }).some((x) => x.level === "high" && /forms.action/.test(x.message)));
});

test("the giving page shows every way to give and never writes a tax claim itself", () => {
  const g = buildSite(abbey).files.get("give.html");
  for (const s of ["https://example.org/give", "Monthly gifts", "payable to <strong>Saint Aelred&#39;s Abbey</strong>", "Mass intentions", "Care of our elderly monks", "Legal name:", "$152,000 of $400,000 as of 1 October 2026"]) assert.ok(g.includes(s), s);
  const plain = buildSite(minimal).files.get("give.html");
  assert.doesNotMatch(plain, /tax[- ]deductible|501\(c\)/i);
});

test("the launch checklist catches what a donor or discerner would trip on", () => {
  const level = (f, re) => f.find((x) => re.test(x.message))?.level;
  const empty = checkSite({});
  assert.equal(level(empty, /no name/), "high");
  assert.equal(level(empty, /No general email/), "high");
  const g = checkSite({ ...minimal, giving: { online: [{ label: "Give", url: "http://example.org/give" }], campaign: { name: "Roof", goal: 10, raised: 5 } } });
  assert.equal(level(g, /not https/), "high");
  assert.equal(level(g, /monthly giving/), "medium");
  assert.equal(level(g, /no date/), "medium");
  assert.equal(level(checkSite(minimal), /No online giving link/), "high");
  assert.equal(level(checkSite({ ...minimal, events: [{ name: "Feast", start: "next week" }] }), /no start date/), "medium");
  assert.equal(level(checkSite({ ...minimal, images: { hero: { src: "images/hero.jpg" } } }), /hero photograph has no description/), "medium");
  // the examples have only polish left
  for (const c of [abbey, sisters]) assert.ok(checkSite(c).every((x) => x.level === "low"), JSON.stringify(checkSite(c).filter((x) => x.level !== "low")));
});

test("the same config always builds the same site", () => {
  const a = buildSite(abbey).files, b = buildSite(structuredClone(abbey)).files;
  assert.deepEqual([...a.keys()], [...b.keys()]);
  for (const [k, v] of a) assert.equal(b.get(k), v, k);
});

test("the sitemap and llms.txt list every page, with full URLs once site.url is set", () => {
  const { files, pages } = buildSite({ ...abbey, site: { ...abbey.site, url: "https://abbey.example.org/" } });
  const sm = files.get("sitemap.xml");
  for (const p of pages) assert.ok(sm.includes(`https://abbey.example.org/${p.path === "index.html" ? "" : p.path}</loc>`), p.path);
  assert.match(files.get("robots.txt"), /Sitemap: https:\/\/abbey.example.org\/sitemap.xml/);
  assert.match(files.get("index.html"), /<link rel="canonical" href="https:\/\/abbey.example.org\/">/);
  for (const p of pages) assert.ok(files.get("llms.txt").includes(`](${p.path})`), p.path);
});

test("the one-per-line lists round-trip between the builder form and the config", () => {
  const items = parseLines("4:30 am | Vigils | public\n7:00 am | Mass | public\n8:15 am | Work\n", ["time", "name", "public"]);
  assert.deepEqual(items, [{ time: "4:30 am", name: "Vigils", public: true }, { time: "7:00 am", name: "Mass", public: true }, { time: "8:15 am", name: "Work" }]);
  assert.deepEqual(parseLines(toLines(items, ["time", "name", "public"]), ["time", "name", "public"]), items);
  // the last field keeps any further bars, so an answer may contain one
  assert.deepEqual(parseLines("Q? | yes | and no", ["q", "a"]), [{ q: "Q?", a: "yes | and no" }]);
  // an empty middle field is skipped, not shifted
  assert.deepEqual(parseLines("2026-12-05 |  | Advent day | Talks", ["start", "end", "name", "text"]), [{ start: "2026-12-05", name: "Advent day", text: "Talks" }]);
  assert.deepEqual(parseLines("Give | https://x.example/give | monthly", ["label", "url", "recurring"]), [{ label: "Give", url: "https://x.example/give", recurring: true }]);
});

test("the committed demo sites are what the engine builds now (run node build.mjs --demo)", () => {
  for (const [name, file] of Object.entries(DEMOS)) {
    const { files } = buildSite(JSON.parse(read(file)));
    const dir = new URL(`demo/${name}/`, import.meta.url);
    assert.ok(existsSync(dir), `demo/${name} missing`);
    assert.deepEqual(readdirSync(dir).sort(), [...files.keys()].sort(), name);
    for (const [k, v] of files) assert.equal(readFileSync(new URL(k, dir), "utf8"), v, `demo/${name}/${k} is stale`);
  }
});

test("the example sites say on every page that they are fictional", () => {
  for (const c of [abbey, sisters]) for (const [name, page] of html(buildSite(c).files)) assert.match(page, /made-up example community/, name);
  assert.ok(![...html(buildSite(minimal).files)].some(([, p]) => /made-up example/.test(p)));
});

test("no generated page skips a heading level, and every table has header cells, whatever sections are filled", () => {
  const sparse = { ...minimal, events: [{ name: "Feast", start: "2027-01-01" }], shop: { items: [{ name: "Bread" }] }, visit: { guesthouse: { text: "Rooms" } }, about: { values: [{ title: "Prayer" }] }, horarium: { days: [{ label: "Daily", items: [{ time: "6:00", name: "Lauds", public: true }] }] } };
  for (const config of [abbey, sisters, minimal, sparse]) {
    for (const [name, page] of html(buildSite(config).files)) {
      let last = 0;
      for (const [, lvl] of page.matchAll(/<h([1-6])[\s>]/g)) {
        const n = Number(lvl);
        assert.ok(n <= last + 1 || last === 0, `${name}: h${last} then h${n}`);
        last = n;
      }
      for (const [table] of page.matchAll(/<table[\s\S]*?<\/table>/g)) assert.match(table, /<th[\s>]/, `${name}: table with no <th>`);
    }
  }
});
