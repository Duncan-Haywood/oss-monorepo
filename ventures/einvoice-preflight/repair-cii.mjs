// Repair the arithmetic of a UN/CEFACT CII invoice (XRechnung CII, ZUGFeRD,
// the XML inside a Factur-X PDF), and nothing else. Same contract as
// repair-ubl.mjs: edits happen on the original text so every untouched byte
// stays, only amounts the lines fully determine are recomputed (line totals,
// each header tax group's basis and tax, the monetary summation), and a
// document with header allowances or charges, or tax groups that do not match
// the lines one to one, has its tax part skipped and said so. The result is
// re-parsed and re-checked.

import { checkInvoice, roundHalfUpToCents, wholeUnitTaxAgrees } from "./checks.mjs";
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
  // ZUGFeRD EXTENDED sub-invoice lines (ParentLineID, LineStatusReasonCode GROUP / DETAIL /
  // INFORMATION) are flat line items whose totals do not simply add up: a group line repeats
  // its details' sum, an information line counts for nothing. Summing them all doubled the
  // taxable amount of Mustang's and the ZUGFeRD 2.5 sub-line samples (2026-11-14).
  if (lineBlocks.some((b) => new RegExp(`<${P}(?:ParentLineID|LineStatusReasonCode)[\\s>]`).test(b[3]))) {
    skipped.push("The file has sub-invoice lines (ParentLineID or LineStatusReasonCode, ZUGFeRD EXTENDED); their totals do not simply add up, so nothing was recomputed.");
    return unchanged();
  }
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
    lines.push({ net: roundHalfUpToCents((q * p) / base), written: kept, fixed: true, inner });
  });
  if (!computable) {
    skipped.push("Some line has no quantity or net price to compute from; nothing was recomputed.");
    return unchanged();
  }

  // A line net the header already agrees with is kept (2026-11-14, eval/repair-real-files.mjs):
  // when every line states a net and they add up to the stated sum of line nets (BT-106,
  // BR-CO-10), the totals corroborate the nets, so a quantity x price that disagrees points
  // at the price or quantity, not the net (KoSIT's gross-price insurance samples: net price
  // 67.2244 on a line of 80.00). Rewriting them changed the amount billed on valid files.
  const sumBlock = [...xml.matchAll(tagRe("SpecifiedTradeSettlementHeaderMonetarySummation"))][0]?.[3];
  const statedLines = sumBlock ? num(firstChild(sumBlock, "LineTotalAmount")?.value) : null;
  const off = lines.filter((l) => l.fixed && l.written !== null && roundHalfUpToCents(l.written) !== l.net);
  if (off.length && statedLines !== null && lines.every((l) => l.net !== null && (l.written ?? l.net) !== null && !Number.isNaN(l.written ?? l.net))
      && roundHalfUpToCents(lines.reduce((s, l) => s + (l.fixed ? l.written : l.net), 0)) === roundHalfUpToCents(statedLines)) {
    for (const l of off) {
      skipped.push(`Line ${lines.indexOf(l) + 1}'s net (${fmt(l.written)}) is not quantity times price (${fmt(l.net)}), but the line nets add up to the stated total of lines (BT-106), so the net was kept: check the line's price or quantity.`);
      l.net = l.written;
      l.fixed = false;
    }
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
        groups.set(key, { id, pct, taxable: roundHalfUpToCents((groups.get(key)?.taxable || 0) + l.net), count: (groups.get(key)?.count || 0) + 1 });
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
          let amt = roundHalfUpToCents((g.taxable * g.pct) / 100);
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
          // A tax a cent or so off is the seller's per-line rounding, which EN 16931 accepts
          // (BR-CO-17 / BR-S-09 allow up to one currency unit): kept when the basis is right
          // and the gap is at most a cent per line in the group.
          const writtenBasis = num(firstChild(inner, "BasisAmount")?.value);
          const writtenTax = num(firstChild(inner, "CalculatedAmount")?.value);
          const slack = 0.01 * Math.max(1, g.count || 0);
          // Hungarian VAT in whole forints (CEN's huf_example_cii: 18679 for 18678.60) is kept too.
          const currency = firstChild(xml, "InvoiceCurrencyCode")?.value.trim();
          const huf = writtenBasis === g.taxable && wholeUnitTaxAgrees(currency, writtenTax, (g.taxable * g.pct) / 100);
          if (huf && writtenTax !== amt) {
            skipped.push(`Tax group ${j + 1} (${writtenTax}) is ${fmt(amt)} rounded to the whole forint, as Hungarian VAT is stated; kept.`);
            amt = writtenTax;
          } else if (writtenBasis === g.taxable && writtenTax !== null && !Number.isNaN(writtenTax) && writtenTax !== amt && Math.abs(writtenTax - amt) <= slack + 1e-9) {
            skipped.push(`Tax group ${j + 1} (${fmt(writtenTax)}) is ${fmt(Math.abs(writtenTax - amt))} off basis x rate (${fmt(amt)}); within a cent per line, as per-line rounding gives, so it was kept (EN 16931 BR-CO-17 accepts up to 1.00).`);
            amt = writtenTax;
          }
          tax = roundHalfUpToCents(tax + amt);
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
