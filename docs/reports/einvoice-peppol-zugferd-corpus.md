# einvoice-preflight on Peppol and ZUGFeRD corpora (2026-10-27)

Clone `OpenPEPPOL/peppol-bis-invoice-3` (rules/examples) and `ZUGFeRD/corpus`
shallowly (git clone works through the proxy; the GitHub API does not for
out-of-scope repos). Run `PATH_FILTER=<folder> node eval/official-examples.mjs <checkout>`.
Results and fixes: ventures/einvoice-preflight/README.md. Not yet run: the
corpus's `fatturaPA/`, `ZUGFeRDv1/`, Factur-X PDFs (`unstructured/`), and
`ZUGFeRD/mustangproject` (cloned, 209 XML files, unread).
