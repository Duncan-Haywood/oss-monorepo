# EU Packaging Regulation Checker

Free, private browser tool for brand owners, importers, packaging makers and online sellers: pick the packaging use, its material, your role and where you are established to see which duties of the Packaging and Packaging Waste Regulation (EU) 2025/40 (PPWR) reach you, the date each applies from (producer registration, PFAS limits, label, recyclability, recycled content, the 50 percent empty-space rule), whether an EU operator stands behind the packaging, and which duties are still open.

**Live tool:** https://marisstella.app/eu-packaging-regulation-checker/

After using this, you know what is live from 12 August 2026 and what lands in 2028 and 2030, instead of reading a 100-page Regulation.

Open `index.html`. Tests: `node --test 'ventures/eu-packaging-regulation-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal advice. Dates were written from memory and must be checked against the Regulation (CELEX 32025R0040) and later delegated acts. See `VENTURE.yaml`.

## Known gaps

From the [2026-11-17 quality audit](../../portfolio/quality/audits/2026-11-17-eu-packaging-regulation-checker.json):

- The reuse-target row reaches only the transport category and producer, importer and distributor roles. E-commerce packaging, online sellers and fulfilment providers never see it (the worked example shows no reuse duty), and cardboard transport boxes, which the reuse article excludes, are given it.
- The label, recycled-content and empty-space rows show a fixed date and leave out "or N months/years after the implementing act, whichever is later".
- One role per run: an own-brand online seller who picks "Online seller" loses the maker duties (conformity, label, design).
- A glass drinks bottle gets the deposit-return row, which covers plastic bottles and metal cans.
- An unknown option value falls back to the default without an error.
