# 3PL Quote Normalizer

Compare a third-party logistics quote with in-house fulfillment before signing.
This free browser calculator puts receiving, storage, pick and pack, packaging,
shipping, returns, fixed fees, and minimum monthly spend on the same monthly
basis. It also shows the effective cost per order and the order volume at which
the supplied in-house rate catches up.

Open [`index.html`](index.html) directly or serve this directory as a static
site. No install, account, API key, or upload is required. Use **Copy summary**
to take the line-by-line assumptions and result into a quote review or vendor
conversation.

## What it does

- Normalizes common 3PL fee lines into a monthly subtotal.
- Applies a quoted monthly minimum without hiding the pre-minimum subtotal.
- Compares the result with a user-supplied in-house cost per order.
- Shows returns, break-even volume, and whether the minimum charge was applied.
- Copies a plain-text review summary; all calculations remain in the browser.

This is a planning comparison, not a provider quote, recommendation, or
guarantee of savings. Ask each provider for written, itemized pricing and check
their service levels, contract terms, surcharges, and seasonal rules.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, tax, legal, or engineering
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded; there are no
accounts, tracking cookies, or analytics vendors. The page counts only anonymous
feature events in local storage (`quote_normalized` and `summary_copied`), never
inputs or identity. Use **Turn usage counting off** to opt out. Events can be
deleted by clearing this site's local storage.

The product is free and has no payment flow. Public deployment is not implied by
this repository copy.
