---
title: "A one-file clothing shop now has a basket"
date: 2026-11-05
description: "The Clothing Design Studio's generated shop file lets a buyer add several designs and sizes and send one order email with the total. No server, no cookies."
tags: [clothing-design-studio, storefront, small-business]
---

# A one-file clothing shop now has a basket

The Clothing Design Studio already turns a design into one static shop page. Until now a buyer
could order one garment per email. From today, in the default email-order mode, each product has
"Add to basket". The basket merges repeats by size, shows a total before shipping and tax, and
builds a single order email with every line and a prompt for the delivery address.

Shops that use the seller's own payment link do not get a basket, since one link pays for one
product. The page stays one file with no cookies and no tracker, and the seller still confirms the
final amount. A test runs the page script against a stub DOM: two clicks make 2 x A and €60.00,
and Remove empties the basket.

Try it at https://marisstella.app/clothing-design-studio/ (live after the next deploy).
