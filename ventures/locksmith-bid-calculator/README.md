# Locksmith Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/locksmith-bid-calculator/>

Mobile and small-shop locksmiths can use this free browser-local calculator to
price one service call — lockout, rekey, lock or cylinder install, or fob
programming — from labor and travel time, an after-hours/emergency premium
applied to billed time only, parts cost and markup, a callback reserve,
overhead, target margin, and a minimum service charge floor. A second section
checks a day's worth of calls, at that average profit, against a target daily
income. **After using this, you can quote an emergency call with the
after-hours premium and the minimum charge built in, which used to mean doing
that math in your head on the phone or rounding to a number that quietly
underpriced the trip.**

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. The deterministic calculation works with no
account, API key, upload, or paid dependency.

## Why a phone-quote number is easy to get wrong

A lockout or a rekey feels like a quick number to quote, and that is exactly
how two things go missing:

- **The after-hours premium** belongs on billed time (labor + travel), never
  on parts — a cylinder costs the same at 2am as at 2pm, but your own
  availability at 2am is worth more.
- **The minimum service charge** protects a short, low-parts job — a
  five-minute car unlock, a single cut key — from pricing below what the trip
  itself cost once drive time, fuel, and standing overhead are counted.

The daily-goal section then answers a different question: given today's
average profit per call, does the day's schedule actually hit your income
target, and if not, how many more calls close the gap?

See
[how much should a locksmith charge for a service call?](how-much-should-a-locksmith-charge-for-a-service-call.html)
for a worked emergency-lockout example.

## Privacy and usage

Everything runs in your browser and nothing is ever uploaded. Your call
details (time, rates, the emergency premium, parts, overhead, any deposit or
terms, and today's income-check numbers) are saved locally on this device so
you don't retype them — **Reset to defaults** clears them, and **Copy
shareable link** puts them in a URL fragment your browser never sends
anywhere. We
count anonymous local feature events only (`call-priced`,
`daily-goal-check`, `link-copied`), with a visible opt-out. Do Not Track and Global Privacy
Control disable counting automatically. No prices, parts, or income figures
are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, licensing, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

This calculator produces arithmetic observations from numbers you supply. It
does not verify a locksmith license or bond, price a specific make or model
of lock or fob, or replace your own insurance, contract, or accountant.

MIT licensed. See `LICENSE`.
