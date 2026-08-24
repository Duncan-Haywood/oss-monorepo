# Mobile Detailing Bid Calculator

A free browser calculator for mobile auto detailers. It prices the whole stop,
including travel, setup, cleanup, loaded labor, supplies, vehicle costs,
overhead, and target margin, so an attractive package price does not quietly
turn into an underpaid day.

Open [`index.html`](index.html) directly or serve this directory statically.
There are no accounts, network calls, build steps, or paid dependencies.

```bash
cd ventures/mobile-detailing-bid-calculator
node --test
python3 -m http.server 8080
```

## Why this is distinct

The portfolio has calculators for commercial cleaning, lawn care, HVAC
contracts, and other trades, but none models mobile auto detailing's distinctive
travel, water/power, setup, and cleanup economics. The search phrase is
“mobile detailing pricing calculator”; the user gets a quote, cost floor,
effective hourly rate, and copyable draft in one visit.

## Privacy and usage

Everything runs in the browser; job details and prices are never uploaded. An
anonymous local tally records only `quote_calculated` and `summary_copied`.
It contains no person identifiers, IP address, quote content, or analytics
vendor and is skipped for Do Not Track or Global Privacy Control. Clear this
site's local storage to remove it. No public usage reading exists yet because
publishing is owner-gated.

## Limitations and disclaimer

This is arithmetic, not a market-rate guide. It does not estimate chemical
quantities, taxes, payment processing, weather risk, damage liability, or local
demand. Verify wage, burden, insurance, travel, equipment, and supply inputs.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial or business advice, and it does
not replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licensed; see [`LICENSE`](LICENSE).
