# einvoice-preflight on the FatturaPA corpus (2026-10-28)

`git clone --depth 1 https://github.com/ZUGFeRD/corpus` works through the proxy
(codeload tarballs and the API do not). Run
`node eval/fatturapa-corpus.mjs <corpus>/fatturaPA` in ventures/einvoice-preflight.
15 files: 15 read, `IT-018` false positive on the official FPR02 sample fixed
(PEC/Contatti order no longer ranked). Remaining findings are sample
placeholders or real inconsistencies (README, "Measured on real FatturaPA
samples"). Next: Factur-X PDFs in `unstructured/`, mustangproject's 209 XMLs,
and reading the FatturaPA XSD to settle the element order for good.
