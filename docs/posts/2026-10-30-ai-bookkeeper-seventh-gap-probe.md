---
title: "Bookkeeping rules for salons, electricians, podcasters and print-on-demand shops"
seo_title: "Bank-line categories for salons, trades and podcasters"
date: 2026-10-30
tags: [ai-bookkeeper, categorization, evaluation]
description: "A seventh probe of 64 made-up bank descriptors: 46 right before new rules, 64 after. Most misses were our own wrong expectations, and one was an electric supplier read as an electric bill."
---

The [AI bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) files bank lines with built-in keyword rules before any learning happens. To find where those rules are thin, we write bank descriptors for a kind of business we have not covered and count what the rules do with them.

This round covered hair salons, electricians and plumbers, podcasters, online tutors and print-on-demand sellers: 64 descriptors, with the expected account fixed before the first run.

**First run:** 46 right, 9 wrong, 12 with no suggestion. Of the 21 misses, 12 were our own expectations. We had put Ferguson and Winsupply under cost of goods, but the repo files supply houses as supplies, and stamps.com as postage. We fixed those and dropped two lines that were ambiguous.

The real gaps were small: Printful and Gelato (cost of goods), Boulevard and FieldPulse (software), CosmoProf, Cricut and JOANN (supplies), NECA and tutoring-association dues. The one instructive error: Graybar Electric and CED Consolidated Electrical were filed as utilities because the word "electric" matched the power-bill rule.

**Caveat.** The rules were tuned on the same 64 lines, so 64 of 64 is a coverage count, not accuracy. The descriptors are agent-written from public company names, not from a real bank export. Printify stays filed as software because an older test pins it, and its subscription and orders look alike on a statement.
