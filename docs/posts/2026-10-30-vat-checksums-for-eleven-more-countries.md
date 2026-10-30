---
title: "VAT number typo checks for eleven more countries"
date: 2026-10-30
tags: [einvoice-preflight, vat, validation]
description: "E-invoice Preflight now checks the VAT check digit, not only the length, for eleven more EU countries, from Estonia to Czechia."
---

Until today the [e-invoice preflight](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/) tool checked only the length of a VAT number from eleven EU countries. A typo that kept the length, such as `HU12892313` for `HU12892312`, passed. It now raises INV-023 for those, as it already did for Germany, France, Italy and the others.

Covered: Estonia, Hungary, Slovenia, Slovakia, Croatia, Latvia (companies, first digit 4 to 9), Lithuania (9 digits), Bulgaria (9 digits), Romania, Greece and Czechia (8 digits). Variants without a check here stay length-only: 10-digit Bulgarian, 12-digit Lithuanian, 9- and 10-digit Czech, Latvian individuals, and Malta and Cyprus.

**How far to trust it.** The algorithms come from memory of public descriptions (the ones python-stdnum documents), not from a tax authority's text. Each country's test uses a published example number plus a one-digit change that must fail; all eleven passed, and the full JS (952) and Python (358) suites pass. A real invoice for each country has not been run, and a valid checksum says nothing about whether the number is registered. The same logic is in the JS and Python readers.
