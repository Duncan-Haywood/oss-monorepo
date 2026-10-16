# Court Reporter Transcript Pricing Calculator

Two free calculators for the arithmetic every freelance court reporter and
deposition stenographer does before sending an invoice or accepting an
assignment: turn a deposition's page count, turnaround speed, travel, copies,
and exhibits into an invoice total and an effective hourly rate, and check
whether an agency's flat per-page offer is worth the day. Entirely
client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/court-reporter-transcript-calculator/

After using this, you can now **turn a page count, turnaround tier, travel,
and add-on fees into an invoice total, a plain-text summary you can paste
straight into an email, and an effective hourly rate — and check an agency's
flat offer against your own target hourly rate before accepting it**, in
seconds instead of a spreadsheet or a guess under a deadline.

## Why this exists

Freelance court reporters bill in a shape almost no other trade does: a flat
appearance fee stacked on a per-page transcript rate that itself multiplies
for faster turnaround, plus separate per-page fees for certified copies,
exhibits, a rough draft, and realtime. r/courtreporting and NCRA member
forums both see the same recurring questions — "how much should I charge for
a rush transcript" and "is this agency's flat offer actually worth it" —
because both numbers are easy to get wrong under a deadline, and a per-page
headline rate alone hides whether a fast turnaround or an agency assignment
actually pays for the extra hours it costs. Neither calculator here knows any
court's official transcript-rate schedule or a specific agency's contract; both
just do the arithmetic correctly from the numbers the reporter already has.

## Try it

Open [`index.html`](index.html). For the invoice calculator, enter the page
count and per-page rate at minimum, pick a turnaround (its default multiplier
is editable), add any copies/exhibits/travel/realtime that apply, and click
**Calculate invoice**. For the agency offer check, enter the agency's page
rate and appearance fee, your total hours on the job, and your target hourly
rate, then click **Check this offer**.

## What it calculates

Both in [`calculator.mjs`](calculator.mjs), as pure functions with no
dependencies:

- **`computeTranscriptInvoice`** — sums an appearance fee, travel
  (miles × rate), the transcript fee (pages × per-page rate × turnaround
  multiplier), certified copies (copies × copy rate × pages), exhibits
  (count × rate), a rough draft fee, and a realtime uplift (only when
  requested) into a total invoice, and divides that total by hours worked for
  an effective hourly rate. Flags a missing per-page rate, realtime requested
  with no rate, travel miles with no mileage rate, and always notes that
  turnaround multipliers and rates are the reporter's own to set — not any
  court's official schedule.
- **`computeAgencyOfferCheck`** — turns an agency's page rate and flat
  appearance fee into a total, divides by total hours (travel + appearance +
  production) for the effective hourly rate, and compares that against a
  target hourly rate the reporter sets, flagging an offer that pays below
  target.
- **`formatInvoiceSummary`** — renders an invoice calculation as a plain-text,
  line-item summary to paste into an actual invoice or an email.
- **`TURNAROUND_TIERS`** — the four default turnaround multipliers (ordinary
  1×, expedited 1.5×, daily 2×, same-day/hourly 3×) shown in the turnaround
  dropdown; every one is editable in the UI before it reaches the total.

## Copy the invoice summary

Computing the total is only half the job. **Copy invoice summary**, next to
the result, puts the line items, the total, and an "arithmetic only" note on
the clipboard as plain text to paste into an actual invoice or email.

Three deliberate choices, the same ones `security-deposit-return-calculator`
already made for its own copy button:

- **The disclaimer travels with the text.** The summary's whole purpose is to
  leave the tool, and its reader — an attorney's office, an agency — never
  sees this page's footer.
- **It is served from the last calculated invoice**, never recomputed from
  the live inputs on click, so editing a field without pressing Calculate
  cannot produce a summary the screen disagrees with.
- **A blocked clipboard is not a dead end.** `navigator.clipboard` is absent
  over plain http and in some embedded webviews, so a failure reveals a
  read-only textarea with the summary selected instead of leaving the button
  inert.

Every output is the arithmetic behind your own invoice or acceptance
decision, **never a determination of what a client owes or what a contract
requires** — the reporter decides what to send or accept.

## Disclaimers

This is not legal or financial advice. It does not know any court's official
transcript-rate schedule, any agency's contracted rate, or which fees a
specific bar or client will accept — check your own rate card, state rules,
and any governing contract before invoicing. Verify its output before relying
on it, the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`invoice_calculated`, `agency_offer_checked`, `summary_copied`,
`example_loaded`) are counted in `localStorage` only, never transmitted. Do
Not Track and Global Privacy Control are honoured, and a button on the page
turns counting off entirely.

## Development

```sh
node --test calculator.test.mjs usage.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Both calculators and
their test suites are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
