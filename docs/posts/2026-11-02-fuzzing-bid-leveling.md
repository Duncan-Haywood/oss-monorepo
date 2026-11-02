---
title: "Random bids against the bid-leveling engine"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: A seeded property test throws 300 random scopes and subcontractor bids at the bid-leveling engine and checks that totals add up and no price is ever guessed.
---

wall-framing-takeoff can line subcontractor bids up against the takeoff's own quantities, so a cheap bid that is short on sheets or leaves out the vapor barrier is compared on the same scope. A new seeded test runs 300 random scopes with 1 to 6 lines and 1 to 4 bids, with lines dropped, quantities off by up to 30 percent, and prices given as unit price or lump amount.

For every bidder the leveled total must equal the bid plus additions, additions can never be negative, and the leveled total can never fall below the bid. A missing line with no plan price and no other bid's price must be listed as unleveled, never priced by guess; one that can be priced from the plan or the median of the other bids must not be. The "lowest" fields must agree with the numbers, the report must be deterministic, and a looser tolerance must never raise more quantity flags. All hold; no bug found. Flipping the sign of a shortfall addition makes the test fail. Scopes and bids are invented, not from a real bid set.
