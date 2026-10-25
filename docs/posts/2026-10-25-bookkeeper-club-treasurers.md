---
title: "Bookkeeping for club and PTO treasurers: donation payouts from one bank statement"
date: 2026-10-25
description: "ai-bookkeeper now books Zeffy, Givebutter, Donorbox and fundraiser payouts as income, and has a page for volunteer treasurers."
tags: [ventures, ai-bookkeeper, nonprofits, bookkeeping]
---

Booster clubs, PTOs and robotics teams run on one bank account and a volunteer
treasurer. [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) left Zeffy and
Givebutter payouts blank; a keyword rule now books them (with Donorbox, Classy,
GoFundMe, MemberPlanet, dues and fundraiser deposits) as income.

A made-up September (`fixtures/club-checking.csv`, 10 lines) gives $2,798.25 in
and $628.53 out. Nine lines get an account with nothing taught; a Sam's Club
trip is left for the treasurer on purpose, since it could be food, prizes or
supplies. A new [treasurer page](../../ventures/ai-bookkeeper/club-bookkeeping.html)
walks through it and says what the tool does not do: no fund accounting, no
Form 990.

Limits: rules come from platform names, not a real treasurer's statement. The
planned held-out Hack Club (HCB) reading was blocked this session by the
network proxy (403), so that item stays open.
