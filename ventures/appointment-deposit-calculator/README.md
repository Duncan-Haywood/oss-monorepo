# Appointment Deposit Calculator

A free browser calculator for salons, trainers, tutors, photographers, and other small service businesses. Set a service-specific appointment deposit, see the balance due and expected annual cash secured, then copy a transparent deposit and cancellation policy draft.

After using this, you can now choose and explain an upfront booking deposit, which used to take guessing or adapting a generic policy.

Open `index.html` directly or run `python3 -m http.server 8080`. There are no dependencies, accounts, payments, or server calls.

## Opportunity assessment

The target user is an independent appointment business owner searching for “how much deposit should I charge” or “appointment deposit calculator”. Current 2026 search results include active deposit-policy guides and calculators, validating the problem while leaving room for a transparent, local-first decision tool. Scheduling products collect or toggle deposits but do not help a small operator choose a service-specific amount and communicate the balance/refund terms. This is distinct from the portfolio’s no-show fee calculator: that tool models a charge after a missed appointment; this tool sets the commitment before booking. It can later support paid hosted policy libraries or user-supplied AI wording, but the free deterministic workflow has zero marginal cost today.

## Disclaimer and privacy

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

Everything runs in your browser. Data is never uploaded. The optional local counter records only event names and dates, never prices, names, or identifiers, and can be disabled in the page footer. See `portfolio/usage/README.md` for the portfolio measurement rules.

## License

MIT, see `LICENSE`.
