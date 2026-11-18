// The checks NAV runs against its invoice store, run here against the files a user drops together:
// a Hungarian base invoice (CREATE) and the modifying or cancelling documents (MODIFY, STORNO)
// that refer to it. A single file cannot show these; a set that holds the whole chain can.
//
// Source: nav-gov-hu/Online-Invoice (MIT), "Online Invoice System 3.0 Interface Specification"
// (English, 2026.02.12), read with `pdftotext -layout` for this module
// (eval/nav-chain-2026-11-15.md):
//   - section 3.3.2, blocking codes 6 INVOICE_TYPE_MISMATCH, 7 INVOICE_LINE_ALREADY_EXISTS,
//     16 MODIFICATION_INDEX_NOT_UNIQUE and 20 MODIFY_WITHOUT_MASTER_MISMATCH, with the
//     "Error, actions" table that says what each one compares (HU-036, errors);
//   - Annex I warnings that need the stored base invoice: 342, 11400, 11401 (I.1), 632, 1030
//     (I.2) and the whole of I.5 (1140, 1200, 1210, 1220, 1230) (HU-037, warnings);
//   - Annex II INFO messages 11250 and 10082 (HU-037, severity "information").
// Every finding names its code in `nav`. "Received earlier" in NAV's text means received by NAV;
// here it means "among the files given, earlier in modificationIndex order", and each message
// says so. Legal-predecessor chains (A10000_JOGELOD_POTLAS) are not followed.
// This is an offline observation, not NAV's acceptance and not tax advice. Findings never repeat
// a tax number.

import { parseXmlTree } from "./ubl.mjs";
import { wellFormed } from "./fatturapa-xsd.mjs";

