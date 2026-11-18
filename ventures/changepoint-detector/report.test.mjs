import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, DEFAULTS } from "./engine.mjs";
import { changeReportHtml, chartSvg, safeColor, safeLogo } from "./report.mjs";
import { CHECKOUT_URL } from "./checkout.mjs";
import { buyLink, cleanKey, interpret, checkLicence } from "./licence.mjs";

const r = analyze({ csv: DEFAULTS.csv });

test("the report carries the chart, the changes, the segments and the assumptions", () => {
  const h = changeReportHtml(r, { title: "Nile flow", author: "A. Analyst", contact: "a@example.com", date: "2026-11-02" });
  assert.match(h, /<h1>Nile flow<\/h1>/);
  assert.ok(h.includes(chartSvg(r)));
  for (const c of r.pelt.changepoints) assert.ok(h.includes(`<td>${c.label}</td>`));
  assert.match(h, /does not show what caused the change/);
  assert.match(h, /no warranty/);
  assert.match(h, /A\. Analyst · 2026-11-02 · a@example\.com/);
});

test("typed text and series labels are escaped; colour and logo are restricted", () => {
  const evil = analyze({ csv: "when,v\n<img src=x onerror=1>,1\nb,1\nc,1\nd,1\ne,9\nf,9\ng,9\nh,9\n" });
  const h = changeReportHtml(evil, { title: "<script>x</script>", author: "<b>b</b>", contact: '"><i>', notes: "<u>n</u>", accent: "red;}</style><script>", logo: "data:image/svg+xml;base64,AAAA" });
  assert.ok(!h.includes("<script>") && !h.includes("<img src=x") && !h.includes("<b>b</b>") && !h.includes("<u>n</u>") && !h.includes("svg+xml"));
  assert.equal(safeColor("#12abEF"), "#12abEF");
  assert.equal(safeColor("red"), "#1f5f86");
  assert.ok(safeLogo("data:image/png;base64,iVBOR"));
  assert.equal(safeLogo("https://x.test/a.png"), "");
  assert.match(changeReportHtml(r, { logo: "data:image/png;base64,iVBORw0KGgo=", accent: "#aa0000" }), /<img class="logo" src="data:image\/png;base64,iVBORw0KGgo="[^>]*>.*--a:#aa0000|--a:#aa0000[\s\S]*<img class="logo"/);
});

test("a flat series says no change was found instead of an empty table", () => {
  const flat = analyze({ csv: "t,v\n" + Array.from({ length: 30 }, (_, i) => `${i},${10 + (i % 2) * 0.01}`).join("\n") });
  const h = changeReportHtml(flat, {});
  if (!flat.pelt.changepoints.length) assert.match(h, /No change was found/);
  assert.match(h, /<h1>Change report<\/h1>/);
});

test("the report stays dark until a checkout link is set, and unlock never throws", async () => {
  assert.equal(buyLink(CHECKOUT_URL), CHECKOUT_URL || null); // dark when empty, live when golive.py set a link
  assert.equal(buyLink("http://x.test"), null);
  assert.equal(cleanKey("short"), null);
  assert.equal(interpret({ valid: true, license_key: { status: "active" } }).valid, true);
  assert.equal(interpret({ valid: true, license_key: { status: "disabled" } }).valid, false);
  assert.equal(interpret(null).valid, false);
  assert.equal((await checkLicence("ABCD-1234-EFGH", { url: "" })).valid, false);
  const boom = async () => { throw new Error("offline"); };
  assert.equal((await checkLicence("ABCD-1234-EFGH", { url: "https://x.test/v", fetch: boom })).valid, false);
  const ok = async () => ({ json: async () => ({ valid: true, license_key: { status: "active" } }) });
  assert.equal((await checkLicence("ABCD-1234-EFGH", { url: "https://x.test/v", fetch: ok })).valid, true);
});

test("sample report is what the real report code produces, and the marketing page says it is not on sale", async () => {
  const { sampleReport } = await import("./build-sample-report.mjs");
  const { readFileSync } = await import("node:fs");
  assert.equal(readFileSync(new URL("./sample-change-report.html", import.meta.url), "utf8"), sampleReport());
  const p = readFileSync(new URL("./change-report-for-analysts.html", import.meta.url), "utf8");
  assert.match(p, /sample-change-report\.html/);
  assert.match(p, /not on sale yet/);
  assert.match(p, /No warranty/);
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /change-report-for-analysts/);
});

test("the report leads with the agreed changes when the page passes them, and escapes them", async () => {
  const { analyze, DEFAULTS } = await import("./engine.mjs");
  const { consensus, agreedText } = await import("./consensus.mjs");
  const r = analyze({ csv: DEFAULTS.csv });
  const h = changeReportHtml(r, { agreed: agreedText(consensus({ csv: DEFAULTS.csv })) });
  assert.match(h, /<h2>What changed<\/h2>\n<p class="agreed"><strong>Agreed changes:<\/strong> Every one of 6 settings agrees on 1 change: 1899 \(down\)/);
  assert.match(h, /<p>Level model alone: PELT splits/);
  assert.match(changeReportHtml(r, { agreed: "<b>x</b>" }), /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(changeReportHtml(r), /class="agreed"/);
});
