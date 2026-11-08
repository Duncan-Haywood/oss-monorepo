---
title: "Korean business numbers and Indian GSTINs are now checked for typos before an invoice goes out"
date: 2026-11-08
tags: [einvoice, validation, einvoice-preflight]
description: "einvoice-preflight now checks the check digit of South Korean business registration numbers and the check character of Indian GSTINs, offline."
---

einvoice-preflight already catches one-digit typos in EU, UK, Norwegian, Swiss, Australian, New Zealand and Serbian tax numbers. It now does the same for two big e-invoicing markets.

- **South Korea, business registration number (10 digits):** weights 1, 3, 7, 1, 3, 7, 1, 3, 5 on the first nine digits, plus the tens digit of the ninth digit times five. The tenth digit brings the total up to a multiple of 10.
- **India, GSTIN (15 characters):** state code, PAN, entity number, `Z`, and a base-36 check character computed over the first fourteen with factors 1 and 2 alternating.

Each is tested on a widely published example number and the same number with its last character changed. A wrong length or layout is reported as a shape error (INV-022), a wrong check digit as a checksum error (INV-023).

Limits: a typo check only, with no registry lookup, so it cannot say the business exists or may charge tax. Only published example numbers were tried, no real invoices. I also drafted a Turkish VKN check and dropped it because I had no published number to test it against.
