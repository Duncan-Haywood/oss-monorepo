// HU-036 / HU-037: a Hungarian base invoice and its modifications, checked as a chain (what NAV
// checks against its invoice store). The files are NAV's own: base invoice ZZZ000001, its
// modification 1 (one new line) and modification 2 (six new lines that bring the chain to zero:
// "Modositas es ervenytelenites", modification and cancellation), and a line-data modification.
// Each test seeds one fault and expects the code the 2026.02.12 specification gives for it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNavChains, navChainEntries, NAV_CHAIN_CODES } from "./hungary-nav-chain.mjs";
import { preflightDocuments } from "./report.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/hungary-nav/${f}`, import.meta.url), "utf8");
const base = read("chain-base.xml"); // ZZZ000001, issued 2021-05-15, delivered 2021-05-10, net 5,500,000, VAT 1,485,000
const mod1 = read("chain-modify-1.xml"); // index 1, issued 2021-05-20, creates line 6, net -2,200,000, VAT -594,000
const cancel2 = read("chain-cancel-2.xml"); // index 2, issued 2021-05-25, creates lines 7-12, net -3,300,000, VAT -891,000
const lineModify = read("chain-line-modify.xml"); // index 1, lineOperation MODIFY on line 1
const once = (xml, from, to) => {
  assert.equal(xml.split(from).length, 2, `"${from}" must occur once`);
  return xml.replace(from, to);
};
const run = (...files) => checkNavChains(files.map(([name, source, operation]) => ({ name, source, operation })));
const codes = (r, file) => (r.byFile.get(file) || []).map((f) => f.nav);
const chain = (m2 = cancel2, op2 = "STORNO", m1 = mod1) => run(["base.xml", base], ["m1.xml", m1, "MODIFY"], ["m2.xml", m2, op2]);
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const request = (...ops) => `<?xml version="1.0" encoding="UTF-8"?><ManageInvoiceRequest xmlns="http://schemas.nav.gov.hu/OSA/3.0/api"><invoiceOperations><compressedContent>false</compressedContent>${ops.map(([op, xml], i) => `<invoiceOperation><index>${i + 1}</index><invoiceOperation>${op}</invoiceOperation><invoiceData>${b64(xml)}</invoiceData></invoiceOperation>`).join("")}</invoiceOperations></ManageInvoiceRequest>`;

test("NAV's own chain is clean: the cancellation brings net, VAT and HUF VAT to zero", () => {
  const r = chain();
  assert.deepEqual([...r.byFile.values()].flat(), []);
  assert.deepEqual(r.chains, [{ base: "base.xml", invoiceNumber: "ZZZ000001", members: [{ file: "m1.xml", index: 1, operation: "MODIFY" }, { file: "m2.xml", index: 2, operation: "STORNO" }] }]);
  assert.deepEqual(r.skipped, []);
  const lm = run(["base.xml", base], ["lm.xml", lineModify, "MODIFY"]);
  assert.deepEqual([...lm.byFile.values()].flat(), []);
});

test("a bare InvoiceData modification is read as MODIFY and says the cancellation checks did not run", () => {
  const r = run(["base.xml", base], ["m1.xml", mod1], ["m2.xml", cancel2]);
  assert.deepEqual([...r.byFile.values()].flat(), []);
  assert.equal(r.skipped.length, 2);
  assert.match(r.skipped[1].reason, /does not say whether it is sent as MODIFY or STORNO/);
  assert.equal(r.skipped[1].file, "m2.xml");
});

