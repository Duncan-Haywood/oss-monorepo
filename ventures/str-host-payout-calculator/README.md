# STR Host Payout Calculator

A free browser calculator for short-term rental hosts. It puts one stay
through Airbnb’s 2026 host-only fee, the retired 3% split, Vrbo
(pay-per-booking and the legacy annual plan), and a direct booking, then
shows host payout, the price the guest actually pays, the listed-price
raise that restores the old 3% deposit, and how many stays you must keep
going direct before the fee gap is real money.

**After using this, you can now see which channel actually pays you on
the same stay — and how much occupancy you can lose leaving a
marketplace — which used to take a spreadsheet that mixed percentages
taken from different bases.**

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no
build step, no network calls, no accounts. Not yet deployed to a public
URL — publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is
ready to deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/str-host-payout-calculator -p 8080
# Run the tests
cd ventures/str-host-payout-calculator && node --test
```

## The problem it solves

Airbnb spent 2025–2026 moving most hosts off a ~3% host / ~14% guest
split onto a single **15.5% host-only service fee**. Hosts who still
price as if they pay 3% are short before the guest arrives. Vrbo’s
pay-per-booking model is a different shape again: 5% commission on the
rental plus 3% processing on the guest payment, including tax and
deposits. A blog that says “15.5% vs 8%” is comparing two percentages
of two different numbers.

Direct booking looks cheapest on fees and loses if the occupancy
haircut is large. The decision is not “which percentage is smaller.”
It is “which annual payout survives the bookings I actually keep.”

## How it works

1. **One stay, every channel.** Nightly × nights + cleaning + extras is
   the booking subtotal. Occupancy tax and a security deposit are
   tracked separately because Airbnb usually excludes them from the
   host fee and Vrbo’s processing fee usually does not.
2. **Airbnb host-only.** Host fee × subtotal. Processing bundled. Guest
   pays listed + tax.
3. **Airbnb legacy split.** Host ~3%, guest ~14.1% at checkout. Shown
   as a reference row so the 2026 cut is visible. It cannot win the
   ranking — most hosts can no longer choose it.
4. **Vrbo pay-per-booking.** 5% of the subtotal plus 3% of the guest
   payment (subtotal + tax + deposit).
5. **Vrbo subscription.** No 5% commission; processing remains; the
   annual invoice is spread over the year’s bookings. Renewals only
   for many hosts in 2026 — turn the row off if you do not pay it.
6. **Direct.** Card processing (default 2.9% + $0.30) plus website /
   channel-manager cost, then an occupancy-keep percentage.
7. **Restore the old payout.** New list = old subtotal × (1 − old host
   rate) ÷ (1 − new host rate). For 3% → 15.5% that is about a 14.8%
   raise, not 15.5%, because the new fee is taken from the new list.
8. **Direct break-even.** Bookings needed, after processing and site
   cost, to match the best *available* marketplace’s annual payout.

Every starting rate is editable. The arithmetic lives in
[`calc.mjs`](calc.mjs) with no DOM or network dependency. See
[`calc.test.mjs`](calc.test.mjs).

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing
stored is an anonymous local tally of which features were used and the
current date, in `localStorage` under `str-host-payout-usage` — never
the nightly rate, occupancy, address, or payout. It is opt-out from
the footer, and it is skipped automatically when the browser sends Do
Not Track or Global Privacy Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

A **Copy share link** button puts the numeric assumptions in the URL
when the host asks it to. The allowlist is in [`share.mjs`](share.mjs);
listing notes and addresses are not encoded.

Events counted: `comparison_calculated`, `channel_toggled`,
`rates_edited`, `summary_copied`, `link_copied`.

## Discoverability

- Landing copy uses the phrases hosts type: Airbnb vs Vrbo host fees,
  15.5% host-only fee, host payout, direct booking.
- [`airbnb-host-fee-2026.html`](airbnb-host-fee-2026.html) answers the
  migration question.
- [`airbnb-vs-vrbo-host-fees.html`](airbnb-vs-vrbo-host-fees.html)
  answers the channel comparison.
- `schema.org` SoftwareApplication + FAQPage, Open Graph, sitemap,
  crawlable robots.txt.

## Limitations

- Starting rates are 2026 ballparks (15.5% Airbnb host-only, 16% in
  some markets, VAT on the fee in the EU; Vrbo 5% + 3%; Stripe-like
  2.9% + $0.30). They are not a quote from either platform.
- One listing, one currency, no channel-manager markup beyond the
  monthly/annual fields.
- Occupancy-keep is a host estimate, not a demand model.
- Guest service fees on Vrbo vary by stay length and market; the
  default 10% is a starting point for the *guest-paid* column only.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty
of any kind, express or implied. It is not legal, tax, financial, or
business advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before
relying on it**, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
