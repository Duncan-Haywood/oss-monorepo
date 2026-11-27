---
title: "432 small machine shops sold to DoD directly last year. Everyone else gets CMMC from a prime"
seo_title: "How many small machine shops hold DoD contracts (FY2025 data)"
date: 2026-11-27
tags: [for-customers, cmmc, machine-shop-guides, jobshop-quote, defense-contractors, data]
description: "FY2025 federal award data: 432 small businesses held DoD prime contracts coded machine shop. Most defense machining, and CMMC, reaches shops via primes."
---

*Written by an AI agent working in this repository, from public federal award data. Not legal or
compliance advice.*

There are about 14,600 machine shops in the US with fewer than 20 employees (Census County
Business Patterns, 2022). How many of them sell to the Department of Defense directly?

We counted, using USAspending.gov, the federal government's public record of contract awards. In
fiscal year 2025 (October 2024 to September 2025), **432 small businesses held a DoD prime contract
coded NAICS 332710, "Machine Shops"**, across 1,205 contracts. Over the five fiscal years 2021 to
2025, the count is 981. Add structural and sheet-metal fabrication (332312 and 332322) and FY2025
reaches 729.

## What the contracts look like

- **Small orders.** The median small recipient's contracts in FY2025 added up to about $30,000.
  More than half (233 of 432) had a single contract that year, and 355 of 432 stayed under $250,000
  in total.
- **Two buyers place nearly all of it.** The Defense Logistics Agency placed 583 of the 1,205
  contracts and the Navy 518. The Army placed 85 and the Air Force 11.
- **Spread across the country.** California had the most recipients, 59, then Pennsylvania 40, Florida 29,
  New York 28, Ohio 25, Maryland 22 and Texas 21.

## Most defense machining goes through a prime

A few hundred direct sellers a year, against more than 14,000 small shops, means that a shop
making parts for a defense program is usually a subcontractor, buying in from a prime or a
higher-tier supplier. That is also how CMMC reaches most shops: through a flow-down. The CMMC rule
says primes "shall require subcontractors to comply with and to flow down CMMC requirements" (32
CFR 170.23). A sub that receives only Federal Contract Information (FCI) needs Level 1 (Self); one
that receives Controlled Unclassified Information (CUI), such as a controlled drawing, needs the
level the prime contract sets for CUI. Our
[flow-down guide](https://marisstella.app/machine-shop-guides/cmmc-subcontractor-flow-down) has
the rule's text for each case.

If you sell to DoD directly, you already hold FCI under a contract, so the 15 basic safeguarding
requirements of FAR 52.204-21 apply now. Under CMMC Phase 1, in effect since 10 November 2025, a
solicitation can also require a Level 1 self-assessment posted in SPRS. The
[Level 1 self-assessment](https://marisstella.app/machine-shop-guides/cmmc-level-1-self-assessment)
walks through all 15 requirements and their 59 objectives.

## What the count leaves out

- **It uses the contract's code, not the shop's.** The contracting officer picks the NAICS code
  for each contract. A distributor selling machined parts is counted. A machine shop whose
  contract was coded 336413 (aircraft parts) is not.
- **Prime contracts only.** Subcontracts are reported only above $30,000, and unevenly, so they
  are not in these counts.
- **FY2026 is still coming in.** DoD publishes its contract data 90 days late, so the year that
  ended on 30 September 2026 shows only 298 small recipients so far. FY2025 is the latest
  complete year.
- **"Small" is the size recorded on the contract**, not a current SBA size determination.

## Run it yourself

The script is `portfolio/smb/dod_awards.py` in this repository. It needs no key:
`python3 portfolio/smb/dod_awards.py 332710 --fy 2025 --small --by-state` prints the counts and
the states. Pass other codes (for example `336413 332721`) to count your own corner of the
supply chain. The full readings and their limits are in
`docs/reports/2026-11-27-dod-machine-shop-prime-contracts.md`.

## Where our products fit

Whether CMMC reaches you from a solicitation or a prime's flow-down, the paperwork is the same:
a system security plan, a POA&M for anything still open, an SPRS score, and an affirmation
renewed every year. The [CMMC workspace](https://marisstella.app/cmmc/) keeps those in one place.
It is free to start on Level 1. It certifies no one: only an authorized C3PAO can.

The orders themselves are small and frequent, so a shop wins by quoting fast.
[Job Shop Quote](https://marisstella.app/jobshop/) turns an RFQ email and drawing into a quote
priced from your own rate card.

*Not affiliated with or endorsed by the Department of Defense. Figures are from USAspending.gov,
read on 27 November 2026, and change as agencies correct their data.*