test("a manageInvoice request names the operation, so its STORNO is checked", () => {
  const short = once(cancel2, "<invoiceNetAmount>-3300000<", "<invoiceNetAmount>-3000000<");
  const r = run(["base.xml", base], ["req.xml", request(["MODIFY", mod1], ["STORNO", short])]);
  assert.deepEqual(codes(r, "req.xml"), ["INCONSISTENT_MODIFICATION_DATA_NETAMOUNT_NOT_ZERO_NORMAL"]);
  const f = r.byFile.get("req.xml")[0];
  assert.equal(f.path, "/ManageInvoiceRequest/invoiceOperations/invoiceOperation[2]/invoiceData/invoiceMain/invoice/invoiceSummary/summaryNormal/invoiceNetAmount");
  assert.match(f.message, /add up to 300000\.00, not zero/);
  assert.match(f.fix, /-3300000\.00/);
  assert.equal(navChainEntries(request(["CREATE", base])).length, 1);
});

test("1200, 1220, 1230: the cancellation's totals against the chain, 1 unit tolerated", () => {
  const net = (v) => codes(chain(once(cancel2, "<invoiceNetAmount>-3300000<", `<invoiceNetAmount>${v}<`)), "m2.xml");
  assert.deepEqual(net("-3299999"), []); // 1 HUF: tolerated
  assert.deepEqual(net("-3299998"), ["INCONSISTENT_MODIFICATION_DATA_NETAMOUNT_NOT_ZERO_NORMAL"]);
  assert.deepEqual(codes(chain(once(cancel2, "<invoiceVatAmount>-891000<", "<invoiceVatAmount>-890000<")), "m2.xml"), ["INCONSISTENT_MODIFICATION_DATA_VATAMOUNT_NOT_ZERO"]);
  assert.deepEqual(codes(chain(once(cancel2, "<invoiceVatAmountHUF>-891000<", "<invoiceVatAmountHUF>-891002<")), "m2.xml"), ["INCONSISTENT_MODIFICATION_DATA_VATAMOUNT_NOT_ZERO_HUF"]);
  // As MODIFY the same short file is a partial correction, which NAV does not sum.
  assert.deepEqual(codes(chain(once(cancel2, "<invoiceNetAmount>-3300000<", "<invoiceNetAmount>-1<"), "MODIFY"), "m2.xml"), []);
});

test("1210: a simplified cancellation's gross against the chain", () => {
  const simp = (xml) => xml.replaceAll("<invoiceCategory>NORMAL<", "<invoiceCategory>SIMPLIFIED<");
  const b = checkNavChains([{ name: "base.xml", source: simp(base) }, { name: "m1.xml", source: simp(mod1), operation: "MODIFY" }, { name: "m2.xml", source: simp(once(cancel2, "<invoiceGrossAmount>-4191000<", "<invoiceGrossAmount>-4000000<")), operation: "STORNO" }]);
  assert.ok(codes(b, "m2.xml").includes("INCONSISTENT_MODIFICATION_DATA_AMOUNT_NOT_ZERO_SIMPLIFIED"));
  assert.ok(!codes(b, "m2.xml").includes("INCONSISTENT_MODIFICATION_DATA_NETAMOUNT_NOT_ZERO_NORMAL")); // 1200 is NORMAL and AGGREGATE only
});

test("the zero sums run only on a complete chain, and a gap is noted (11250)", () => {
  const r = run(["base.xml", base], ["m2.xml", cancel2, "STORNO"]);
  assert.deepEqual(codes(r, "m2.xml"), ["MODIFICATIONINDEX_SEQUENCE_INCOMPLETE"]);
  assert.equal(r.byFile.get("m2.xml")[0].severity, "information");
  assert.match(r.skipped[0].reason, /modifications 1 to 1 are not all among the files/);
});

test("16: two modifications with one modificationIndex", () => {
  const r = run(["base.xml", base], ["m1.xml", mod1, "MODIFY"], ["lm.xml", lineModify, "MODIFY"]);
  assert.deepEqual([...codes(r, "m1.xml"), ...codes(r, "lm.xml")], ["MODIFICATION_INDEX_NOT_UNIQUE"]);
  assert.equal([...r.byFile.values()].flat()[0].rule, "HU-036");
});

