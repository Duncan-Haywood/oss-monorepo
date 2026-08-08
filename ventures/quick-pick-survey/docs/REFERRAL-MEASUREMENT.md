# Referral conversion: where the number comes from, and where it cannot

## The question

Does inviting a partner work? The couples tier is the only part of Pairwise
with a viral loop, `hypotheses[0]` is `untested`, and the `$9 / month` on the
pricing page is labelled planned. Whether that tier is worth a payment path
turns on the invite-to-join rate.

## Why the usage event stream cannot answer it

`couple_invite_created` and `couple_joined` are both in `USAGE_EVENTS`, and
both are emitted. It is tempting to read the second over the first.

That number would not be a conversion rate.

The two events are produced by **two different people in two different browser
sessions**. Every aggregate in `api/admin/overview` groups by
`sessionKeyHash` — `transitionPairs` finds a `from` event and then looks for a
`to` event *later in the same session*. A `couple_invite_created` →
`couple_joined` row added to that list would sit at **n = 0 forever**, and an
operator reading the panel would conclude that invites never convert.

Dropping the session grouping does not rescue it either. Counting
`sessions that emitted couple_joined / sessions that emitted couple_invite_created`
is a quotient of two population counts. It is not per-invite, nothing attributes
a join to the invite that caused it, and the two populations do not even have to
overlap in time.

Making the event stream capable of this would require an identifier that
survives **across sessions and across people** — a new data category, a new
retention question, and a new consent obligation, none of which
`docs/DATA-COLLECTION.md` or `/privacy` currently cover.

## Where the number actually comes from

None of that is necessary. `Couple` already records the invite and its outcome
on one row:

| column | meaning |
| --- | --- |
| `createdAt` | the invite was created |
| `joinerId` | somebody joined (this is what `linkedCouples` counts) |
| `joinedAt` | when they joined |

So the conversion is **linked and per-invite**, computed from first-party
relational data, with no new data category and no change to what is collected.
`src/lib/inviteConversion.ts` does the arithmetic; `api/admin/overview` reads
the rows and puts the summary on `referral`.

`CoupleChallenge` gets the same treatment via `challengedCoupleId`. It records
no acceptance timestamp, so every latency for it is null and the window cannot
be validated — the summary says so rather than implying otherwise.

## The two ways this number lies, and what stops them

**Censoring.** An invite created a minute ago has not *declined* to convert. A
rate over every invite ever sent is biased downward, and the bias is worst
exactly when invites are growing — the measure would look worst when the venture
was doing best. Every rate is therefore computed over a **matured cohort**:
invites older than `INVITE_MATURITY_MS` (7 days), with numerator and denominator
drawn from the same cohort. Invites inside the window are reported separately as
`immature` and counted on neither side.

Lowering that constant inflates every rate on the surface without anybody
joining. It is pinned, with its direction, in `inviteConversion.test.ts`.

The window does not ask to be trusted: `maturityAdequate` compares it against
the observed p90 on every call and reports `false` when conversions are still
arriving after it closes, meaning the rate is still censored and understates.
Only a matured invite can record a latency longer than the window, so the check
is decided by matured rows; the wider latency sample buys currency, not
sensitivity.

**A rate that reads as a result.** `maturedRate` is `null`, never `0`, when the
cohort is empty — "no invite has had time yet" and "invites were sent and nobody
joined" are opposite facts and `0` reads as the second. The admin card renders
the explanation instead of a percentage, and never shows a rate without the
cohort it was computed over, so a 100% built on two invites cannot be mistaken
for a finding.

## What this does not do

It does not measure whether people who join *stay*, and it does not measure
willingness to pay. It is the denominator that was missing, not the decision.
