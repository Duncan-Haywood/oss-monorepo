import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import * as E from "./engine.mjs";
import * as S from "./site.mjs";

const full = () => {
  const d = E.exampleDesk("2026-11-02");
  d.profile.site = {
    theme: "bright",
    url: "https://gracenotes.example/",
    towns: "Springfield, Riverside\nOak Hill",
    sitSteps: "Hello and handover: allergies, bedtime, emergency numbers\nPlay, homework or a craft\nDinner and bath\nBedtime routine\nA short note for you when you get home",
    firstSit: "I come 15 minutes early to meet the kids with you there.",
    safety: "No phone scrolling while kids are awake.",
    cancellation: "",
    payment: "Cash, Venmo or Zelle at the end of each sit.",
    sick: "Please tell me before I arrive if anyone has a fever; we can reschedule with no fee.",
    certs: "CPR and First Aid | 2026-03 | 2028-03\nLifeguard | 2022-06 | 2024-06",
    faq: "Do you drive kids? | Only with your car seats installed.\nno pipe here",
  };
  return d;
};

test("every theme meets WCAG AA contrast (4.5:1) for every text colour it draws", () => {
  assert.equal(Object.keys(S.THEMES).length, 3);
  for (const [name, t] of Object.entries(S.THEMES)) for (const { pair, ratio } of S.themePairs(t)) assert.ok(ratio >= 4.5, `${name}: ${pair} is ${ratio.toFixed(2)}`);
  assert.equal(Math.round(S.contrastRatio("#000000", "#ffffff")), 21);
  assert.equal(S.contrastRatio("#777777", "#777777"), 1);
});

test("the full example builds four pages, robots and a sitemap with absolute URLs", () => {
  const files = S.buildSiteFiles(full(), { today: "2026-11-02", formAction: "/inquiry" });
  assert.deepEqual(Object.keys(files).sort(), ["about.html", "faq.html", "index.html", "policies.html", "robots.txt", "sitemap.xml"]);
  assert.match(files["robots.txt"], /Sitemap: https:\/\/gracenotes\.example\/sitemap\.xml/);
  const locs = [...files["sitemap.xml"].matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, ["https://gracenotes.example/", "https://gracenotes.example/about.html", "https://gracenotes.example/policies.html", "https://gracenotes.example/faq.html"]);
  for (const f of ["index.html", "about.html", "policies.html", "faq.html"]) {
    assert.match(files[f], /<html lang="en">/);
    assert.match(files[f], /name="viewport"/);
    assert.match(files[f], /<link rel="canonical" href="https:\/\/gracenotes\.example\//);
    assert.match(files[f], /property="og:title"/);
    assert.match(files[f], /--accent:#0b6e4f/, `${f} uses the bright theme`);
  }
  assert.match(files["index.html"], /action="\/inquiry"/);
});

test("local SEO: title and description from town + babysitter, ChildCare JSON-LD with areaServed", () => {
  const files = S.buildSiteFiles(full(), { today: "2026-11-02" });
  const home = files["index.html"];
  assert.match(home, /<title>Grace Notes Babysitting: babysitter in Springfield<\/title>/);
  const desc = /<meta name="description" content="([^"]+)"/.exec(home)[1];
  assert.match(desc, /babysitter serving Springfield, Riverside, Oak Hill/);
  assert.ok(desc.length <= 160, desc);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(home)[1]);
  assert.equal(ld["@type"], "ChildCare");
  assert.deepEqual(ld.areaServed.map((a) => a.name), ["Springfield", "Riverside", "Oak Hill"]);
  assert.equal(ld.url, "https://gracenotes.example/");
  assert.equal(ld.priceRange, "$20/hour");
});

