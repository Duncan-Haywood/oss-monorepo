# Consent Change Record

Web agencies and site operators can compare two browser trace exports around a consent choice and download a source-linked record of observable request and storage-key changes. This is evidence for review, not a compliance badge.

## Use it

Open `index.html`, paste a **before** and **after** JSON trace, then choose **Compare traces**. A trace contains only metadata such as `url`, `method`, and storage `key` values:

```json
{
  "site": "https://example.test",
  "capturedAt": "2026-08-24T12:00:00Z",
  "browser": "Chromium 128 / en-US",
  "sequence": "before-consent",
  "requests": [{"url":"https://cdn.example.test/script.js","method":"GET"}],
  "storage": [{"key":"consent_state"}]
}
```

The comparator keeps raw URLs out of analytics and never uploads the traces. Use **Download report** to save the local review artifact. Only test sites you own or are authorized to test.

If you already have DevTools HAR captures instead of JSON traces, open [`tool/index.html`](tool/index.html). That sibling diffs two HAR files and groups known tracker domains; it still does not claim a site is compliant.

## Privacy and usage

Everything runs in your browser. Your trace data is never uploaded and there are no accounts, tracking cookies, or analytics vendors. We count only anonymous local feature events, with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. The count never includes a site, URL, IP address, or trace content.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, medical, or compliance advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## Opportunity and boundaries

The target user is an agency or publisher that needs repeatable evidence of what a consent sequence changed. Existing Shopify permission and accessibility products in this portfolio inspect different inputs and produce different records. A future hosted tier could retain customer-owned history, but the free core deliberately has zero hosting or inference cost. The report does not select a legal basis, determine compliance, inspect page content, capture form values, or prove that an unobserved request is absent in every browser or region.
