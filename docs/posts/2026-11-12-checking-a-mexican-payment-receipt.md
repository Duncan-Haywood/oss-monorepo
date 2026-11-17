---
title: "Checking a Mexican payment CFDI before the PAC does: Pagos 2.0 sums, offline"
seo_title: "Validate a CFDI Pagos 2.0 complement offline: balances, Totales"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "A Mexican invoice paid later needs a payment CFDI with fiddly sums. Our free checker redoes them in your browser: 202 of 202 planted faults caught."
---

In Mexico, an invoice marked PPD ("paid later or in instalments") isn't finished when it's stamped. When the money arrives, the seller issues a second CFDI, of type P, carrying the **Pagos 2.0 complement**. It says which invoices the payment settles, how much of each, what balance is left, and how much of the payment was tax.

That second document is where the sums get fiddly:

- Each related invoice carries **ImpSaldoAnt - ImpPagado = ImpSaldoInsoluto**: the balance before, the amount paid, the balance left. It has to hold exactly.
- An invoice in pesos can be paid in dollars. Then **EquivalenciaDR** says how many pesos one dollar settled, and every amount and tax of that invoice is divided by it before it is added into the payment.
- The payment's own tax rows (**ImpuestosP**) are those converted document taxes, grouped by tax and rate and rounded to six decimals.
- **Totales** then converts every payment to pesos at its TipoCambioP and rounds to the cent.

A wrong cent anywhere and the PAC rejects the file. Most people only find out at that point.

## What we built

[E-invoice preflight](https://marisstella.app/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html) already read CFDI 4.0 invoices this morning. It checks SAT's schema and catalogues and recomputes the totals. Payment CFDIs were named as unchecked. Now they're read too, with ten new rules (MX-040 to MX-049):

- **The shell of a payment CFDI:** currency XXX, the single "Pago" concept (84111506, ACT, zero), use CP01.
- **SAT's Pagos20.xsd itself.** It is read into a table at build time, and the same element, attribute and catalogue checks run inside the complement.
- **Each payment and document:** the balance arithmetic, EquivalenciaDR present when the currencies differ and 1 when they don't, no "99" payment form, and the paid share of each tax equal to base times rate.
- **The sums:** Monto has to cover what the documents say was paid. ImpuestosP is checked against the documents' taxes and Totales against the payments.

The arithmetic follows [CfdiUtils](https://github.com/eclipxe13/CfdiUtils)' SumasPagos20 calculator (MIT, by Carlos C Soto), redone with exact BigInt decimals. Issuers legitimately differ on some details: rounding versus truncating payment taxes, or writing fewer decimals. Where they do, the checker accepts every reading CfdiUtils supports. So a finding means no supported reading gives the number in the file.

## How we measured it

- **No false alarms on real-shaped files.** CfdiUtils' tests include nine public type P samples: up to 43 invoices in one payment, dollar invoices paid in pesos and the reverse, IVA at 16%, 0% and exempt, IEPS, and ISR and IVA withheld. None raised a payment finding. Running them did find a bug in our older code. Rule MX-014 told a payment to a foreign customer to use CFDI use S01, but payments use CP01 for everyone. That's fixed.
- **Planted faults.** Across those nine files and our own two-currency example, we planted 23 kinds of mistake: a cent off a total, a wrong remaining balance, a dropped EquivalenciaDR, an 8% rate where 16% belongs, the tax block removed, and others. **202 of 202** were caught by the rule named for them.
- **The schema against xmllint.** We mutated the complement 1,446 ways: attributes deleted, emptied or lengthened, elements duplicated or swapped. On every one, our verdict matched xmllint running SAT's real Pagos20.xsd.

## What it can't tell you

It can't tell you whether the invoices being paid exist, whether they are really PPD, or whether the balance before this payment is the true one. Only SAT's records know that. It hasn't been compared with a PAC's actual rejection yet. Rule numbers are ours, not SAT's CRP codes. A clean result is not acceptance by a PAC or SAT, and it isn't tax advice.

To try it, open the [Mexico page](https://marisstella.app/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html) and press "Try a payment (Pagos 2.0) sample with planted errors", or drop your own XML. The file is read in your browser and never uploaded.
