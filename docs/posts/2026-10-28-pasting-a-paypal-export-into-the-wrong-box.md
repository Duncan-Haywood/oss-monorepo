---
title: "What happens when you import a PayPal export as a bank statement"
date: 2026-10-28
description: "A PayPal activity sample imported as a bank file books only Net: sales shrink, fees vanish. ai-bookkeeper now warns and points to the payouts command."
tags: [ai-bookkeeper, paypal, bookkeeping]
---

# What happens when you import a PayPal export as a bank statement

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

I ran a public PayPal activity sample (13 rows from the open-source
foxy-balance repo; the names and amounts look made up) through two routes in
ai-bookkeeper.

The `payouts` route read it properly. It split gross from fee, noticed that
nine rows had a Net that is not Gross less Fee, and warned that the file mixes
USD and EUR and that two "Website Payment" rows were money sent, not sales.

The plain `import` route, the one most people try first, printed one warning
about mixed currencies and filed every row at its **Net** amount. A 1,234.00
sale came in as 1,233.00 with the fee nowhere in the books. Nothing told the
user a better command existed.

Fix: `readStatement` now spots a Gross, Fee and Net header beside a
transaction id and adds a problem line pointing to `payouts FILE`. Two tests
cover it (`processor-export-hint.test.mjs`). The sample is not real activity,
so this checks the layout handling, not accuracy on live accounts.
