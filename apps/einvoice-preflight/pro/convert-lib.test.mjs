// The convert screen's pure helpers (pro/web/workspace-lib.mjs) on a real POST /v1/convert answer.
// Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateInvoice } from "../generate.mjs";
import { draftFromPdf } from "./pdf-draft.mjs";
import {
  CONVERT_GROUPS,
  convertBlockers,
  convertRows,
  endpointText,
  fromBase64,
  getPath,
  lineValue,
  parseEndpoint,
  setPath,
  shiftLineFields,
  shiftLinePaths,
  toBase64,
} from "./web/workspace-lib.mjs";

const pdf = (name) => new Uint8Array(readFileSync(new URL(`./testdata/${name}`, import.meta.url)));

test("convertRows: each value with its source line, marks and what the checker still needs", async () => {
  const conv = await draftFromPdf(pdf("rechnung-de.pdf"));
  const groups = convertRows(conv);
  assert.deepEqual(groups.map((g) => g.group), ["invoice", "seller", "buyer", "payment"]);
  const row = (path) => groups.flatMap((g) => g.rows).find((r) => r.path === path);
  assert.equal(row("number").value, "2026-0815");
  assert.equal(row("number").source.page, 1);
  assert.match(row("number").source.line, /2026-0815/);
  assert.equal(row("number").check, false);
  assert.equal(row("buyer.name").check, true, "the address block is a judgment call");
  assert.equal(row("buyer.endpoint").missing, true, "no VAT ID or e-invoice address on the PDF");
  assert.equal(row("buyer.endpoint").source, null);
  assert.equal(row("buyer_reference").value, "");
  // Filling the address clears "needed".
  const filled = { ...conv, draft: setPath(conv.draft, "buyer.endpoint", { scheme: "EM", id: "ap@x.example" }) };
  const after = convertRows(filled).flatMap((g) => g.rows).find((r) => r.path === "buyer.endpoint");
  assert.equal(after.missing, false);
  assert.equal(after.value, "ap@x.example");
  // Every path the reader can set on a single value is on the screen.
  const shown = new Set(CONVERT_GROUPS.flatMap(([, items]) => items.map(([p]) => p)));
  for (const f of conv.fields) if (!f.path.startsWith("lines.")) assert.ok(shown.has(f.path), `${f.path} is shown`);
});

test("convertBlockers: unconfirmed marks and totals that differ from the PDF block the download", async () => {
  const conv = await draftFromPdf(pdf("rechnung-de.pdf"));
  const totals = { net: conv.printedTotals.net, tax: conv.printedTotals.vat, gross: conv.printedTotals.gross };
  assert.equal(convertBlockers(conv, new Set()).unconfirmed.length, conv.toConfirm.length);
  const all = new Set(conv.toConfirm);
  assert.deepEqual(convertBlockers(conv, all, totals), { unconfirmed: [], mismatches: [] });
  const off = convertBlockers(conv, all, { ...totals, net: totals.net - 1, gross: totals.gross - 1.19 });
  assert.deepEqual(off.mismatches.map((m) => m.id), ["net", "gross"]);
  assert.equal(off.mismatches[0].pdf, conv.printedTotals.net);
  // A PDF that prints no totals cannot be compared, and is not blocked for it.
  assert.deepEqual(convertBlockers({ toConfirm: [], printedTotals: { net: null, vat: null, gross: null } }, new Set(), totals).mismatches, []);
});

test("parseEndpoint takes an e-mail or a Peppol ID, refuses the rest", () => {
  assert.deepEqual(parseEndpoint("ap@them.example"), { scheme: "EM", id: "ap@them.example" });
  assert.deepEqual(parseEndpoint(" 0204:991-01234-56 "), { scheme: "0204", id: "991-01234-56" });
  assert.deepEqual(parseEndpoint("9930:DE136695976"), { scheme: "9930", id: "DE136695976" });
  assert.equal(parseEndpoint(""), undefined);
  assert.equal(parseEndpoint("Muster KG"), null);
  assert.equal(parseEndpoint("12:abc"), null);
  assert.equal(endpointText({ scheme: "EM", id: "a@b.example" }), "a@b.example");
  assert.equal(endpointText({ scheme: "0204", id: "991-1" }), "0204:991-1");
  assert.equal(endpointText(null), "");
});

