# EU Packaging Regulation Checker

Free, private browser tool for brand owners, importers, packaging makers and online sellers: pick the packaging use, its material, your role and where you are established to see which duties of the Packaging and Packaging Waste Regulation (EU) 2025/40 (PPWR) reach you, the date each applies from (producer registration, PFAS limits, label, recyclability, recycled content, the 50 percent empty-space rule), whether an EU operator stands behind the packaging, and which duties are still open.

**Live tool:** https://marisstella.app/eu-packaging-regulation-checker/

After using this, you know what is live from 12 August 2026 and what lands in 2028 and 2030, instead of reading a 100-page Regulation.

Open `index.html`. Tests: `node --test 'ventures/eu-packaging-regulation-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal advice. Dates were written from memory and must be checked against the Regulation (CELEX 32025R0040) and later delegated acts. See `VENTURE.yaml`.

## Known gaps

From the [2026-11-17 quality audit](../../portfolio/quality/audits/2026-11-17-eu-packaging-regulation-checker.json):

- One role per run: an own-brand online seller who picks "Online seller" loses the maker duties (conformity, label, design).
- No marketplace, HORECA/take-away, compostable-packaging or beverage (Article 29 drinks) reuse duties are modelled.
- Dates and the reuse scope were checked against secondary sources (law-firm and compliance summaries), not the EUR-Lex text, which the building sessions could not reach.

Fixed 2026-11-18 (see `calc.test.mjs`, last five tests): reuse targets now reach e-commerce packaging and online sellers and fulfilment providers, leave out cardboard boxes, and the microenterprise exemption asks for the 1,000 kg condition too; the label, recycled-content and empty-space rows read "set by a Commission act" once their fixed date passes; the deposit-return row needs plastic or metal; an unknown option value is an error.
