// Repair the arithmetic of a UBL Invoice or CreditNote file, and nothing else.
//
// Works on the original text, so comments, namespaces, attribute order and
// every element it does not touch stay byte for byte. It recomputes only what
// the lines and the document-level allowances and charges fully determine, the
// way EN 16931 does: each line's net (quantity times unit price; a line with its
// own allowances and charges added in), the taxable amount and VAT of each
// category subtotal (line nets minus allowances plus charges in that category,
// times the rate, rounded half up), and the document totals. It never picks a
// rate, category, date, identifier or party, and never adds an element. A tax
// group with no subtotal to hold it, or a header allowance with no readable
// category, stops the tax part and says so. The repaired file is re-parsed and
// re-checked so the caller sees what is still wrong.
//
// Saudi (ZATCA) files get three more things, each from a published KSA rule:
// a line's own TaxTotal (KSA-11 line VAT, KSA-12 line amount with VAT,
// BR-KSA-51) is kept consistent with the line; a prepayment line's subtotal
// (KSA-31/32) has its VAT recomputed (BR-KSA-79); and a subtotal's VAT that sits
// within ZATCA's own tolerance (0.01 per invoice line, BR-S-09/BR-CO-17 in
// ZATCA's cut of EN 16931) is left as written, since that is how a price
// that already includes VAT comes out.
//
// PINT Oman files (CustomizationID ...@om-1) price lines to the baisa, a
// thousandth of a rial, and state each line's VAT (BTOM-016) and amount with VAT
// (BTOM-017) in cac:ItemPriceExtension. For them a recomputed line net is rounded
// to three decimals, not two; a line VAT more than 0.001 off net x rate is
// rewritten to it, rounded to three decimals (IBR-168-OM); and BTOM-017 more than
// 0.01 off net plus line VAT is rewritten (IBR-158-OM; not on a profit margin
// invoice, where it is the item's sale value).

import { checkInvoice, roundHalfUpToCents } from "./checks.mjs";
import { parseUblInvoice } from "./ubl.mjs";

export const fmt = (n) => roundHalfUpToCents(n).toFixed(2);
// Half up to the baisa (three decimals), through toPrecision so 0.0475 is not 0.047.
export const roundBaisa = (n) => {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Number((Math.abs(n) * 1000).toPrecision(12)))) / 1000;
};
// Two decimals when the amount has no baisa part, three when it has.
export const fmtBaisa = (n) => {
  const v = roundBaisa(n);
  return roundHalfUpToCents(v) === v ? v.toFixed(2) : v.toFixed(3);
};
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
  return { start: m.index + open, end: m.index + open + m[3].length, value: block.slice(m.index + open, m.index + open + m[3].length) };
}

const blocks = (xml, name) => [...xml.matchAll(tagRe(name))].map((m) => {
  const open = m.index + m[0].indexOf(">") + 1;
  return { start: m.index, end: m.index + m[0].length, open, inner: m[3], attrs: m[2] || "" };
});
const noScheme = (s) => s.replace(/<(?:[\w.-]+:)?TaxScheme[\s>][\s\S]*?<\/(?:[\w.-]+:)?TaxScheme>/, "");
// Tax category ID and percent of a block holding a TaxCategory or ClassifiedTaxCategory.
function category(inner, name = "TaxCategory") {
  const cat = new RegExp(`<(?:[\\w.-]+:)?${name}[\\s>][\\s\\S]*?</(?:[\\w.-]+:)?${name}>`).exec(inner)?.[0];
  if (!cat) return { id: null, pct: null };
  return { id: firstChild(noScheme(cat), "ID")?.value.trim() || null, pct: num(firstChild(cat, "Percent")?.value) };
}
const currencyOf = (attrs) => /currencyID\s*=\s*"([^"]*)"/.exec(attrs || "")?.[1] ?? null;

