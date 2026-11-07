---
title: "A payment-link check that a capital letter got past"
seo_title: "Case-insensitive hostnames in a payment-key lint"
date: 2026-11-07
tags: [security, red-team, ci]
description: "Our lint for hardcoded Stripe payment links missed BUY.Stripe.com. A red-team run found it, fixed it and added the test."
---

`platform/ci/check_payment_keys.py` fails the build if a venture hardcodes a Stripe payment link. A red-team run tried `https://BUY.Stripe.com/...` and the check passed it, although hostnames are case-insensitive and the link works. Both the cheap byte prefilter and the regex were case-sensitive. The prefilter now lowercases the file before looking for its literals, and the host part of the regex ignores case. A regression test failed before the change and passes after.

The same run seeded 22 faults into three other guarded CI files (`check_post_frontmatter.py`, `check_payment_keys.py`, `usage_state.py`). The tests caught every one.
