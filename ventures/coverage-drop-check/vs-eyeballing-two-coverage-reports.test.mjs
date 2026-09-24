import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { compareCoverage, summarizeCompare } from "./compare.mjs";

// The page's worked example is the exact 92% -> 81% drop the venture's own
// README and index.html already use to motivate the tool ("a PR that dropped
// coverage from 92% to 81% even though both numbers are above 80"). This
// builds two real Cobertura reports that produce that overall delta and
// asserts every number the page prints against compare.mjs, so the page
// cannot drift from what the tool actually computes.

function cobertura({ covered, valid, files }) {
  const classXml = files
    .map(({ filename, lines }) => {
      const body = lines.map(({ number, hits }) => `<line number="${number}" hits="${hits}"/>`).join("");
      return `<class name="${filename}" filename="${filename}"><lines>${body}</lines></class>`;
    })
    .join("");
  return `<?xml version="1.0"?>
<coverage line-rate="${valid ? covered / valid : 0}" lines-covered="${covered}" lines-valid="${valid}">
  <packages><package name="p"><classes>${classXml}</classes></package></packages>
</coverage>`;
}

function lines(total, hitCount) {
  const out = [];
  for (let n = 1; n <= total; n += 1) out.push({ number: n, hits: n <= hitCount ? 1 : 0 });
  return out;
}

// checkout.py is untouched by the PR (40/40 both times); payments.py is the
// file the PR actually weakens (52/60 -> 41/60). Summed, that is exactly
// 92/100 -> 81/100 overall.
const baselineXml = cobertura({
  covered: 92,
  valid: 100,
  files: [
    { filename: "checkout.py", lines: lines(40, 40) },
    { filename: "payments.py", lines: lines(60, 52) },
  ],
});
const currentXml = cobertura({
  covered: 81,
  valid: 100,
  files: [
    { filename: "checkout.py", lines: lines(40, 40) },
    { filename: "payments.py", lines: lines(60, 41) },
  ],
});

const result = compareCoverage(baselineXml, currentXml, { maxDropPct: 0 });

test("the worked example drops overall coverage by exactly 11.00 points, 92% to 81%", () => {
  assert.equal(result.baseline.lineRate, 0.92);
  assert.equal(result.current.lineRate, 0.81);
  assert.ok(Math.abs(result.dropPct - 11) < 1e-9);
  assert.equal(result.overallDropped, true);
  assert.equal(summarizeCompare(result).text, "Line coverage dropped 11.00 points (92.00% → 81.00%), past the 0 point allowance. 1 file(s) got worse.");
});

test("payments.py is the one file that moved, checkout.py did not", () => {
  assert.equal(result.droppedFiles.length, 1);
  const [dropped] = result.droppedFiles;
  assert.equal(dropped.filename, "payments.py");
  assert.ok(Math.abs(dropped.dropPct - 18.333333333333336) < 1e-9);
  assert.ok(Math.abs(dropped.baselineRate - 52 / 60) < 1e-9);
  assert.ok(Math.abs(dropped.currentRate - 41 / 60) < 1e-9);

  const checkout = result.files.find((f) => f.filename === "checkout.py");
  assert.equal(checkout.verdict, "unchanged");
  assert.equal(checkout.dropPct, 0);
});

const html = readFileSync(new URL("./vs-eyeballing-two-coverage-reports.html", import.meta.url), "utf8");

test("the page states the exact overall and per-file numbers the test computed above", () => {
  assert.match(html, /92(?:\.00)?%.{0,20}(?:&rarr;|&#8594;|to|&mdash;).{0,20}81(?:\.00)?%/s);
  assert.match(html, /11(?:\.00)? point/);
  assert.match(html, /payments\.py/);
  assert.match(html, /18\.33 point/);
  assert.match(html, /checkout\.py/);
});

test("the page names no company or product, and carries no trademark disclaimer", () => {
  assert.doesNotMatch(html, /not affiliated with/i);
});

test("the page carries the standard disclaimer and links back to the tool", () => {
  assert.match(html, /No warranty\.<\/strong>/);
  assert.match(html, /href="\.\/"|href="index\.html"/);
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test("FAQPage JSON-LD questions match the visible headings, and every answer appears verbatim as prose", () => {
  const faqMatch = html.match(/"@type":"FAQPage".*?<\/script>/s);
  assert.ok(faqMatch, "expected a FAQPage JSON-LD block");
  const faq = faqMatch[0];
  const questionRe = /"name":"([^"]+)","acceptedAnswer":\{"@type":"Answer","text":"([^"]+)"/g;
  let match;
  let count = 0;
  while ((match = questionRe.exec(faq))) {
    count += 1;
    const [, question, answer] = match;
    assert.match(html, new RegExp(`<h3>${question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h3>`));
    const plainAnswer = answer.replace(/\\"/g, '"');
    assert.ok(html.includes(plainAnswer), `answer for "${question}" is not visible verbatim as prose`);
  }
  assert.ok(count >= 3, "expected at least 3 FAQ entries");
});
