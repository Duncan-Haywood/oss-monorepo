# Appointment Deposit Calculator

A free browser calculator for salons, trainers, tutors, photographers, and other small service businesses. Set a service-specific appointment deposit, see the balance due and expected annual cash secured, check whether the deposit actually leaves you better off, then copy a transparent deposit and cancellation policy draft.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/appointment-deposit-calculator/

After using this, you can now choose and explain an upfront booking deposit, and see whether it pays for itself — both of which used to take guessing or adapting a generic policy.

## Does the deposit pay for itself?

Cash secured is not the same question as more money. A deposit is applied to the service total rather than added to it, so the deposits collected in a year are revenue that would have been billed anyway, collected earlier. Reading "secured cash" as profit is the mistake the second results panel exists to prevent.

The panel puts a year of two worlds side by side, from three inputs — the booking rate you expect to keep, and your no-show rate with and without a deposit:

| | Revenue |
|---|---|
| No deposit | today's bookings, minus today's no-shows, at full price |
| With a deposit | the bookings you keep: full price when they show, the forfeited deposit when they don't |

It reports the difference and the **break-even booking rate** — the share of today's bookings you would have to keep for the two columns to match.

Two properties of that model are worth knowing, and both are asserted in `test/deposit.test.mjs`:

- **Break-even is normally below 100%.** As long as a deposit does not make no-shows worse, it pays for itself at full retention even with no change in customer behaviour, because the no-shows that remain forfeit a deposit instead of paying nothing. So the whole cost of a deposit policy is the bookings it turns away. A break-even above 100% only appears if you enter a *higher* no-show rate with a deposit than without one.
- **A missed slot is assumed to earn nothing and not be refilled.** That is the optimistic-for-deposits case, shown honestly. A business that reliably refills short-notice cancellations has less to gain than this model shows.

Open `index.html` directly or run `python3 -m http.server 8080`. There are no dependencies, accounts, payments, or server calls.

## Opportunity assessment

The target user is an independent appointment business owner searching for “how much deposit should I charge” or “appointment deposit calculator”. Current 2026 search results include active deposit-policy guides and calculators, validating the problem while leaving room for a transparent, local-first decision tool. Scheduling products collect or toggle deposits but do not help a small operator choose a service-specific amount and communicate the balance/refund terms. This is distinct from the portfolio’s no-show fee calculator: that tool models a charge after a missed appointment; this tool sets the commitment before booking. It can later support paid hosted policy libraries or user-supplied AI wording, but the free deterministic workflow has zero marginal cost today.

## Disclaimer and privacy

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

Everything runs in your browser. Data is never uploaded. The optional local counter records only event names and dates (`deposit_calculated`, `policy_copied`, and one of `deposit_pays_off` / `deposit_costs_money` recording only which side of break-even a run landed on), never prices, names, or identifiers, and can be disabled in the page footer. Counting honors Do Not Track and Global Privacy Control. See `portfolio/usage/README.md` for the portfolio measurement rules.

Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood). Refusing does not change the calculator.

## Related

To measure your own no-show rate from a booking export first, see [`appointment-no-show-analyzer`](../appointment-no-show-analyzer/): it reads the export in the browser, nothing uploaded.

## License

MIT, see `LICENSE`.
