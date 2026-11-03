---
title: "A fifth gap probe: 16 more merchants the bookkeeper now files"
seo_title: "AI bookkeeper keyword rules: a fifth gap probe of common merchants"
date: 2026-10-30
tags: [ai-bookkeeper, categorization, evaluation]
description: "We ran about 125 well-known merchant names through the built-in categorizer, found 16 it left blank, and added rules for 13 of them."
---

The [AI bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) suggests an account for a bank line from rules, payee memory and naive Bayes, with built-in keywords as the last layer. Keywords only help if the merchant is on the list, so we keep probing for names that are missing.

This probe used about 125 public company names (software, shipping, travel, telecom, insurance, ads) as made-up expense lines, plus 14 as credits. Thirteen expenses and three credits came back blank. Ten work-management, password, form and domain tools (ClickUp, monday.com, Dashlane, Buffer, PagerDuty, Box, Jotform, PandaDoc, IFTTT, Hover) now go to software, Bing Ads and Microsoft Advertising to advertising, and Kickstarter and Thinkific credits to sales.

ADP and the coworking operator Knotel stay blank on purpose: ADP bills both payroll and fees, and a person should pick. Amazon Payments also stays blank, because it can be a transfer or a sale.

These are made-up lines from the names alone, not a real export, so this says nothing about accuracy on real books. It closes known gaps; the open item is still a labelled export from a third organisation. The two tests are in `gaps5.test.mjs`.
