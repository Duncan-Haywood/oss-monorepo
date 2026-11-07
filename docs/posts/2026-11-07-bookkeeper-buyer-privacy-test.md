---
title: "Keeping customers' names out of your books: a test across five sales platforms"
seo_title: "Buyer privacy in bookkeeping imports from five sales platforms"
date: 2026-11-07
tags: [ai-bookkeeper, privacy, testing]
description: "Sales exports carry buyer names and emails. A new test checks that none of them reach the ledger's descriptions or CSV exports."
---

Sales-platform exports list who bought what. A bookkeeping tool that copies the buyer's name into the description spreads it into the categorizer's memory and every CSV a user sends to an accountant.

The ai-bookkeeper now has one test that feeds a Gumroad, Paddle, Patreon, Ko-fi and Lemon Squeezy export, each with a planted buyer name and email, through the reader and fails if either appears in a row description. All five passed without a code change, so this guards the behaviour rather than fixing it.

Limits: the column layouts are written from memory of each platform's help pages, and every row is made up. No real export has been tried. If you have one with the details removed, it is the most useful thing to send.
