# Rule page data: format

Each `*.json` file in this folder is an array of rule entries. `../build.mjs`
turns every entry into three pages (`../en/`, `../de/`, `../fr/`), and
`../rules.test.mjs` refuses an entry whose `id` is not in the cited official
rule set (the compiled Schematron in `../../plain/`, pinned in
`../../plain/manifest.json`).

The **official message** and the **severity** (fatal, warning, information) are
not written here: the build reads them from the compiled official Schematron so
they cannot drift. What is written here is our own explanation.

```json
{
  "id": "BR-DE-15",
  "source": "xrechnung",
  "terms": ["BT-10"],
  "en": {
    "title": "Buyer reference (Leitweg-ID) is missing",
    "meaning": "XRechnung requires the Buyer reference (BT-10) on every invoice. For German public buyers this field carries the Leitweg-ID, the routing number that tells the receiving platform which authority the invoice is for.",
    "causes": [
      "The invoicing software leaves BT-10 empty because it is optional in plain EN 16931.",
      "The Leitweg-ID was typed into a note, the order reference (BT-13) or the buyer's name instead of BT-10.",
      "A template made for private customers was used for a public buyer."
    ],
    "fix": [
      "Ask the buyer for the reference they expect; a public buyer gives you its Leitweg-ID with the order.",
      "Put it in cbc:BuyerReference (UBL) or ram:BuyerReference inside ram:ApplicableHeaderTradeAgreement (CII).",
      "For a private German buyer with no Leitweg-ID, agree another reference (for example their order number) and send that."
    ]
  },
  "de": { "title": "...", "meaning": "...", "causes": ["..."], "fix": ["..."] },
  "fr": { "title": "...", "meaning": "...", "causes": ["..."], "fix": ["..."] },
  "ubl": "<cbc:BuyerReference>04011000-12345-34</cbc:BuyerReference>",
  "cii": "<ram:ApplicableHeaderTradeAgreement>\n  <ram:BuyerReference>04011000-12345-34</ram:BuyerReference>\n</ram:ApplicableHeaderTradeAgreement>"
}
```

Fields:

- `id`: the rule id exactly as the official Schematron writes it.
- `source`: `xrechnung` (KoSIT XRechnung Schematron), `en16931` (CEN/TC 434
  EN 16931 validation artefacts) or `peppol` (OpenPeppol BIS Billing 3).
- `terms`: the EN 16931 business terms (BT-n) and groups (BG-n) the rule is
  about, as the official message names them.
- `en`, `de`, `fr`: the same explanation in English, German and French, each
  with `title` (one short line, no rule id: the build prefixes it), `meaning`
  (one to three sentences), `causes` (two to four usual causes) and `fix` (two
  to four steps). Plain words for a bookkeeper or a small business owner, not a
  developer only. Same facts in all three languages; German uses the terms a
  German accountant would (Rechnung, Käufer, Verkäufer, Leitweg-ID,
  Zahlungsanweisungen), French those of a French one (facture, acheteur,
  vendeur, moyens de paiement). Never tax advice: say what the rule checks and
  how to make the file pass, not which VAT treatment applies to a sale.
- `ubl`: a minimal corrected UBL 2.1 fragment we wrote, enough to show the
  fix, well-formed, with the `cbc:`/`cac:` prefixes and no namespace
  declarations. Values are made-up examples (`example.com`, the test IBAN
  `DE02120300000000202051`, the Leitweg-ID `04011000-12345-34` used by the
  checker's own examples).
- `cii`: optional, the same for UN/CEFACT CII (`ram:`, `udt:` prefixes),
  when the CII form differs in a way a reader needs.

Every explanation must match what the rule's test actually checks: read the
`test` expression of the rule in `../../plain/<set>-ubl.json` (and `-cii.json`)
before writing, not only its message.
