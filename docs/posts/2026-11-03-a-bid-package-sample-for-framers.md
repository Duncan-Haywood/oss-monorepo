---
title: "A sample bid package for framers, generated from the real code"
seo_title: "Branded bid package for framers: sample proposal from a takeoff"
date: 2026-11-03
tags: [construction, estimating, open-source, pricing]
description: "Wall Framing Takeoff prints a proposal on a framer's letterhead with a quantities appendix and no unit prices. Here is a sample and why it is not on sale yet."
---

Small framing contractors usually have the numbers (studs, headers, sheets, labor) and then retype them into a Word document to send a customer. Wall Framing Takeoff already turned a plan and the contractor's own prices into a proposal letter. The branded bid package, built dark on 2026-11-02, puts the company name, logo and colour on that letter and adds an appendix of quantities counted from the plans.

The appendix never shows unit prices, labor lines or allowances, so the customer sees the price by section and the total and nothing about cost or margin. A test asserts that.

Today's change is the evidence: `build-sample-pack.mjs` runs the built-in example house through the real budget, proposal and bid-package code with invented prices and an invented company, and writes `sample-bid-package.html`. A test fails if the committed sample ever differs from what the code produces, and another that the marketing page says the package is **not on sale yet**. There is no checkout link, so nothing can charge anyone. The takeoff, cut list, lumber order, budget, schedule and plain customer letter stay free.

What is still missing is a real contractor's real bid to compare against, and the owner's merchant-of-record checkout link. The comparable tools charge monthly (Buildxact from $149 a month, Autotakeoff from $49 a month, as read on 2026-11-02); the planned price is a yearly licence key, untested.
