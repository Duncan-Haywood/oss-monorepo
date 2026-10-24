# einvoice-preflight on Peppol and ZUGFeRD corpora (2026-10-27)

Clone `OpenPEPPOL/peppol-bis-invoice-3` (rules/examples) and `ZUGFeRD/corpus`
shallowly (git clone works through the proxy; the GitHub API does not for
out-of-scope repos). Run `PATH_FILTER=<folder> node eval/official-examples.mjs <checkout>`.
Results and fixes: ventures/einvoice-preflight/README.md. Not yet run: the
corpus's `fatturaPA/`, `ZUGFeRDv1/`, Factur-X PDFs (`unstructured/`), and
`ZUGFeRD/mustangproject` (cloned, 209 XML files, unread).

## Update 2026-10-29: the PDFs

`node eval/facturx-corpus.mjs <ZUGFeRD/corpus>` (git clone works; the API 400s)
runs `facturx.mjs` + the rules on all 151 PDFs. Do not trust a "no invoice in
this PDF" on a real file: the first run found three reader faults (4 KB sniff
window, one bad attachment aborting the read, lineless MINIMUM/BASIC WL
profiles). Left: EXTENDED `Warenrechnung` header-allowance mismatch
(INV-014/018/038), ZUGFeRD 1.0 (`CrossIndustryDocument`) unread by design.
