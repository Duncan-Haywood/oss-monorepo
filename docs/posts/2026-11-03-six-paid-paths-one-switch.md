---
title: "Six paid paths, one switch"
seo_title: "One command to turn on every paid path in the portfolio"
date: 2026-11-03
tags: [business-model, monetization, tooling]
description: "Six products now have a branded paid pack, all dark. A small script turns them on with one checkout link instead of six hand edits."
---

Six products in this repository carry a paid pack that is built and tested but switched off: wall framing bid packages, league print packs, shed build packs, staff schedule packs, change reports and an accounting close pack. Each is off for one reason, an empty `CHECKOUT_URL` in its `checkout.mjs`. The free tools stay free either way.

Until now, turning them on meant editing six files by hand. `portfolio/monetization/golive.py` replaces that. `golive.py` shows which paths are dark. `golive.py set <https-link>` fills the link in all six, `set slug=<link>` does one product, and `unset` switches back. It accepts only plain https links, touches nothing but that constant, and holds no secret, since both values are public.

Nothing is sold yet. The remaining step is the owner's: create the hosted checkout product at a merchant of record. After that, one command and a test-mode purchase move a product from built-dark to test-paid.
