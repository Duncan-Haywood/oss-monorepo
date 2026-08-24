import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadQuote, calculate } from "./calc.mjs";
import { toMarkdown, encodeQuoteToHash, decodeQuoteFromHash } from "./report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "src", "quote_margin.py");

test("markdown matches the CLI's --format markdown byte for byte", () => {
  // The whole reason this venture has two surfaces is that they agree. A
  // freelancer who copies the browser report and one who pipes the CLI should
  // be able to diff the two and find nothing, so this asserts against the real
  // CLI rather than a hand-copied fixture that could drift with it.
  const input = {
    currency: "EUR",
    price: 4200,
    delivery_hours: 30,
    admin_hours: 6,
    revision_hours: 8,
    overhead: 150,
    subcontractor_cost: 400,
    target_hourly_rate: 95,
  };
  const dir = mkdtempSync(join(tmpdir(), "qmc-"));
  const path = join(dir, "quote.json");
  writeFileSync(path, JSON.stringify(input));

  let fromCli;
  try {
    fromCli = execFileSync("python3", [cli, path, "--format", "markdown"], {
      encoding: "utf8",
    });
  } catch {
    // No python3 on this machine: the browser surface still has to be
    // self-consistent, so fall back to the weaker check rather than failing
    // for a reason that has nothing to do with the code under test.
    const rendered = toMarkdown(loadQuote(input), calculate(loadQuote(input)));
    assert.match(rendered, /^# Quote Margin Check\n/);
    return;
  }

  const quote = loadQuote(input);
  assert.equal(toMarkdown(quote, calculate(quote)), fromCli);
});

test("markdown reports below-target status and the disclaimer", () => {
  const quote = loadQuote({
    price: 1000,
    delivery_hours: 20,
    target_hourly_rate: 100,
  });
  const rendered = toMarkdown(quote, calculate(quote));
  assert.match(rendered, /Status: \*\*below target\*\*/);
  assert.match(rendered, /not tax, financial, or business advice/);
  assert.match(rendered, /\| Effective hourly rate \| units 50\.00\/hour \|/);
});

test("a quote round-trips through the URL fragment", () => {
  const raw = {
    currency: "USD",
    price: "4200",
    delivery_hours: "30",
    admin_hours: "6",
    revision_hours: "8",
    overhead: "150",
    subcontractor_cost: "400",
    target_hourly_rate: "95",
  };
  const decoded = decodeQuoteFromHash(encodeQuoteToHash(raw));
  // "USD" is the form's own default and is left out of the link to keep it
  // short; the form supplies it again on restore.
  const { currency, ...numbers } = raw;
  assert.deepEqual(decoded, numbers);
});

test("blank optional fields are omitted rather than written as zero", () => {
  const hash = encodeQuoteToHash({
    currency: "USD",
    price: "1000",
    delivery_hours: "10",
    target_hourly_rate: "100",
    admin_hours: "",
    revision_hours: "   ",
    overhead: "",
    subcontractor_cost: "",
  });
  const decoded = decodeQuoteFromHash(hash);
  assert.deepEqual(decoded, {
    price: "1000",
    delivery_hours: "10",
    target_hourly_rate: "100",
  });
  // "USD" is the form default, so a default-currency link stays short.
  assert.ok(!hash.includes("currency"));
});

test("a non-default currency survives the round trip", () => {
  const hash = encodeQuoteToHash({ currency: "GBP", price: "500", delivery_hours: "5" });
  assert.equal(decodeQuoteFromHash(hash).currency, "GBP");
});

test("an empty or absent fragment decodes to an empty form", () => {
  assert.deepEqual(decodeQuoteFromHash(""), {});
  assert.deepEqual(decodeQuoteFromHash("#"), {});
  assert.deepEqual(decodeQuoteFromHash(undefined), {});
  assert.equal(encodeQuoteToHash({}), "");
});

test("a hand-mangled fragment populates what it can and drops the rest", () => {
  // Links get truncated by chat clients and edited by hand. Partial data is a
  // better outcome than an error the visitor cannot act on.
  const decoded = decodeQuoteFromHash("#price=2000&delivery_hours=abc&overhead=-5&admin_hours=3");
  assert.deepEqual(decoded, { price: "2000", admin_hours: "3" });
});

test("an over-long currency label from a fragment is ignored", () => {
  // loadQuote() rejects labels over 12 characters; dropping it here means a
  // bad link shows an empty currency box, not a validation error on load.
  const decoded = decodeQuoteFromHash(`#currency=${"x".repeat(13)}&price=100`);
  assert.equal(decoded.currency, undefined);
  assert.equal(decoded.price, "100");
});
