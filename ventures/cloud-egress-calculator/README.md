# Cloud Egress Cost Calculator

If you are comparing S3-compatible storage providers, this browser-local calculator shows the monthly cost of your actual workload: stored GB, API requests, and outbound data transfer. After using this, you can identify the egress volume at which a cheaper storage rate stops being cheaper, which used to take a spreadsheet and a provider pricing page.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/cloud-egress-calculator/

Open `index.html` directly, or serve this directory with any static HTTP server. Enter the rates from each provider's current price sheet; the calculator intentionally does not fetch or endorse prices.

**After using this, you can now** see which quoted sheet is cheaper on *your* stored GB, requests, and outbound transfer — the cache-hit rate at which a CDN still loses to origin-only — whether a second-region replica still beats paying the cross-region pull every month — and the restore volume at which infrequent / archive storage still loses to the standard class — which used to take a spreadsheet plus two pricing pages.

## What it does

- Compares two monthly scenarios using storage, request, and egress charges.
- Shows the cheaper option, annualized savings, savings percentage, and a break-even outbound-transfer volume when the crossing is a positive GB figure.
- Copies a short decision summary for a migration ticket (totals and the cheaper option only — no stored-GB, request, or rate-sheet inputs).
- Downloads a portable JSON review record with the workload and calculated totals, while omitting provider rate inputs.
- Compares origin-only egress against a CDN on the same download volume (`does-a-cdn-cut-s3-egress.html`), including miss-fetch cost and the hit-rate floor.
- Compares keep-pulling a dataset across regions against copying it once (`does-a-replica-beat-cross-region-pull.html`), including the seed, change-sync, payback months, and the pull volume where they match.
- Compares keeping a bucket on the standard class against infrequent / archive storage after retrieve fees (`does-infrequent-access-still-beat-standard.html`), including the restore-GB ceiling.
- Says which tool to open for which question against the obvious named incumbent, the Google Cloud Pricing Calculator (`vs-google-cloud-pricing-calculator.html`): Google's own tool prices Google Cloud products on Google's schedule, this one puts two providers' price sheets on one workload and solves the outbound-GB crossover. Every claim about Google's tool is quoted from Google's own pages and linked to them; no dollar figure is asserted on Google's behalf. Not affiliated with Google.
- Same comparison against the third major cloud's named incumbent, the Azure Pricing Calculator (`vs-azure-pricing-calculator.html`): Microsoft's own tool turns anticipated Azure usage into an estimate on Microsoft's schedule (and your negotiated rate once you sign in), this one compares two providers' price sheets. Every claim about Microsoft's tool is quoted verbatim from Microsoft's own Learn documentation and linked to it; no dollar figure is asserted on Microsoft's behalf. Not affiliated with Microsoft.
- Runs without an account, API key, network call, or paid dependency.
- Includes crawler-readable metadata, JSON-LD, sitemap, and `robots.txt`.

## Run it

Open `index.html` directly, or:

```sh
python3 -m http.server 8877 --directory ventures/cloud-egress-calculator
```

Then open `http://localhost:8877`.

## Research And Business Case

Target users are small SaaS teams, agencies, and self-hosters moving media, exports, or backups between object-storage providers. Their painful question is not the advertised storage rate; it is whether outbound transfer and request charges erase the apparent saving. Existing provider calculators are vendor-specific, while generic cloud calculators are broad and often require a provider selection before showing the arithmetic. This tool is provider-neutral, transparent, local-first, and searchable for “how much will S3 egress cost?”, “does CloudFront cut S3 egress?”, and “S3 infrequent access restore cost”.

The product can later support saved local scenarios, provider price-sheet imports, or a user-supplied API key for optional document parsing. It does not need those features to deliver value today. Hosting is static and marginal cost is zero. A future paid model could sell team scenario history or provider-maintained rate imports, but there is no paywall or payment collection in this version.

The main risks are stale user-supplied rates and confusing estimates with an invoice. The interface says to use a current price sheet and labels the result as a comparison, not a quote or financial/technical determination. No customer data leaves the browser.

This is a different product from `egress-window-bid-calculator` (a residential egress-window install bid). Overlap checked 2026-08-26: replica vs cross-region pull landed on `main` during this run (`compareReplica`); do not rebuild it. #1409 and #1267 are older cores of the two-provider calculator (leave them open). Distinct from the CDN extra (internet downloads) and the replica extra (a second copy). No open PR covers infrequent-access restore vs standard.

## Privacy And Usage

Everything runs in your browser. Your data is never uploaded, and we don't have accounts, tracking cookies, or an analytics vendor. We count anonymous events (which features get used, nothing about who used them). Uncheck the box on the page to turn counting off. Do Not Track and Global Privacy Control disable counting automatically.

## Safety

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial or technical advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Tests

```bash
node --test
```
