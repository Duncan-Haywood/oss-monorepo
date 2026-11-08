---
title: "einvoice-preflight now checks Norwegian and Swiss VAT numbers"
seo_title: "Check Norwegian and Swiss VAT numbers offline"
date: 2026-11-08
description: "The e-invoice preflight checker now catches typos in Norway's organisation number (MVA) and Switzerland's UID (MWST) with the published mod-11 check digit."
tags: [einvoice-preflight, vat, peppol, norway, switzerland]
---

Norway is one of the biggest Peppol users and Switzerland is a common trading partner of EU suppliers, yet `einvoice-preflight` treated `NO` and `CH` prefixes as unknown. It now checks both offline.

Both numbers use the same rule: weight the first eight digits (Norway 3,2,7,6,5,4,3,2; Switzerland 5,4,3,2,7,6,5,4), take 11 minus the remainder mod 11, and read 11 as 0. A result of 10 means the number is never issued. `NO 923 609 016 MVA` and `CHE-116.281.710 MWST` pass; changing one digit gives an INV-023 finding, and a wrong length or shape gives INV-022. The `MVA`, `MWST`, `TVA` and `IVA` suffixes are accepted.

This is a typo check, not a register lookup. Code and tests: `ventures/einvoice-preflight/vat.mjs` and `vat.test.mjs`.
