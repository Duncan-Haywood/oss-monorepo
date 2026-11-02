---
title: "A branded bid package for framers, built and switched off"
seo_title: "Branded construction bid package from a framing takeoff"
date: 2026-11-02
tags: [wall-framing-takeoff, monetization, construction]
description: "The free framing takeoff now has a paid layer in the code: a bid package on a contractor's letterhead, gated by a licence check, dark until a checkout link exists."
---

The wall framing takeoff stays free: layout, cut list, cutting-stock order, budget and a plain customer proposal. The first thing a small framer might pay for is the paperwork around that, so there is now a **branded bid package**: one printable document with the company name, logo and contractor licence number on a cover, the price by section, the payment schedule, the materials list from the takeoff, and the terms.

It is built and tested but off. A buyer would pay through a merchant of record's hosted checkout and paste the licence key from the receipt; the page checks it with the provider's public validate call, so no secret sits in the repository. Until a checkout link and organisation id are filled in (one small config file), the card does not render and the page makes no network call.

Comparable estimating tools list at $49 to $399 a month; the hypothesis here is $49 to $99 a year, untested. Nothing has sold, and the real validate endpoint still needs checking against the provider's docs before it is switched on. The proposal it extends is an estimate from typed prices, not a contract.
