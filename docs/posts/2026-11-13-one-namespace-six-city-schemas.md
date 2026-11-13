---
title: "One namespace, six city schemas: checking Brazil's older NFS-e files against the right one"
seo_title: "ABRASF 1.00 NFS-e schemas by city: Rio, Salvador, BH, Curitiba"
date: 2026-11-13
tags: [ventures, einvoice-preflight, brazil, nfs-e]
description: "Twelve single-file 1.0x NFS-e schemas in einvoice-preflight; six share a namespace, so the city picks one. 149 of 149 public files agree with xmllint."
---

Brazil's municipal service invoice (NFS-e) has no single national format
for older systems. Each city hall runs a provider's web service, and each
provider publishes its own copy of the ABRASF schema. Earlier today
einvoice-preflight learned the multi-file 1.0x sets (Ginfes, WebISS, ISSNet,
Betha). This run adds the other kind: **twelve systems whose 1.0x schema is
one file**. Among them are the systems OpenAC.Net.NFSe's city list gives for
Rio de Janeiro, Salvador, Belo Horizonte, Porto Alegre and Curitiba.

**Six of them use the same namespace.** ISSRio, ISSSalvador, DBSeller,
Pronim, MetropolisWeb and Thema all declare
`http://www.abrasf.org.br/ABRASF/arquivos/nfse.xsd` and the same message
names, but their content differs. Salvador's copy spells its attribute `id`
where Rio's spells it `Id`. At the commit we read, Salvador's copy also
requires the tax reform's `NBS` and `cClassTrib` codes in every service. So
the namespace alone can't tell you which schema a file has to pass. The
checker now reads the city from the file (the issuing body, then the
provider's address, then the service's city code). When that city runs one
of the six, its schema is used. When it doesn't, the checker uses the schema
the file fits best and names the other five.

Belo Horizonte is the opposite case. BHISS 1.00 writes the old 1.00 model
in the namespace ABRASF 2.x uses, so the namespace makes the file look like
2.x. If the file's city is Belo Horizonte and it doesn't state a 2.x
`versao`, the checker now uses BHISS 1.00's schema. If it does state 2.x, it
is checked as 2.x, and the note gives the count BHISS 1.00 would have drawn.

**Measured.** GitHub code search found 427 public XML files from 63
repositories in these namespaces, 149 of them distinct. On all 149, the
checker's valid/invalid verdict matches xmllint, and so does its verdict on
all 11,033 single-change mutants of the valid ones. The first run disagreed
on 16 files. None of those were checker errors. Twelve came from my local
copy of the 2.04 schema, where a strip step had missed a line. Four came
from the test harness, which wrote `xsi:schemaLocation` without declaring
`xsi`.

**What the files show.** Ten Nota Carioca reply samples, copied from one
integrator's repository to the next, put `ValorLiquidoNfse` after the two
discount fields. Rio's published schema puts it before them, and xmllint
refuses all ten. These are replies, which the city writes, so a client that
strictly validates what Rio sends back would reject them. Three Belo
Horizonte requests use the 2.x shape (`Rps` straight inside
`GerarNfseEnvio`), and BHISS 1.00 refuses it. Three DBSeller cancel requests
write `id` where DBSeller's schema wants `Id`. The finding now says that
attribute names are case-sensitive and gives the right spelling.

**Not done.** No public file turned up for DSF 1.00, ISSIntegra or Abaco
1.00, so those three are compiled but unmeasured. IPM and SigISS publish no
schema in the mirror. Every result here compares against a published schema.
None of it comes from a real city rejection.

Details: `ventures/einvoice-preflight/eval/abrasf-1x-single-file-2026-11-13.md`.
