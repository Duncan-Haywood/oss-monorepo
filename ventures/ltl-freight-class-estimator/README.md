# LTL Freight Class Estimator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ltl-freight-class-estimator/>

Estimate an LTL freight class from pallet or crate dimensions and weight before
you request a carrier quote. It turns a common shipping question, "what freight
class is this?", into the cube, density, and class band that a shipper can check
against the carrier's answer.

Serve this directory statically and open it at `http://localhost:8080`. Browsers
may block the module imports when the page is opened directly as `file://`. It
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

## The two levers

Knowing you are 1 lb/ft³ from the next band is not an instruction, because
nobody ships a lb/ft³. Density is `weight × 1728 / (length × width × height)`,
and of those four terms the footprint is the pallet and the weight is the goods
— so height and load are the only ones a shipper can usually move on the day.

The result restates the gap in both:

- **Cheaper.** The packed height that reaches the next class down, and the
  weight per piece that would reach it at the current height. When the height it
  would take is under a bare pallet's own deck (~6″), the page drops that half
  and says why, rather than printing a number nobody can execute.
- **Dearer.** The height at which a carrier's dimensioner re-rates the shipment
  into the class above, and how much clearance is left. Class follows the
  dimensions the *carrier* measures, so this is the number that turns into a
  re-class notice after the freight has already moved. Under half an inch of
  clearance the page says the freight is on the band line instead of quoting a
  headroom figure.

"Copy repack target" puts those instructions on the clipboard as plain text for
a warehouse email. It is a planning aid for comparing packaging options, not a
promise that changing dimensions or weight will change a carrier's class.

## Privacy and usage

Everything runs in the browser. Dimensions and weights are never uploaded. No
accounts, cookies, tracking pixels, analytics vendor, IPs, or user identifiers
are used. The tool optionally counts only `estimate_completed`,
`result_copied` and `repack_target_copied` in localStorage, never the entered
values. `repack_target_copied` is the outcome measure for the levers above: it
separates readers from shippers who took the instruction to a dock. The footer clears the
counter, and Do Not Track or Global Privacy Control disables counting.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, legal, tax, or shipping advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

MIT licensed; see [`LICENSE`](LICENSE).
