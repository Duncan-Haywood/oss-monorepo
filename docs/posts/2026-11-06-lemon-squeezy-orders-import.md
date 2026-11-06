---
title: "Importing a Lemon Squeezy orders export into your books"
seo_title: "Import a Lemon Squeezy orders CSV into bookkeeping"
date: 2026-11-06
tags: [ai-bookkeeper, saas, bookkeeping]
description: "The free ai-bookkeeper now reads a Lemon Squeezy orders export, turning minor-unit totals into dollars and skipping refunded orders."
---

Before this change the browser bookkeeper could not read a Lemon Squeezy orders export at all: it found no transaction lines. Totals in that export are whole minor units (2900 means $29.00), so a naive import would also have booked every sale a hundred times too large.

It now recognises the export by its `order_number`, `user_email`, `total` and `created_at` columns, divides the total by 100, and uses the product name as the description so customer names and emails stay out of your ledger. Refunded orders are skipped with a note that says so; book the refund from the payout.

This books gross sales. The export has no fee column, so Lemon Squeezy's fee and the tax it remits show up in the payout line from your bank.

One test covers it: two paid orders and a refunded one, checked in cents. The header is written from memory and the rows are made up; no real export has been tried. If yours reads wrongly, tell us through the feedback form on the page. Arithmetic on your own file, not accounting advice.
