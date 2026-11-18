# Single-file 1.0x NFS-e layouts against xmllint, 2026-11-13

Schemas: OpenAC-Net/OpenAC.Net.NFSe at cac2bb13ebe5 (MIT), one `nfse*.xsd` per layout,
compiled by `build-abrasf-schema.mjs` (`OPENAC_SCHEMAS=<checkout>/src/OpenAC.Net.NFSe/Schemas`;
a blobless `git clone --filter=blob:none` of the repository works from a cloud session,
codeload tarballs and the contents API return 403).

| Layout | Namespace | Cities in OpenAC's list |
|---|---|---|
| ISSRio 1.00 | `www.abrasf.org.br/ABRASF/arquivos/nfse.xsd` | Rio de Janeiro |
| ISSSalvador 1.00 | same | Salvador |
| DBSeller 1.00 | same | Carazinho, Maquiné, Tramandaí |
| Pronim 1.00 | same | Paranapanema |
| MetropolisWeb 1.00 | same | Ilhéus |
| Thema 1.00 | same | Lajeado |
| BHISS 1.00 | `www.abrasf.org.br/nfse.xsd` (ABRASF 2.x's) | Belo Horizonte, Porto Alegre |
| DSF 1.00 | same | São José dos Campos |
| ISSIntegra 1.00 | `http:/www.abrasf.org.br/nfse.xsd` (one slash, as ABRASF's own 1.00 file) | Guariba |
| ISSCuritiba 1.00 | `isscuritiba.curitiba.pr.gov.br/iss/nfse.xsd` | Curitiba |
| SimplISS 1.00 | `www.sistema.com.br/Nfse/arquivos/nfse_3.xsd` | Piracicaba, Dois Córregos, Iguatama |
| Abaco 1.00 | `www.e-nfs.com.br` | Rio Branco, Canoas |

All twelve compile with the existing compiler (no new construct) and load in xmllint.
Not read: Abaco 1.01 (no target namespace), Agili, FissLex, Tiplan 1.00 (no city in the
list names them), SmarAPD 1.00 (a different shape), and the folders that hold only an
`Informacao.txt` (IPM 1.00/1.01, SigISS, SigISSWeb, AssessorPublico, Conam: no schema
published).

## Choosing among systems that share a namespace

Six systems use ABRASF 1.00's namespace with the same root names but different content
(Salvador's copy names its Id attribute `id`; at the pinned commit it also requires the
tax reform's `NBS` and `cClassTrib` in `Servico`). `abrasf.mjs` takes the issuing city's
own system when the city's list entry is one of them, otherwise the one the file draws
fewest schema findings under, and names the others. BHISS 1.00 and DSF 1.00 write the
1.00 model in the 2.x namespace, so a file there is read as 2.x first; when its city runs
BHISS or DSF 1.00 and it does not state a 2.x `versao`, the city's 1.00 schema replaces the
2.x layout, and when it does state 2.x, it stays 2.x and the note gives the 1.00 count.
A file in the one-slash namespace that states a 2.x `versao` stays a 2.x file with a typo.

## Files

GitHub code search (`gh api search/code`), XML only:
`"abrasf.org.br/ABRASF/arquivos/nfse.xsd"`, `"isscuritiba.curitiba.pr.gov.br/iss/nfse.xsd"`,
`"sistema.com.br/Nfse/arquivos/nfse_3.xsd"`, `"www.e-nfs.com.br"`, and
`"abrasf.org.br/nfse.xsd"` with each of 3106200 (Belo Horizonte), 4314902 (Porto Alegre)
and 3549904 (São José dos Campos): 427 paths from 63 repositories, all downloaded, 272
distinct. Read from download, not copied into the tree.

```
node eval/abrasf-xsd-diff.mjs <2.00..2.04 dir> --per 120 --providers <Schemas> <files>
{"verdicts":{"files":149,"bothValid":97,"bothInvalid":52,"onlyXmllint":0,"onlyUs":0},
 "byLayout":{"DBSeller 1.00":12,"ISSRio 1.00":55,"ISSSalvador 1.00":2,"Pronim 1.00":4,
 "MetropolisWeb 1.00":4,"Thema 1.00":3,"ISSCuritiba 1.00":19,"SimplISS 1.00":10,
 "2.04":25,"2.03":4,"BHISS 1.00":10,"ISSNet 2.04":1}}
{"seeds":97,"mutants":11033,"both":8060,"neither":2973,"onlyXsd":0,"onlyUs":0,"agreement":1}
```

119 of the 149 distinct elements are in the new layouts. No file was found for DSF 1.00,
ISSIntegra 1.00 or Abaco 1.00, so those three are compiled and unmeasured.

The first run disagreed on 16 files, none of them this checker's error: 12 were my local
2.04 copy (the `minOccurs`/`maxOccurs` on the global `CompNfse` sit on their own line, so
the documented strip missed one), and 4 were the differential's serialiser keeping
`xsi:schemaLocation` without its `xmlns:xsi`, which xmllint refuses as not
namespace-well-formed. The serialiser now leaves `xsi:*` out (a hint, not content).

## What the published files show

By the layout this checker chose (distinct files, schema findings only):

| Layout | Files | Valid | Repositories |
|---|---|---|---|
| ISSRio 1.00 | 93 | 58 | 22 |
| DBSeller 1.00 | 20 | 13 | 9 |
| ISSCuritiba 1.00 | 19 | 18 | 3 |
| SimplISS 1.00 | 13 | 8 | 2 |
| BHISS 1.00 | 10 | 6 | 7 |
| Pronim, MetropolisWeb, Thema, ISSSalvador 1.00 | 13 | 5 | 2-3 each |

- **Rio's reply samples put `ValorLiquidoNfse` last.** 10 Nota Carioca reply examples
  (`GerarNfseResposta`, `ConsultarLoteRpsResposta`, `ConsultarNfseRpsResposta`, copied
  between integrators' repositories) write `ValorLiquidoNfse` after `DescontoCondicionado`;
  ISSRio's published `tcValores` puts it before the two discounts. xmllint agrees with the
  finding. These are replies, written by the city, so a client that validates replies
  strictly against the published schema would refuse them.
- 17 issued `Nfse` elements in Rio-namespace files carry no `Signature`, which the schema
  requires (templates and stripped copies).
- 7 replies carry a `MensagemRetorno` without `Codigo` and `Mensagem`.
- 3 BHISS files write `Rps` directly in `GerarNfseEnvio`, the 2.x shape; BHISS 1.00 wants a
  `LoteRps` there.
- DBSeller and SimplISS samples: empty `Complemento`, 13-digit CNPJs, a misspelt
  `ContrucaoCivil`, and lower-case `id` on `InfPedidoCancelamento` (DBSeller's copy names
  it `Id`; the finding now says the name is case-sensitive and gives the spelling).
