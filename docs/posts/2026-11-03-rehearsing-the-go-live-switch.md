---
title: "Rehearsing the go-live switch"
seo_title: "We flipped every paid path on in a test and six tests failed"
date: 2026-11-03
tags: [business-model, monetization, testing]
description: "Setting a test checkout link on all six paid paths turned six tests red, because each asserted the link was empty. They now pass either way."
---

The earlier post on `golive.py` said one command turns the six paid paths on. We had not checked what happens next. This run set a placeholder https link on all six, then ran each product's pack, licence and page tests.

Six tests failed. None was a product bug. Each one asserted that the checkout link is empty ("dark by default"), so switching a product on would have turned its CI red on the first merge. They now check the real contract: with no link the buy button is absent, with an https link it points at that link, and a non-https link is never accepted. The shift-roster test also required the pack card to be hidden in the HTML; it now only requires that the card exists, since the page hides it from script when no link is set.

With the link unset again, all six suites pass dark. With it set, they pass live. Nothing is sold yet; the merchant-of-record account is still the owner's step, but the switch itself has now been rehearsed rather than assumed.
