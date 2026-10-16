# Appointment No-Show Cost Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/appointment-no-show-cost-calculator/>

A free browser tool for small medical, dental, therapy, chiropractic, vet and
salon practices. Enter your schedule, visit revenue, no-show and late-cancel
rates, the share of empty slots you refill, a no-show fee or deposit, and what
reminders cost and how much they cut no-shows. It shows the yearly revenue lost,
the cost after refills and fees, the best overbooking level, the no-show fee that
breaks even, the most a reminder service can cost and still pay, and a
sensitivity grid. Entirely client-side; no patient information is asked for.

After using this, you can **tell what your empty slots really cost and which lever
(a fee, reminders or a little overbooking) is worth pulling first**.

## Try it

Open [`index.html`](index.html) and click **Work out the cost**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies.

- Slots per year = slots per day x days x weeks. No-shows and late cancels are
  shares of those slots; refilled shares earn the visit revenue again; fees are
  charged on each no-show or late cancel and collected at your stated rate.
- Break-even fee: the fee at which collected fees equal the cost after refills.
  Closed form, because cost is linear in the fee.
- Reminders: the typed no-show rate is the rate without reminders; a relative cut
  lowers it, and the break-even price is the saving per scheduled visit.
- Overbooking: each booked patient arrives with probability 1 - no-show - late-cancel,
  independently, so arrivals are exactly binomial. Value per day is revenue from
  patients seen less your cost per patient who arrives to a full day. The best level
  is the argmax over extra bookings per day. Refills on the day are ignored.

Related, different jobs: `appointment-no-show-analyzer` reads a booking export,
`appointment-overbooking-optimizer` works from daily history and clustered bad days,
`appointment-deposit-calculator` and `no-show-fee-calculator` set a single fee. This
tool puts the whole-year cost, the fee, reminders and overbooking side by side.

## Limits

Defaults are placeholders, not benchmarks. This is arithmetic, not billing, legal or
clinical advice, and it does not say whether a fee or deposit is permitted where you
practise. Arrivals are assumed independent; real days cluster.

## No warranty

Provided free and as-is, without warranty of any kind. You are responsible for
verifying its output before relying on it. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

## Privacy and usage

Nothing leaves your browser. Anonymous feature counts (`cost_run`, `example_loaded`)
are kept in local storage only, and can be turned off on the page; Do Not Track and
Global Privacy Control are honoured.

Support is optional: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).

## Tests

`node --test`
