# Flux 10 e-reporting: plain route vs Saxon-JS, 2026-11-17

France's e-reporting file (Flux 10: international B2B invoices 10.1, B2C and other sales without an
e-invoice 10.3, and the payments on them 10.2 and 10.4) now runs FNFE-MPE's Flux 10 Schematron
("PPF — Flux 10 e-reporting — v1.8", the PPF's Annexe 7 controls, 150 asserts under 36 control
codes; github.com/fnfempe/France_RFE commit 97ba0f3, `FNFE_RFE_INVOICE/Flux10/Flux10.sch`,
Apache-2.0) on the plain route, compiled by `build-fr-rules.mjs` into `plain/flux10-fr.json`.

**How it was checked.** FNFE publishes no Flux 10 example, so this repo's three made-up files
(`fixtures/flux10/b2c-transactions.xml`, `international-invoices.xml`, `payments.xml`; each valid
against FNFE's copy of the PPF XSD, `Flux10/xsd/ereporting.xsd`, with `xmllint --schema`) were each
run as written and broken by up to 95 mutations (each applied where it changes the file) (`eval/flux10-crosscheck.mjs`). Each run went through the
plain set (fontoxpath 3.34.0) and through Saxon-JS 2.7 running FNFE's own compiled
`Flux10/Flux10.xslt` (exported to SEF with xslt3). The control codes repeat across contexts (G1.09
is the code of 17 different date checks), so runs are compared as the **multiset** of codes fired, not
the set.

    node eval/flux10-crosscheck.mjs <France_RFE checkout> flux10.sef.json

**Result.** 147 of 147 runs fire the same multiset of control codes on both engines; 0 plain
checks skipped; all 36 control codes fired on some run (G1.102 needed two mutations of its own:
an exempt subtotal with no seller VAT number, and one with only a tax representative's). The
three examples pass every control on both engines.

**What the official controls let through.** 25 runs fire nothing on either engine but are caught
by `flux10.mjs`'s own checks (FR-F10-101..107):

- impossible calendar dates (30 February, 31 November, 34 October, hour 25): G1.09, G1.36 and
  G7.53 test the shape `^\d{8}$` (or 14 digits) and the year 2000-2099 only. FR-F10-101.
- VAT that is not base x rate: a 20% subtotal with 0.00 VAT passes, as does +9.00 on one rate's
  VAT when the total is moved with it; G1.53 only adds the subtotals up. FR-F10-102 (warning;
  for daily aggregates the tolerance is half a cent per sale counted).
- a day or payment outside the report's period. FR-F10-103 (warning).
- a SIREN with a wrong Luhn key (the controls check nine digits). FR-F10-104.
- a French VAT number with a wrong key, or built on another SIREN than the company id. FR-F10-105.
- the same rate twice in one day's breakdown. FR-F10-106 (warning).
- non-EUR blocks: G1.53 is written for `TransactionsCurrency = 'EUR'` only. FR-F10-107.

Also seen, not changed: G6.25 compares the period's dates as strings and refuses a period whose
end equals its start, so a one-day transmission period is refused; G6.28 asks every 10.1 invoice
for a buyer company id.

**Limits.** Made-up files only: no real platform's Flux 10 file, no PPF rejection compared. The
XSD itself is not enforced by this tool (xmllint was used to make the seeds valid). The French
messages are FNFE's; the FR-F10 ones are this tool's, in English.

## Run output

```
seeds: 3; runs (seed x mutation that changed it, plus originals): 147; Saxon fired at least one control on 112; same multiset of control codes on both engines: 147/147; plain checks skipped (engine limit): 0
runs where flux10.mjs's own checks (FR-F10-101..107) raise something: 32; of them, runs neither engine flags: 25
  original                     runs 3  fired 0  agree 3/3
  doc-id-double-space          runs 3  fired 3  agree 3/3
  doc-id-51                    runs 3  fired 3  agree 3/3
  doc-id-accent                runs 3  fired 3  agree 3/3
  doc-id-lead-space            runs 3  fired 3  agree 3/3
  datetime-12                  runs 3  fired 3  agree 3/3
  datetime-1999                runs 3  fired 3  agree 3/3
  datetime-feb-30              runs 3  fired 0  agree 3/3  caught only by FR-F10 3
  datetime-hour-25             runs 3  fired 0  agree 3/3  caught only by FR-F10 3
  type-xx                      runs 3  fired 3  agree 3/3
  type-re                      runs 3  fired 0  agree 3/3
  both-reports                 runs 3  fired 3  agree 3/3
  no-report                    runs 3  fired 3  agree 3/3
  sender-scheme-0002           runs 3  fired 3  agree 3/3
  sender-id-5                  runs 3  fired 3  agree 3/3
  sender-role-se               runs 3  fired 3  agree 3/3
  issuer-scheme-0009           runs 3  fired 3  agree 3/3
  issuer-siren-8               runs 3  fired 3  agree 3/3
  issuer-siren-key             runs 3  fired 0  agree 3/3  caught only by FR-F10 3
  issuer-role-wk               runs 3  fired 3  agree 3/3
  period-equal                 runs 3  fired 3  agree 3/3
  period-dashes                runs 3  fired 3  agree 3/3
  period-end-nov-30-ok         runs 3  fired 0  agree 3/3
  period-end-feb-31            runs 3  fired 0  agree 3/3  caught only by FR-F10 3
  period-start-2100            runs 3  fired 3  agree 3/3
  tx-category-xxx              runs 1  fired 1  agree 1/1
  tx-currency-usd              runs 1  fired 0  agree 1/1
  tx-currency-lower            runs 1  fired 1  agree 1/1
  tx-rate-21                   runs 1  fired 1  agree 1/1
  tx-total-3dp                 runs 1  fired 1  agree 1/1
  tx-total-plus-1              runs 1  fired 1  agree 1/1
  tx-subtotal-tax-plus-5       runs 1  fired 1  agree 1/1
  tx-tax-not-rate              runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  tx-due-code-99               runs 1  fired 1  agree 1/1
  tx-date-feb-30               runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  tx-date-outside              runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  tx-rate-twice                runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  inv-type-999                 runs 1  fired 1  agree 1/1
  inv-type-384-no-ref          runs 1  fired 1  agree 1/1
  inv-credit-no-ref            runs 1  fired 1  agree 1/1
  inv-process-z9               runs 1  fired 1  agree 1/1
  inv-b4-deposit               runs 1  fired 1  agree 1/1
  inv-typeid-other             runs 1  fired 1  agree 1/1
  inv-id-space                 runs 1  fired 1  agree 1/1
  inv-id-36                    runs 1  fired 1  agree 1/1
  inv-issue-feb-30             runs 2  fired 0  agree 2/2  caught only by FR-F10 2
  inv-due-bad                  runs 1  fired 1  agree 1/1
  inv-due-code-1               runs 1  fired 1  agree 1/1
  inv-no-buyer-id              runs 1  fired 1  agree 1/1
  inv-buyer-scheme-9999        runs 1  fired 1  agree 1/1
  inv-buyer-0223-19            runs 1  fired 1  agree 1/1
  inv-seller-siren-8           runs 1  fired 1  agree 1/1
  inv-seller-0228              runs 1  fired 1  agree 1/1
  inv-seller-0229              runs 1  fired 1  agree 1/1
  inv-seller-0227              runs 1  fired 1  agree 1/1
  inv-seller-no-vat            runs 1  fired 1  agree 1/1
  inv-all-no-vat               runs 1  fired 1  agree 1/1
  inv-seller-vat-key           runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  inv-seller-vat-other-siren   runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  inv-vat-qualifier            runs 1  fired 1  agree 1/1
  inv-country-lower            runs 1  fired 1  agree 1/1
  inv-category-e-no-reason     runs 1  fired 1  agree 1/1
  inv-e-no-vat                 runs 1  fired 1  agree 1/1
  inv-e-rep-vat                runs 1  fired 1  agree 1/1
  inv-category-x               runs 1  fired 1  agree 1/1
  inv-percent-21               runs 1  fired 1  agree 1/1
  inv-percent-20-tax-0         runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  inv-tax-usd                  runs 1  fired 1  agree 1/1
  inv-total-off                runs 1  fired 1  agree 1/1
  inv-total-comma              runs 1  fired 1  agree 1/1
  inv-price-net-off            runs 1  fired 1  agree 1/1
  inv-price-negative           runs 1  fired 1  agree 1/1
  inv-qty-5dp                  runs 1  fired 1  agree 1/1
  inv-cnwvat-380               runs 1  fired 1  agree 1/1
  inv-period-backwards         runs 1  fired 1  agree 1/1
  inv-line-period-backwards    runs 1  fired 1  agree 1/1
  inv-delivery-feb-29          runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  inv-doc-allowance-bad        runs 1  fired 1  agree 1/1
  inv-line-allowance-3dp       runs 1  fired 1  agree 1/1
  inv-line-ref-bad             runs 1  fired 1  agree 1/1
  inv-line-delivery-lower      runs 1  fired 1  agree 1/1
  inv-ref-id-accent            runs 1  fired 1  agree 1/1
  inv-ref-date-dash            runs 1  fired 1  agree 1/1
  pay-invoice-id-space         runs 1  fired 1  agree 1/1
  pay-issue-feb-30             runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  pay-date-bad                 runs 1  fired 1  agree 1/1
  pay-date-feb-30              runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  pay-date-outside             runs 1  fired 0  agree 1/1  caught only by FR-F10 1
  pay-rate-21                  runs 1  fired 1  agree 1/1
  pay-currency-usd             runs 1  fired 1  agree 1/1
  pay-currency-lower           runs 1  fired 1  agree 1/1
  pay-amount-negative          runs 1  fired 1  agree 1/1
  pay-amount-7dp               runs 1  fired 1  agree 1/1
  pay-tx-rate-21               runs 1  fired 1  agree 1/1
  pay-tx-currency-usd          runs 1  fired 1  agree 1/1
  pay-tx-date-bad              runs 1  fired 1  agree 1/1
control codes in the set: 36; fired by Saxon on some run: 36; never fired: none
```
