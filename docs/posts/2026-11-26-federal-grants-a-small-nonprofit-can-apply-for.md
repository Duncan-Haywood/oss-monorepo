---
title: "Federal grants a small nonprofit can apply for: 471 on Grants.gov, about 71 that are not research"
seo_title: "Federal grants for small nonprofits: what's open on Grants.gov now"
date: 2026-11-26
tags: [grant-autopilot, for-customers, grants, nonprofits, grants-gov, federal-grants]
description: "We read every opportunity posted on Grants.gov that a 501(c)(3) can apply for. 400 of 471 were research funding; of the other 71, the median award ceiling was $1M and 7 capped awards at $100,000 or less."
---

If you run a small nonprofit and type "federal grants for nonprofits" into
a search box, you get sent to Grants.gov, where a search filtered to
501(c)(3) organizations returns hundreds of open opportunities. That number
is real but misleading. We read every one of them on 26 November 2026, and
most are not written for an organization like yours.

## What we counted

On 26 Nov 2026 (23:42 UTC) we pulled every **posted** opportunity on
Grants.gov whose eligible applicants include "Nonprofits having a 501(c)(3)
status with the IRS, other than institutions of higher education" or
"Unrestricted", then read each one's detail record: award floor and
ceiling, cost sharing, close date and agency. We used the public
[Grants.gov API](https://www.grants.gov/api/api-guide), which needs no
key. The script and the full snapshot are in the repository
([`docs/data/grants-gov-nonprofits/`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/docs/data/grants-gov-nonprofits)),
so anyone can rerun it.

| | Opportunities |
|---|---:|
| Posted and open to a 501(c)(3) | **471** |
| of which list 501(c)(3)s by name | 402 |
| of which are "unrestricted" only | 69 |
| Research funding (NIH, NSF, DOD, NASA, or an "(R01)"-style code) | **400** |
| of which NIH | 328 |
| of which NSF | 42 |
| Everything else ("program" grants below) | **71** |

**Four in five are research.** The National Institutes of Health alone
posted 328 of the 471. NIH lists nonprofits as eligible because research
institutes are nonprofits, not because a food pantry or a youth league is
expected to apply for an R01.

## The 71 that are not research

| Of the 71 | Count |
|---|---:|
| Require cost sharing or matching | 30 |
| State an award ceiling | 63 |
| Median ceiling, where stated | $1,000,000 |
| Ceiling of $1M or more | 33 |
| Ceiling of $250,000 or less | 10 |
| Ceiling of $100,000 or less | 7 |
| Close within 30 days | 20 |
| Close within 90 days | 41 |

The agencies with the most were Commerce (16, mostly NOAA and the Economic
Development Administration), Energy (8), State (7), Agriculture, Interior,
the National Endowment for the Arts and Justice (6 each), and the National
Endowment for the Humanities (5).

The seven with a ceiling of $100,000 or less were three National Endowment
for the Arts *indemnity* rounds (government cover for borrowed exhibition
objects, not cash), a Great Lakes invasive-species grant for tribes, the US
Embassy in Bahrain's public diplomacy small grants, the Alaska Marine
Education and Training mini-grants, and the Austrian-American Partnership
Fund. That is the whole list, and few local nonprofits fit any of them.

## What this means if you are a small nonprofit

- **Don't count the Grants.gov total.** Filter out research, then read
  eligibility text, cost share and the ceiling before anything else. A
  match requirement on 30 of 71 program grants is a real cost for a
  small budget.
- **Much federal money reaches small nonprofits through someone else.**
  Grants.gov lists direct federal awards. Funding passed through a state
  agency, a county or a larger intermediary (a subaward) is announced by
  that body, not here, so check your state's grant portal too.
- **Foundations are the other half.** Candid found that between 2019 and
  2023, 22% of very small nonprofits (990-N filers) received at least one
  foundation grant, against 72% of other nonprofits
  ([Candid](https://candid.org/blogs/data-insights-very-small-nonprofits-make-up-majority-us-nonprofits/)).
  Foundation calls are scattered across funders' own sites.

## How Grant Autopilot handles this

[Grant Autopilot](https://marisstella.app/grants/) reads Grants.gov every
day for opportunities open to your kind of organization and ranks each one
for fit, with the reasons and the deadline, so a search that returns 471
becomes a short list. Foundation and state opportunities go in by link or
by uploading the RFP. Drafts come only from facts in your own documents,
each one citing its source, and nothing is submitted without a person's
approval. It does not promise awards: funders decide.
[Plans and prices](https://marisstella.app/grants/pricing).

The free [grant deadline tracker](https://marisstella.app/grant-deadline-tracker/)
runs in your browser if you only need the calendar.

## Limits of these numbers

- "Research" is a rule of thumb (agency, or an NIH-style activity code in
  the title); a few opportunities land in the wrong bucket either way.
- Ceilings of $0 or $1 on Grants.gov are placeholders and are counted as
  not stated. Three opportunities with a close date of 1 January 2099 are
  open-ended annual program statements.
- This is one day. Federal postings follow the fiscal year, so the mix in
  spring will differ; rerun the script for a current count.