export function repairUbl(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  const before = checkInvoice(parseUblInvoice(text));
  const changes = [];
  const skipped = [];
  const xml = text;
  const edits = []; // {start, end, value}, applied at the end from the back

  // Plan a new value for the child `child` of a block (offsets on the original text).
  const set = (block, child, skip, path, value, reason) => {
    const c = firstChild(block.inner, child, skip);
    if (!c) return false;
    if (num(c.value) === Number(value)) return true;
    edits.push({ start: block.open + c.start, end: block.open + c.end, value });
    changes.push({ path, from: c.value.trim(), to: value, reason });
    return true;
  };
  const done = () => {
    let out = xml;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.value + out.slice(e.end);
    return out;
  };
  const finish = () => {
    const out = done();
    const remaining = edits.length ? checkInvoice(parseUblInvoice(out)) : before;
    return { xml: out, changes, skipped, before, remaining, repaired: changes.length > 0 };
  };

  const lineName = /<(?:[\w.-]+:)?(InvoiceLine|CreditNoteLine|DebitNoteLine)[\s>]/.exec(xml)?.[1];
  if (!lineName) return finish();
  const lineBlocks = blocks(xml, lineName);
  const inLine = (pos) => lineBlocks.some((b) => pos > b.start && pos < b.end);
  const qtyName = { InvoiceLine: "InvoicedQuantity", CreditNoteLine: "CreditedQuantity", DebitNoteLine: "DebitedQuantity" }[lineName];
  const docCurrency = firstChild(xml, "DocumentCurrencyCode")?.value.trim() || null;
  const zatca = /<(?:[\w.-]+:)?ProfileID[^>]*>\s*reporting:1\.0\s*</.test(xml)
    || /<(?:[\w.-]+:)?InvoiceTypeCode[^>]*\bname\s*=\s*"0[12]\d{5}"/.test(xml);
  // PINT Oman: lines to the baisa, BTOM-016/017 in ItemPriceExtension.
  const oman = /<(?:[\w.-]+:)?CustomizationID[^>]*>[^<]*@om-1[^<]*</.test(xml);
  // BTOM-001, the 20-digit transaction type: position 10 marks a profit margin invoice.
  const omType = /<(?:[\w.-]+:)?(?:InvoiceTypeCode|CreditNoteTypeCode)[^>]*\bname\s*=\s*"([01]{20})"/.exec(xml)?.[1] ?? null;
  const profitMargin = omType !== null && omType[9] === "1";
  // Any PINT jurisdiction; PINT UAE in particular.
  const pint = /<(?:[\w.-]+:)?CustomizationID[^>]*>[^<]*urn:peppol:pint:[^<]*</.test(xml);
  const uae = pint && /<(?:[\w.-]+:)?CustomizationID[^>]*>[^<]*@ae-1[^<]*</.test(xml);
  // Categories whose tax is 0 whatever rate they state: reverse charge (EN 16931 BR-AE-08,
  // PINT UAE aligned-ibrp-ae-09-ae, which states the rate, 5%, with a tax of 0) and PINT
  // UAE's margin scheme "N" (ibr-108-ae).
  const zeroTax = (id) => id === "AE" || (uae && id === "N");

  const lines = [];
  let computable = lineBlocks.length > 0;
  lineBlocks.forEach((b, i) => {
    const inner = b.inner;
    const own = firstChild(inner, "LineExtensionAmount", ["TaxTotal"]);
    const written = num(own?.value);
    const keep = (why) => {
      skipped.push(`Line ${i + 1} ${why}; its net is left as written.`);
      lines.push({ b, net: written, written, fixed: false });
      if (written === null) computable = false;
    };
    if (/<(?:[\w.-]+:)?(?:Sub\w+Line)[\s>]/.test(inner)) return keep("has sub-lines");
    // The line's own allowances and charges (BG-27/BG-28). One inside Price is the
    // gross-to-net price discount (BT-147), already inside the net price (BT-146).
    const outside = inner.replace(tagRe("Price"), (m) => " ".repeat(m.length));
    let adj = 0;
    for (const a of blocks(outside, "AllowanceCharge")) {
      const ind = firstChild(a.inner, "ChargeIndicator")?.value.trim().toLowerCase();
      const amt = num(firstChild(a.inner, "Amount")?.value);
      if (!["true", "false"].includes(ind) || amt === null || Number.isNaN(amt)) return keep("has an allowance or charge with no readable indicator or amount");
      adj += ind === "true" ? amt : -amt;
    }
    const q = num(firstChild(inner, qtyName)?.value);
    const p = num(firstChild(inner, "PriceAmount")?.value);
    const base = num(firstChild(inner, "BaseQuantity")?.value) ?? 1;
    if (q === null || p === null || !(base > 0)) { computable = false; lines.push({ b, net: null, written, fixed: false }); return; }
    // Oman: the exact net to the baisa (IBR line net rule: q x p / base + charges - allowances).
    const net = oman ? roundBaisa((q * p) / base + adj) : roundHalfUpToCents(roundHalfUpToCents((q * p) / base) + adj);
    // Some producers state a base quantity and still net the line as quantity x price (LHDN's
    // PINT MY CompleteSample: 10 x 10.00 per 10 written as 100.00); the checks accept that
    // reading (acceptedLineNet in linenet.mjs), so a net written that way is kept too.
    const unscaled = base !== 1 && written !== null && roundHalfUpToCents(written) === roundHalfUpToCents(roundHalfUpToCents(q * p) + adj);
    lines.push({ b, net: unscaled ? written : net, written, fixed: true });
  });
  if (!computable) {
    skipped.push("Some line has no quantity or price to compute from; nothing was recomputed.");
    return finish();
  }

  lines.forEach((l, i) => {
    // A net written with more decimals (PINT allows them) that rounds to the right cent is
    // kept, and summed as written: ten PINT Oman lines of 0.047 OMR make 0.47, not 0.50.
    if (l.fixed && l.written !== null && roundHalfUpToCents(l.written) === roundHalfUpToCents(l.net)) { l.net = l.written; return; }
    if (l.fixed && oman) set(l.b, "LineExtensionAmount", ["TaxTotal", "ItemPriceExtension"], `/lines/${i}/net`, fmtBaisa(l.net), "Line net is quantity times unit price (per base quantity), plus the line's charges, minus its allowances, to the baisa (0.001 OMR).");
    else if (l.fixed) set(l.b, "LineExtensionAmount", ["TaxTotal"], `/lines/${i}/net`, fmt(l.net), "Line net is quantity times unit price (per base quantity), plus the line's charges, minus its allowances.");
  });
  const netSum = roundHalfUpToCents(lines.reduce((s, l) => s + l.net, 0));

  // PINT Oman's own line VAT (BTOM-016) and line amount with VAT (BTOM-017).
  if (oman) lines.forEach((l, i) => {
    const ext = blocks(l.b.inner, "ItemPriceExtension")[0];
    if (!ext || l.net === null) return;
    const abs = { ...ext, open: l.b.open + ext.open };
    const tt = blocks(ext.inner, "TaxTotal")[0];
    const { id, pct } = category(l.b.inner, "ClassifiedTaxCategory");
    const rate = pct ?? (id && /^[EZO]$/.test(id) ? 0 : null);
    let vat = tt ? num(firstChild(tt.inner, "TaxAmount")?.value) : null;
    if (tt && vat !== null && rate !== null) {
      const want = zeroTax(id) ? 0 : roundBaisa((l.net * rate) / 100);
      if (Number.isNaN(vat) || Math.abs(vat - want) > 0.001 + 1e-9) {
        set({ ...tt, open: abs.open + tt.open }, "TaxAmount", [], `/lines/${i}/vat`, fmtBaisa(want), `Line VAT (BTOM-016) is the line net times ${rate}%, to the baisa (IBR-168-OM); the written amount was more than 0.001 off.`);
        vat = want;
      }
    }
    l.vat = vat;
    if (vat === null || Number.isNaN(vat) || profitMargin) return;
    const amount = num(firstChild(ext.inner, "Amount", ["TaxTotal"])?.value);
    if (amount !== null && (Number.isNaN(amount) || Math.abs(amount - (l.net + vat)) > 0.01 + 1e-9)) {
      set(abs, "Amount", ["TaxTotal"], `/lines/${i}/amount_with_vat`, fmtBaisa(l.net + vat), "Line amount with VAT (BTOM-017) is the line net plus the line VAT (IBR-158-OM).");
    }
  });

  // A line's own TaxTotal. Only ZATCA defines what it holds, so other files keep it as written.
  let prepaySum = 0;
  let prepayRows = 0;
  lines.forEach((l, i) => {
    // PINT Oman's line VAT (BTOM-016) sits in ItemPriceExtension: not ZATCA's KSA-11 TaxTotal.
    const tt = blocks(l.b.inner.replace(tagRe("ItemPriceExtension"), (m) => " ".repeat(m.length)), "TaxTotal")[0];
    if (!tt) return;
    if (!zatca) {
      skipped.push(`Line ${i + 1} has its own TaxTotal; it was left as written (only ZATCA's KSA-11/12 say what it must hold).`);
      return;
    }
    const abs = { ...tt, open: l.b.open + tt.open };
    const { id, pct } = category(l.b.inner, "ClassifiedTaxCategory");
    const rate = pct ?? (id && /^[EZO]$/.test(id) ? 0 : null);
    let vat = num(firstChild(tt.inner, "TaxAmount", ["TaxSubtotal"])?.value);
    if (vat !== null && rate !== null) {
      const want = roundHalfUpToCents((l.net * rate) / 100);
      // Within 0.01 is kept: a price that already includes VAT (869.57 + 130.43 = 1000.00
      // in ZATCA's rounding example) comes out a cent under net x rate.
      if (Math.abs(vat - want) > 0.01 + 1e-9) {
        set(abs, "TaxAmount", ["TaxSubtotal"], `/lines/${i}/vat`, fmt(want), `Line VAT (KSA-11) is the line net times ${rate}%, rounded half up; the written amount was more than 0.01 off.`);
        vat = want;
      }
    }
    if (vat !== null && firstChild(tt.inner, "RoundingAmount", ["TaxSubtotal"])) {
      set(abs, "RoundingAmount", ["TaxSubtotal"], `/lines/${i}/amount_with_vat`, fmt(l.net + vat), "Line amount with VAT (KSA-12) is the line net plus the line VAT (BR-KSA-51).");
    }
    blocks(tt.inner, "TaxSubtotal").forEach((s, k) => {
      const sub = { ...s, open: abs.open + s.open };
      const c = category(s.inner);
      const taxable = num(firstChild(s.inner, "TaxableAmount")?.value);
      const r = c.pct ?? (c.id && /^[EZO]$/.test(c.id) ? 0 : null);
      if (taxable === null || r === null) return;
      const t = roundHalfUpToCents((taxable * r) / 100);
      set(sub, "TaxAmount", ["TaxCategory"], `/lines/${i}/prepayment/${k}/tax`, fmt(t), `Prepayment VAT (KSA-32) is the prepayment taxable amount (KSA-31) times ${r}% (BR-KSA-79).`);
      prepaySum = roundHalfUpToCents(prepaySum + taxable + t);
      prepayRows++;
    });
  });

  // Document-level allowances and charges (BG-20/BG-21): every one outside a line.
  const adjust = [];
  let adjustOk = true;
  for (const a of blocks(xml, "AllowanceCharge").filter((a) => !inLine(a.start))) {
    const charge = firstChild(a.inner, "ChargeIndicator")?.value.trim().toLowerCase();
    const amount = num(firstChild(a.inner, "Amount", ["TaxCategory"])?.value);
    const { id, pct } = category(a.inner);
    const rate = pct ?? (id && /^[EZO]$/.test(id) ? 0 : null);
    if (!["true", "false"].includes(charge) || amount === null || Number.isNaN(amount) || !id || rate === null) { adjustOk = false; continue; }
    adjust.push({ charge: charge === "true", amount, key: `${id}|${rate}` });
  }
  const allowances = adjust.filter((a) => !a.charge).reduce((s, a) => roundHalfUpToCents(s + a.amount), 0);
  const charges = adjust.filter((a) => a.charge).reduce((s, a) => roundHalfUpToCents(s + a.amount), 0);
  const lm = blocks(xml, "LegalMonetaryTotal")[0];

  if (!adjustOk) {
    skipped.push("A document-level allowance or charge has no readable indicator, amount, tax category or rate; tax and totals were not recomputed.");
    return finish();
  }

  // The document's TaxTotal: the root-level one with subtotals (BT-110). A root-level
  // one without subtotals is BT-111, the tax in the VAT accounting currency.
  const rootTotals = blocks(xml, "TaxTotal").filter((t) => !inLine(t.start));
  const withSubs = rootTotals.filter((t) => /<(?:[\w.-]+:)?TaxSubtotal[\s>]/.test(t.inner));
  const repeats = rootTotals.filter((t) => !withSubs.includes(t));
  let tax = null;
  if (withSubs.length !== 1 || repeats.length > 1) {
    skipped.push("Tax was not recomputed: the document does not have exactly one TaxTotal with subtotals (and at most one without, the tax currency's).");
  } else {
    const total = withSubs[0];
    const groups = new Map();
    let bad = false;
    for (const l of lines) {
      const { id, pct } = category(l.b.inner, "ClassifiedTaxCategory");
      const rate = pct ?? (id && /^[EZO]$/.test(id) ? 0 : null);
      if (!id || rate === null) { bad = true; break; }
      const key = `${id}|${rate}`;
      // A PINT line's own VAT (Oman's BTOM-016, ItemPriceExtension/TaxTotal) counts only
      // within a cent of net x rate, and only while every line at the rate states one.
      const ext = blocks(l.b.inner, "ItemPriceExtension")[0];
      const extTotal = ext ? blocks(ext.inner, "TaxTotal")[0] : null;
      const lv = l.vat !== undefined ? l.vat : extTotal ? num(firstChild(extTotal.inner, "TaxAmount")?.value) : null;
      const plausible = lv !== null && !Number.isNaN(lv) && Math.abs(lv - (zeroTax(id) ? 0 : (l.net * rate) / 100)) < 0.01 + 1e-9;
      const g = groups.get(key) || { pct: rate, taxable: 0, lineTax: 0, lineTaxAll: true };
      g.taxable += l.net;
      if (plausible) g.lineTax += lv;
      else g.lineTaxAll = false;
      groups.set(key, g);
    }
    for (const g of groups.values()) g.taxable = roundHalfUpToCents(g.taxable);
    for (const a of adjust) {
      const g = groups.get(a.key) || { pct: Number(a.key.split("|")[1]), taxable: 0, lineTax: 0, lineTaxAll: false };
      g.taxable = roundHalfUpToCents(g.taxable + (a.charge ? a.amount : -a.amount));
      g.lineTaxAll = false;
      groups.set(a.key, g);
    }
    const subtotals = blocks(total.inner, "TaxSubtotal").map((s) => ({ ...s, open: total.open + s.open }));
    const subKey = subtotals.map((s) => {
      const { id, pct } = category(s.inner);
      return `${id}|${pct ?? (id && /^[EZO]$/.test(id) ? 0 : null)}`;
    });
    // A rate whose lines net to zero needs no subtotal (a ZATCA prepayment line at
    // the old rate: quantity 0, net 0.00).
    for (const [k, g] of groups) if (g.taxable === 0 && !subKey.includes(k)) groups.delete(k);
    const ok = !bad && groups.size === subtotals.length && [...groups.keys()].every((k) => subKey.includes(k)) && new Set(subKey).size === subKey.length;
    if (!ok) {
      skipped.push("Tax was not recomputed: a line's or allowance's tax category or rate is unreadable, or the tax groups do not match the TaxSubtotal elements one to one. Add or fix the subtotal yourself.");
    } else {
      const tolerance = zatca ? (xml.match(/<(?:[\w.-]+:)?InvoiceLine[\s>]/g) || []).length * 0.01 : 0;
      tax = 0;
      subtotals.forEach((s, j) => {
        const g = groups.get(subKey[j]);
        const zero = zeroTax(subKey[j].split("|")[0]);
        let t = zero ? 0 : roundHalfUpToCents((g.taxable * g.pct) / 100);
        const written = num(firstChild(s.inner, "TaxAmount", ["TaxCategory"])?.value);
        const taxableOk = num(firstChild(s.inner, "TaxableAmount", ["TaxCategory"])?.value) === g.taxable;
        // PINT Oman: the subtotal's tax may be the sum of its lines' own VAT (ALIGNED-IBRP-S-09-OM).
        const lineSum = g.lineTaxAll ? roundHalfUpToCents(g.lineTax) : null;
        // It does not depend on the written taxable amount, so a wrong taxable does not undo it.
        // PINT allows more decimals on a subtotal's tax (PINT UAE's examples write 532.1645):
        // one that rounds to the right cent is kept as written, as a line net is.
        const kept = written !== null && ((taxableOk && zatca && Math.abs(written - t) <= tolerance + 1e-9) || written === lineSum
          || (pint && !Number.isNaN(written) && roundHalfUpToCents(written) === t));
        if (kept) t = written;
        // Oman's category tax is the sum of its lines' VAT, so a wrong one is rewritten to that.
        else if (oman && !zero && lineSum !== null) t = lineSum;
        tax = roundHalfUpToCents(tax + t);
        const writtenTaxable = num(firstChild(s.inner, "TaxableAmount", ["TaxCategory"])?.value);
        if (!(pint && writtenTaxable !== null && roundHalfUpToCents(writtenTaxable) === g.taxable)) set(s, "TaxableAmount", ["TaxCategory"], `/tax_breakdown/${j}/taxable`, fmt(g.taxable), "Taxable amount is the sum of the nets of the lines in this tax group, minus its document allowances, plus its charges.");
        if (!kept) set(s, "TaxAmount", ["TaxCategory"], `/tax_breakdown/${j}/tax`, fmt(t), oman && !zero && lineSum !== null && t === lineSum ? "Tax is the sum of this category's line VAT amounts (BTOM-016; ALIGNED-IBRP-S-09-OM)." : zero ? `Tax in category ${subKey[j].split("|")[0]} is 0 whatever the stated rate (the buyer accounts for it, or it is a margin scheme).` : `Tax is the taxable amount times ${g.pct}%, rounded half up.`);
      });
      set(total, "TaxAmount", ["TaxSubtotal"], "/totals/tax", fmt(tax), "Document tax is the sum of the tax subtotals.");
      if (repeats.length) {
        const cur = currencyOf(/<(?:[\w.-]+:)?TaxAmount(\s[^>]*)?>/.exec(repeats[0].inner)?.[1]);
        if (cur && docCurrency && cur === docCurrency) {
          set(repeats[0], "TaxAmount", [], "/totals/tax_accounting_currency", fmt(tax), "The tax in the VAT accounting currency (BT-111) repeats the document tax when both currencies are the same.");
        } else {
          skipped.push(`The tax in the VAT accounting currency (BT-111, ${cur || "no currency"}) was left as written: converting it needs your exchange rate.`);
        }
      }
    }
  }

  if (lm) {
    const setLm = (child, value, path, reason, required = true) => {
      if (!set(lm, child, [], path, value, reason) && required && Number(value) !== 0) {
        skipped.push(`${child} is missing; it should be ${value}. The repair does not add elements.`);
      }
    };
    setLm("LineExtensionAmount", fmt(netSum), "/totals/lines", "Sum of the line nets.");
    setLm("AllowanceTotalAmount", fmt(allowances), "/totals/allowances", "Sum of the document-level allowances.");
    setLm("ChargeTotalAmount", fmt(charges), "/totals/charges", "Sum of the document-level charges.");
    const net = roundHalfUpToCents(netSum - allowances + charges);
    setLm("TaxExclusiveAmount", fmt(net), "/totals/net", adjust.length ? "Net total is the line nets minus document allowances plus charges." : "Net total is the sum of the line nets (no header allowances or charges).");
    if (tax !== null) {
      const gross = roundHalfUpToCents(net + tax);
      setLm("TaxInclusiveAmount", fmt(gross), "/totals/gross", "Gross is net plus tax.");
      const pre = num(firstChild(lm.inner, "PrepaidAmount")?.value) ?? 0;
      const rnd = num(firstChild(lm.inner, "PayableRoundingAmount")?.value) ?? 0;
      setLm("PayableAmount", fmt(roundHalfUpToCents(gross - pre + rnd)), "/totals/due", "Amount due is gross minus prepaid plus rounding.");
      if (zatca && prepayRows && Math.abs(pre - prepaySum) > 0.005) {
        skipped.push(`The prepaid amount (BT-113, ${fmt(pre)}) is not the advances' taxable amounts plus their VAT (KSA-31 + KSA-32, ${fmt(prepaySum)}; BR-KSA-80). Left for a person: what was paid is a fact, not arithmetic.`);
      }
    }
  }

  return finish();
}
