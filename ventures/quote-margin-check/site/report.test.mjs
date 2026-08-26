import test from "node:test";
import assert from "node:assert/strict";

import { loadQuote, calculate } from "./calc.mjs";
import { reportDocument } from "./report.mjs";

test("export contains inputs, arithmetic result, and disclaimer", () => {
  const quote = loadQuote({ currency: "USD", price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  const result = calculate(quote);
  const document = reportDocument(quote, result);

  assert.equal(document.product, "Quote Margin Check");
  assert.deepEqual(document.inputs, quote);
  assert.deepEqual(document.result, result);
  assert.match(document.disclaimer, /not tax, financial, or business advice/);
  assert.doesNotThrow(() => new Date(document.exported_at).toISOString());
});
