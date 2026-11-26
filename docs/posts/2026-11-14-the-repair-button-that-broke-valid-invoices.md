---
title: "The repair button that broke valid invoices"
date: 2026-11-14
tags: [einvoice-preflight, e-invoicing, en16931, redteam, testing, fuzzing]
seo_title: "Why an invoice auto-fix must use the validator's own arithmetic"
description: "einvoice-preflight's JSON repair rounded unit prices to cents and summed VAT per line, so it rewrote correct invoices into failing ones. The fix and the guard."
---

`einvoice-preflight` checks an invoice against the EN 16931 arithmetic rules before it goes to a buyer or a tax portal. It also has a **Repair** button. Repair rewrites only the numbers the invoice's own inputs fully determine: line nets, the net, tax, gross and amount-due totals. It leaves rates, dates and parties for a person.

Today's red-team run found that the JSON repair could take an invoice the checker passes and give it back failing. It had its own copy of the arithmetic, and that copy disagreed with the checker in three ways:

- **It rounded the unit price to cents first.** EN 16931 allows more decimals on a price (BT-146). For 1,000 units at 0.125, the line net is 125.00. Repair rounded the price to 0.13 and wrote 130.00. The checker then flagged the line, the net and the tax.
- **It ignored the price base quantity (BT-149).** At 50.00 per 100 units, 10 units cost 5.00. Repair wrote 500.00.
- **It worked VAT out per line, not per rate.** BR-CO-17 applies each rate to that rate's summed taxable amount. Three lines of 0.10 at 5% give 0.30 × 5% = 0.015, which rounds to 0.02. Rounding each line first gives 0.03. Repair "corrected" a right 0.02 to a wrong 0.03.

It also dropped the rounding amount (BT-114) from the amount due.

**The fix: one source of truth.** Repair now changes a value only when the checker flags it. The new value comes from the same helpers the checker uses (`linenet.mjs`: `expectedLineNet`, `summedLineNet`, `taxGroups`). An invoice the checker passes now comes back untouched by construction. If an allowance is bigger than its line, the net goes negative. Repair now stops there rather than write a negative tax total.

**The guard: a seeded fuzz test.** One test generates 300 invoices. They mix sub-cent prices, base quantities, line and header allowances and several VAT rates. For each one, the test checks three things:

1. a repaired invoice passes the checker;
2. repairing it again changes nothing;
3. after the totals and a line net are scrambled, repair brings back the same totals and adds no new finding.

On the old code, 9 of the 16 repair tests fail. On the new code all of them pass, and so does the whole 1,729-test suite.

The same run seeded 8 faults into the UBL XML repair. The existing tests caught 4. Three of the 4 that got through were real gaps, and each now has a test. One was a single-fix file not marked as repaired. One was a zero base quantity that the totals recomputed past. One was the float slack in the 0.01 tolerance on two-million-rial Omani lines. The fourth fault could not change the output.

## Update, 2026-11-26: a decimal comma crashed the repair

A later red-team run tried a number the way many European sellers type it: `1,5` for one and a half, `130,43` for a VAT amount. XML decimals use a dot, so the file is not valid. The repair should have said so. On a CII invoice (XRechnung CII, ZUGFeRD, Factur-X) it crashed instead. A comma in a quantity, a net price or the prepaid amount did it. The UBL repair crashed the same way on a comma in a Saudi (ZATCA) line's VAT or prepayment amount. In each case the value was read as "not a number" and passed on to the rounding step, which fails on it. The page then said it "could not read this XML as a UBL or CII invoice", which was no help to the person trying to fix it.

The repair now names the line and the field, says that XML decimals use a dot, and leaves the file unchanged. A new test tries a decimal comma in every one of the 1,009 numeric fields across the 39 XML examples, and in every number of the JSON examples. Each repair may refuse with a clear message or skip a step and say why. It may not throw an internal error or write `NaN` into the file. On the old code that test failed on 6 of the example files.

The same run seeded 8 faults into the CII repair; the tests caught 5. All three that got through were real gaps, and each now has a test. A standard-rated (S) group with no rate was read as 0%. A missing allowance total was passed over silently. A second tax total in the same currency (BT-111) was left stale. Six more faults seeded into the Mexican CFDI rules were all caught.

The broader lesson applies to any validator that also offers an auto-fix: **the fixer must not have its own arithmetic.** Two copies of the same rule drift apart, and the user only sees the drift as a "fix" that makes things worse.

The tool is free and MIT licensed, and it runs in the browser: [einvoice-preflight](https://marisstella.app/einvoice-preflight/).
