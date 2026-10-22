// Repair the arithmetic of a UBL Invoice or CreditNote file, and nothing else.
//
// Works on the original text, so comments, namespaces, attribute order and
// every element it does not touch stay byte for byte. It recomputes only what
// the lines fully determine, the way EN 16931 does: each line's net (quantity
// times unit price; a line with its own allowance or charge is left alone),
// the taxable amount and VAT of each
// category subtotal (taxable x rate, rounded half up), and the document
// totals. It never picks a rate, category, date, identifier or party. If a
// document has header allowances or charges, or a tax group with no subtotal
// to hold it, the tax part is skipped and said so. The repaired file is
// re-parsed and re-checked so the caller sees what is still wrong.

import { checkInvoice, roundHalfUpToCents } from "./checks.mjs";
import { parseUblInvoice } from "./ubl.mjs";

export const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);
export const tagRe = (name, flags = "g") => new RegExp(`<((?:[\\w.-]+:)?${name})(\\s[^>]*)?>([\\s\\S]*?)</\\1>`, flags);
export const num = (s) => (s === undefined || s === null || s.trim() === "" ? null : Number(s.trim()));

// First <name ...>value</name> at the top level of a block (not inside a nested
// element named in `skip`), as {start, end, value} offsets of the value text.
export function firstChild(block, name, skip = []) {
  let masked = block;
  for (const s of skip) masked = masked.replace(tagRe(s), (m) => " ".repeat(m.length));
  const m = tagRe(name, "").exec(masked);
  if (!m) return null;
  const open = m[0].indexOf(">") + 1;
  return { start: m.index + open, end: m.index + open + m[3].length, value: m[3] };
}

