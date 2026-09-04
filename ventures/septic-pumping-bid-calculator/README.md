# Septic Pumping Bid Calculator

A free browser calculator for licensed septic pumpers. It prices a tank
pump the way the trade actually loses money — the included gallons, then
the buried lid, the hose beyond the truck, extra tanks and pump
chambers, baffles, risers, a written inspection, dump tickets, and
after-hours dispatch as their own hours — and shows the margin before
the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx --yes serve ventures/septic-pumping-bid-calculator -p 8080
# Run the tests
cd ventures/septic-pumping-bid-calculator && node --test
```

## The problem it solves

Small pumping shops are told to bid a published pump special, or by
dollars per gallon. That rule cannot see the access extras. A
1,000-gallon exposed-lid driveway stop is not the same job as a
two-tank buried system with a 150-foot hose, baffles, risers, and a
written inspection. The word "pump" is the same. The hours are not.
Matching a cheaper per-gallon quote written for the brochure special is
how a sold buried two-tank job becomes a loss after the first
locate-and-dig.

Basement-waterproofing calculators price wells, a pit, and discharge.
Water-heater calculators price a vent, a gas upsize, and an attic.
Junk-removal calculators price haul volume and a landfill ticket. None
of those price a septic service stop.

After using this, you can now send a pump price that already includes
access, extra gallons, and dump hours, which used to take a guess from
a published special.

## How it works

1. **Included gallons.** A 1,000-gallon include is not a 2,000-gallon
   two-tank job. Extra gallons over the include are their own hours and
   their own dump ticket.
2. **Access as its own hours.** Exposed lid versus buried locate-and-dig,
   and hose beyond the included run, do not scale with "a pump is a pump."
3. **Service extras.** Extra tanks, baffles, risers, inspection, and
   after-hours dispatch are billed as their own hours and kits.
4. **Loaded labor.** Hourly wage × (1 + payroll burden %).
5. **Price.** Cost ÷ (1 − target margin %), because margin is quoted as a
   share of price, not a markup on cost.

It then reports the numbers a pumper sanity-checks a bid against:
price per gallon pumped, effective hourly billing rate, the hour
split, and the **walk-away price** — total cost, below which the job
makes nothing. Entering a price already on the table scores it against
the same cost base. **Copy bid summary** turns the result into a
plain-text draft with wages omitted, ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Starting rates

The job and access presets ship with common ballpark hours and dump
figures. **They are not an industry standard, a septic design, or an
environmental determination.** Changing access or tank size never
overwrites a rate the pumper has already changed.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `septic-pumping-bid-usage` — never the
address, wages, costs, or prices. It is opt-out from the footer, and it is
skipped automatically when the browser sends Do Not Track or Global Privacy
Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`,
`proposed_price_compared`, `summary_copied`.

## Limitations

- Single currency and no tax handling; the pumper enters their own numbers.
- One stop. A full-system replacement, a drainfield, or a sewer-line
  replacement is not priced as a package.
- Open-and-inspect versus camera inspection is one rate; a county form
  is the pumper's choice of report fee, not a second model.
- Starting hours are ballpark figures, not timed from a named crew.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not septic, environmental, construction,
legal, tax, or financial advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its
output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