const child = (node, name) => (node ? node.children.find((c) => c.name === name) : undefined);
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
const at = (node, ...names) => names.reduce((cur, n) => child(cur, n), node);
const txt = (node, ...names) => (at(node, ...names)?.text ?? "").trim();
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const num = (v) => (DECIMAL.test(v || "") ? Number(v) : null);
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
const decode = (s) => (typeof s === "string" ? s : new TextDecoder().decode(s));
function base64Text(b64) {
  try {
    const bin = atob(String(b64).replace(/\s+/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

/** The codes this module cites, for the test that holds it to the specification's list. */
export const NAV_CHAIN_CODES = {
  errors: ["INVOICE_TYPE_MISMATCH", "INVOICE_LINE_ALREADY_EXISTS", "MODIFICATION_INDEX_NOT_UNIQUE", "MODIFY_WITHOUT_MASTER_MISMATCH"],
  warnings: [
    "INCORRECT_DATE_MODIFICATION_ISSUE_DATE_EARLY", "UNINTENDED_MODIFICATION_DELIVERY_DATE", "UNINTENDED_CANCELLATION_DELIVERY_DATE",
    "ITEM_AGGREGATION_MISMATCH", "INCORRECT_LINE_REFERENCE", "INCONSISTENT_MODIFICATION_DATA_STORNO_ALREADY_EXISTS",
    "INCONSISTENT_MODIFICATION_DATA_NETAMOUNT_NOT_ZERO_NORMAL", "INCONSISTENT_MODIFICATION_DATA_AMOUNT_NOT_ZERO_SIMPLIFIED",
    "INCONSISTENT_MODIFICATION_DATA_VATAMOUNT_NOT_ZERO", "INCONSISTENT_MODIFICATION_DATA_VATAMOUNT_NOT_ZERO_HUF",
  ],
  information: ["MODIFICATIONINDEX_SEQUENCE_INCOMPLETE", "INCORRECT_HEAD_DATA_CUSTOMER_TAXPAYERID_DIFFERS"],
};

// One invoice of a NAV report: a single invoice, or one batchInvoice entry of a batch modification.
function entriesOfInvoiceData(text, { file, operation = null, prefix = "/InvoiceData" }) {
  if (!wellFormed(text)) return [];
  const root = parseXmlTree(text).children.find((c) => c.name === "InvoiceData");
  if (!root) return [];
  const main = child(root, "invoiceMain");
  const single = child(main, "invoice");
  const list = single ? [[single, `${prefix}/invoiceMain/invoice`]] : kids(main, "batchInvoice").map((b, i) => [child(b, "invoice"), `${prefix}/invoiceMain/batchInvoice[${i + 1}]/invoice`]).filter(([inv]) => inv);
  return list.map(([inv, path]) => {
    const ref = child(inv, "invoiceReference");
    const detail = at(inv, "invoiceHead", "invoiceDetail");
    const linesNode = child(inv, "invoiceLines");
    const sn = at(inv, "invoiceSummary", "summaryNormal");
    const simplifiedRows = kids(at(inv, "invoiceSummary"), "summarySimplified");
    const gross = num(txt(inv, "invoiceSummary", "summaryGrossData", "invoiceGrossAmount"));
    const simpleGross = simplifiedRows.length ? simplifiedRows.reduce((s, r) => (s === null || num(txt(r, "vatContentGrossAmount")) === null ? null : s + num(txt(r, "vatContentGrossAmount"))), 0) : null;
    const op = operation || (ref ? null : "CREATE");
    return {
      file, path, operation: op,
      invoiceNumber: txt(root, "invoiceNumber"),
      issueDate: txt(root, "invoiceIssueDate"),
      reference: ref ? {
        original: txt(ref, "originalInvoiceNumber"),
        withoutMaster: txt(ref, "modifyWithoutMaster") === "true",
        index: num(txt(ref, "modificationIndex")),
      } : null,
      category: txt(detail, "invoiceCategory"),
      currency: txt(detail, "currencyCode"),
      rate: num(txt(detail, "exchangeRate")),
      delivery: txt(detail, "invoiceDeliveryDate"),
      customer: at(inv, "invoiceHead", "customerInfo"),
      customerTaxpayerId: txt(inv, "invoiceHead", "customerInfo", "customerVatData", "customerTaxNumber", "taxpayerId"),
      hasLinesNode: Boolean(linesNode),
      merged: txt(linesNode, "mergedItemIndicator") === "true",
      lines: kids(linesNode, "line").map((l, i) => ({
        n: i + 1,
        number: txt(l, "lineNumber"),
        ref: txt(l, "lineModificationReference", "lineNumberReference"),
        op: txt(l, "lineModificationReference", "lineOperation"),
      })),
      net: num(txt(sn, "invoiceNetAmount")),
      vat: num(txt(sn, "invoiceVatAmount")),
      vatHUF: num(txt(sn, "invoiceVatAmountHUF")),
      gross: gross ?? simpleGross,
    };
  });
}

/** Every invoice in a NAV file: an InvoiceData report, or each operation of a manageInvoice request. */
export function navChainEntries(source, { file = "", operation = null } = {}) {
  const text = decode(source);
  const head = text.slice(0, 4096);
  if (/<(?:[A-Za-z0-9_]+:)?InvoiceData[\s>]/.test(head)) return entriesOfInvoiceData(text, { file, operation });
  if (!wellFormed(text)) return [];
  const req = parseXmlTree(text).children.find((c) => c.name === "ManageInvoiceRequest");
  if (!req || txt(req, "invoiceOperations", "compressedContent") === "true") return [];
  return kids(at(req, "invoiceOperations"), "invoiceOperation").flatMap((op, i) =>
    entriesOfInvoiceData(base64Text(txt(op, "invoiceData")), {
      file, operation: txt(op, "invoiceOperation") || null,
      prefix: `/ManageInvoiceRequest/invoiceOperations/invoiceOperation[${i + 1}]/invoiceData`,
    }));
}

// Two customerInfo blocks are "the same" when their text content is, element by element.
const flat = (node) => (node ? `${node.name}(${node.children.length ? node.children.map(flat).join(",") : node.text.trim()})` : "");
const month = (d) => d.slice(0, 7);

/**
 * Check every chain the inputs hold. `inputs` is [{ name, source, operation? }]; `operation`
 * (MODIFY or STORNO) names what a bare InvoiceData modification will be sent as, which only the
 * manageInvoice request says. Returns { byFile: Map(name -> findings), skipped, chains }.
 */
export function checkNavChains(inputs) {
  const entries = inputs.flatMap((i) => navChainEntries(i.source, { file: i.name, operation: i.operation || null }));
  const byFile = new Map();
  const skipped = [];
  const chains = [];
  const push = (e, f) => {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file).push(f);
  };
  const bases = new Map();
  for (const e of entries) if (!e.reference && e.operation === "CREATE" && e.invoiceNumber) {
    if (!bases.has(e.invoiceNumber)) bases.set(e.invoiceNumber, []);
    bases.get(e.invoiceNumber).push(e);
  }
  const groups = new Map();
  for (const e of entries) if (e.reference && e.reference.original) {
    if (!groups.has(e.reference.original)) groups.set(e.reference.original, []);
    groups.get(e.reference.original).push(e);
  }
  for (const [original, members] of groups) {
    const found = bases.get(original) || [];
    if (found.length !== 1) {
      if (found.length > 1) for (const mm of members) skipped.push({ file: mm.file, rule: "HU-036/HU-037", path: mm.path, reason: `${found.length} files given are base invoice ${original} (${found.map((b) => b.file).join(", ")}); the chain was not checked against either.` });
      continue; // no base among the files: the single-file checks are all there is
    }
    const base = found[0];
    // NAV keeps a chain in the order the modifications arrive; the files carry modificationIndex,
    // which must count 1, 2, 3, ... in that order, so it stands in for arrival.
    const ordered = [...members].sort((a, b) => (a.reference.index ?? Infinity) - (b.reference.index ?? Infinity));
    chains.push({ base: base.file, invoiceNumber: original, members: ordered.map((m) => ({ file: m.file, index: m.reference.index, operation: m.operation })) });
    const knownLines = new Set(base.lines.map((l) => l.number).filter(Boolean));
    const usedIndex = new Map();
    const seenIndexes = [];
    const total = { net: base.net, vat: base.vat, vatHUF: base.vatHUF, gross: base.gross };
    let lastDelivery = base.delivery;
    let lastDeliveryFrom = "the base invoice";
    let storno = null;
    let mergedBefore = base.merged ? base.file : null;
    for (const m of ordered) {
      const r = m.reference;
      const rp = `${m.path}/invoiceReference`;
      const op = m.operation; // MODIFY, STORNO, or null (a bare InvoiceData file: not known)
      const asOp = op || "MODIFY";
      const blocking = (code, message, fix, path) => push(m, { rule: "HU-036", message: `${message} (NAV ${code}).`, fix, path, nav: code });
      const w = (code, message, fix, path, severity = "warning") => push(m, { rule: "HU-037", message: `${message} (NAV ${code}).`, fix, path, severity, nav: code });
      const idx = r.index;
      const label = `modification ${idx ?? "(no index)"} of ${original}`;
      if (r.withoutMaster) {
        // Code 20: modifyWithoutMaster true, yet the base invoice is here and so (presumably) reported.
        blocking("MODIFY_WITHOUT_MASTER_MISMATCH", `modifyWithoutMaster is true, but the base invoice ${original} is among these files (${base.file}); NAV refuses this once that base invoice is reported`,
          "Set modifyWithoutMaster to false when the base invoice was reported to NAV; true is for a base invoice issued before reporting began or never reported.", `${rp}/modifyWithoutMaster`);
      }
      // Code 16.
      if (idx !== null && usedIndex.has(idx)) {
        blocking("MODIFICATION_INDEX_NOT_UNIQUE", `modificationIndex ${idx} is also used by ${usedIndex.get(idx)} for the same base invoice ${original}`,
          "Number the modifications of one base invoice 1, 2, 3, ... with no repeat.", `${rp}/modificationIndex`);
      } else if (idx !== null) usedIndex.set(idx, m.file);
      // Code 6.
      if (!r.withoutMaster && base.category && m.category && m.category !== base.category) {
        blocking("INVOICE_TYPE_MISMATCH", `The modifying document is ${m.category} but the base invoice ${original} is ${base.category}`,
          "A modification keeps the base invoice's invoiceCategory.", `${m.path}/invoiceHead/invoiceDetail/invoiceCategory`);
      }
      // Code 7 and Annex I 1030 (line references), against the lines of the chain so far.
      const created = [];
      for (const l of m.lines) {
        const lp = `${m.path}/invoiceLines/line[${l.n}]/lineModificationReference/lineNumberReference`;
        if (!l.ref) continue;
        if (l.op === "CREATE" && knownLines.has(l.ref)) {
          blocking("INVOICE_LINE_ALREADY_EXISTS", `Line ${l.n} creates line ${l.ref}, which already exists in the chain of ${original}`,
            "Give a created line the next free number after the base invoice's and earlier modifications' lines, or point a correction at the line with lineOperation MODIFY.", lp);
        }
        if (l.op === "MODIFY" && !r.withoutMaster && !knownLines.has(l.ref)) {
          w("INCORRECT_LINE_REFERENCE", `Line ${l.n} modifies line ${l.ref}, which neither the base invoice ${original} nor an earlier modification among these files has`,
            "Point lineNumberReference at a line the base invoice or an earlier modification created.", lp);
        }
        created.push(l.ref);
      }
      // Annex I 342.
      if (isDate(m.issueDate) && isDate(base.issueDate) && m.issueDate < base.issueDate) {
        w("INCORRECT_DATE_MODIFICATION_ISSUE_DATE_EARLY", `The modifying document is dated ${m.issueDate}, before the base invoice ${original} (${base.issueDate})`,
          "A modifying document is issued after the invoice it modifies: check its issue date.", `${m.path.split("/invoiceMain")[0]}/invoiceIssueDate`);
      }
      // Annex I 11400 (MODIFY) and 11401 (STORNO): the delivery date set to the document's own issue date.
      if (isDate(m.delivery) && isDate(lastDelivery) && m.delivery === m.issueDate) {
        const dp = `${m.path}/invoiceHead/invoiceDetail/invoiceDeliveryDate`;
        if (asOp === "MODIFY" && month(m.delivery) !== month(lastDelivery) && (m.lines.length || (m.customer && flat(m.customer) !== flat(base.customer)))) {
          w("UNINTENDED_MODIFICATION_DELIVERY_DATE", `The modification moves the delivery date from ${lastDelivery} (${lastDeliveryFrom}) to ${m.delivery}, its own issue date${op ? "" : " (read as MODIFY: a bare file does not say)"}`,
            "Give a modification the delivery date of the supply it corrects, not the day the correction is issued; NAV notes this as a common invoicing-program error.", dp);
        }
        if (op === "STORNO" && m.delivery !== lastDelivery) {
          w("UNINTENDED_CANCELLATION_DELIVERY_DATE", `The cancellation moves the delivery date from ${lastDelivery} (${lastDeliveryFrom}) to ${m.delivery}, its own issue date`,
            "Give a cancellation the delivery date of the invoice it cancels.", dp);
        }
      }
      // Annex I 632.
      if (mergedBefore && m.hasLinesNode && !m.merged) {
        w("ITEM_AGGREGATION_MISMATCH", `mergedItemIndicator is false, but ${mergedBefore} earlier in the chain of ${original} set it to true`,
          "Once an invoice chain reports merged lines, later documents keep mergedItemIndicator true.", `${m.path}/invoiceLines/mergedItemIndicator`);
      }
      // Annex I 1140.
      if (storno) {
        w("INCONSISTENT_MODIFICATION_DATA_STORNO_ALREADY_EXISTS", `${storno} already cancels ${original} (STORNO, earlier in modificationIndex order among these files)`,
          "Nothing should follow a cancellation of the base invoice; if the invoice is re-issued, report it as a new invoice (CREATE).", `${rp}/originalInvoiceNumber`);
      }
      // Annex II 11250: the indices so far (with this one) form 1..n.
      const indexesWithThis = idx === null ? seenIndexes : [...seenIndexes, idx];
      const max = indexesWithThis.length ? Math.max(...indexesWithThis) : 0;
      const missing = [];
      for (let k = 1; k <= max; k++) if (!indexesWithThis.includes(k)) missing.push(k);
      const priorComplete = idx !== null && seenIndexes.length === idx - 1 && seenIndexes.every((k, j) => k === j + 1);
      if (!r.withoutMaster && idx !== null && missing.length) {
        w("MODIFICATIONINDEX_SEQUENCE_INCOMPLETE", `modificationIndex ${idx}: modification${missing.length === 1 ? "" : "s"} ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""} of ${original} ${missing.length === 1 ? "is" : "are"} not among these files`,
          "If the missing modifications were reported to NAV, this only means they were not given here; if not, number the modifications 1, 2, 3, ... with no gap.", `${rp}/modificationIndex`, "information");
      }
      // Annex II 10082.
      if (m.customerTaxpayerId && base.customerTaxpayerId && m.customerTaxpayerId !== base.customerTaxpayerId) {
        w("INCORRECT_HEAD_DATA_CUSTOMER_TAXPAYERID_DIFFERS", `The customer's tax number differs from the one on the base invoice ${original}`,
          "A modification is for the same customer as the base invoice; check the customer tax number.", `${m.path}/invoiceHead/customerInfo/customerVatData/customerTaxNumber`, "information");
      }
      // Annex I I.5, 1200-1230: a cancellation brings the chain to zero (1 unit; 1 HUF or 0.01 of the currency for HUF VAT).
      if (op === "STORNO") {
        const sp = `${m.path}/invoiceSummary`;
        if (!priorComplete) {
          skipped.push({ file: m.file, rule: "HU-037", path: sp, reason: `The cancellation ${m.file} is ${label}, but modifications 1 to ${(idx ?? 1) - 1} are not all among the files, so NAV's zero-sum checks (1200-1230) were not run: they run only on a complete chain.` });
        } else {
          const tolHUF = Math.max(1, 0.01 * (m.rate && m.rate > 0 ? m.rate : 1));
          const zero = (key, code, what, el, tol, cats) => {
            if (!cats.includes(m.category)) return;
            if (key !== "gross" && key !== "vatHUF" && r.withoutMaster) return;
            if (total[key] === null || m[key] === null) return;
            const sum = total[key] + m[key];
            if (Math.abs(sum) > tol + 1e-9) {
              w(code, `The cancellation's ${what} (${fmt(m[key])}) and ${original}'s ${what} with its modifications so far (${fmt(total[key])}) add up to ${fmt(sum)}, not zero`,
                `A cancellation reverses what is left of the invoice: make its ${what} ${fmt(-total[key])}.`, `${sp}/${el}`);
            }
          };
          zero("net", "INCONSISTENT_MODIFICATION_DATA_NETAMOUNT_NOT_ZERO_NORMAL", "net amount", "summaryNormal/invoiceNetAmount", 1, ["NORMAL", "AGGREGATE"]);
          zero("gross", "INCONSISTENT_MODIFICATION_DATA_AMOUNT_NOT_ZERO_SIMPLIFIED", "gross amount", "summaryGrossData/invoiceGrossAmount", 1, ["SIMPLIFIED"]);
          zero("vat", "INCONSISTENT_MODIFICATION_DATA_VATAMOUNT_NOT_ZERO", "VAT amount", "summaryNormal/invoiceVatAmount", 1, ["NORMAL", "AGGREGATE"]);
          zero("vatHUF", "INCONSISTENT_MODIFICATION_DATA_VATAMOUNT_NOT_ZERO_HUF", "VAT amount in HUF", "summaryNormal/invoiceVatAmountHUF", tolHUF, ["NORMAL", "AGGREGATE"]);
        }
      } else if (!op) {
        skipped.push({ file: m.file, rule: "HU-037", path: m.path, reason: `${m.file} is ${label}, a bare InvoiceData file, which does not say whether it is sent as MODIFY or STORNO; it was checked as MODIFY, so the cancellation checks (1200-1230 zero sums, 11401) did not run. Check the manageInvoice request instead, which says.` });
      }
      // Carry the chain forward.
      for (const k of ["net", "vat", "vatHUF", "gross"]) total[k] = total[k] === null || m[k] === null ? null : total[k] + m[k];
      for (const l of created) knownLines.add(l);
      if (idx !== null) seenIndexes.push(idx);
      seenIndexes.sort((a, b) => a - b);
      if (isDate(m.delivery)) { lastDelivery = m.delivery; lastDeliveryFrom = m.file; }
      if (op === "STORNO" && !storno) storno = m.file;
      if (m.merged && !mergedBefore) mergedBefore = m.file;
    }
  }
  return { byFile, skipped, chains };
}
