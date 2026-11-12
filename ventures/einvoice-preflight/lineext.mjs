// A PINT line's own VAT and amount with VAT (INV-060).
//
// PINT UAE (BTAE-08 line VAT, BTAE-10 line amount payable) and PINT Oman (BTOM-016,
// BTOM-017) restate each line's VAT and its amount with VAT in
// cac:ItemPriceExtension. The UAE rule set requires both (ibr-104-ae, ibr-194-ae)
// but fixes no arithmetic for them: on 2026-11-12 a seeded BTAE-10 drew a finding
// from nothing, ours or the UAE's, in 0 of 40 seeds, and a seeded BTAE-08 in 11 of
// 36 (README, "UAE line VAT"). The repair pass already rewrote them; no check said
// to ask for it. A receiver that books the line amounts books the wrong figure.
//
// Every one of OpenPeppol's 40 UAE example lines and 49 Oman files reads as
// net x rate and net + VAT, so a line is flagged only when it is more than 0.01 off
// (the repair's own tolerance; a VAT-inclusive price a fils under is kept):
//
// - line VAT more than 0.01 off net x rate, or off 0 in a category whose tax is 0
//   whatever rate it states (reverse charge AE; the UAE's margin scheme N);
// - line amount more than 0.01 off net + line VAT (net alone where an exempt line
//   states no VAT, ibr-163-ae).
//
// PINT Malaysia is left out on purpose: LHDN's samples write ItemPriceExtension/Amount
// as a fact no reading of the line gives (100.00 on a 5,000.00 line), under a note that
// it is "not part of Schematron calculations at this moment".

import { parseDecimal } from "./numbers.mjs";
import { taxPercentOf } from "./linenet.mjs";

const TOLERANCE = 0.01 + 1e-9;

function jurisdiction(invoice) {
  const spec = String(invoice.specification_id || "");
  if (!/urn:peppol:pint:/i.test(spec)) return null;
  if (/@ae-1/i.test(spec)) return "ae";
  if (/@om-1/i.test(spec)) return "om";
  return null;
}

function shown(value) {
  // As many decimals as the arithmetic needs, 2 to 4 (999.375 x 5% is 49.96875).
  for (const places of [2, 3, 4]) {
    const fixed = value.toFixed(places);
    if (Math.abs(Number(fixed) - value) < 1e-9) return fixed;
  }
  return value.toFixed(4);
}

export function inspectLineExtension(invoice) {
  if (!invoice || typeof invoice !== "object" || !Array.isArray(invoice.lines)) return [];
  const where = jurisdiction(invoice);
  if (!where) return [];
  const ids = where === "ae"
    ? { vat: "BTAE-08", amount: "BTAE-10", label: "amount payable" }
    : { vat: "BTOM-016", amount: "BTOM-017", label: "amount with VAT" };
  const zeroTax = (category) => category === "AE" || (where === "ae" && category === "N");
  const findings = [];
  invoice.lines.forEach((line, index) => {
    if (!line || typeof line !== "object") return;
    const net = parseDecimal(line.net);
    const stated = parseDecimal(line.tax_amount);
    const amount = parseDecimal(line.amount_with_vat);
    if (net === null || (stated === null && amount === null)) return;
    const category = typeof line.tax_category === "string" ? line.tax_category.trim().toUpperCase() : "";
    const percent = taxPercentOf(line);
    const n = index + 1;
    let vat = stated;
    if (stated !== null && percent !== null) {
      const want = zeroTax(category) || category === "E" ? 0 : (net * percent) / 100;
      if (Math.abs(stated - want) > TOLERANCE) {
        const why = zeroTax(category)
          ? `0 in category ${category}, whatever rate it states`
          : category === "E" ? "0 on an exempt line" : `the line net ${shown(net)} times ${percent}%, ${shown(want)}`;
        findings.push({
          rule: "INV-060",
          message: `Line ${n} VAT (${ids.vat}, ItemPriceExtension) is ${shown(stated)}; it should be ${why}.`,
          fix: `Set the line VAT to ${shown(want)}, or correct the line net or rate; the repair pass does this.`,
          path: `/lines/${index}/tax_amount`,
        });
        vat = want;
      }
    } else if (stated === null && category !== "E") {
      return; // nothing to add the amount up from
    }
    if (amount === null) return;
    const expected = net + (vat ?? 0);
    if (Math.abs(amount - expected) > TOLERANCE) {
      findings.push({
        rule: "INV-060",
        message: `Line ${n} ${ids.label} (${ids.amount}, ItemPriceExtension) is ${shown(amount)}; the line net plus its VAT is ${shown(expected)}.`,
        fix: `Set the line ${ids.label} to ${shown(expected)}; the repair pass does this.`,
        path: `/lines/${index}/amount_with_vat`,
      });
    }
  });
  return findings;
}
