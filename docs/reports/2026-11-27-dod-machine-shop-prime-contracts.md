---
kind: note
date: 2026-11-27
subjects: [cmmc, jobshop-quote]
---
# How many small machine shops hold DoD prime contracts (USAspending, read 2026-11-27)

For bets #2 (Job Shop Quote) and #4 (CMMC workspace), which sell to the same small machine shops.
`bets.md` had the Census count of every machine shop (`portfolio/smb/cbp_counts.py`, 17,433
establishments, 14,619 under 20 employees) and DoD's count of every contractor CMMC touches
(337,968), but nothing on the shops in between: the ones doing defense work, who are the CMMC
buyers. This reads the federal award data for them.

## How it was read

`python3 portfolio/smb/dod_awards.py <naics...> [--fy N] [--years K] [--small] [--by-state] [--csv path]`
asks the public USAspending API (`POST api.usaspending.gov/api/v2/search/spending_by_award/`, no
key, answered from a cloud session on 2026-11-27) for DoD prime contracts (award types A–D) coded
with the NAICS code and active in the fiscal year, pages through all of them, and counts distinct
recipients by UEI. Tests: `portfolio/ledger/test_smb_dod_awards.py` (no network).

Pagination check: FY2025, 332710, all sizes, the script counted 1,381 contracts;
`spending_by_award_count` with the same filters answers 1,381. Without the DoD filter the count is
1,480, so DoD places 93% of federal contracts coded 332710.

## Readings

| Codes | Span | Recipients | Of them small | Small: contracts, median total award |
|---|---|---|---|---|
| 332710 | FY2025 | 519 (7 outside the US) | **432** | 1,205; $29,805 |
| 332710 | FY2026 (incomplete) | 349 | 298 | 696; $34,002 |
| 332710 | FY2021–FY2025 | 1,156 | **981** | 4,781; $38,044 |
| 332312 + 332322 | FY2025 | n/a | 352 | 946; $17,240 |
| 332710 + 332312 + 332322 | FY2025 | n/a | **729** | 2,151; $27,639 |

- Small 332710, FY2025: 233 of the 432 had one contract; 355 had under $250k in total award value.
- Who buys (contracts, small 332710, FY2025): Defense Logistics Agency 583, Navy 518, Army 85, Air
  Force 11, DCMA 8. Over five years and all sizes: DLA 2,652, Navy 1,993, Army 641, Air Force 74.
- Recipients by state (small 332710, FY2025): CA 59, PA 40, FL 29, NY 28, OH 25, MD 22, TX 21,
  IL 18, VA 18, NJ 18, IN 18, MI 15. Over five years: CA 134, FL 76, PA 72, NY 67, TX 49, VA 49,
  OH 49, MD 44, IN 41, NJ 40.

## What it means for the bets

1. **Direct DoD sellers are a few hundred shops a year**, about 3% of the machine shops under 20
   employees (432 / 14,619; recipients are firms, CBP counts establishments, so this is a ratio of
   scale, not a share). Even over five years it is under 1,000.
2. So **most defense machining reaches small shops as subcontracts**, and the CMMC buyer bet #4
   reaches is mostly a sub that a prime flows DFARS 252.204-7021 down to (32 CFR 170.23), not a
   prime. Marketing should speak to "your prime sent you a CMMC flow-down" before "your next DoD
   solicitation". The flow-down page (`ventures/machine-shop-guides/cmmc-subcontractor-flow-down.html`)
   is the right front door, and a sales list of the primes that buy machined parts (the large
   recipients under 336413, 336411, 332994 and similar) would reach their supplier networks.
3. **The direct sellers are worth a list of their own**: they hold FCI on a DoD contract today, so
   FAR 52.204-21 applies now, and they are named in public records with a city and state. The
   script writes them with `--csv <path outside the repo>` (business name, UEI, city, state,
   contract count, total award) for prospect research. That list is not committed: public business
   records, but some recipients are sole proprietors, and outbound sending is the owner's switch
   (`prompts/goals.md`, pivot point 7).
4. For bet #2, DoD's direct buying is many small orders (a small recipient's median total over five
   years is about $38k, DLA first): a quoting tool's value there is speed on many small RFQs, which is the wedge.

## Limits (quote them with any figure)

- The NAICS code is the contract's, set by the contracting officer: distributors of machined parts
  are in, shops that sell under another code (336413 aircraft parts, 332721 precision turned) are
  out.
- Primes only. Subawards are reported by primes only above $30k and unevenly; not read here.
- DoD's FPDS reporting runs 90 days behind, so FY2026 (ended 30 Sep 2026) is incomplete until about
  January 2027. FY2025 is the latest whole year.
- "Small" is the business size recorded on the contract, not a current SBA determination.
- Award amount is the award's total value, which can include years outside the span.

## Next

- Read the same for 336413 and 332721 if a page or the sales list needs them (the script takes any
  codes).
- When outbound is switched on, start from the FY2025 small-business list, sorted by state, with the
  flow-down and Level 1 pages as the offer.
