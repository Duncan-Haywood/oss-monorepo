// Repair the arithmetic of a UN/CEFACT CII invoice (XRechnung CII, ZUGFeRD,
// the XML inside a Factur-X PDF), and nothing else. Same contract as
// repair-ubl.mjs: edits happen on the original text so every untouched byte
// stays, only amounts the lines fully determine are recomputed (line totals,
// each header tax group's basis and tax, the monetary summation, with header
// allowances and charges (BG-20/BG-21) taken off or added to their tax group
// since 2026-11-14), and a document whose tax groups do not match the lines and
// allowances one to one, or whose allowance has no readable amount, indicator or
// category, has its tax part skipped and said so. The result is re-parsed and
// re-checked.

import { checkInvoice, roundHalfUpToCents, wholeUnitTaxAgrees } from "./checks.mjs";
import { parseCiiInvoice } from "./cii.mjs";
import { fmt, tagRe, num, firstChild } from "./repair-ubl.mjs";

const P = "(?:[\\w.-]+:)?";

// "Category|rate" of a block holding CategoryCode and RateApplicablePercent; E, Z and O
// with no rate count as 0% (EN 16931 lets O omit it). Null when unreadable.
function taxKey(block) {
  const id = firstChild(block, "CategoryCode")?.value.trim();
  const pct = num(firstChild(block, "RateApplicablePercent")?.value);
  const rate = pct ?? (id && /^[EZO]$/.test(id) ? 0 : null);
  if (!id || rate === null || Number.isNaN(rate)) return null;
  return `${id}|${rate}`;
}

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
    const sum = new RegExp(`<${P}SpecifiedTradeSettlementHeaderMonetarySummation[\\s>]`).test(hs);
    // Header allowances and charges (BG-20/BG-21): SpecifiedTradeAllowanceCharge directly in
    // the header settlement, and ZUGFeRD EXTENDED's SpecifiedLogisticsServiceCharge, which
    // counts as a charge (as cii.mjs reads it for the checks). Each moves its own tax group's
    // basis (BT-116 = line nets - allowances + charges in the category).
    const adjust = [];
    let adjustOk = true;
    for (const a of hs.matchAll(tagRe("SpecifiedTradeAllowanceCharge"))) {
      const indBlock = tagRe("ChargeIndicator", "").exec(a[3])?.[3] || "";
      const ind = firstChild(indBlock, "Indicator")?.value.trim().toLowerCase();
      const amount = num(firstChild(a[3], "ActualAmount")?.value);
      const cat = tagRe("CategoryTradeTax", "").exec(a[3])?.[3] || "";
      const key = taxKey(cat);
      if (!["true", "false", "1", "0"].includes(ind) || amount === null || Number.isNaN(amount) || !key) { adjustOk = false; continue; }
      adjust.push({ charge: ind === "true" || ind === "1", amount, key });
    }
    for (const a of hs.matchAll(tagRe("SpecifiedLogisticsServiceCharge"))) {
      const amount = num(firstChild(a[3], "AppliedAmount")?.value);
      const key = taxKey(tagRe("AppliedTradeTax", "").exec(a[3])?.[3] || "");
      if (amount === null || Number.isNaN(amount) || !key) { adjustOk = false; continue; }
      adjust.push({ charge: true, amount, key });
    }
    const allowances = adjust.filter((a) => !a.charge).reduce((s, a) => roundHalfUpToCents(s + a.amount), 0);
    const charges = adjust.filter((a) => a.charge).reduce((s, a) => roundHalfUpToCents(s + a.amount), 0);
    const net = roundHalfUpToCents(netSum - allowances + charges);
    if (!sum) {
      skipped.push("The header monetary summation is missing; add it before repairing.");
    } else if (!adjustOk) {
      skipped.push("A header allowance or charge has no readable indicator, amount, tax category or rate; tax and totals were not recomputed.");
    } else {
      // Tax groups from the lines, keyed by category and rate.
      const groups = new Map();
      let bad = false;
      for (const l of lines) {
        const t = new RegExp(`<${P}ApplicableTradeTax[\\s>][\\s\\S]*?</${P}ApplicableTradeTax>`).exec(l.inner)?.[0] || "";
        const key = taxKey(t);
        if (!key) { bad = true; break; }
        const [id, pct] = [key.split("|")[0], Number(key.split("|")[1])];
        groups.set(key, { id, pct, taxable: roundHalfUpToCents((groups.get(key)?.taxable || 0) + l.net), count: (groups.get(key)?.count || 0) + 1 });
      }
      for (const a of adjust) {
        const g = groups.get(a.key) || { id: a.key.split("|")[0], pct: Number(a.key.split("|")[1]), taxable: 0, count: 0 };
        g.taxable = roundHalfUpToCents(g.taxable + (a.charge ? a.amount : -a.amount));
        groups.set(a.key, g);
      }
      // Header ApplicableTradeTax blocks (direct children of the settlement).
      const headerTaxes = [...hs.matchAll(tagRe("ApplicableTradeTax"))];
      const keys = headerTaxes.map((t) => taxKey(t[3]) || "?");
      // A group whose lines and allowances net to zero needs no header block.
      for (const [k, g] of groups) if (g.taxable === 0 && !keys.includes(k)) groups.delete(k);
      const ok = !bad && groups.size === headerTaxes.length && [...groups.keys()].every((k) => keys.includes(k)) && new Set(keys).size === keys.length;
      // BT-110 is the TaxTotalAmount in the invoice currency; a second one is BT-111, the tax
      // in the VAT accounting currency (TaxCurrencyCode, BT-6). KoSIT's 02.0xa cases and CEN's
      // example 5 state both (EUR and GBP, DKK and EUR): converting BT-111 needs the seller's
      // exchange rate, so it is left as written and said so, as the UBL repair does.
      const taxAmounts = [...hs.matchAll(tagRe("TaxTotalAmount"))];
      const invoiceCurrency = firstChild(hs, "InvoiceCurrencyCode")?.value.trim() || firstChild(xml, "InvoiceCurrencyCode")?.value.trim();
      const curOf = (m) => /\bcurrencyID\s*=\s*"([^"]*)"/.exec(m[2] || "")?.[1]?.trim() || null;
      let taxAt = taxAmounts.length === 1 ? 0 : -1;
      let accounting = null;
      if (taxAmounts.length === 2 && invoiceCurrency) {
        const marks = taxAmounts.map(curOf);
        if (marks[0] === invoiceCurrency && marks[1] === invoiceCurrency) { taxAt = 0; accounting = { at: 1, same: true }; }
        else if (marks.filter((c) => c === invoiceCurrency).length === 1 && marks.every((c) => c)) {
          taxAt = marks.indexOf(invoiceCurrency);
          accounting = { at: 1 - taxAt, same: false, currency: marks[1 - taxAt] };
        }
      }
      let tax = null;
      if (!ok) {
        skipped.push("Tax was not recomputed: a line's tax category or rate is unreadable, or the lines' tax groups do not match the header tax blocks one to one. Add or fix the block yourself.");
      } else if (taxAt === -1) {
        skipped.push("Tax was not recomputed: the file does not have exactly one TaxTotalAmount in the invoice currency (a second one, BT-111, is the VAT accounting currency's, and needs its own currencyID).");
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
      const smNeeded = (child, value, path, reason) => {
        if (!sm(child, value, path, reason) && Number(value) !== 0) skipped.push(`${child} is missing; it should be ${value}. The repair does not add elements.`);
      };
      smNeeded("AllowanceTotalAmount", fmt(allowances), "/totals/allowances", "Sum of the header allowances.");
      smNeeded("ChargeTotalAmount", fmt(charges), "/totals/charges", "Sum of the header charges.");
      sm("TaxBasisTotalAmount", fmt(net), "/totals/net", adjust.length ? "Net total is the line nets minus header allowances plus charges." : "Net total is the sum of the line nets (no header allowances or charges).");
      if (tax !== null) {
        // Edit the nth TaxTotalAmount of the summation (BT-110, or BT-111 when it repeats it).
        const editTax = (n, value, path, reason) => {
          const b = [...xml.matchAll(tagRe("SpecifiedTradeSettlementHeaderMonetarySummation"))][0];
          const m = [...b[3].matchAll(tagRe("TaxTotalAmount"))][n];
          if (!m || num(m[3]) === Number(value)) return;
          const at = b.index + b[0].indexOf(">") + 1 + m.index + m[0].indexOf(">") + 1;
          changes.push({ path, from: m[3].trim(), to: value, reason });
          xml = xml.slice(0, at) + value + xml.slice(at + m[3].length);
        };
        editTax(taxAt, fmt(tax), "/totals/tax", "Document tax is the sum of the tax groups.");
        if (accounting?.same) editTax(accounting.at, fmt(tax), "/totals/tax_accounting_currency", "The tax in the VAT accounting currency (BT-111) repeats the document tax when both currencies are the same.");
        else if (accounting) skipped.push(`The tax in the VAT accounting currency (BT-111, ${accounting.currency}) was left as written: converting it needs your exchange rate.`);
        const gross = roundHalfUpToCents(net + tax);
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
