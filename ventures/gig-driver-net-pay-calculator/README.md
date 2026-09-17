# Gig Driver Net Pay Calculator

A free browser calculator for DoorDash, Uber Eats, Instacart, Uber, and Lyft
drivers. It turns one session's gross app pay into **net pay per hour and per
mile after gas, maintenance, and a prorated share of insurance** — the cost
the app screen never subtracts — plus an optional self-employment tax
reserve and a solver for the gross pay needed to hit an hourly take-home goal.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts.

```bash
# Serve it locally
npx http-server ventures/gig-driver-net-pay-calculator -p 8080
# Run the tests
cd ventures/gig-driver-net-pay-calculator && node --test
```

**Value:** After using this, you can now see whether last night's dash
actually paid $25/hour or $12/hour once the car is accounted for — which used
to take a spreadsheet nobody keeps current, or a guess.

## The problem it solves

Every delivery and rideshare app reports gross pay: base pay plus tips plus
promotions, per trip or per hour online. None of them subtract fuel, tires,
oil changes, or insurance — those are entirely the driver's, and a 1099
contractor has no employer withholding tax from any of it either. "The app
said $30/hour" and "I kept $30/hour" get treated as the same sentence because
nothing in the app ever separates them.

This is a different question from a fee calculator (what a marketplace takes
off the top of a sale) and from an owner-operator's cost-per-mile page (a
week of commercial trucking, not a rideshare or delivery shift). It is the
one gap in between: a personal-vehicle gig session, priced honestly.

## How it works

1. **This session.** Gross pay, miles driven (every mile the car moved,
   including the drive to go online and back home — not just active-delivery
   miles), and hours logged online.
2. **Vehicle cost per mile.** Gas price ÷ MPG, plus a maintenance reserve you
   set yourself — deliberately not the IRS standard mileage rate, which
   changes every year and would go stale hardcoded into a page. Prefer the
   standard rate as a single figure? Put it in maintenance-per-mile and set
   gas price to 0.
3. **Monthly fixed cost, prorated by miles.** Insurance and other fixed costs
   don't shrink because you drove fewer sessions this month. This session
   gets the share its miles represent out of your typical monthly business
   miles.
4. **Net profit.** Gross pay minus vehicle cost. Reported per hour and per
   mile, next to the gross figures, so the gap is visible rather than implied.
5. **Optional tax reserve.** Nothing withholds for a self-employed driver.
   Enter the share of profit you set aside for self-employment and income tax
   and the page shows the reserve and what's left. **The percentage is
   yours** — see
   [`how-much-should-i-set-aside-for-gig-driving-taxes.html`](how-much-should-i-set-aside-for-gig-driving-taxes.html).
   Leave it at 0 and every figure behaves exactly as it would with no reserve
   at all.
6. **Optional wage comparison.** Enter another hourly wage — a state minimum
   wage, a job offer — and see the gap against this session's net-per-hour,
   both stated before income tax so they compare on the same basis. No wage
   is assumed by default; it varies too much by state to guess at one.
7. **Optional take-home target.** Solves for the gross pay — and gross pay
   per mile — that would clear a target hourly take-home after vehicle cost
   and the tax reserve.

**Copy session summary** turns the result into plain text. **Copy share
link** puts the same inputs in a URL fragment so a partner or future-you can
reopen the exact session — nothing is sent to a server either way.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency; see [`calc.test.mjs`](calc.test.mjs).

## Opportunity and evidence

The target user is a DoorDash, Uber Eats, Instacart, Uber, or Lyft driver
checking whether a session (or a platform, or a market) is actually worth
driving in once the car is priced in. This is a well-populated question on
r/doordash, r/UberEATS, r/InstacartShoppers, and r/uberdrivers — recurring
threads with titles like "am I actually making money" and "how much should I
set aside for taxes" — and in search phrases like "doordash pay after gas"
and "gig driver tax calculator". Existing free tools in this space are mostly
mileage-deduction calculators (a tax-form number) or an app's own weekly
summary (gross only); neither reports net pay per hour after vehicle cost
next to a tax reserve and a wage comparison in one page. This is not yet
validated by a real visitor — see `kill_criteria` in `VENTURE.yaml`.

This is a different job from [`delivery-app-margin-calculator`](../delivery-app-margin-calculator),
which prices a *restaurant's* margin across dine-in vs. delivery-app tickets,
and from [`owner-operator-cpm-calculator`](../owner-operator-cpm-calculator),
which costs a week of *commercial trucking*, not a personal-vehicle gig
session.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and there are
no accounts, tracking cookies, or analytics vendors. The product counts only
aggregate local `session_calculated`, `tax_reserve_set`, `target_set`,
`wage_compared`, `summary_copied`, `share_link_copied`, and
`shared_link_opened` events, never people, IPs, content, or cross-site
identifiers. A shareable link encodes the session's inputs in the URL hash;
it is not sent to a server. The checkbox in the footer turns counting off;
clearing browser storage removes the local count. See
[`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
never changes what the tool does.

## Limitations

- **The tax reserve is arithmetic on a percentage you supply, not a tax
  calculation.** It does not know your filing status, state, deductions,
  other income, or quarterly-estimate schedule, and it does not tell you what
  to reserve. A losing session reserves nothing rather than implying a
  refund. Ask a tax preparer for your number.
- **One session at a time.** Multi-app stacking (driving for two platforms at
  once) is not modeled separately — combine gross pay across apps and use the
  same miles and hours.
- No standard mileage rate is built in, and none is asserted as current —
  see "How it works" above for the substitute.
- Single currency.
- Starting figures are an illustrative example, not a benchmark or a claim
  about what any platform pays.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or legal advice, and
it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any tax obligation it helps you prepare for. To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising from
its use.

MIT licensed — see [`LICENSE`](LICENSE).