export function repairUbl(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  const before = checkInvoice(parseUblInvoice(text));
  const changes = [];
  const skipped = [];
  let xml = text;

  // Replace the value of a child element inside the block found by `find`.
  const edit = (blockName, nth, child, skip, path, value, reason) => {
    const blocks = [...xml.matchAll(tagRe(blockName))];
    const b = blocks[nth];
    if (!b) return false;
    const open = b[0].indexOf(">") + 1;
    const inner = b[3];
    const c = firstChild(inner, child, skip);
    if (!c) return false;
    const old = inner.slice(c.start, c.end);
    if (num(old) === Number(value)) return true;
    const abs = b.index + open + c.start;
    xml = xml.slice(0, abs) + value + xml.slice(abs + (c.end - c.start));
    changes.push({ path, from: old.trim(), to: value, reason });
    return true;
  };

  const lineName = /<(?:[\w.-]+:)?(InvoiceLine|CreditNoteLine|DebitNoteLine)[\s>]/.exec(xml)?.[1];
  if (!lineName) return { xml: text, changes, skipped, before, remaining: before, repaired: false };
  const lineBlocks = [...xml.matchAll(tagRe(lineName))];
  const qtyName = { InvoiceLine: "InvoicedQuantity", CreditNoteLine: "CreditedQuantity", DebitNoteLine: "DebitedQuantity" }[lineName];

  const lines = [];
  let computable = lineBlocks.length > 0;
  lineBlocks.forEach((b, i) => {
    const inner = b[3];
    if (/<(?:[\w.-]+:)?AllowanceCharge[\s>]/.test(inner) || /<(?:[\w.-]+:)?(?:Sub\w+Line)[\s>]/.test(inner)) {
      skipped.push(`Line ${i + 1} has its own allowance, charge or sub-line; its net is left as written.`);
      const kept = num(firstChild(inner, "LineExtensionAmount")?.value);
      lines.push({ net: kept, fixed: false, inner });
      if (kept === null) computable = false;
      return;
    }
    const q = num(firstChild(inner, qtyName)?.value);
    const p = num(firstChild(inner, "PriceAmount")?.value);
    const base = num(firstChild(inner, "BaseQuantity")?.value) ?? 1;
    if (q === null || p === null || !(base > 0)) { computable = false; lines.push({ net: null, fixed: false, inner }); return; }
    const net = roundHalfUpToCents((q * p) / base);
    lines.push({ net, fixed: true, inner });
  });
  if (!computable) {
    skipped.push("Some line has no quantity or price to compute from; nothing was recomputed.");
    return { xml: text, changes, skipped, before, remaining: before, repaired: false };
  }

  lines.forEach((l, i) => {
    if (l.fixed) edit(lineName, i, "LineExtensionAmount", [], `/lines/${i}/net`, fmt(l.net), "Line net is quantity times unit price.");
  });
  const netSum = lines.reduce((s, l) => roundHalfUpToCents(s + l.net), 0);

  const hasHeaderAdjust = [...xml.matchAll(/<(?:[\w.-]+:)?AllowanceCharge[\s>][\s\S]*?<\/(?:[\w.-]+:)?AllowanceCharge>/g)]
    .some((m) => !lineBlocks.some((b) => m.index > b.index && m.index < b.index + b[0].length));
  const taxTotals = [...xml.matchAll(tagRe("TaxTotal"))];
  let tax = null;
  if (hasHeaderAdjust) {
    skipped.push("The document has header allowances or charges; tax and totals were not recomputed.");
  } else if (taxTotals.length !== 1) {
    skipped.push("Tax was not recomputed: the file does not have exactly one TaxTotal (a second one is the tax currency's).");
  } else {
    const groups = new Map();
    for (const l of lines) {
      const cat = /<(?:[\w.-]+:)?ClassifiedTaxCategory[\s>][\s\S]*?<\/(?:[\w.-]+:)?ClassifiedTaxCategory>/.exec(l.inner)?.[0] || "";
      const id = firstChild(cat.replace(/<(?:[\w.-]+:)?TaxScheme[\s\S]*?<\/(?:[\w.-]+:)?TaxScheme>/, ""), "ID")?.value.trim();
      const pct = num(firstChild(cat, "Percent")?.value);
      const key = `${id}|${pct}`;
      if (!id || pct === null) { groups.clear(); groups.set("bad", 1); break; }
      groups.set(key, { id, pct, taxable: roundHalfUpToCents((groups.get(key)?.taxable || 0) + l.net) });
    }
    const subtotals = [...taxTotals[0][3].matchAll(tagRe("TaxSubtotal"))];
    const subKey = subtotals.map((s) => {
      const id = firstChild(s[3].replace(/<(?:[\w.-]+:)?TaxScheme[\s\S]*?<\/(?:[\w.-]+:)?TaxScheme>/, ""), "ID")?.value.trim();
      return `${id}|${num(firstChild(s[3], "Percent")?.value)}`;
    });
    const ok = !groups.has("bad") && groups.size === subtotals.length && [...groups.keys()].every((k) => subKey.includes(k)) && new Set(subKey).size === subKey.length;
    if (!ok) {
      skipped.push("Tax was not recomputed: a line's tax category or rate is unreadable, or the lines' tax groups do not match the TaxSubtotal elements one to one. Add or fix the subtotal yourself.");
    } else {
      tax = 0;
      subtotals.forEach((s, j) => {
        const g = groups.get(subKey[j]);
        const t = roundHalfUpToCents((g.taxable * g.pct) / 100);
        tax = roundHalfUpToCents(tax + t);
        // Edit by offset inside the single TaxTotal.
        const sub = [...xml.matchAll(tagRe("TaxSubtotal"))][j];
        const open = sub[0].indexOf(">") + 1;
        let inner = sub[3];
        const rep = (child, value, path, reason) => {
          const c = firstChild(inner, child, ["TaxCategory"]);
          if (!c || num(inner.slice(c.start, c.end)) === Number(value)) return;
          changes.push({ path, from: inner.slice(c.start, c.end).trim(), to: value, reason });
          inner = inner.slice(0, c.start) + value + inner.slice(c.end);
        };
        rep("TaxableAmount", fmt(g.taxable), `/tax_breakdown/${j}/taxable`, "Taxable amount is the sum of the nets of the lines in this tax group.");
        rep("TaxAmount", fmt(t), `/tax_breakdown/${j}/tax`, `Tax is the taxable amount times ${g.pct}%, rounded half up.`);
        xml = xml.slice(0, sub.index + open) + inner + xml.slice(sub.index + open + sub[3].length);
      });
      edit("TaxTotal", 0, "TaxAmount", ["TaxSubtotal"], "/totals/tax", fmt(tax), "Document tax is the sum of the tax subtotals.");
    }
  }

  if (!hasHeaderAdjust) {
    const lm = (child, value, path, reason) => edit("LegalMonetaryTotal", 0, child, [], path, value, reason);
    lm("LineExtensionAmount", fmt(netSum), "/totals/lines", "Sum of the line nets.");
    lm("TaxExclusiveAmount", fmt(netSum), "/totals/net", "Net total is the sum of the line nets (no header allowances or charges).");
    if (tax !== null) {
      const gross = roundHalfUpToCents(netSum + tax);
      lm("TaxInclusiveAmount", fmt(gross), "/totals/gross", "Gross is net plus tax.");
      const lmBlock = [...xml.matchAll(tagRe("LegalMonetaryTotal"))][0];
      const pre = num(firstChild(lmBlock[3], "PrepaidAmount")?.value) ?? 0;
      const rnd = num(firstChild(lmBlock[3], "PayableRoundingAmount")?.value) ?? 0;
      lm("PayableAmount", fmt(roundHalfUpToCents(gross - pre + rnd)), "/totals/due", "Amount due is gross minus prepaid plus rounding.");
    }
  }

  const remaining = checkInvoice(parseUblInvoice(xml));
  return { xml, changes, skipped, before, remaining, repaired: changes.length > 0 };
}
