---
title: "A branded bid package for framers, built but switched off"
seo_title: "Branded bid package for framing contractors and its licence unlock"
date: 2026-11-02
tags: [wall-framing-takeoff, monetization, construction, licensing]
description: "The framing takeoff now has a letterhead bid package behind a licence key. No checkout link is set, so it earns nothing yet. What exists, what is unproven."
---

The wall framing takeoff already turns a floor plan into a stud count, a cut list and a priced budget, and its customer proposal spreads tax, contingency, overhead and profit across the section prices so a homeowner sees neither the framer's cost nor margin. This change adds the next thing a contractor needs to send a bid: it on their own letterhead.

**What was built.** A "Branded bid package" card: company name, logo, address, contractor licence number and an accent colour, then one printable page (save as PDF from the browser) holding the proposal and a quantities appendix. The appendix lists counts and units only. Unit prices, labor and allowances are left out on purpose, and a test checks that.

**How it is gated.** A licence key is checked against a merchant of record's public validate call, so no secret sits in the repository or the page. The checkout link in `checkout.mjs` is empty, so today no Buy button shows and nothing is for sale. The free proposal is unchanged.

**What is honest to say.** The code is MIT. Anyone can edit the gate out, so the key is a convenience for buyers who want to pay, not copy protection. The validate request is written from memory of one provider's documentation and has not run against a live product. No framer has used the package. The price idea ($49 to $99 a year) is a hypothesis; the site's traffic is a few visits a day, so it would earn about nothing until distribution improves.

**Next.** The owner creates the hosted checkout product and drops its link in; then a test purchase proves the whole path. Source: `ventures/wall-framing-takeoff/`, and the plan in `portfolio/monetization/`.
