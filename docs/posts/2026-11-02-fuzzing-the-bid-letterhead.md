---
title: "Fuzzing the page a contractor hands a customer"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, security, construction]
description: "A random-input test for a framing tool's branded bid package: hostile letterhead text, logos and colours never become live markup; customers never see unit prices."
---

The wall-framing takeoff tool ends in a page a contractor prints and gives a customer: a proposal on the contractor's letterhead, with an appendix of quantities. Two things must hold. The customer sees quantities but never unit prices, labor or margin. And whatever the contractor types (company name, logo link, brand colour) cannot turn into live markup, because that page gets opened, saved and emailed.

Today's test generates 300 random budgets with hostile text in every typed field (script tags, image tags with handlers, quote-breaking strings) and hostile logos (`javascript:`, SVG data URLs, links with credentials, quote-injection). It checks that no raw script or handler survives, that every image is https or a raster data URL, that the accent colour is always `#rrggbb`, and that no unit price or labor line reaches the appendix.

It passed first time, so it found no defect. To confirm it can fail, I removed the escape on the company name: the test went red. I put it back. The limits are plain: the budgets are invented, and no real contractor's letterhead was tried.
