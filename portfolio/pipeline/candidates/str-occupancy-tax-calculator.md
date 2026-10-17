# STR occupancy tax calculator

Scored 2026-09-24. Composite 6.875 · floor 1 (`ai_leverage`). Deterministic
arithmetic the same shape as this portfolio's other browser calculators:
every figure is a percentage or a flat rate applied to a taxable base the
host supplies, split by which portion a platform's own collection agreement
already remits — no model in the loop, no rate table shipped, no per-user
marginal cost.

A short-term rental host filing occupancy tax, or checking one before
listing a new property, hits a specific and recurring confusion: platform
"we collect and remit occupancy tax" messaging is true only per taxing
authority, not per platform. Airbnb and Vrbo each hold voluntary collection
agreements with some states, counties, and cities and not others — a common
real pattern is a state sales tax collected automatically sitting next to a
county tourist-development tax that is not, because no agreement covers
that county. Nothing on a payout statement flags the gap; it only ever nets
fees the platform already handled. A host who stops at "the platform
handles this" can owe an uncollected county or city tax on every stay,
discovered only at audit or renewal.

## Why this venture, not another marketplace-fee calculator

This portfolio already has a family of marketplace/platform fee calculators
(`str-host-payout-calculator`, `ebay-fee-calculator`, `etsy-profit-calculator`,
`amazon-fba-calculator`, and others) and a family of tax calculators
(`ifta-quarterly-fuel-tax-calculator`, `qbi-deduction-calculator`,
`1099k-reconciliation-worksheet`). `duplicate_check.py`, run against a
description naming this exact mechanism (splitting a stay's occupancy tax
into named layers and marking which layers a platform's collection
agreement already covers), scored `str-host-payout-calculator` closest at
0.16 — well under the 0.45 read-this-first bar, and a different question
(payout fees across channels, not tax remittance) from a different angle
(which channel to list on, not what is owed to which authority). No
existing venture models the platform-collects-some-layers-not-all split at
all; `hoa-reserve-fund-calculator` (0.12 overlap) is the closest thematic
neighbor and serves a different persona entirely (board treasurers avoiding
a future assessment, not hosts remitting a tax already owed on a stay that
already happened).

## Distribution

"Airbnb occupancy tax calculator", "vrbo tax by county", and "short term
rental tax I owe" are real searches with no existing free tool answering
the specific "which layer is on me" question — general occupancy-tax guides
answer "what rate applies" and platform help pages answer "does the
platform collect in my state", but neither computes the per-layer dollar
split a host can act on. Distribution scored a point below the sibling
checker family's typical 8, reflecting that this audience (STR hosts) is
narrower than the multi-community reach of a dev-tooling checker, but still
a specific, high-intent audience already proven to search and share within
this portfolio (`str-host-payout-calculator` carries the same audience).

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic: a percentage or flat rate applied to a taxable base, split by a host-supplied collection percentage; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser calculator, no server, no queue, no ops |
| Time to revenue | 7 | Donations only; same as the sibling STR and HOA calculators |
| Gross margin | 10 | Static page; serving one more host costs nothing |
| Defensibility | 3 | The split arithmetic is easily reimplemented — same order as the sibling STR/HOA calculators (3-5) |
| Distribution | 7 | A specific, high-intent host audience with real search terms this portfolio has already proven engages with the sibling STR calculator, a point below the dev-checker family's typical 8 because the audience is narrower |
| Liability containment | 8 | Output is arithmetic on host-supplied inputs; no rate table ships so nothing here can be a stale claim about a real jurisdiction's rate; makes no determination about which authorities tax a specific listing or what a platform's current agreements cover |
| Ethical robustness | 9 | Gets better for hosts the more it is used (surfaces a real, easy-to-miss filing gap before a bill or audit finds it), makes no compliance or filing claim, repeatedly directs the host to each taxing authority's own guidance and a qualified tax professional |

Composite: (1+10+7+10+3+7+8+9)/8 = **6.875**. Floor: **1** (`ai_leverage`).

## Mitigation for the floor and near-floor dimensions

`ai_leverage` sits at the same deliberate floor every deterministic
calculator in this portfolio carries: the output is arithmetic on numbers
the host supplies, not a judgment call, so there is no accuracy claim that
needs a model behind it. `defensibility` (3) is a real, named weakness
mitigated the same way as the sibling calculators: being first, free, and
correct with the specific "platform collects some layers, not all" framing
is the moat available to a zero-marginal-cost product; a copy competing on
the same axis does not change the portfolio's economics.

## Verdict

**Graduate as a venture** (`ventures/str-occupancy-tax-calculator`). Both
gates clear well above the floor of 5 (`liability_containment` 8,
`ethical_robustness` 9). Kill criteria: no return usage or organic referral
signal after 60 days of public availability; no unsolicited feedback, star,
fork, or referral after 90 days.
