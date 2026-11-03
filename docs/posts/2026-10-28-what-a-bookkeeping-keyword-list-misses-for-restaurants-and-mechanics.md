---
title: "What a bookkeeping keyword list misses for restaurants, mechanics and online sellers"
seo_title: "What a bookkeeping keyword list misses for small trades"
date: 2026-10-28
description: "A 79-line probe of small-trade bank descriptors: the built-in categorizer filed 27 right, 5 wrong and left 47 blank. The wrong ones are the instructive part."
tags: [ai-bookkeeper, categorization, small-business]
---

AI Bookkeeper files bank lines with rules, payee memory, a naive Bayes model
and a built-in keyword list. The keyword list only helps on day one, before the
books have learned anything, so its gaps decide the first impression.

I wrote 79 descriptors in the shapes US banks print them, for businesses the
earlier probes skipped: restaurants, auto repair, landscaping, cleaning,
tutoring, web agencies and online sellers. I wrote them from public company
names, not from anyone's export, and fixed the expected accounts first.

Before any new rule, 27 were filed right, 5 wrong and 47 got no suggestion.
The worst miss was "Restaurant Depot", a wholesale supplier that the generic
word "restaurant" sent to Meals. A blank is cheap, since a person files it. A
confident wrong answer is the one that gets accepted without a look.

After adding rules, 78 of 78 are right. That number is a ceiling. I wrote the
rules while looking at the same lines, so it says nothing about accuracy on
your bank. I also fixed four expectations of mine that were wrong: the
built-ins deliberately have no cost-of-goods rules, USPS already counts as
postage, a loan repayment is a transfer, and PayPal's "inst xfer" wrapper is
stripped on purpose.

What would make this honest is a real restaurant, shop or landscaper export to
hold the rules out against. The probe and its test are in
`ventures/ai-bookkeeper/eval/`.
