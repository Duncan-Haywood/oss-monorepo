# einvoice: the site's "checked / not checked" lists now match the app (2026-11-26)

Bet #3 (e-invoice fix-and-explain), `private-monorepo` ROADMAP Next 3, merged as
private PR #232 (squash `978e361e`). Explore-track run.

## What the audit found

The site's lists (`apps/einvoice-site/content/i18n/{en,de,fr}.mjs`) were "the planned
scope". Compared line by line with `apps/einvoice-preflight` (`report.mjs`, `pro/check.mjs`,
`pro/server.mjs`, `pro/web/app.js`):

| Site claim | Reality before | Now |
|---|---|---|
| File structure against the format's schema (UBL, CII, …) | no UBL/CII XSD runs (`xsd-check.mjs` serves FA(3) and NAV only) | moved to "not checked"; ROADMAP Next 4 adds it |
| EN 16931 business rules | official Schematron only with `schematron=1`, which the workspace never sent | workspace sends it; each result shows which rule sets ran |
| ZUGFeRD MINIMUM / BASIC-WL do not count (Germany) | no rule | `PRO-DE-001` (BMF FAQ), seller DE or XRechnung profile, PDFs too |
| "Detect from the file" (workspace) | sent `profile=""`, i.e. no national rules | `profile=auto`: XRechnung/Peppol from BT-24, France when seller and buyer are FR |
| Fixes "a total that does not add up", "a code in the wrong list" | the whitelist refuses totals; no code-list fix | step lists the real five fixes |
| API page sample proposed fixing GrandTotalAmount | the API never fixes totals | a real `checkInvoice` response |

## For the next run

- Site claims about the checker must name code that runs. A claim with no test is how this drifted.
- `examples/xrechnung-cii-invoice.xml` carries Leitweg-ID `04011000-12345-34`. Its MOD 97-10
  check digits are wrong (they should be 03), so XR-002 fires on it under the XRechnung profile. The rule is right.
- In this container, `repair-facturx.test.mjs` "poppler opens the repaired PDF" fails because
  `pdfdetach` is a sandboxed wrapper that refuses to save. This is environmental and does not mean the code is broken.
- private-monorepo CI was starved on PR #232 (`ci_starvation.py` exit 1). Verified locally:
  pro 113/113, root 2179 pass with the 1 environmental failure, site 30/30, `biome ci` clean.
