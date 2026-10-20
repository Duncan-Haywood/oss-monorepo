# Ice Dam Removal Bid Calculator

Independent ice dam removal contractors (a truck, a steam machine, and a
two- or three-person crew — not a roofing company, not a gutter-cleaning
outfit, not a snow-plow route) can use this free browser-local calculator to
price one job from linear feet of roof edge, crew size, an emergency/storm
premium, and a minimum service charge, check whether their existing
per-linear-foot rate card actually covers the job's largely fixed cost, and
plug in the real on-site hours once the crew is back down the ladder.
**After using this, you can quote a job knowing whether your rate card
clears its own break-even point on THIS footage, and know before you send
the invoice whether the ice took long enough to erase the built-in profit —
which used to take a guess until the crew got back.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ice-dam-removal-bid-calculator/

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. The deterministic calculation works with no
account, API key, upload, or paid dependency.

## Why a per-linear-foot rate card can lose money on a short job

An ice dam removal job is quoted by the foot of eave and valley that needs
to be steamed clear, but a crew, truck, and steam machine cost close to the
same to dispatch whether that footage is 15 feet or 150 feet — the trip's
real cost is mostly fixed, not proportional to the number quoted:

- **The rate card is a flat number per foot.** It has to clear the job's
  real fixed cost divided across however many feet this specific job has,
  not just look reasonable next to what a competitor advertises. A rate
  that comfortably covers a 150-foot roof can lose money on a 15-foot spot
  over one window, because the fixed labor, travel, and equipment cost gets
  spread across far fewer feet.
- **The minimum service charge is the backstop, and it needs to actually be
  high enough.** `underpriced` flags the case where even the minimum charge
  does not clear the job's real cost — a short job with a floor that is
  itself set too low.
- **The job is priced before anyone knows how thick the ice actually is.**
  A phone estimate of footage and hours is a planning number; the
  reconciliation section recomputes the real cost from the actual on-site
  hours, the same way a proposed price gets checked against a breakeven in
  the portfolio's other job-pricing calculators.

The sharpest number here is `breakEvenRatePerFoot` — what the rate card
would need to charge per foot, ignoring the minimum charge, for this job's
specific footage to break even. Comparing it to the rate actually being
charged tells an operator, before the truck rolls, whether a short call is
about to be quietly unprofitable.

## Sharing a bid

"Copy share link" encodes every pricing field (and the proposal's deposit
and hold-period terms) into this page's own URL fragment and copies it to
the clipboard — send it to a partner, the office, or your own next visit,
and it reopens the same job. Nothing is transmitted: the link is built and
copied entirely in your browser, and only fields this calculator actually
has can ride in it. See [`share.mjs`](share.mjs).

## Privacy and usage

Everything runs in your browser. Your job details, prices, and hours are
never uploaded, there is no account, and nothing is saved to storage —
every field resets on refresh unless you opened or copied a share link,
which lives only in the page's own URL. We count anonymous local feature
events only (`quote-priced`, `actual-hours-checked`, `share_link_copied`),
with a visible opt-out. Do Not Track and Global Privacy Control disable
counting automatically. No job details, prices, or hours are recorded. The
counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

This calculator produces arithmetic observations from numbers you supply. It
does not audit your books, assess roof or ice conditions, predict actual job
length, or replace your own contract, insurance, or accountant. It is not a
safety or roofing-condition assessment tool — always follow manufacturer and
OSHA fall-protection guidance for ladder and roof work.

MIT licensed. See `LICENSE`.
