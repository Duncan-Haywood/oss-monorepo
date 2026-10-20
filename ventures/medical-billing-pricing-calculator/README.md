# Medical Billing Pricing Calculator

A free browser tool: **type a practice's claim volume and average collection per claim, what a claim costs you to handle, and three prices you might quote, and see which one earns the most** — percent of collections, fee per claim or a flat monthly fee — with margin under each, the smallest practice you can afford at each price, the price that hits your target margin, and what happens if the practice's collections move. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/medical-billing-pricing-calculator/

After using this, you can **quote a billing client a price that covers your own cost plus a target margin**, which used to mean defaulting to the going percentage.

## Model

- Cost to serve a month = claims x (staff minutes per claim x loaded hourly cost + clearinghouse fee) + denied claims x rework minutes x hourly cost + software per client + onboarding hours x hourly cost spread over the contract.
- Collections = claims x average collected per claim. Percent pricing earns rate x collections; per-claim pricing earns fee x claims; flat pricing earns the flat fee.
- Percent beats per-claim only when the average collected per claim is above fee / rate.
- Flat pricing has a volume ceiling rather than a floor: it stops covering cost above a claim volume.

Not modelled: payer contracts, state rules on percentage-based billing, ramp-up time, collection lag, A/R cleanup, credentialing and other add-ons, bad debt, taxes.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not billing, legal, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
