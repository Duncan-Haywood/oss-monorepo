---
title: "From a partner brand's CSV to a multi-brand shop page, with payouts"
date: 2026-11-07
description: "The clothing design studio now checks a partner brand's product CSV, shows what each piece pays the brand and the shop, and builds a multi-brand shop page."
tags: [clothing-design-studio, ventures, marketplaces]
---

A designer in the interview behind the clothing design studio wanted other brands on the same site for a commission. The missing piece was getting those brands' products in without retyping them.

The partners page now takes a brand's product CSV. Headers are matched loosely (title or name, retail or price, colors or colours), quoted commas work, and bad rows are skipped with their row number. Non-https links are dropped, repeated SKUs renamed.

Each product then gets the split under the agreed terms. One worked case: a 61.00 shelf price with 22% VAT and 20% commission leaves net 50.00, commission 10.00, a card fee of 2.13 (3% plus 0.30) that the shop carries, so the brand is paid 40.00 and the shop keeps 7.87. Pieces that would pay the brand or the shop nothing are flagged. A script-free multi-brand shop page and a payouts CSV download from the same page.

Not done: no real partner brand has sent a feed through it, the shop page links to each brand's own page rather than holding a cart, and who owes VAT is a contract question the page does not settle. Source: `ventures/clothing-design-studio/partnerfeed.mjs`.
