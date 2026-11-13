# Ginfes 1.00 and WebISS 1.00 against xmllint, 2026-11-13

Schemas: OpenAC-Net/OpenAC.Net.NFSe at cac2bb13ebe5 (MIT), `Schemas/Ginfes/1.00/*_v03.xsd`
(13 files) and `Schemas/WebISS/1.00/*.xsd` (16 files), compiled by `build-abrasf-schema.mjs`.

Files: GitHub code search (`gh api search/code`) for `tipos_v03.xsd`, the six Ginfes
`servico_*_v03.xsd` namespaces, `abrasf.org.br/nfse` with `EnviarLoteRpsEnvio`/`CompNfse`,
plus a sparse checkout of Unimake/Uninfe at ab611c6e (`exemplos xml/NFSe/GINFES`, `WEBISS`).
Read from download, not copied. 163 files carry a Ginfes namespace; 64 distinct Ginfes root
elements after unwrapping and de-duplication.

```
node eval/abrasf-xsd-diff.mjs <abrasf dir> --only none --per 60 --providers <Schemas> <ginfes files>
{"verdicts":{"files":64,"bothValid":42,"bothInvalid":22,"onlyXmllint":0,"onlyUs":0},"byLayout":{"Ginfes 1.00":64}}
{"seeds":42,"mutants":2471,"both":1822,"neither":649,"onlyXsd":0,"onlyUs":0,"agreement":1}

WebISS 1.00 files:
{"verdicts":{"files":2,"bothValid":0,"bothInvalid":2,"onlyXmllint":0,"onlyUs":0},"byLayout":{"WebISS 1.00":2}}

Everything (ABRASF 2.00-2.04, provider copies, both 1.0x sets; --per 40 --retarget 3543402,3518800):
{"verdicts":{"files":261,"bothValid":85,"bothInvalid":171,"onlyXmllint":5,"onlyUs":0}, ...}
{"seeds":85,"mutants":3294,"both":2445,"neither":849,"onlyXsd":0,"onlyUs":0,"agreement":1}
```

The five `onlyXmllint` files are ABRASF 2.x files whose `ds:Signature` carries an
out-of-range `HMACOutputLength` (Unimake's sample signature); the code before this change
gives the same five (checked with `git stash`). The signature is free content here.

Findings on the 22 invalid Ginfes files, by kind: templates with placeholders
(`{{ cnpj }}`, Jinja/Genshi), placeholder series longer than 5 characters, `Id` on the
query requests (3.01 samples; the v03 schema defines none), tax-reform `IbsCbs`/`CodigoNbs`
in Fortaleza's own 4.00 layout (it reuses Ginfes's namespaces), and `<Pedido xmlns="">` in
cancel requests (Uninfe 3.00/3.01 samples, PyTrustNFe's template).

Setup notes: xmllint refuses ABRASF 2.04 as published (minOccurs/maxOccurs on the global
CompNfse spanning two lines); strip both from your copy, or every 2.04 verdict reads "invalid".
