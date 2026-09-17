// The venture ships the same calculator twice: `src/quote_margin.py` for the
// CLI and `site/calc.mjs` for the browser page. Until this file existed,
// nothing checked that the two agree. Every other test pins one side against
// numbers hand-copied into the test on the day it was written, so a change to
// `load_quote()` or `calculate()` on either side left the other's tests green
// and shipped two calculators quietly disagreeing about the same quote.
//
// This runs the real CLI over the committed examples and requires the browser
// port to reproduce its JSON payload exactly -- inputs, the headline result,
// and all five sensitivity tables. Same IEEE-754 doubles, same order of
// operations on both sides, so the comparison is exact rather than epsilon
// based: a drift of one ulp is still a drift, and rounding for display is the
// formatter's job, not this file's.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  loadQuote,
  calculate,
  overrunScenarios,
  directCostSpikeScenarios,
  discountAskScenarios,
  targetRateLadder,
  compareBillingModels,
} from "./calc.mjs";

const ventureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(ventureRoot, "src", "quote_margin.py");
const examplesDir = path.join(ventureRoot, "examples");

/** The CLI's own JSON report for one quote file. */
function cliReport(quotePath) {
  return JSON.parse(execFileSync("python3", [cli, quotePath, "--format", "json"], { encoding: "utf-8" }));
}

/**
 * The same payload built from the browser port.
 *
 * Mirrors `sensitivity()` in quote_margin.py, which is the function that
 * exists precisely so the JSON, batch JSON, and Markdown reports cannot drift
 * apart. `survives_overrun_percent` is deliberately absent: it is a CLI-only
 * figure for sorting a folder of quotes, with no browser counterpart to
 * compare against, so asserting on it here would test nothing about the port.
 */
function browserReport(data) {
  const quote = loadQuote(data);
  const result = calculate(quote);
  return {
    inputs: quote,
    result,
    overrun_scenarios: overrunScenarios(quote, result),
    direct_cost_spikes: directCostSpikeScenarios(quote, result),
    discount_asks: discountAskScenarios(quote, result),
    target_rate_ladder: targetRateLadder(quote, result),
    billing_models: compareBillingModels(quote, result),
  };
}

const examples = readdirSync(examplesDir).filter((name) => name.endsWith(".json"));

// A venture with no committed example would make every assertion below vacuous
// and this file would go green while checking nothing.
test("there is at least one committed example to compare", () => {
  assert.ok(examples.length > 0, `no .json examples in ${examplesDir}`);
});

for (const name of examples) {
  test(`browser port matches the Python CLI for examples/${name}`, () => {
    const quotePath = path.join(examplesDir, name);
    const fromCli = cliReport(quotePath);
    const fromBrowser = browserReport(JSON.parse(readFileSync(quotePath, "utf-8")));

    for (const key of Object.keys(fromBrowser)) {
      assert.deepStrictEqual(fromBrowser[key], fromCli[key], `${key} differs between the browser port and the CLI`);
    }
  });
}

// The examples are all well-formed and profitable-ish, so on their own they
// would not catch a divergence that only shows up on an awkward quote. These
// cover the shapes a real visitor produces that no committed example does: a
// quote that misses its target, one with no optional costs at all, and a
// currency label the CLI has to quote.
const edgeCases = {
  "a quote that misses its target": {
    price: 800,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 120,
  },
  "a quote with no optional costs or hours": {
    price: 1000,
    delivery_hours: 10,
    target_hourly_rate: 100,
  },
  "a quote that clears its target with room to discount": {
    currency: "EUR",
    price: 9000,
    delivery_hours: 20,
    admin_hours: 2,
    overhead: 100,
    target_hourly_rate: 75,
  },
  "a currency label containing a comma and quotes": {
    currency: 'USD, "US"',
    price: 2400,
    delivery_hours: 24,
    target_hourly_rate: 75,
  },
};

for (const [label, data] of Object.entries(edgeCases)) {
  test(`browser port matches the Python CLI for ${label}`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "quote-margin-parity-"));
    try {
      const quotePath = path.join(dir, "quote.json");
      writeFileSync(quotePath, JSON.stringify(data));
      const fromCli = cliReport(quotePath);
      const fromBrowser = browserReport(data);
      for (const key of Object.keys(fromBrowser)) {
        assert.deepStrictEqual(fromBrowser[key], fromCli[key], `${key} differs between the browser port and the CLI`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
