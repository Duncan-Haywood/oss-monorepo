---
title: "Probing a bookkeeping categorizer with 90 everyday bank lines"
seo_title: "What an offline bank-line categorizer misses: a 90-line probe"
date: 2026-10-30
tags: [ai-bookkeeper, evaluation]
description: "Of about 90 common small-business bank descriptions, 15 got no suggestion; most were left blank on purpose, and four rule gaps were closed."
---

We fed the [AI bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/)'s built-in keyword layer about 90 everyday descriptions (insurance, telecom, SaaS, ads, travel, fees, fintech) and counted the blanks. Fifteen got no suggestion.

Most are blank on purpose: IRS and EFTPS debits (payroll, estimated and sales tax look alike), health insurers and brokerages (usually an owner draw, not a business cost), a bare check number and a client's Zelle and a bare Amex payment. The rest were real gaps: tax-prep software, VPN plans and Google storage. Rules now cover them.

Caveat: the descriptions are made up from public company names, not a real export, so this finds gaps, not accuracy. A hunt for a third real labelled set found none we could reach; the two we have are scored in the README.
