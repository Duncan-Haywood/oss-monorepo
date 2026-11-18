---
title: "Checking a Mexican CFDI before the PAC does: SAT's schema, 52,747 product keys and the sums"
seo_title: "Free CFDI 4.0 validator: SAT XSD, catalogues and totals offline"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "E-invoice Preflight now reads Mexico's CFDI 4.0. On 3,666 mutated files its schema verdict matched xmllint on SAT's own XSD every time."
---

Every tax invoice in Mexico is a CFDI: an XML file the issuer sends to a PAC, a provider SAT has authorised, which checks it, stamps it with a UUID and reports it to SAT. If the PAC refuses, there's no invoice. Until today, [E-invoice Preflight](https://marisstella.app/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html) could only test an RFC's check digit for Mexico. Its own FAQ said so: "Can this checker validate a Mexican CFDI? No."

Now it can, partly, and the page says exactly how far that goes.

## What it checks

You drop a CFDI 4.0 file on the Mexico page. The file stays in the browser, and the check runs in three layers.

1. **SAT's schema.** A build script reads `cfdv40.xsd`, its data types and the catalogue file `catCFDI.xsd` into a 96 KB table. It covers element order, required attributes, patterns and every catalogue code. Payment form, CFDI use, tax regime, unit keys, all 52,747 product keys and all 95,777 postal codes are in it. The two big lists fit because they're mostly consecutive numbers: the product keys pack into 4,620 runs and the postal codes into 15.
2. **The sums.** Each line's amount against quantity times unit price. Each tax against base times rate. The tax summary, grouped by tax, factor and rate, against the lines. Then subtotal, discount and total, rounded to the currency's decimals.
3. **A few well-known 4.0 rules.** "Pay later" (PPD) needs payment form 99. A peso invoice can't carry an exchange rate, and a dollar invoice must. A sale to the general public (`XAXX010101000`) uses CFDI use S01 and regime 616. A foreign buyer needs a country of residence.

The rule IDs, MX-001 to MX-036, are our own. We did not read SAT's Anexo 20 error matrix, so we don't claim its CFDI40xxx codes.

## How we know the schema layer is right

The FA(3) and FatturaPA readers set the method for this: compare against xmllint on the real XSD. We took five CFDI 4.0 files. One is our own made-up example. Four come from the test assets of CfdiUtils, an MIT-licensed PHP library, and two of those carry real PAC stamps. We mutated each one thousands of ways: a deleted attribute, an empty one, junk, a 1,100-character value, a negative or over-precise number, an unknown attribute, and elements deleted, duplicated or swapped with a neighbour.

The first run agreed on 1,463 of 1,478. All 15 misses were the same thing. libxml2 rejects any decimal longer than 24 digits, even though the XSD sets no such limit. No real amount is that long, so the checker now flags it too. After that fix, a run three times the size agreed on **3,666 of 3,666**.

## Where the sums are deliberately loose

The line check isn't strict equality. One of CfdiUtils' real stamped samples bills 4 × 956.04 as 3,824.15, a cent short of 3,824.16. The PAC accepted it. As PAC vendors document Anexo 20, the rule allows half a unit of slack in the last written decimal of both quantity and price. "4" written with no decimals could be anything from 3.5 to 4.5, which makes the allowed range very wide.

So we planted 24 defects in each of four files. The right rule caught 91 of the 92. The miss was a tax line written as whole pesos (`Base="1500"`, `Importe="240"`). The rule lets that amount be anything from 239 to 241, so changing it to 241 is "within rounding". That's the rule doing what it says, and the README records it as a limit.

## What it doesn't do

It doesn't verify the seal or the PAC stamp. It doesn't look up the RFC, name or postal code in SAT's records, which is the 4.0 rejection vendors mention most. It doesn't check the table of which tax regimes may use which CFDI uses, and it doesn't add up the payment (Pagos 2.0), payroll or foreign-trade complements. It hasn't yet been compared with a real PAC rejection. If a file passes, these checks found nothing. It doesn't mean SAT or a PAC accepted it.

The code is MIT. The catalogue data comes from the public-domain phpcfdi mirror of sat.gob.mx, which didn't answer from our build host. Rebuilding from SAT's own files is one command: `node build-cfdi-schema.mjs <dir>`.
