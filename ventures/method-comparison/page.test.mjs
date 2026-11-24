import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const stripTags = (s) => { let p; do { p = s; s = s.replace(/<[^>]+>/g, ""); } while (s !== p); return s; };

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not medical, laboratory accreditation, regulatory or other professional advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /a standard, accreditation body or regulator may require a different protocol/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with the authors of the cited papers/);
});

test("JSON-LD blocks parse and the FAQ matches the page", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
  const text = stripTags(html).replace(/&amp;/g, "&");
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(text.includes(q.acceptedAnswer.text), `answer to "${q.name}" is not shown on the page`);
  }
  assert.doesNotMatch(html, /AggregateRating|"Review"/);
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>Method Comparison Tool — Passing-Bablok, Deming regression and Bland-Altman/);
  assert.match(html, /<meta name="description" content="Free online method comparison[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 9);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*\\sfor="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, NETWORK);
  for (const f of ["engine.mjs", "example-data.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), NETWORK, f);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)=["']https?:/);
});

test("the module script imports only local files and parses", async () => {
  const html = page("index.html");
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]), ["./engine.mjs", "./example-data.mjs", "./usage.mjs"]);
  assert.doesNotMatch(page("engine.mjs"), /^\s*import\s/m);
  assert.doesNotThrow(() => new Function(scripts[0][1].replace(/^\s*import .*$/gm, "")));
  for (const m of html.matchAll(/import \{([^}]+)\} from "\.\/([\w-]+\.mjs)"/g)) {
    const mod = await import(`./${m[2]}`);
    for (const name of m[1].split(",").map((s) => s.trim())) assert.notEqual(mod[name], undefined, `${m[2]} ${name}`);
  }
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the examples are the data files, verbatim, and the page's worked example is the engine's", async () => {
  const { EXAMPLES, NHANES_BP, PEAK_FLOW } = await import("./example-data.mjs");
  const { analyze, SAMPLE_TEXT } = await import("./engine.mjs");
  assert.equal(NHANES_BP, page("data/nhanes-2017-2018-systolic.csv"));
  assert.equal(PEAK_FLOW, page("data/bland-altman-1986-peak-flow.csv"));
  assert.equal(EXAMPLES.lab.text, SAMPLE_TEXT);
  assert.match(EXAMPLES.lab.label, /Made-up/);
  const html = page("index.html");
  for (const k of ["bp", "peakflow", "lab"]) assert.match(html, new RegExp(`loadExample\\("${k}"\\)`));
  const source = page("data/SOURCE.md");
  for (const s of ["Public domain", "f98f1d9a4c18173e715c749b4294f6f1525140d5ad5751316bb17cc038fb3423", "9a7f4b6d0e327282b0032c94ab85936c9b1027e5e4d410bcda6af23f188665c4", "randomly assigned order", "10.1016/S0140-6736(86)90837-8"]) assert.ok(source.includes(s), s);
  const r = analyze({ text: NHANES_BP, decisionLevels: [130] });
  const ba = r.blandAltman, pb = r.passingBablok, d = r.deming, at = r.decision[0].deming;
  assert.equal(r.n, 4212);
  assert.match(html, /4,212 adults/);
  assert.match(html, new RegExp(`reads systolic pressure <strong>${(-ba.bias).toFixed(1)} mmHg lower</strong> on average \\(95% CI ${(-ba.biasCI[1]).toFixed(1)} to ${(-ba.biasCI[0]).toFixed(1)}\\)`));
  assert.match(html, new RegExp(`between <strong>${ba.lower.toFixed(1)} and \\+${ba.upper.toFixed(1)} mmHg</strong>`));
  assert.match(html, new RegExp(`slope of <strong>${r.ols.slope.toFixed(2)}</strong>, as if the cuff under-read high pressures by ${Math.round(100 * (1 - r.ols.slope))}%`));
  assert.match(html, new RegExp(`Passing-Bablok gives <strong>${pb.slope.toFixed(3)}</strong> \\(95% CI ${pb.slopeCI[0].toFixed(3)} to ${pb.slopeCI[1].toFixed(3)}\\) and Deming <strong>${d.slope.toFixed(3)}</strong> \\(${d.slopeCI[0].toFixed(3)} to ${d.slopeCI[1].toFixed(3)}\\)`));
  assert.match(html, new RegExp(`<strong>${(-at.bias).toFixed(1)} mmHg</strong> below mercury \\(${(-at.ci[1]).toFixed(1)} to ${(-at.ci[0]).toFixed(1)}\\)`));
  assert.match(html, new RegExp(`no curvature \\(p = ${r.cusum.p.toFixed(2)}\\)`));
  assert.equal((html.match(new RegExp(pb.N.toLocaleString("en-US"), "g")) || []).length, 3);
  assert.match(html, new RegExp(`slope is ${r.ols.slope.toFixed(2)} while Passing-Bablok and Deming give ${pb.slope.toFixed(2)}`));
});

test("the page's verification claims match the saved simulation and reference", () => {
  const html = page("index.html");
  const sim = JSON.parse(page("eval/simulation.json"));
  const ref = JSON.parse(page("eval/reference.json"));
  assert.match(html, new RegExp(`On ${sim.settings.datasets.toLocaleString("en-US")} simulated data sets of ${sim.settings.n} pairs`));
  assert.match(html, new RegExp(`${sim.constant.demingSlope}% \\(Deming\\) and ${sim.constant.passingBablokSlope}% \\(Passing-Bablok\\)`));
  assert.match(html, new RegExp(`at most ${Math.max(sim.constant.cusumRejectRate, sim.proportional.cusumRejectRate)}% false alarms`));
  assert.match(html, new RegExp(`caught a moderate curve ${sim.curved.cusumRejectRate}% of the time`));
  assert.match(html, new RegExp(`on ${ref.cases.length} generated data sets`));
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(html, /loadExample\("lab", true\)/, "the page's first render must not count as a use");
  assert.match(page("usage.mjs"), /"method-comparison-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/method-comparison\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: method-comparison$/m);
  assert.match(page("llms.txt"), /Passing-Bablok/);
});

test("the page cites every paper the engine implements, with BibTeX", async () => {
  const { PAPERS } = await import("./engine.mjs");
  const html = page("index.html");
  for (const p of PAPERS) {
    assert.ok(html.includes(`doi={${p.doi}}`), p.doi);
    assert.ok(html.includes(`https://doi.org/${p.doi}`), p.doi);
  }
  for (const s of ["inter-rater-agreement", "scale-reliability"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
});

test("the decision-level box goes to the engine as text, so 6,000 stays one level (red team 2026-11-17)", () => {
  const src = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(src, /o\.decisionLevels = \$\("#levels"\)\.value;/);
  assert.doesNotMatch(src, /#levels"\)\.value\.split\(/);
});

test("footer links the Gage R&R sibling", () => {
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/gage-rr\/"/);
});
