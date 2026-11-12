# NF-e corpus

35 Brazilian NF-e and NFC-e XML files, copied unchanged on 2026-11-12 from two
open-source libraries, for `eval/nfe-corpus.mjs` and `nfe.test.mjs`:

- `sped-nfe/`: the files under `tests/fixtures/xml/` that carry an `infNFe`, from
  [nfephp-org/sped-nfe](https://github.com/nfephp-org/sped-nfe) at commit
  `ff80086aa16576345a519629efdd9a05fc49226a` (2026-11-05). sped-nfe is offered under
  "LGPLv3 or MIT" (its README, "License", and `composer.json`); these copies are taken
  under the MIT option. Copyright the NFePHP authors.
- `nfelib/`: the NF-e samples under `nfelib/nfe/samples/v4_0/`, from
  [akretion/nfelib](https://github.com/akretion/nfelib) at commit
  `d1b0fbe90facd2395503d1d7407cb4dbb742374d` (2026-11-05), MIT (`LICENSE-nfelib`,
  copied beside them).

What they are: library test fixtures and samples. Several carry a SEFAZ protocol with
cStat 100 and `tpAmb` 1 (production), so they began as real authorised documents, but
the files have been re-indented since signing, so no XML-DSig digest recomputes
(checked with lxml c14n, 2026-11-12) and whether a field was also edited cannot be
proved. Read the findings on them as "this file, as published, would not pass SEFAZ",
not as a claim about the original issuer.

The MIT licence text, which applies to the sped-nfe copies under the option above:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this
> software and associated documentation files (the "Software"), to deal in the Software
> without restriction, including without limitation the rights to use, copy, modify,
> merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
> permit persons to whom the Software is furnished to do so, subject to the following
> conditions: The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
> WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
