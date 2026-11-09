---
title: "Checking Turkey's tax-number check digit against a second implementation"
seo_title: "Turkish VKN check digit: how the e-invoice pre-flight validates it"
date: 2026-11-09
tags: [e-invoicing, turkey, validation, testing]
description: "How the free e-invoice pre-flight checks a Turkish VKN, what we cross-checked it against, and what we still could not confirm."
---

Turkish e-Fatura needs a valid VKN (10-digit company tax number) on each invoice. The last digit is a check digit, so most typos can be caught before the invoice is sent.

The rule in `ventures/einvoice-preflight/turkey.mjs` follows the widely published algorithm. For each of the first nine digits at position `p`, take `t = (digit + 10 - p) mod 10`. Then take `t * 2^(10-p) mod 9`, using 9 when that gives 0 for a non-zero `t`. The check digit is `(10 - sum mod 10) mod 10`.

We found no GİB-published example number. So we wrote a second formulation from an open-source validator's description and compared the two on 200,000 pseudo-random numbers. They agree, and a changed last digit is always rejected. Two implementations agreeing is not the tax authority agreeing, so the page still says a pass is not a registry lookup. A VKN from a real e-Fatura is still wanted.
