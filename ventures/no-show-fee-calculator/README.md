# No-Show & Cancellation Fee Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/no-show-fee-calculator/>

A free, static calculator for appointment-based service businesses — personal
trainers, salons, tutors, therapists, and similar solo/small operators —
that turns your own price, booking volume, and no-show rate into a specific
cancellation fee, an estimate of what no-shows cost you a year, and a
ready-to-copy cancellation policy.

**After using this, you can now** state and defend a specific
no-show/late-cancellation fee, see whether a 24-hour or 48-hour notice
window actually recovers more empty-slot cash on your waitlist, and hand
clients a ready-to-use policy — **which used to take** guessing a number
or copying a boilerplate template that doesn't match your prices.

## Who this is for

Independent service providers who take appointments and lose real money when
a client doesn't show or cancels too late to rebook the slot: personal
trainers, hair/nail/spa businesses, private tutors, therapists and coaches,
and similar solo or small-team operators. Booking platforms (Calendly,
Acuity, Mindbody, etc.) let you *toggle on* a cancellation fee, but none of
them help you decide the number or explain it to clients — that's the gap
this fills.

## Try it

Open [`index.html`](index.html) in a browser, or serve the directory with
any static file server:

```sh
python3 -m http.server 8080
# then open http://localhost:8080/
```

No build step, no install, no dependencies. It's plain HTML/CSS/JS.

## How it works

1. Enter your appointment price, weekly booking volume, and roughly how
   often clients no-show or cancel late.
2. Enter the notice window you want to require and what percentage of the
   price you'd charge as a fee.
3. Choose the currency your prices already use. The calculator labels amounts
   in USD, EUR, GBP, CAD, or AUD; it does not convert between currencies.
4. Optionally enter the booking deposit you could require instead of (or
   together with) chasing a no-show invoice after the fact.
5. Get: the fee amount, how many no-shows/late-cancels you can expect in a
   year at your rate, what that time is worth, and an estimate of fee
   revenue you could collect if you enforce the policy, the modeled share of
   lost slot value recovered, and the exposure still unrecovered (both per
   month and as a full-year figure) — plus a comparison of
   that after-the-fact fee against keeping a deposit, a table that compares
   collecting the fee on a full book against overbooking 50%, 100%, and 150%
   of the empty chairs (and against dropping the fee and only overbooking),
   and a plain-text cancellation policy (including how you plan to collect
   the fee) you can copy straight into your booking system, client
   agreement, or website. Optionally type what a
   double-booked chair costs you; leave it blank to price overflow as one
   session.

All the arithmetic is in [`calc.mjs`](calc.mjs), covered by
[`test/calc.test.mjs`](test/calc.test.mjs). Nothing here is AI-generated
guesswork — it's your numbers, run through a fixed formula you can read.

After calculating, use **Copy share link** to create a bookmarkable URL that
restores the form and results on another device. The link contains the values
in its query string, including the selected currency, deposit percentage, and
any business or service names, so treat it like any other link containing
business information. It is not uploaded or stored by this tool.

The deposit comparison is complementary to a standalone appointment-deposit
calculator if one is opened later. This page does not replace that tool; it
answers a different question on numbers the user already entered here: for the
same missed slots, does keeping a deposit recover more cash than chasing a
no-show fee after the fact.

**Compare notice windows** answers the 24-hour vs 48-hour question with
your own waitlist fill-rate assumption. Same-day, 24-hour, and 48-hour
rows show how many late cancels you refill, how much empty-slot cash that
recovers, and the extra versus a same-day rule. The fee table stays
separate: collecting a fee does not put another client in the chair. A
crawlable explainer lives at
[`24h-vs-48h-cancellation-notice.html`](24h-vs-48h-cancellation-notice.html).

A worked example of the overbooking table lives on
[`should-i-overbook-or-charge-a-no-show-fee.html`](should-i-overbook-or-charge-a-no-show-fee.html).

Use **Download .txt** to save the generated policy as a plain-text file for your
booking system, client agreement, or records. The download is created locally
in your browser; no policy text is uploaded.

The calculator also saves the current form locally in your browser as you edit,
so a return visit starts with your own prices and policy assumptions. Use
**Reset saved numbers** to remove that draft and restore the shipped defaults.
Shared-link values take precedence over the saved draft. The draft never leaves
your browser and is separate from the anonymous usage event log.

Use **Download .txt** to save the generated policy as a plain-text file for your
booking system, client agreement, or records. The download is created locally
in your browser; no policy text is uploaded.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, or financial advice, and
it does not replace a qualified professional. You are responsible for
reviewing and verifying its output before relying on it, and for meeting any
obligation it helps you prepare for — including checking that a
cancellation/no-show fee is permitted for your business type and location
before you publish a policy. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

## Privacy

Everything runs in your browser. There is no server, no account, and no
third-party analytics vendor — your prices and business details are never
uploaded anywhere. The page counts a small number of anonymous local events
(e.g. "a calculation ran", "the policy was copied") so it can tell whether
anyone is using it at all. The page recalculates as you type, but a
calculation is only *counted* once a field is settled — the count is meant to
measure calculations, not keystrokes, and the result shown on first load is
not counted at all, since nobody asked for it. Each event is just a name and a date, stored only
in `localStorage` on your own device, visible to you in the page's "Usage"
section, and clearable or disable-able at any time (a "don't count my usage"
checkbox is right there, and the tool also honors your browser's Do Not
Track / Global Privacy Control signal automatically). See
[`usage.mjs`](usage.mjs) for the full implementation and
[`portfolio/usage/README.md`](../../portfolio/usage/README.md) for the
portfolio-wide rules this follows.

## Opportunity assessment

- **Who exactly:** solo/small appointment-based service providers (personal
  trainers, salons, tutors, therapists) — not enterprises, not businesses
  with a dedicated ops team.
- **What they type into a search box:** "no show fee calculator",
  "cancellation policy template for [trainers/salons/tutors]", "how much to
  charge for a no show".
- **What it costs them:** a no-show is a fully lost, usually unrecoverable
  time slot — direct, recurring lost income, not a vague annoyance.
- **Why a big vendor hasn't solved it:** scheduling platforms bundle a
  cancellation-fee *toggle* as one feature among many; deciding the *amount*
  and explaining it to clients is a positioning/pricing problem, not a
  scheduling feature, and too small a wedge for a scheduling vendor to build
  a dedicated tool around.
- **Distinct from this portfolio's other work:** not evidence/compliance
  monitoring (the bulk of the existing pipeline), not freelance-proposal
  margin pricing (`quote-margin-check`), not a scheduling product — it's a
  narrow calculator + policy generator for a different buyer with a
  different, recurring, quantifiable pain.
- **Shape:** pure static site, zero marginal cost, zero third-party
  dependency, no AI needed — deterministic arithmetic is the whole product.

The recovery percentage is a comparison of modeled fee collections with the
appointment value at risk. It reflects the enforcement assumption you enter;
it is not a forecast of client behavior or a guarantee that fees can be
collected.

## Usage tracking

Local-only counters as described above. There is no server-side aggregate
yet; the honest external signal available today is GitHub Pages repo
views/clones once this is deployed, which belongs in
[`portfolio/usage/usage.yaml`](../../portfolio/usage/usage.yaml) after
launch.

## Related

To measure your own no-show rate from a booking export first, see [`appointment-no-show-analyzer`](../appointment-no-show-analyzer/): it reads the export in the browser, nothing uploaded.

## License

MIT — see [`LICENSE`](LICENSE).
