# Kickstarter Fee Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/kickstarter-fee-calculator/>

A free browser calculator for Kickstarter creators: what a funded campaign
actually keeps after Kickstarter's 5% platform fee and its per-pledge payment
processing fee, and why two campaigns raising the identical total can keep
very different amounts.

## Why this exists

Most "Kickstarter takes 8-10%" summaries treat the fee as a flat percentage
of the total raise. It isn't. Kickstarter charges two fees, and only if the
project is funded:

- **Platform fee:** 5% of the total amount pledged.
- **Payment processing:** charged **per pledge**, not per dollar --
  3% of the pledge plus $0.20 for pledges of $10.00 or more, or
  5% plus $0.05 for pledges under $10.00 (a "micro-pledge").

Because the processing fee's flat component is per pledge, the same total
raised pays different total fees depending on the average pledge size: more,
smaller pledges spread that flat charge across more transactions and keep a
smaller share of an identical raise. This tool makes that difference visible
before you set reward tiers, not after the campaign closes.

Every rate is a constant lifted from Kickstarter's own published US fee
schedule ("Fees: United States", [kickstarter.com/help/fees](https://www.kickstarter.com/help/fees)),
not a live fetch. Confirm the current schedule there before relying on this
for a real campaign -- published fee schedules can change.

## Two calculators, one arithmetic module

- **Campaign** -- enter the total raised and number of backers, and see the
  platform fee, total processing fee, net payout, and effective rate,
  assuming pledges are close to the campaign's own average.
- **Single pledge** -- enter one pledge amount (a reward tier) and see its
  own fee and net contribution exactly, rather than as a campaign-wide
  average.

Both read the same `calc.mjs`, so a campaign estimate and a reward-tier
lookup can never disagree about the underlying rates.

## Privacy

Everything runs in your browser. The total raised, backer count, and any
pledge amount you enter are never uploaded, and this tool makes no network
calls of its own. We don't have accounts, tracking cookies, or an analytics
vendor. An anonymous local count of which features were used and the day is
kept in this browser only, and can be turned off with the checkbox in the
page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not legal, tax, financial, or crowdfunding advice, and it
does not replace a qualified professional. You are responsible for reviewing
and verifying its output before relying on it, including confirming
Kickstarter's current published fee schedule before budgeting a real
campaign against it. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted page is free, experimental, and
may be slow, broken, moved, or taken offline without notice. Do not use it
as a system of record.

Not affiliated with, endorsed by, or sponsored by Kickstarter. Kickstarter
is a trademark of its owner, named here only to describe the published fee
schedule this tool computes against.

## License

[MIT](LICENSE). Free and open source --
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/kickstarter-fee-calculator && node --test
```

Assertions across the fee arithmetic (`calc.test.mjs`), the usage counter
(`usage.test.mjs`), and the page's structure and disclaimers (`page.test.mjs`).
