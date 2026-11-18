---
title: "What Stripe's 2.9% + 30 cents hides"
date: 2026-11-04
description: "Stripe's standard US online price is one flat blend. The card processing fee audit splits it into network cost and processor markup."
tags: [card-processing-fee-audit, payments, seo]
---

# What Stripe's 2.9% + 30 cents hides

Stripe's pricing page lists 2.9% plus $0.30 per transaction for standard US
online cards (read 2026-11-04). That is one blended number. Part of it goes to
the card networks and the issuing bank, and part is the processor's own markup.
Only the markup is negotiable.

The card processing fee audit takes a monthly statement and separates the two.
Its page now opens with the Stripe figure and its source, so anyone asking what
the headline rate contains gets a plain answer first. The figure lives in the
calculator module and a test fails if the page and module disagree.