test("FAQ answers come only from the sitter's data and match the FAQPage JSON-LD", () => {
  const faq = S.buildSiteFiles(full(), { today: "2026-11-02" })["faq.html"];
  const blocks = [...faq.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const qa = blocks[1].mainEntity;
  assert.deepEqual(qa.map((q) => q.name), ["How much do you charge?", "What ages do you care for?", "Where do you babysit?", "How do you keep children safe?", "What happens at the first sit?", "What is your cancellation policy?", "How can I pay?", "What if my child is sick?", "Do you drive kids?"]);
  assert.match(qa[0].acceptedAnswer.text, /^\$20\/hour for one child, plus \$3\/hour/);
  // The cancellation answer falls back to the sitter's own rate card.
  assert.equal(qa[5].acceptedAnswer.text, "Cancelling with less than 24 hours' notice: 50% of the booked sit.");
  for (const q of qa) assert.ok(faq.includes(q.acceptedAnswer.text.replace(/'/g, "&#39;")), q.name);
});

test("certifications show their dates, and an expired one is hidden and flagged", () => {
  const d = full();
  const about = S.buildSiteFiles(d, { today: "2026-11-02" })["about.html"];
  assert.match(about, /CPR and First Aid, since March 2026 \(valid through March 2028\)/);
  assert.doesNotMatch(about, /Lifeguard/);
  assert.ok(S.siteGaps(d, { today: "2026-11-02" }).some((g) => /Lifeguard expired \(2024-06\)/.test(g)));
  assert.match(about, /<ol class="steps"><li>Hello and handover/);
  assert.equal(S.parseCerts("CPR | soon | 2028-03")[0].earned, "");
  assert.ok(S.certCurrent({ expires: "2026-11" }, "2026-11-30"));
  assert.ok(!S.certCurrent({ expires: "2026-11-01" }, "2026-11-02"));
});

test("empty fields hide sections: no towns, no sit steps, no policies, no faith, no sitemap", () => {
  const d = E.emptyDesk();
  d.profile.bio = "";
  d.profile.certifications = [];
  const files = S.buildSiteFiles(d);
  const all = Object.values(files).join("\n");
  assert.doesNotMatch(all, /Where I babysit|What a sit looks like|If your child is sick|Payment<|My faith|What families say|Certifications/);
  assert.equal(files["sitemap.xml"], undefined);
  assert.equal(files["about.html"], undefined);
  assert.doesNotMatch(files["index.html"], /href="about\.html"/, "no nav link to a page that was not built");
  assert.doesNotMatch(files["index.html"], /rel="canonical"/);
  assert.equal(files["robots.txt"], "User-agent: *\nAllow: /\n");
  assert.ok(S.siteGaps(d).length >= 5);
});

test("faith is the sitter's opt-in; profile text is escaped on every page", () => {
  const d = full();
  d.profile.site.towns = "<b>Town</b>";
  d.profile.site.faq = "<img src=x> | <script>x</script>";
  const all = Object.values(S.buildSiteFiles(d)).join("");
  assert.doesNotMatch(all, /<b>Town|<img src=x>|<script>x/);
  assert.match(all, /My faith/);
  d.profile.showFaith = false;
  assert.doesNotMatch(Object.values(S.buildSiteFiles(d)).join(""), /My faith|I&#39;m a Christian/);
});

test("engine.buildSite still returns the home page", () => {
  const d = full();
  assert.equal(E.buildSite(d, { formAction: "/x" }), S.buildSiteFiles(d, { formAction: "/x" })["index.html"]);
});

test("crc32 matches the standard check value and node's zlib", () => {
  const enc = new TextEncoder();
  assert.equal(S.crc32(enc.encode("123456789")), 0xcbf43926);
  const page = enc.encode(S.buildSiteFiles(full())["index.html"]);
  if (zlib.crc32) assert.equal(S.crc32(page), zlib.crc32(page));
});

// Read a zip back by its central directory, the way unzip tools do.
function readZip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22;
  assert.equal(v.getUint32(eocd, true), 0x06054b50);
  const count = v.getUint16(eocd + 10, true);
  let at = v.getUint32(eocd + 16, true);
  assert.equal(at + v.getUint32(eocd + 12, true), eocd, "central directory ends at the end record");
  const dec = new TextDecoder();
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(at, true), 0x02014b50);
    const crc = v.getUint32(at + 16, true), size = v.getUint32(at + 20, true), nlen = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true);
    const name = dec.decode(buf.subarray(at + 46, at + 46 + nlen));
    assert.equal(v.getUint32(local, true), 0x04034b50);
    assert.equal(v.getUint16(local + 8, true), 0, "stored, not deflated");
    const start = local + 30 + v.getUint16(local + 26, true);
    const data = buf.subarray(start, start + size);
    assert.equal(S.crc32(data), crc, name);
    out[name] = dec.decode(data);
    at += 46 + nlen;
  }
  return out;
}

test("zipFiles writes a store-only zip that reads back byte for byte", () => {
  const files = S.buildSiteFiles(full(), { today: "2026-11-02" });
  files["notes/é.txt"] = "unicode name ✓";
  const zip = S.zipFiles(files, new Date(Date.UTC(2026, 9, 30, 12, 34, 56)));
  assert.deepEqual(readZip(zip), files);
  const v = new DataView(zip.buffer);
  assert.equal(v.getUint16(12, true), ((2026 - 1980) << 9) | (10 << 5) | 30, "DOS date");
  assert.equal(v.getUint16(10, true), (12 << 11) | (34 << 5) | 28, "DOS time");
  assert.equal(S.zipFiles({}).length, 22, "an empty zip is just the end record");
});

test("the local checklist is plain steps with no promises about results", () => {
  assert.ok(S.LOCAL_CHECKLIST.length >= 6);
  for (const c of S.LOCAL_CHECKLIST) {
    assert.ok(c.id && c.title && c.steps.length > 40, c.id);
    assert.doesNotMatch(c.steps, /guarantee|rank (you )?(first|#1|higher)|more (clients|families|bookings)|boost/i, c.id);
  }
  for (const id of ["gbp", "nextdoor", "facebook", "church", "school"]) assert.ok(S.LOCAL_CHECKLIST.some((c) => c.id === id), id);
});
