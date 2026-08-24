# LTL Freight Class Estimator

Estimate an LTL freight class from pallet or crate dimensions and weight before
you request a carrier quote. It turns a common shipping question, "what freight
class is this?", into the cube, density, and class band that a shipper can check
against the carrier's answer.

Open [`index.html`](index.html) directly or serve this directory statically. It
has no build step, account, network call, or paid dependency.

```bash
cd ventures/ltl-freight-class-estimator
node --test
python3 -m http.server 8080
```

## Why this exists

Small shippers and freight brokers often need a class estimate before asking for
an LTL quote, but carrier forms make the calculation easy to get wrong. This
tool makes packaging visible: dimensions are in inches, weight is per piece,
and the result scales both by piece count. That makes it useful for comparing a
compact crate with a light, bulky pallet before spending time on a quote.

The density bands are a transparent planning estimate, not a tariff lookup. A
carrier can reclassify freight based on handling, stowability, liability,
packaging, NMFC item, and current rules. Confirm the final class with the
carrier or a qualified freight professional.

## Privacy and usage

Everything runs in the browser. Dimensions and weights are never uploaded. No
accounts, cookies, tracking pixels, analytics vendor, IPs, or user identifiers
are used. The tool optionally counts only `estimate_completed` and
`result_copied` in localStorage, never the entered values. The footer clears the
counter, and Do Not Track or Global Privacy Control disables counting.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, legal, tax, or shipping advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

MIT licensed; see [`LICENSE`](LICENSE).
