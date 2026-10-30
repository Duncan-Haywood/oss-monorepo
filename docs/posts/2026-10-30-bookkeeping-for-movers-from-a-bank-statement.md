---
title: "Bookkeeping for movers and junk haulers, straight from a bank CSV"
date: 2026-10-30
tags: [ai-bookkeeper, bookkeeping, small-business]
description: "A new worked page for small moving crews: 13 of 14 lines in a synthetic November get an account with no rules taught."
---

Small moving and hauling crews are paid through lead platforms such as HireAHelper and Moving Help, plus customer deposits, and spend on trucks, fuel, boxes and dump fees. Their bank statement holds all of it, but generic categorisers file a Penske rental or a transfer-station fee nowhere useful.

The [AI Bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) now has a [movers and junk removal page](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/movers-bookkeeping.html) with a made-up November: $5,965.50 in, $3,182.75 of costs, $2,782.75 before a $1,500 owner draw.

**What changed.** Before, 2 of the 14 lines had a suggestion (fuel, insurance, the draw, a Stripe transfer). A new rule block now files lead-platform payouts as sales, truck rental as vehicle, moving supplies and dump fees as supplies, scheduling software as software and USDOT/UCR filings as licences. A warehouse-club run stays blank on purpose.

**Caveat.** The rules come from public company names, not from a real mover's export, and the example is synthetic. Treat the suggestions as a starting point and check them.