test("7: a created line number already in the chain; 1030: a modified line not in it", () => {
  const dup = once(cancel2, "<lineNumberReference>7<", "<lineNumberReference>6<"); // line 6 is modification 1's
  assert.deepEqual(codes(chain(dup), "m2.xml"), ["INVOICE_LINE_ALREADY_EXISTS"]);
  assert.deepEqual(codes(run(["base.xml", base], ["lm.xml", lineModify, "MODIFY"]), "lm.xml"), []);
  const ghost = once(lineModify, "<lineNumberReference>1<", "<lineNumberReference>9<");
  assert.deepEqual(codes(run(["base.xml", base], ["lm.xml", ghost, "MODIFY"]), "lm.xml"), ["INCORRECT_LINE_REFERENCE"]);
  // Line 6 exists once modification 1 created it.
  const six = once(once(lineModify, "<lineNumberReference>1<", "<lineNumberReference>6<"), "<modificationIndex>1<", "<modificationIndex>2<");
  assert.deepEqual(codes(run(["base.xml", base], ["m1.xml", mod1, "MODIFY"], ["lm.xml", six, "MODIFY"]), "lm.xml"), []);
});

test("342: a modifying document dated before its base invoice", () => {
  const early = once(mod1, "<invoiceIssueDate>2021-05-20<", "<invoiceIssueDate>2021-05-14<");
  assert.deepEqual(codes(chain(cancel2, "STORNO", early), "m1.xml"), ["INCORRECT_DATE_MODIFICATION_ISSUE_DATE_EARLY"]);
  const same = once(mod1, "<invoiceIssueDate>2021-05-20<", "<invoiceIssueDate>2021-05-15<");
  assert.deepEqual(codes(chain(cancel2, "STORNO", same), "m1.xml"), []);
});

test("11400: a modification whose delivery date became its issue date, in another month", () => {
  const moved = (issue, delivery) => once(once(mod1, "<invoiceIssueDate>2021-05-20<", `<invoiceIssueDate>${issue}<`), "<invoiceDeliveryDate>2021-05-10<", `<invoiceDeliveryDate>${delivery}<`);
  assert.deepEqual(codes(chain(cancel2, "STORNO", moved("2021-06-02", "2021-06-02")), "m1.xml"), ["UNINTENDED_MODIFICATION_DELIVERY_DATE"]);
  assert.deepEqual(codes(chain(cancel2, "STORNO", moved("2021-05-20", "2021-05-20")), "m1.xml"), []); // same month: does not run
  assert.deepEqual(codes(chain(cancel2, "STORNO", moved("2021-06-02", "2021-06-01")), "m1.xml"), []); // not its issue date
});

test("11401: a cancellation whose delivery date became its issue date", () => {
  const moved = once(cancel2, "<invoiceDeliveryDate>2021-05-10<", "<invoiceDeliveryDate>2021-05-25<");
  assert.deepEqual(codes(chain(moved), "m2.xml"), ["UNINTENDED_CANCELLATION_DELIVERY_DATE"]);
  assert.deepEqual(codes(chain(moved, "MODIFY"), "m2.xml"), []); // MODIFY: 11400 needs another month
});

test("632: mergedItemIndicator false after an earlier true in the chain", () => {
  const merged = once(base, "<mergedItemIndicator>false<", "<mergedItemIndicator>true<");
  const r = run(["base.xml", merged], ["m1.xml", mod1, "MODIFY"]);
  assert.deepEqual(codes(r, "m1.xml"), ["ITEM_AGGREGATION_MISMATCH"]);
});

