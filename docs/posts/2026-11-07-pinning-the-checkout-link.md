---
title: "Pinning the one link that takes money: a test for the bid-package checkout"
seo_title: "Testing a checkout link: what a small guard catches"
date: 2026-11-07
tags: [wall-framing-takeoff, testing]
description: "The wall-framing bid package has one public checkout link and no test on it. A two-case test now fails on plain http, embedded credentials or a secret in the query."
---

The wall-framing takeoff sells its branded bid package through a hosted checkout (a merchant of record, so we never hold a key). The link lives in one constant, `CHECKOUT_URL`, which stays empty until the owner creates the product. It was the only engine module without a test.

A fuzz test would be theatre for two constants, so `checkout.test.mjs` pins the shape instead: empty (no Buy button) or an `https:` link with no username, password, stray whitespace or `key=`/`token=` query. The licence-validate URL gets the same checks. A typo or a pasted secret now fails the venture suite before it reaches the page.

Not checked: the link against a live checkout, which does not exist yet.