test("setPath copies, removes blanks and refuses prototype keys", () => {
  const d = { seller: { name: "A" } };
  const e = setPath(d, "seller.contact.email", "x@y.example");
  assert.equal(d.seller.contact, undefined, "the original is untouched");
  assert.equal(getPath(e, "seller.contact.email"), "x@y.example");
  assert.equal(getPath(setPath(e, "seller.name", ""), "seller.name"), undefined);
  assert.throws(() => setPath(d, "__proto__.polluted", 1));
  assert.throws(() => setPath(d, "seller.constructor.prototype", 1));
  assert.equal({}.polluted, undefined);
});

test("lineValue reads decimal commas and never turns a blank into 0", () => {
  assert.equal(lineValue("quantity", "12,5"), 12.5);
  assert.equal(lineValue("unit_price", "1850"), 1850);
  assert.equal(lineValue("unit_price", ""), undefined);
  assert.equal(lineValue("tax_percent", "19 %"), undefined);
  assert.equal(lineValue("description", "  Pose  "), "Pose");
  assert.equal(lineValue("unit", ""), undefined);
});

test("shiftLinePaths and shiftLineFields follow a removed line", () => {
  assert.deepEqual(shiftLinePaths(["seller.name", "lines.0", "lines.1", "lines.2", "lines.2.unit"], 1), ["seller.name", "lines.0", "lines.1", "lines.1.unit"]);
  assert.deepEqual(shiftLineFields([{ path: "lines.0", line: "a" }, { path: "lines.1", line: "b" }], 0), [{ path: "lines.0", line: "b" }]);
});

test("fromBase64 inverts toBase64", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 37, 80, 68, 70]);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test("convertBlockers on a PDF with a discount and a charge: the printed net is the e-invoice's taxable amount", async () => {
  const conv = await draftFromPdf(pdf("rechnung-rabatt-de.pdf"));
  const draft = setPath(conv.draft, "buyer.endpoint", { scheme: "EM", id: "ap@x.example" });
  const built = generateInvoice(draft, { format: "cii", profile: "en16931" });
  assert.equal(built.ok, true, JSON.stringify(built.errors));
  assert.equal(built.totals.net, 2191.8, "the rows' total (BT-106)");
  assert.equal(built.totals.taxable, 2161.05, "after the discount and the charge (BT-109)");
  assert.deepEqual(convertBlockers(conv, new Set(conv.toConfirm), built.totals), { unconfirmed: [], mismatches: [] });
  // The discount and the charge are marked, so the download waits for them to be confirmed.
  assert.ok(convertBlockers(conv, new Set()).unconfirmed.includes("allowances.0"));
  // Removing the discount on the screen: the built file no longer carries the PDF's amounts.
  const without = generateInvoice(setPath(draft, "allowances", undefined), { format: "cii", profile: "en16931" });
  assert.deepEqual(convertBlockers(conv, new Set(conv.toConfirm), without.totals).mismatches.map((m) => m.id), ["net", "vat", "gross"]);
});

test("shiftLinePaths follows a removed discount or charge and leaves the lines alone", () => {
  assert.deepEqual(shiftLinePaths(["lines.0", "charges.0", "charges.1", "charges.1.tax_percent"], 0, "charges"), ["lines.0", "charges.0", "charges.0.tax_percent"]);
  assert.deepEqual(shiftLineFields([{ path: "allowances.1", line: "x" }, { path: "lines.1" }], 0, "allowances"), [{ path: "allowances.0", line: "x" }, { path: "lines.1" }]);
});
