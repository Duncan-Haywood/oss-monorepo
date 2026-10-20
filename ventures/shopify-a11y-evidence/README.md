# Shopify Accessibility Evidence Report

Shopify merchants and agencies can paste an `axe-core` JSON export and create a dated, readable accessibility evidence record in seconds. The tool reports what the supplied automated test found; it does not claim that a storefront is compliant.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/shopify-a11y-evidence/

## Run it

Open `index.html` in a browser, paste the JSON exported by axe-core, and choose **Generate evidence record**. Use **Copy record** for an agency or client handoff, or **Download .txt** to save a dated record. Incomplete checks are included separately so uncertain results are not lost. No account, network call, Shopify permission, or API key is required.

Open `quote.html` when the next question is money: the same export becomes a fix-first list, estimated hours, and a quote range at your hourly rate. After using it, you can answer “what will this remediation cost?” in a minute instead of reading every rule by hand. The hours are a planning estimate, not a fixed bid and not a compliance determination.

Open `theme-areas.html` with the same JSON when the next question is which file to open. It groups affected nodes by likely Shopify theme area (product form, header, cart, collection) so a developer starts in the right Liquid section. Classification is a selector/HTML heuristic, not a file-path guarantee.

Open `what-changed-between-axe-scans.html` when the next question is what a fix changed. Paste the earlier export and the later one. After using it, you can now show which rules resolved, which remain (with node-count change), and which appeared only after the change — a diff that used to mean reading two axe dashboards side by side. It is a diff of two supplied results, not a compliance determination.

Everything runs in the browser. The JSON is never uploaded and there are no cookies or analytics vendors. The evidence page keeps anonymous aggregate `report_generated` and `report_copied` counts in localStorage; the quote page adds `quote_generated`, `quote_copied`, and `quote_downloaded`; the theme-area page adds `theme_areas_generated`, `theme_areas_copied`, and `theme_areas_downloaded`; the compare page adds `comparison_generated`, `comparison_copied`, and `comparison_downloaded`. All have a visible opt-out. GitHub Sponsors is optional and does not change what the tool does.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or compliance advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## Opportunity assessment

The target user is a Shopify merchant or accessibility agency that needs evidence of what was tested and when, not an overlay or a compliance badge. Existing scanners often stop at a dashboard; this wedge produces a portable record and keeps storefront data local. A future version could accept scheduled exports or Shopify theme snapshots behind user-owned credentials, but the free core is useful without them. Potential revenue is a hosted history and agency workflow tier, with zero launch variable cost. The main risks are incomplete automated coverage and users mistaking a report for legal advice, so every result states that it is not a compliance determination and calls for manual review.

This is distinct from `local-site-studio`'s EAA remediation service: it is a self-serve, Shopify-specific evidence artifact, and it currently requires no service engagement or live-site access. The quote page answers “what should this cost to fix.” The theme-area page answers “which Liquid file do I open first.” The compare page answers “what changed.” Keep all three as siblings of the evidence report. PR #1514 asked the same compare question on `index.html`; this sibling keeps that page as the single-scan record.
