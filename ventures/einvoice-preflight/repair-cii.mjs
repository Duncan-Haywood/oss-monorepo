// Repair the arithmetic of a UN/CEFACT CII invoice (XRechnung CII, ZUGFeRD,
// the XML inside a Factur-X PDF), and nothing else. Same contract as
// repair-ubl.mjs: edits happen on the original text so every untouched byte
// stays, only amounts the lines fully determine are recomputed (line totals,
// each header tax group's basis and tax, the monetary summation), and a
// document with header allowances or charges, or tax groups that do not match
// the lines one to one, has its tax part skipped and said so. The result is
// re-parsed and re-checked.

import { checkInvoice, roundHalfUpToCents } from "./checks.mjs";
import { parseCiiInvoice } from "./cii.mjs";
import { fmt, tagRe, num, firstChild } from "./repair-ubl.mjs";

const P = "(?:[\\w.-]+:)?";

export function repairCii(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  const before = checkInvoice(parseCiiInvoice(text));
  const changes = [];
  const skipped = [];
  let xml = text;

  // Replace a child's value inside the nth block named `blockName`.
  const edit = (blockName, nth, child, skip, path, value, reason) => {
    const b = [...xml.matchAll(tagRe(blockName))][nth];
    if (!b) return false;
    const open = b[0].indexOf(">") + 1;
    const c = firstChild(b[3], child, skip);
    if (!c) return false;
    const old = b[3].slice(c.start, c.end);
    if (num(old) === Number(value)) return true;
    const abs = b.index + open + c.start;
    xml = xml.slice(0, abs) + value + xml.slice(abs + (c.end - c.start));
    changes.push({ path, from: old.trim(), to: value, reason });
    return true;
  };
  const unchanged = () => ({ xml: text, changes: [], skipped, before, remaining: before, repaired: false });

  const lineBlocks = [...xml.matchAll(tagRe("IncludedSupplyChainTradeLineItem"))];
  const lines = [];
  let computable = lineBlocks.length > 0;
  lineBlocks.forEach((b, i) => {
    const inner = b[3];
    const kept = num(firstChild(inner, "LineTotalAmount")?.value);
    if (new RegExp(`<${P}(?:SpecifiedTradeAllowanceCharge|AppliedTradeAllowanceCharge)[\\s>]`).test(inner) || new RegExp(`<${P}IncludedSubordinateTradeLineItem[\\s>]`).test(inner)) {
      skipped.push(`Line ${i + 1} has its own allowance, charge or sub-line; its total is left as written.`);
      lines.push({ net: kept, fixed: false, inner });
      if (kept === null) computable = false;
      return;
    }
    const price = firstChild(inner, "NetPriceProductTradePrice");
    const priceBlock = new RegExp(`<${P}NetPriceProductTradePrice[\\s>][\\s\\S]*?</${P}NetPriceProductTradePrice>`).exec(inner)?.[0] || "";
    const p = num(firstChild(priceBlock, "ChargeAmount")?.value);
    const base = num(firstChild(priceBlock, "BasisQuantity")?.value) ?? 1;
    const q = num(firstChild(inner, "BilledQuantity")?.value);
    if (!price || q === null || p === null || !(base > 0)) { computable = false; lines.push({ net: null, fixed: false, inner }); return; }
    lines.push({ net: roundHalfUpToCents((q * p) / base), fixed: true, inner });
  });
  if (!computable) {
    skipped.push("Some line has no quantity or net price to compute from; nothing was recomputed.");
    return unchanged();
  }

  lines.forEach((l, i) => {
    if (l.fixed) edit("IncludedSupplyChainTradeLineItem", i, "LineTotalAmount", [], `/lines/${i}/net`, fmt(l.net), "Line net is quantity times unit price.");
  });
  const netSum = lines.reduce((s, l) => roundHalfUpToCents(s + l.net), 0);

  const settle = [...xml.matchAll(tagRe("ApplicableHeaderTradeSettlement"))];
  if (settle.length !== 1) {
    skipped.push("Tax and totals were not recomputed: the file does not have exactly one header settlement block.");
  } else {
    const hs = settle[0][3];
    const headerAdjust = new RegExp(`<${P}SpecifiedTradeAllowanceCharge[\\s>]`).test(hs);
    const sum = new RegExp(`<${P}SpecifiedTradeSettlementHeaderMonetarySummation[\\s>]`).test(hs);
    if (!sum) {
      skipped.push("The header monetary summation is missing; add it before repairing.");
    } else if (headerAdjust) {
      skipped.push("The document has header allowances or charges; tax and totals were not recomputed.");
    } else {
      // Tax groups from the lines, keyed by category and rate.
      const groups = new Map();
      let bad = false;
      for (const l of lines) {
        const t = new RegExp(`<${P}ApplicableTradeTax[\\s>][\\s\\S]*?</${P}ApplicableTradeTax>`).exec(l.inner)?.[0] || "";
        const id = firstChild(t, "CategoryCode")?.value.trim();
        const pct = num(firstChild(t, "RateApplicablePercent")?.value);
        if (!id || pct === null) { bad = true; break; }
        const key = `${id}|${pct}`;
        groups.set(key, { id, pct, taxable: roundHalfUpToCents((groups.get(key)?.taxable || 0) + l.net) });
      }
      // Header ApplicableTradeTax blocks (direct children of the settlement).
      const headerTaxes = [...hs.matchAll(tagRe("ApplicableTradeTax"))];
      const keys = headerTaxes.map((t) => `${firstChild(t[3], "CategoryCode")?.value.trim()}|${num(firstChild(t[3], "RateApplicablePercent")?.value)}`);
      const ok = !bad && groups.size === headerTaxes.length && [...groups.keys()].every((k) => keys.includes(k)) && new Set(keys).size === keys.length;
      const taxAmounts = [...hs.matchAll(tagRe("TaxTotalAmount"))];
      let tax = null;
      if (!ok) {
        skipped.push("Tax was not recomputed: a line's tax category or rate is unreadable, or the lines' tax groups do not match the header tax blocks one to one. Add or fix the block yourself.");
      } else if (taxAmounts.length !== 1) {
        skipped.push("Tax was not recomputed: the file does not have exactly one TaxTotalAmount (a second one is the tax currency's).");
      } else {
        tax = 0;
        const headerStart = settle[0].index + settle[0][0].indexOf(">") + 1;
        headerTaxes.forEach((t, j) => {
          const g = groups.get(keys[j]);
          const amt = roundHalfUpToCents((g.taxable * g.pct) / 100);
          tax = roundHalfUpToCents(tax + amt);
          // Re-find the j-th header tax block in the current text and edit inside it.
          const cur = [...xml.slice(headerStart).matchAll(tagRe("ApplicableTradeTax"))][j];
          const open = cur[0].indexOf(">") + 1;
          let inner = cur[3];
          const rep = (child, value, path, reason) => {
            const c = firstChild(inner, child);
            if (!c || num(inner.slice(c.start, c.end)) === Number(value)) return;
            changes.push({ path, from: inner.slice(c.start, c.end).trim(), to: value, reason });
            inner = inner.slice(0, c.start) + value + inner.slice(c.end);
          };
          rep("BasisAmount", fmt(g.taxable), `/tax_breakdown/${j}/taxable`, "Taxable amount is the sum of the nets of the lines in this tax group.");
          rep("CalculatedAmount", fmt(amt), `/tax_breakdown/${j}/tax`, `Tax is the taxable amount times ${g.pct}%, rounded half up.`);
          const abs = headerStart + cur.index + open;
          xml = xml.slice(0, abs) + inner + xml.slice(abs + cur[3].length);
        });
      }
      const sm = (child, value, path, reason) => edit("SpecifiedTradeSettlementHeaderMonetarySummation", 0, child, [], path, value, reason);
      sm("LineTotalAmount", fmt(netSum), "/totals/lines", "Sum of the line nets.");
      sm("TaxBasisTotalAmount", fmt(netSum), "/totals/net", "Net total is the sum of the line nets (no header allowances or charges).");
      if (tax !== null) {
        sm("TaxTotalAmount", fmt(tax), "/totals/tax", "Document tax is the sum of the tax groups.");
        const gross = roundHalfUpToCents(netSum + tax);
        sm("GrandTotalAmount", fmt(gross), "/totals/gross", "Gross is net plus tax.");
        const block = [...xml.matchAll(tagRe("SpecifiedTradeSettlementHeaderMonetarySummation"))][0][3];
        const pre = num(firstChild(block, "TotalPrepaidAmount")?.value) ?? 0;
        const rnd = num(firstChild(block, "RoundingAmount")?.value) ?? 0;
        sm("DuePayableAmount", fmt(roundHalfUpToCents(gross - pre + rnd)), "/totals/due", "Amount due is gross minus prepaid plus rounding.");
      }
    }
  }

  const remaining = checkInvoice(parseCiiInvoice(xml));
  return { xml, changes, skipped, before, remaining, repaired: changes.length > 0 };
}
