---
title: "Fuzzing the page a contractor hands a customer"
seo_title: "Testing a contractor bid package for leaked prices and injected markup"
date: 2026-11-02
tags: [testing, construction, wall-framing-takeoff]
description: "A seeded property test for the branded bid package in wall-framing-takeoff: no unit prices shown, no injected markup, and a mutation check."
---

The bid package in `wall-framing-takeoff` is the one page a contractor prints and gives a customer. It must show quantities but never unit prices, and it prints text the contractor types (company, address, client, project) plus an optional logo URL, so a stray `<script>` or an unsafe logo would land on a customer's screen.

Today's test builds 300 seeded random budgets with hostile text in every field and bad logos (`javascript:`, SVG, plain http, credentials in the URL, oversized data URLs) and checks four things: no raw markup in the output, no unit price anywhere, Labor and Allowances kept out of the quantities appendix, and every other section present.

It found no bug. To check the test can fail, I removed the Labor/Allowances skip, then the item escape; each made it fail. One first-draft failure was my own regex flagging the legitimate logo tag, a reminder that a fuzz test's oracle needs the same care as the code.

Limit: this is synthetic data. No real contractor's bid has been run through it.
