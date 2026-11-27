// The convert screen's row discount cell (pro/web/workspace-lib.mjs discountText, parseDiscount,
// withDiscount) on a real POST /v1/convert answer: what the reader found is shown, a corrected
// discount reaches the built e-invoice, and a typed value that cannot be read is never guessed.
// Fixture: pro/testdata/rechnung-zeilenrabatt-de.pdf (fictional firms). Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateInvoice } from "../generate.mjs";
import { draftFromPdf } from "./pdf-draft.mjs";
import { convertBlockers, discountText, parseDiscount, setPath, withDiscount } from "./web/workspace-lib.mjs";

const pdf = (name) => new Uint8Array(readFileSync(new URL(`./testdata/${name}`, import.meta.url)));

test("parseDiscount: a percent, an amount with a decimal comma or point, blank for none, nothing guessed", () => {
  assert.deepEqual(parseDiscount("10 %"), { percent: 10 });
  assert.deepEqual(parseDiscount("12,5%"), { percent: 12.5 });
  assert.deepEqual(parseDiscount(" 9,40 "), { amount: 9.4 });
  assert.deepEqual(parseDiscount("1 000.50"), { amount: 1000.5 });
  assert.equal(parseDiscount(""), null);
  assert.equal(parseDiscount("   "), null);
  for (const bad of ["0", "0 %", "-5", "-5 %", "101 %", "abc", "5 € off", "%", "1.2.3", "10 % 5"]) assert.equal(parseDiscount(bad), undefined, bad);
});

test("discountText and withDiscount: the reason is kept, and a line with several allowances is not editable", () => {
  assert.deepEqual(discountText({}), { text: "", editable: true });
  assert.deepEqual(discountText({ allowances: [{ reason: "Rabatt", percent: 10 }] }), { text: "10 %", editable: true });
  assert.deepEqual(discountText({ allowances: [{ reason: "Rabatt", amount: 9.4 }] }), { text: "9.4", editable: true });
  assert.deepEqual(discountText({ allowances: [{ reason: "A", percent: 5 }, { reason: "B", amount: 2 }] }), { text: "5 % + 2", editable: false });
  // A charge read from a line under the row is shown, and the cell is read-only.
  assert.deepEqual(discountText({ charges: [{ reason: "Eilzuschlag", amount: 15 }] }), { text: "+15", editable: false });
  assert.deepEqual(discountText({ allowances: [{ reason: "Rabatt", percent: 10 }], charges: [{ reason: "Zuschlag", percent: 2 }] }), { text: "10 % +2 %", editable: false });
  // The PDF's own word for the discount stays; a new discount takes the screen's word.
  assert.deepEqual(withDiscount({ allowances: [{ reason: "Nachlass", percent: 10 }] }, { amount: 3 }, "Rabatt"), [{ reason: "Nachlass", amount: 3 }]);
  assert.deepEqual(withDiscount({ quantity: 1 }, { percent: 5 }, "Remise"), [{ reason: "Remise", percent: 5 }]);
  // Percent replaced by an amount: the old percent does not linger and disagree with it.
  assert.equal("percent" in withDiscount({ allowances: [{ reason: "R", percent: 10 }] }, { amount: 3 }, "R")[0], false);
  assert.equal(withDiscount({ allowances: [{ reason: "R", percent: 10 }] }, null, "R"), undefined);
});

test("a row discount corrected on the convert screen reaches the e-invoice, and the totals check sees it", async () => {
  const conv = await draftFromPdf(pdf("rechnung-zeilenrabatt-de.pdf"));
  assert.deepEqual(conv.draft.lines.map((l) => discountText(l).text), ["10 %", "15 %", "", "9.4"]);
  let draft = setPath(conv.draft, "buyer.endpoint", { scheme: "EM", id: "rechnungseingang@wohnungsbau.example" });
  const asRead = generateInvoice(draft, { format: "cii", profile: "en16931" });
  assert.equal(asRead.ok, true, JSON.stringify(asRead.errors));
  assert.equal(asRead.totals.net, 965.85);
  assert.deepEqual(convertBlockers(conv, new Set(conv.toConfirm), asRead.totals).mismatches, []);

  // The first row's 10 % typed as 12 %: 24 x 8.40 = 201.60, 12 % = 24.19, so the net drops by 4.03.
  const edit = (d, i, raw) => setPath(d, `lines.${i}.allowances`, withDiscount(d.lines[i], /** @type {any} */ (parseDiscount(raw)), "Rabatt"));
  draft = edit(draft, 0, "12 %");
  assert.deepEqual(draft.lines[0].allowances, [{ reason: "Rabatt", percent: 12 }]);
  const changed = generateInvoice(draft, { format: "cii", profile: "en16931" });
  assert.equal(changed.ok, true, JSON.stringify(changed.errors));
  assert.equal(changed.totals.net, 961.82);
  assert.match(changed.xml, /<ram:CalculationPercent>12(?:\.00)?<\/ram:CalculationPercent>/);
  // The e-invoice no longer matches the printed PDF, so the download waits.
  assert.deepEqual(convertBlockers(conv, new Set(conv.toConfirm), changed.totals).mismatches.map((m) => m.id), ["net", "vat", "gross"]);

  // A discount added to the row that had none, and one removed: still a valid e-invoice.
  draft = edit(edit(draft, 2, "16"), 3, "");
  assert.deepEqual(draft.lines[2].allowances, [{ reason: "Rabatt", amount: 16 }]);
  assert.equal(draft.lines[3].allowances, undefined);
  const again = generateInvoice(draft, { format: "ubl", profile: "xrechnung" });
  assert.equal(again.ok, true, JSON.stringify(again.errors));
  assert.equal(again.totals.net, 955.22, "961.82 less the new 16.00, plus the 9.40 no longer taken off");
  // Other lines are untouched.
  assert.deepEqual(draft.lines[1].allowances, conv.draft.lines[1].allowances);
});
