# ISS rate band (ABR-024, NFSE-024) on public NFS-e files, 2026-11-15

**What was checked.** `iss-rate.mjs` judges a stated ISS rate against Lei Complementar 116/2003:
at most 5% (art. 8, II) and at least 2% (art. 8-A, LC 157/2016), except list subitems 7.02, 7.05
and 16.01, which may go lower (art. 8-A § 1). For 2029-2032, art. 8-B (LC 214/2025) cuts municipal
rates by 10/20/30/40%; this tool scales both ends of the band by the same factor (its reading).
From 2033 no band is applied (ISS replaced by IBS). National NFS-e also gets the burden after a
municipal benefit (`BM`) against 2%, which art. 8-A § 1 bars outside the three subitems.

Not judged below 2%: a Simples Nacional or MEI provider (ABRASF `OptanteSimplesNacional` 1; national
`opSimpNac` 2 or 3), a special regime (ABRASF `RegimeEspecialTributacao` 1, 3, 5, 6; national
`regEspTrib` other than 0), ISS not due (`ExigibilidadeISS` other than 1, 1.00 `NaturezaOperacao`
3-6, national `tribISSQN` other than 1 or an `exigSusp`), and a zero rate. Each is said in the
skipped notes. Above 5% is reported for every file.

**Source text.** LC 116/2003 as amended, read from a JSON mirror of planalto.gov.br
(emidio-trancoso/advocacia-aberta, `ferramentas/pesquisa/vade-mecum/data/lei_lc116.json`), because
planalto.gov.br, lexml.gov.br and pt.wikisource.org refused the build host. Statute text is not
protected (Lei 9.610/1998, art. 8, IV). Articles 8, 8-A and 8-B as quoted in `iss-rate.mjs`.

**Corpus.** GitHub code search for `Aliquota` and `pAliqAplic`/`pAliq` in ABRASF, Ginfes and national
NFS-e XML (five queries), 604 distinct blobs downloaded to a scratch directory, read, not copied.
489 were NFS-e files the checker reads: 326 ABRASF-family, 163 national. 376 carry a nonzero rate.

**Result.**

| | files |
|---|---|
| read | 489 (326 ABRASF, 163 national) |
| with a nonzero rate | 376 |
| ABR-024 / NFSE-024 raised | 11 (all ABRASF) |
| below 2%, not judged (Simples Nacional provider) | 8 (7 ABRASF, 1 national at 1.56%) |

All 11 flagged files are test resources in Unimake's DFe/Uninfe repositories (and a fork):
`Aliquota` 6.3000000000 (ADM_SISTEMAS 2.03), 10.00 (EL 2.04, SMARAPD 2.04) and 1000 (DIGIFRED 2.00).
Each is a rate no municipality may charge, so the finding is right about the file. They look like
placeholders in vendor samples, not issued documents. No other file drew the rule: no false
positive was found on the in-band rates (3.00, 5.00, 2.00, 0.05 as a 1.00 fraction, 3.5, 2.79, ...).

Generator-made example files (jcamelosti/abrasf2-04-df, `xml_exemplo_baseados_xsd/`) carry
`-99.99` and `99.99` as later alternatives after a first `Aliquota` of 0; the checker reads the
first and skips a zero rate, so they draw nothing.

**Not done.** Municipal rates themselves (each city's ISS law per service; no table was read). A
real rejection for a rate under 2%. Whether a Simples Nacional provider's ISS share can go under
2% (LC 123's annexes) was not read, so those files are skipped, not judged.

Reproduce: `node <script> <dir>` over the downloaded files; the script loads `abrasf.mjs` and
`nfse.mjs` and counts `ABR-024`/`NFSE-024` findings and "not judged" notes.
