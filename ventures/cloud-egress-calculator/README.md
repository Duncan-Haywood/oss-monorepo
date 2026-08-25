# Cloud Egress Cost Calculator

If you are comparing S3-compatible storage providers, this browser-local calculator shows the monthly cost of your actual workload: stored GB, API requests, and outbound data transfer. After using this, you can identify the egress volume at which a cheaper storage rate stops being cheaper, which used to take a spreadsheet and a provider pricing page.

Open `index.html` directly, or serve this directory with any static HTTP server. Enter the rates from each provider's current price sheet; the calculator intentionally does not fetch or endorse prices.

## What it does

- Compares two monthly scenarios using storage, request, and egress charges.
- Shows the cheaper option, total savings, and a break-even outbound-transfer volume when applicable.
- Copies a short decision summary for a migration ticket or internal review without including raw workload inputs.
- Runs without an account, API key, network call, or paid dependency.
- Includes crawler-readable metadata, JSON-LD, sitemap, and `robots.txt`.

## Research And Business Case

Target users are small SaaS teams, agencies, and self-hosters moving media, exports, or backups between object-storage providers. Their painful question is not the advertised storage rate; it is whether outbound transfer and request charges erase the apparent saving. Existing provider calculators are vendor-specific, while generic cloud calculators are broad and often require a provider selection before showing the arithmetic. This tool is provider-neutral, transparent, local-first, and searchable for the specific question “how much will S3 egress cost?”

The product can later support saved local scenarios, provider price-sheet imports, or a user-supplied API key for optional document parsing. It does not need those features to deliver value today. Hosting is static and marginal cost is zero. A future paid model could sell team scenario history or provider-maintained rate imports, but there is no paywall or payment collection in this version.

The main risks are stale user-supplied rates and confusing estimates with an invoice. The interface says to use a current price sheet and labels the result as a comparison, not a quote or financial/technical determination. No customer data leaves the browser.

## Privacy And Usage

Inputs stay in the browser. There are no accounts, cookies, tracking pixels, IP logs, or analytics vendor. The optional checkbox records only a local aggregate calculation count, debounced until input settles; uncheck it to disable that write. No input values are recorded.

## Safety

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial or technical advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.
