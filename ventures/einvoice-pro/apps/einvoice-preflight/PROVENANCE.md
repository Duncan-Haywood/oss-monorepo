# Provenance: einvoice-preflight

| | |
|---|---|
| Source | oss-monorepo `ventures/einvoice-preflight` |
| Commit | `8e9e26d5e5e80f688e819ac76947283dc41fa24b` (last to touch the venture) |
| Tree | `827836d3db132e32c12d7f5e7359f8248311cc8f` (git tree id of the copied directory) |
| Imported | 2026-11-24 |
| Files | 969 |
| Paid model | subscription |

The imported files are the MIT-licensed baseline (LICENSE, part 1). The public
copy stays online as the free edition; new depth is built here (oss-monorepo
`portfolio/monetization/LICENSING_TRANSITION.md`, "How one product moves").

## Third-party licence files

Reviewed 2026-11-24. The import script lists only files named LICENSE/LICENCE/COPYING;
the review also read every NOTICE, `*.LICENSE.txt`, OFL and README licence statement.

Test data (never part of a paid build; `pro/` imports nothing from `eval/` or `fixtures/`):

- [x] `eval/nfe-corpus/nfelib/LICENSE-nfelib`: MIT (Akretion). NF-e samples.
- [x] `eval/nfe-corpus/sped-nfe/`: "LGPLv3 or MIT", taken under MIT (its README).
- [x] `fixtures/hungary-nav/LICENCE-NAV.md`: MIT (Nemzeti Adó- és Vámhivatal).
- [x] `fixtures/verifactu/`, `fixtures/fr-fnfe/`: sources and licences in each README;
      test data only.

Shipped with the checker (each keeps its notice; `plain/NOTICE.txt` is the record):

- [x] `plain/fontoxpath.esm.js`: fontoxpath 3.34.0 bundle, MIT (+ xspattern, prsc, MIT).
- [x] `fonts/PreflightSans-*.ttf`: Liberation Sans subsets, SIL OFL 1.1 (`fonts/OFL.txt`).
      OFL allows bundling with proprietary software; the fonts are not sold alone.
- [x] `plain/xrechnung-*.json`: KoSIT xrechnung-schematron, Apache-2.0.
- [x] `plain/cius-fr-*.json`, `extended-ctc-fr-*`: FNFE-MPE France_RFE, Apache-2.0 (file
      header says EUPL; either permits redistribution with attribution).
- [ ] `plain/en16931-*.json`: CEN eInvoicing-EN16931 Schematron, **EUPL-1.2**
      (weak copyleft, network use counts as distribution). Ship unmodified, as separate
      data files, with the notice and a link to the source; changes to these files must
      be published under EUPL. Owner to confirm before the first paid release.
      The hosted build serves the notice at `/app/notices` (2026-11-27).
- [ ] `plain/peppol-*.json`, `plain/pint*.json`: OpenPeppol, **MPL-2.0** (file-level
      copyleft): ship unmodified with the notice; publish any change to these files.
- [ ] `plain/zatca-*.json`: ZATCA rules, **LGPL-3.0** data. Keep out of the paid build
      until checked (not needed for the DE/FR product).
      Kept out of the hosted (Worker) build since 2026-11-27: `worker/build.mjs` EXCLUDED,
      tested in `pro/worker.test.mjs` (docs/LAUNCH-REVIEW.md).
- [ ] `plain/cius-hr-ubl.json`: Croatian tax authority rules, **no licence stated** (the
      site allows reproduction with the source named). Keep out of the paid build until
      checked (not needed for the DE/FR product).
      Kept out of the hosted (Worker) build since 2026-11-27: `worker/build.mjs` EXCLUDED,
      tested in `pro/worker.test.mjs` (docs/LAUNCH-REVIEW.md).

The paid layer (`pro/`) itself uses no third-party code at runtime. The optional
`@anthropic-ai/sdk` (MIT) is loaded only when a deployment installs it.

## Source history

Reached 236 commits touching `ventures/einvoice-preflight` (2026-11-04 onwards; the clone
was shallow beyond 5,000 commits). Author on every commit: the owner. Co-author trailers:
Claude agents (`noreply@anthropic.com`) and the owner's CI (`ci@example.com`). No outside
contributor found.

## Before the first paid release

- [ ] Every third-party file above is checked: MIT, BSD or Apache-2.0 ships with
      its notice; GPL, AGPL or unlicensed code does not ship; test corpora stay
      out of the build.
- [x] The source history has no co-author other than the owner or agents
      working for them (see Source history).
- [ ] The paid path goes through the merchant of record (no key in this
      repository) and stays dark until the owner sets the checkout link.
