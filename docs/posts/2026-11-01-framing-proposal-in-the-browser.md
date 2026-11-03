---
title: "The framing proposal now runs in the browser"
date: 2026-11-01
tags: [wall-framing-takeoff, construction, estimating]
description: A builder can type prices, add permit and dumpster allowances, and download a customer letter from the framing takeoff page without a command line.
---

Yesterday's proposal only worked from the command line, which is not where most small builders live. The takeoff page now has a "Customer proposal" card under the budget: client, project, how many days the price holds, what is included, what is not, and terms, one per line. Preview it, or download it as a text file.

The price box also takes lump sums as `allowance Permit, 1200`. Allowances go into the cost before overhead and profit, untaxed and without contingency, and are listed in the letter as amounts billed at actual cost. They are saved in the plan file with the prices.

It is the same code the command line uses, so the same rule holds: with any line unpriced the letter is refused and the gap is named, unless you tick the box that issues it anyway with a warning. Nothing leaves the browser. The letter is an estimate from the prices you typed, not a contract; no price or clause is supplied by the tool. It has been clicked through in headless Chromium, not used on a real job.
