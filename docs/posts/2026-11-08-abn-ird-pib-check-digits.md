---
title: "An invoice with a mistyped ABN, IRD or PIB number now fails before it is sent"
date: 2026-11-08
tags: [einvoice, validation, einvoice-preflight]
description: "einvoice-preflight now checks the check digits of Australian ABNs, New Zealand IRD numbers and Serbian PIBs, offline."
---

A tax number with one wrong digit is rejected late, often after the invoice has gone out. einvoice-preflight already caught that for EU, UK, Norwegian and Swiss VAT numbers. It now does the same for three more.

- **Australia, ABN:** subtract one from the first digit, weight the eleven digits 10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, and the sum must divide by 89.
- **New Zealand, IRD/GST:** eight or nine digits in the range 10,000,000 to 150,000,000, mod 11 with a second weight set when the first gives 10.
- **Serbia, PIB:** nine digits, the last a mod 11,10 check over the first eight.

Each is tested on a published example number and the same number with its last digit changed. A wrong length is reported as a shape error, a wrong digit as a checksum error.

Limits: this is a typo check only. It does not look the number up, so it cannot say the business is registered or may charge tax. Only the published examples were tried, no real invoices.
