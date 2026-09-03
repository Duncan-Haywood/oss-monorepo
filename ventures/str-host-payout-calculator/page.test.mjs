import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");
const rowTemplate = scriptSource.match(/<tr class="\$\{cls\}"[\s\S]*?<\/tr>/);

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the results row template exists", () => {
  assert.ok(rowTemplate, "could not find the per-channel <tr> template");
});

test("every results column has a cell, and every cell has a column", () => {
  const headers = [...markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim());
  const cells = (rowTemplate[0].match(/<t[hd][\s>]/g) || []).length;
  assert.ok(headers.length > 0, "no column headers found");
  assert.equal(
    cells,
    headers.length,
    `the results table declares ${headers.length} columns (${headers.join(" | ")}) but the row template emits ${cells} cells`,
  );
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");

  const claims = [
    ["annual take-home", /result\.annualPayout/],
    ["guest-paid total", /result\.guestPays/],
    ["effective host fee", /result\.effectiveHostFeeRate/],
    ["nightly raise to restore the old 3% payout", /restore\.newSubtotal/],
    ["direct-booking occupancy break-even", /directBreakEven/],
  ];

  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(
      scriptSource,
      rendered,
      `featureList advertises "${claim}" but the page never renders ${rendered}`,
    );
  }
});

test("the user-visible disclaimer and privacy line are in the footer", () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not legal, tax, financial, or business advice/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test("share encoding is the allowlisted numeric payload, not free text", () => {
  assert.match(scriptSource, /encodeComparison\(bookingInput\(\), state\)/);
  assert.equal(
    /encodeComparison\([^)]*(notes|address|listingName)/.test(scriptSource),
    false,
  );
});
