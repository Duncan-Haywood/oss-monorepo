# Payout rail: the owner chose a merchant of record (2026-10-31)

For the next session that touches billing. The design (why no live key may
ever sit where an agent can reach it) is
[`2026-10-30-billing-plan.md`](2026-10-30-billing-plan.md); this file records
the decision and what comes next.

## The decision

Owner, 2026-10-31, answering `payout-rail` in `portfolio/ledger/asks.yaml`:
"its time to add payout rail of some sort. merchant of record sounds fine to
me." That answers the binary in `portfolio/ledger/break-even.md` in the
earning direction.

The same day the owner also answered the billing-model question behind
`session_gate.py`: "flat subscriptions on but with limits on usage. but the
16 agent runs per hour 24/7 hits limits basically exactly if every run does
something. undershoots if the runs slack." So the fleet is sized to its cap;
a run that ships nothing wastes a slot rather than saving money, and #813's
BUILD routing is the right policy.

## What blocks agent work today

Nothing, once the control-plane amendment merges (it now also carries the
owner's 2026-11-01 "turn on for profit ... don't let it block work"). Agents
can build paid paths now; they ship dark (no checkout link, free path shown)
until the owner sets the link. Until the amendment merges, build payment
paths the 2026-10-15 way: off by default, on the deployer's keys. Either way,
no run waits on step 2 or 4 below.

## Provider comparison (pricing pages read 2026-10-31)

| | Polar | Lemon Squeezy | Paddle |
|---|---|---|---|
| Free-tier fee | 5% + 50¢ (new orgs from 2026-05-27) | 5% + 50¢ | 5% + 50¢ |
| Paid plans | $20/mo for 3.8% + 40¢, up to $400/mo for 3.4% + 30¢ | none listed | custom, high volume |
| Extras seen | +1.5% non-US cards | +0.5–1% some methods/currencies | n/a |
| Fit | built for developer and open-source tools: licence keys, file downloads, GitHub sign-in, itself open source | owned by Stripe; its blog has a "2026 Update: Lemon Squeezy + Stripe Managed Payments" post, so its future shape is moving | SaaS-oriented, reviews the business before approving |

The free-tier fees are identical, so fit decides it. **Recommendation:
Polar.** It is the closest match for selling MIT tools (licence keys and
downloads without a server-side secret, which is Option A in the billing
plan), and its API host already answers from sessions. Lemon Squeezy is the
fallback; read its 2026 update first. The owner picks, since the owner opens
the account.

## Steps

| # | Who | Step |
|---|---|---|
| 1 | owner | Approve the `goals.md` amendment PR. |
| 2 | owner | Open the account (ID, bank, tax details), 2FA on, alert emails on. |
| 3 | agent | Pick the first product to charge for (a flagship from `portfolio/flagships.yaml`), add an off-by-default "Buy" path reading a checkout URL from build-time config, with refund policy, terms and disclaimer. Test-mode link first. |
| 4 | owner | Put the live checkout link in owner-only config (Cloudflare dashboard variable), not this repo. |
| 5 | agent + owner | One test purchase end to end, then one live purchase by the owner, refunded. Record it in the product README. |

No live key, webhook secret or merchant API key goes in this repo, its
Actions secrets, the public Cloudflare account or a session, ever.
