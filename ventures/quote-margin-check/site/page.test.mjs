import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.html"), "utf8");

test("browser page wires the fixed-vs-hourly comparison", () => {
  assert.match(page, /import \{[^}]*compareBillingModels[^}]*\} from "\.\/calc\.mjs"/);
  assert.match(page, /id="billing"/);
  assert.match(page, /id="billing-summary"/);
  assert.match(page, /Fixed quote vs hourly at your target/);
  assert.match(page, /recordEvent\("billing_model_compared"\)/);
  assert.match(page, /hourly_minus_fixed_at_planned_hours/);
});
