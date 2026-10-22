// Repair the arithmetic of a UN/CEFACT CII invoice (XRechnung CII, ZUGFeRD,
// Factur-X XML) and nothing else, the same way repair-ubl.mjs does for UBL.
//
// Works on the original text, so every element it does not touch stays byte
// for byte. It recomputes only what the lines fully determine: each line's
// LineTotalAmount (BilledQuantity times the net price, divided by
// BasisQuantity), each header tax group's BasisAmount and CalculatedAmount,
// and the header totals. It never picks a rate, category, date, identifier or
// party. A document with header allowances or charges, or tax groups that do
// not match the header ApplicableTradeTax elements one to one, has its tax and
// totals left alone and says so. The result is re-parsed and re-checked.

import { checkInvoice, roundHalfUpToCents } from "./checks.mjs";
import { parseCiiInvoice, looksLikeCii } from "./cii.mjs";
import { tagRe, firstChild, num, fmt } from "./repair-ubl.mjs";

const optional = (re, s) => re.test(s);

export function repairCii(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  const before = checkInvoice(parseCiiInvoice(text));
  const changes = [];
  const skipped = [];
  let xml = text;

  // Replace a child's value inside the nth block of `blockName`.
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

  const lineBlocks = [...xml.matchAll(tagRe("IncludedSupplyChainTradeLineItem"))];
  const lines = [];
  let computable = lineBlocks.length > 0;
  lineBlocks.forEach((b, i) => {
    const inner = b[3];
    if (optional(/<(?:[\w.-]+:)?SpecifiedTradeAllowanceCharge[\s>]/, inner)) {
      skipped.push(`Line ${i + 1} has its own allowance or charge; its total is left as written.`);
      const kept = num(firstChild(inner, "LineTotalAmount")?.value);
      lines.push({ net: kept, fixed: false, inner });
      if (kept === null) computable = false;
      return;
    }
    const price = /<(?:[\w.-]+:)?NetPriceProductTradePrice[\s>][\s\S]*?<\/(?:[\w.-]+:)?NetPriceProductTradePrice>/.exec(inner)?.[0] || "";
    const q = num(firstChild(inner, "BilledQuantity")?.value);
    const p = num(firstChild(price, "ChargeAmount")?.value);
    const base = num(firstChild(price, "BasisQuantity")?.value) ?? 1;
    if (q === null || p === null || !(base > 0)) { computable = false; lines.push({ net: null, fixed: false, inner }); return; }
    lines.push({ net: roundHalfUpToCents((q * p) / base), fixed: true, inner });
  });
  if (!computable) {
    skipped.push("Some line has no quantity or net price to compute from; nothing was recomputed.");
    return { xml: text, changes, skipped, before, remaining: before, repaired: false };
  }

  lines.forEach((l, i) => {
    if (l.fixed) edit("IncludedSupplyChainTradeLineItem", i, "LineTotalAmount", [], `/lines/${i}/net`, fmt(l.net), "Line net is quantity times net unit price.");
  });
  const netSum = lines.reduce((s, l) => roundHalfUpToCents(s + l.net), 0);

  const settle = [...xml.matchAll(tagRe("ApplicableHeaderTradeSettlement"))][0];
  if (!settle) {
    skipped.push("No ApplicableHeaderTradeSettlement; header tax and totals were not recomputed.");
    return { xml, changes, skipped, before, remaining: checkInvoice(parseCiiInvoice(xml)), repaired: changes.length > 0 };
  }
  const hasHeaderAdjust = /<(?:[\w.-]+:)?SpecifiedTradeAllowanceCharge[\s>]/.test(settle[3]);
  let tax = null;
  if (hasHeaderAdjust) {
    skipped.push("The document has header allowances or charges; tax and totals were not recomputed.");
  } else {
    const groups = new Map();
    for (const l of lines) {
      const t = /<(?:[\w.-]+:)?ApplicableTradeTax[\s>][\s\S]*?<\/(?:[\w.-]+:)?ApplicableTradeTax>/.exec(l.inner)?.[0] || "";
      const id = firstChild(t, "CategoryCode")?.value.trim();
      const pct = num(firstChild(t, "RateApplicablePercent")?.value);
      if (!id || pct === null) { groups.clear(); groups.set("bad", 1); break; }
      const key = `${id}|${pct}`;
      groups.set(key, { id, pct, taxable: roundHalfUpToCents((groups.get(key)?.taxable || 0) + l.net) });
    }
    // Header-level tax blocks only: those inside the settlement but not in a line.
    const headerTax = [...settle[3].matchAll(tagRe("ApplicableTradeTax"))];
    const subKey = headerTax.map((s) => `${firstChild(s[3], "CategoryCode")?.value.trim()}|${num(firstChild(s[3], "RateApplicablePercent")?.value)}`);
    const ok = !groups.has("bad") && groups.size === headerTax.length && [...groups.keys()].every((k) => subKey.includes(k)) && new Set(subKey).size === subKey.length;
    if (!ok) {
      skipped.push("Tax was not recomputed: a line's tax category or rate is unreadable, or the lines' tax groups do not match the header ApplicableTradeTax elements one to one. Add or fix the group yourself.");
    } else {
      tax = 0;
      headerTax.forEach((s, j) => {
        const g = groups.get(subKey[j]);
        const t = roundHalfUpToCents((g.taxable * g.pct) / 100);
        tax = roundHalfUpToCents(tax + t);
        const cur = [...xml.matchAll(tagRe("ApplicableHeaderTradeSettlement"))][0];
        const curTax = [...cur[3].matchAll(tagRe("ApplicableTradeTax"))][j];
        const open = cur[0].indexOf(">") + 1;
        let inner = curTax[3];
        const rep = (child, value, path, reason) => {
          const c = firstChild(inner, child);
          if (!c || num(inner.slice(c.start, c.end)) === Number(value)) return;
          changes.push({ path, from: inner.slice(c.start, c.end).trim(), to: value, reason });
          inner = inner.slice(0, c.start) + value + inner.slice(c.end);
        };
        rep("BasisAmount", fmt(g.taxable), `/tax_breakdown/${j}/taxable`, "Taxable amount is the sum of the nets of the lines in this tax group.");
        rep("CalculatedAmount", fmt(t), `/tax_breakdown/${j}/tax`, `Tax is the taxable amount times ${g.pct}%, rounded half up.`);
        const tOpen = curTax[0].indexOf(">") + 1;
        const abs = cur.index + open + curTax.index + tOpen;
        xml = xml.slice(0, abs) + inner + xml.slice(abs + curTax[3].length);
      });
    }
  }

  if (!hasHeaderAdjust) {
    const hm = (child, value, path, reason) => edit("SpecifiedTradeSettlementHeaderMonetarySummation", 0, child, [], path, value, reason);
    hm("LineTotalAmount", fmt(netSum), "/totals/lines", "Sum of the line nets.");
    hm("TaxBasisTotalAmount", fmt(netSum), "/totals/net", "Net total is the sum of the line nets (no header allowances or charges).");
    if (tax !== null) {
      hm("TaxTotalAmount", fmt(tax), "/totals/tax", "Document tax is the sum of the tax groups.");
      const gross = roundHalfUpToCents(netSum + tax);
      hm("GrandTotalAmount", fmt(gross), "/totals/gross", "Gross is net plus tax.");
      const blk = [...xml.matchAll(tagRe("SpecifiedTradeSettlementHeaderMonetarySummation"))][0];
      const pre = num(firstChild(blk[3], "TotalPrepaidAmount")?.value) ?? 0;
      const rnd = num(firstChild(blk[3], "RoundingAmount")?.value) ?? 0;
      hm("DuePayableAmount", fmt(roundHalfUpToCents(gross - pre + rnd)), "/totals/due", "Amount due is gross minus prepaid plus rounding.");
    }
  }

  const remaining = checkInvoice(parseCiiInvoice(xml));
  return { xml, changes, skipped, before, remaining, repaired: changes.length > 0 };
}

// UBL or CII, by what the file says it is.
export async function repairXml(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  if (looksLikeCii(text)) return repairCii(text);
  const { repairUbl } = await import("./repair-ubl.mjs");
  return repairUbl(text);
}
