# Bridal Hair & Makeup Pricing Calculator

Mobile bridal hair and makeup artists can use this free browser-local calculator to price one wedding-day booking — the bride, the bridal party, hair-only, makeup-only, and kids' services, an early-start fee, mileage, a top-up to your service minimum, and a trial-fee credit — and to check whether the artists already booked can actually finish the group before the ceremony. **After using this, you can quote a booking with the total, the balance due, and the staffing it needs in one pass, instead of pricing each person by hand and discovering the schedule doesn't work on the morning of.**

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Two things a flat rate or a one-row-per-service list misses

- **Crediting a trial fee toward the wedding day is a real discount, even though it rarely gets counted as one.** "Your trial fee comes off your wedding day total if you book" reads as goodwill, but it lowers the combined amount collected across both bookings by up to the trial fee itself — the same booking is worth less to the artist than the identical booking without that policy. This calculator reports the total contract value both ways, so the discount is a number an artist decided on rather than one that fell out of a rate card nobody added up.
- **Group size is a scheduling problem before it is a pricing problem.** One artist can only do so many full "hair + makeup" looks between arrival and the moment the bride has to be dressed. A booking that fits the calendar on paper can still be physically impossible for one person to finish on time — and the fix (a second artist) is a real cost, usually billed to the client as its own line item, not something a rate sheet with one row per service can show.

## What it reports

- **Total contract value**, decomposed into service revenue, the early-start fee, travel, any top-up to your service minimum, and any extra-artist fee.
- **The wedding-day balance due**, separate from the trial fee already collected and any credit applied to it.
- **Whether the artists booked can finish the group in time**, and if not, exactly how many additional artists the schedule needs, what billing them costs the client, and what paying them out costs the artist.
- **Two informational flags**: a group below your usual headcount minimum, and a booking that needed a top-up to reach your dollar minimum.

## Sharing a booking

*Copy shareable link* puts all thirty-one figures into the page's URL fragment so an assistant artist, or your own phone at the trial appointment, can open the same booking. The fragment is never sent in a request line or a `Referer` header, so the numbers reach only the person you hand the link to. Anyone holding that link can read them, so send it the way you would send the numbers themselves.

A shared link replaces **every** field, including ones it did not carry — the recipient's own leftover values in the gaps would have them compare a stranger's headcount against their own prices while believing they were looking at one coherent booking.

## Privacy and usage

Everything runs in your browser. Your prices, headcounts, and fees are never uploaded, there is no account, and nothing is saved when you close the tab — every field resets on refresh by design. We count anonymous local feature events only (`booking-priced`, `assistant-needed`, `link_copied`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No prices, headcounts, or client details are recorded. The counter is not sent to the maintainers.

## Related tools in this portfolio

- [Appointment deposit calculator](../appointment-deposit-calculator/) — sets a deposit amount and drafts a cancellation policy for the trial or the wedding-day booking itself.

## Tests

```
node --test ventures/bridal-hair-makeup-pricing-calculator/*.test.mjs
```

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not book your clients, draft your contract, determine your sales-tax obligations, or replace your own accountant.

MIT licensed. See `LICENSE`. [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.
