---
title: "Reading a Gumroad sales export into your books"
seo_title: "Import a Gumroad sales CSV into bookkeeping software"
date: 2026-11-06
tags: [ai-bookkeeper, gumroad, creators]
description: "The open-source ai-bookkeeper now reads a Gumroad sales CSV: it books Net Total, the money paid out after the fee, under the item sold."
---

A Gumroad sales CSV used to read as zero rows in ai-bookkeeper. Its amount columns are called Sale Price and Net Total, and none matched a known amount header.

Now the reader books Net Total, the payout after Gumroad's fee, and uses the item name as the description, not the buyer's name or email. Two made-up sales of $10 and $50 book $9.00 and $45.00 under "Ebook" and "Course". The layout is from memory of Gumroad's help page, so no real export has been tried; send one (private details removed) and it gets checked. Test: `gumroad-sales.test.mjs`.
