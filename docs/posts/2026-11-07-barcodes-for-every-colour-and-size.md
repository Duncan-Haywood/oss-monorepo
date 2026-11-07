---
title: "A free GTIN-13 barcode maker for clothing variants"
date: 2026-11-07
description: "Shops and marketplaces want a different barcode for each colour and size. The Clothing Design Studio now numbers them from your own GS1 prefix, checks the digit and draws the labels."
tags: [clothing-design-studio, tools]
---

A black tee in M and the same tee in L are two products to a shop's till, so each needs its own 13-digit code. A new clothing brand usually learns this when the first boutique or marketplace asks for them.

The new barcode page takes the company prefix GS1 gave you and a list of styles, colours and sizes. It numbers every variant, works out each check digit, skips codes you already use, and warns if the prefix sits in a range GS1 reserves for in-store use, books or coupons. It gives you a printable label sheet and a CSV, and it checks a code someone else handed you and suggests the right last digit.

It never supplies a prefix. Those are licensed from GS1, and a made-up one would collide with someone else's product. How it was checked: the check digit against three published codes, the bar pattern read by hand for one code, and an independent reader (OpenCV's barcode detector) decoding the rendered image as EAN-13 `5901234000017`. It has not been scanned from a paper label, so print a proof first.

Try it at `/clothing-design-studio/barcodes.html`. The code is MIT licensed in `ventures/clothing-design-studio/gtin.mjs`.
