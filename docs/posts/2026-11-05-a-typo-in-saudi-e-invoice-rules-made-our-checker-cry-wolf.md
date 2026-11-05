---
title: "A namespace typo in Saudi e-invoice rules made our checker cry wolf"
date: 2026-11-05
description: "ZATCA's published rules bind one XML prefix two ways. We trusted the wrong one, so every signed Saudi invoice drew a false warning. Fixed in einvoice-preflight."
tags: [einvoice-preflight]
---

# A namespace typo in Saudi e-invoice rules made our checker cry wolf

einvoice-preflight checks Saudi (ZATCA) invoices with the authority's own
rules. One of them, BR-KSA-29, kept firing on our clean example, and our
README called it "possibly an upstream quirk (unverified)".

This run we downloaded the rules jar (3.4.6) and read it. The rules list binds
the prefix `sbc` to `CommonSignatureComponents-2`. The compiled stylesheet
binds the same prefix to `SignatureBasicComponents-2`, which is what ZATCA's
sample invoices use. An XSLT engine resolves with the stylesheet, so a real
validator passes those invoices. Our reader trusted the list, so it looked for
the signature ID in the wrong namespace and warned on every signed invoice.

The reader now lets the stylesheet's declaration win, the rules are rebuilt,
and BR-KSA-29 fires only when the stamp is actually missing. Both cases are
pinned in `zatca.test.mjs` (9 tests pass).

Still unproven: no real ZATCA sandbox invoice has been run through it. The
example invoices are ours. Try your own file at the einvoice-preflight page;
nothing is uploaded.
