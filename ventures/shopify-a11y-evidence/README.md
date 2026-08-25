# Shopify Accessibility Evidence Report

Shopify merchants and agencies can paste an `axe-core` JSON export and create a dated, readable accessibility evidence record in seconds. The tool reports what the supplied automated test found; it does not claim that a storefront is compliant.

## Run it

Open `index.html` in a browser and paste the JSON exported by axe-core:

1. **Generate after record** — dated summary of violations, impact, passes, incomplete checks, and WCAG tags from the current export.
2. **Compare before → after** — paste an earlier export of the same storefront to see which rules were resolved, still present (with node-count change), or new.
3. **Copy record** or **Download .txt** for an agency or client handoff.

No account, network call, Shopify permission, or API key is required.

After using this, you can now hand a client a dated before/after record of what two automated scans contained, which used to mean reading two raw axe JSON files side by side.

Everything runs in the browser. The JSON is never uploaded and there are no cookies or analytics vendors. Optional "Remember these pastes" stores only on this device. The tool keeps anonymous aggregate event counts in localStorage (`report_generated`, `comparison_generated`, `report_downloaded`, `report_copied`), with a visible opt-out and Do Not Track / Global Privacy Control honored.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or compliance advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## Opportunity assessment

The target user is a Shopify merchant or accessibility agency that needs evidence of what was tested and when, not an overlay or a compliance badge. Existing scanners often stop at a dashboard; this wedge produces a portable record and keeps storefront data local. A future version could accept scheduled exports or Shopify theme snapshots behind user-owned credentials, but the free core is useful without them. Potential revenue is a hosted history and agency workflow tier, with zero launch variable cost. The main risks are incomplete automated coverage and users mistaking a report for legal advice, so every result states that it is not a compliance determination and calls for manual review.

This is distinct from `local-site-studio`'s EAA remediation service: it is a self-serve, Shopify-specific evidence artifact, and it currently requires no service engagement or live-site access.
