# Rule pages: e-invoice validation errors explained (EN, DE, FR)

One page per high-traffic validation rule, in English (`en/`), German (`de/`)
and French (`fr/`), plus a hub per language and a language chooser
(`index.html`). Served at `/einvoice-preflight/rules/`. People search the exact
rule id or message a portal or access point sent back ("BR-DE-15",
"Das Element Buyer reference (BT-10) muss übermittelt werden",
"PEPPOL-EN16931-R003"); each page answers what it means, the usual causes, how
to fix it, a minimal corrected XML snippet, and links the free checker. A paid
fix-and-explain service is linked as in development (early access) at
`/industries/e-invoicing/`.

Covered: every BR-DE rule in the KoSIT XRechnung Schematron, and over 30 of the
EN 16931 and Peppol BIS rules that guard the fields and sums invoices most often
get wrong. That selection is our judgement from the rules the checker's examples
and fixes hit, not a measured ranking of search volume.

## How it is built

```sh
node rules/build.mjs          # from ventures/einvoice-preflight; rewrites en/, de/, fr/, index.html
node --test rules/rules.test.mjs
```

- `data/*.json`: our explanations, one entry per rule (format in
  `data/SCHEMA.md`). Edit these, then rebuild.
- The official message, severity and syntaxes (UBL, CII) are read from the
  compiled official Schematron in `../plain/` at build time, never typed by hand.
- `build.mjs`, `SOURCES`: the release each rule set is cited as, with the
  upstream commit `../plain/manifest.json` records. The test fails if the
  compiled sets are rebuilt from another commit, so the citation on every page
  is updated with them.

## Sources and licences

| Rules | Source | Version cited | Licence |
|---|---|---|---|
| BR-DE-* | [KoSIT xrechnung-schematron](https://github.com/itplr-kosit/xrechnung-schematron/tree/v2.6.0) | v2.6.0 (for XRechnung 3.0). The compiled set is from master `7e3ddbe`, one commit after the tag, which changed only CHANGELOG.md and build.xml | Apache-2.0 |
| BR-*, BR-CO-*, BR-S-* ... | [ConnectingEurope eInvoicing-EN16931](https://github.com/ConnectingEurope/eInvoicing-EN16931/tree/validation-1.3.17) (CEN/TC 434) | validation-1.3.17 (`6e35e0a`) | EUPL-1.2 |
| PEPPOL-EN16931-* | [OpenPEPPOL peppol-bis-invoice-3](https://github.com/OpenPEPPOL/peppol-bis-invoice-3/tree/3.0.22) | 3.0.22 (`38d693d`) | MPL-2.0 |

The tag-to-commit mapping was read with `git ls-remote` on 2026-11-24. Each page
quotes only the one official message of its rule, with the source named and
linked; the explanation, causes, fix and XML are this project's own (MIT). Not
tax or legal advice: the pages say what a rule checks and how a file passes it,
never which VAT treatment applies to a sale.

## Tests (`rules.test.mjs`)

- every rule id exists in the official rule set version its page cites;
- the cited commits equal `../plain/manifest.json`;
- the whole BR-DE set is covered and at least 30 EN 16931 / Peppol rules;
- every entry has title, meaning, 2-5 causes and 2-5 fix steps in all three languages;
- every XML snippet is a well-formed fragment with the right syntax's prefixes;
- the committed pages equal what `build.mjs` writes;
- each page quotes the official message, links its source, the checker and early access, carries the disclaimer and hreflang alternates, and has no price claim;
- titles at most 70 characters, FAQ markup matches visible headings.