test("1140: a document after the cancellation", () => {
  const third = once(once(lineModify, "<modificationIndex>1<", "<modificationIndex>3<"), "<invoiceNumber>ZZZ000005<", "<invoiceNumber>ZZZ000050<");
  const r = run(["base.xml", base], ["m1.xml", mod1, "MODIFY"], ["m2.xml", cancel2, "STORNO"], ["m3.xml", third, "MODIFY"]);
  assert.deepEqual(codes(r, "m3.xml"), ["INCONSISTENT_MODIFICATION_DATA_STORNO_ALREADY_EXISTS"]);
  assert.match(r.byFile.get("m3.xml")[0].message, /m2\.xml already cancels ZZZ000001/);
});

test("10082: the customer's tax number differs from the base invoice's, and the message does not repeat it", () => {
  const other = mod1.replace("<base:taxpayerId>99887764<", "<base:taxpayerId>12345676<");
  const r = chain(cancel2, "STORNO", other);
  assert.deepEqual(codes(r, "m1.xml"), ["INCORRECT_HEAD_DATA_CUSTOMER_TAXPAYERID_DIFFERS"]);
  const f = r.byFile.get("m1.xml")[0];
  assert.equal(f.severity, "information");
  assert.ok(!/12345676|99887764/.test(f.message + f.fix));
});

test("6: invoiceCategory changed; 20: modifyWithoutMaster true with the base among the files", () => {
  const agg = mod1.replace("<invoiceCategory>NORMAL<", "<invoiceCategory>AGGREGATE<");
  assert.deepEqual(codes(chain(cancel2, "STORNO", agg), "m1.xml"), ["INVOICE_TYPE_MISMATCH"]);
  const wm = once(mod1, "<modifyWithoutMaster>false<", "<modifyWithoutMaster>true<");
  assert.deepEqual(codes(chain(cancel2, "STORNO", wm), "m1.xml"), ["MODIFY_WITHOUT_MASTER_MISMATCH"]);
});

test("two files claiming the same base invoice number: the chain is not guessed", () => {
  const r = run(["a.xml", base], ["b.xml", base], ["m1.xml", mod1, "MODIFY"]);
  assert.deepEqual([...r.byFile.values()].flat(), []);
  assert.match(r.skipped[0].reason, /2 files given are base invoice ZZZ000001/);
});

test("every code cited is in the module's list", () => {
  const src = readFileSync(new URL("./hungary-nav-chain.mjs", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export function checkNavChains"));
  const cited = new Set([...body.matchAll(/(?:blocking|w|zero)\(\s*"([A-Z0-9_]+)"/g)].map((m) => m[1]).concat([...body.matchAll(/"((?:INCONSISTENT|INCORRECT|UNINTENDED|MODIFICATION|ITEM|INVOICE|MODIFY)[A-Z0-9_]+)"/g)].map((m) => m[1])));
  const all = [...NAV_CHAIN_CODES.errors, ...NAV_CHAIN_CODES.warnings, ...NAV_CHAIN_CODES.information];
  for (const c of cited) assert.ok(all.includes(c), c);
  assert.equal(cited.size, all.length);
});

test("the batch report attaches chain findings to the modifying file", async () => {
  const short = once(cancel2, "<invoiceNetAmount>-3300000<", "<invoiceNetAmount>-3000000<");
  const res = await preflightDocuments([{ name: "base.xml", source: base }, { name: "req.xml", source: request(["MODIFY", mod1], ["STORNO", short]) }]);
  const req = res.reports.find((r) => r.file === "req.xml");
  assert.match(req.envelope, /checked as a chain with base invoice base\.xml and 2 modifications/);
  assert.ok(req.errors.some((e) => e.rule === "HU-037" && e.nav === "INCONSISTENT_MODIFICATION_DATA_NETAMOUNT_NOT_ZERO_NORMAL"));
  const b = res.reports.find((r) => r.file === "base.xml");
  assert.ok(!b.errors.some((e) => e.rule === "HU-036" || e.rule === "HU-037"));
  // One NAV file alone: no chain.
  const solo = await preflightDocuments([{ name: "m1.xml", source: mod1 }]);
  assert.doesNotMatch(solo.reports[0].envelope, /chain/);
});
