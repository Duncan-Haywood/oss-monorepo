# ISSNet 1.00 and Betha 1.00 against xmllint, 2026-11-13

Schemas: OpenAC-Net/OpenAC.Net.NFSe at cac2bb13ebe5 (MIT), `Schemas/ISSNet/1.00/*.xsd`
(18 files: `tipos_complexos.xsd`, `tipos_simples.xsd`, eight request/reply pairs) and
`Schemas/Betha/1.00/` (`TiposNFe_v01.xsd` and the six request schemas), compiled by
`build-abrasf-schema.mjs` (`OPENAC_SCHEMAS=<checkout>/src/OpenAC.Net.NFSe/Schemas`).

What the compiler had to learn:

- **`<xs:all>`** (ISSNet 1.00 writes 23 of its complex types and seven message roots as all
  groups): a particle of kind `a`, each member at most once, in any order, the group ending
  once every required member is in. A member with maxOccurs above 1 throws (XSD 1.0 forbids it).
- **Unqualified local elements** (Betha 1.00 has no `elementFormDefault`, so it is
  unqualified): every local element carries `ns: ""`; only global elements (the six message
  roots) are in `http://www.betha.com.br/e-nota-contribuinte-ws`.
- **Betha's reply schemas are broken as published**: they name `TcNfse`,
  `tcMensagemRetorno`, `tcMensagemRetornoLote` and `tsSituacaoLoteRps`, which
  `TiposNFe_v01.xsd` does not define. xmllint refuses to load them too
  (`The QName value '{.../tipos}TcNfse' does not resolve to a(n) type definition`). Only the
  six request schemas, the files a sender writes, are read.

Files: GitHub code search (`gh api search/code`) for `issnetonline.com.br/webserviceabrasf/vsd`
and `betha.com.br/e-nota-contribuinte-ws` in XML, `"e-nota-contribuinte-ws" EnviarLoteRpsEnvio`
and `webserviceabrasf/vsd/servico_enviar_lote_rps_envio.xsd`: 122 XML paths, 101 downloaded
(three paths with spaces failed), 87 distinct. Read from download, not copied into the tree.
ISSNet 1.00 elements come from 5 repositories and Betha 1.00 from 7; the rest are other
layouts (Betha 2.x messages, ISSNet 2.04) and are not counted here.

```
node eval/abrasf-xsd-diff.mjs <unused> --only none --per 120 --providers <Schemas> <files>
{"verdicts":{"files":36,"bothValid":10,"bothInvalid":26,"onlyXmllint":0,"onlyUs":0},"byLayout":{"ISSNet 1.00":18,"Betha 1.00":18}}
{"seeds":10,"mutants":1151,"both":832,"neither":319,"onlyXsd":0,"onlyUs":0,"agreement":1}
```

The first run disagreed twice, and both were this tool's errors:

1. **`^` and `$` in an XSD pattern are literal characters.** ISSNet 1.00 writes
   `tsCompetencia` as `^20(09|[1-9]\d)(0[1-9]|1[0-2])$`. XML Schema regular expressions have
   no anchors, so libxml2 matches the `^` and `$` as characters and refuses every real
   month (`[facet 'pattern'] The value '201304' is not accepted`). This tool had read them as
   JavaScript anchors and passed the value. Now they are escaped (only outside a character
   class; `[^...]` keeps its meaning), and the finding says why the value fails and whether a
   validator that reads them as anchors would accept it. It is the only pattern with a bare
   `^` or `$` across every ABRASF and provider layout read (5 ABRASF, 34 provider copies, 4 multi-file sets). Competencia is in replies
   (`InfNfse`), so it is ISSNet's own files, not a sender's, that trip it.
2. **libxml2 does collapse spaces around an `xs:int` that has a pattern or enumeration
   facet.** The checker reported `" 1"` in an int-based type as something libxml2 rejects
   (true for a bare `xs:int`, `xs:date` or `xs:dateTime`, measured earlier). Tried with
   xmllint today: an int restricted by pattern `[1-3]` or by enumeration `1` accepts `" 1"` and
   `"1 "`; a bare int, or one with only `totalDigits` or `maxInclusive`, refuses it; a type
   with a pattern two derivation steps up accepts it. The space finding now applies only when
   no pattern or enumeration sits anywhere in the type's derivation; otherwise the value is
   checked as XSD reads it.

After both fixes: 36 of 36 verdicts and 1,151 of 1,151 single-change mutants agree.

## What the published files show

Betha 1.00, 22 distinct files (18 distinct root elements after unwrapping):

- **17 put the provider's namespace on every child.** They write
  `<EnviarLoteRpsEnvio xmlns="http://www.betha.com.br/e-nota-contribuinte-ws">` and let
  `LoteRps`, `Pedido`, `Prestador` or `Protocolo` inherit it. The schema is unqualified, so
  those children must be in no namespace; xmllint refuses all 17. OpenAC.Net.NFSe's own Betha
  writer (`Providers/Betha/ProviderBetha.cs`) writes `xmlns=""` on each direct child, which
  is the schema's reading; the four prefixed samples (`<e:ConsultarLoteRpsEnvio xmlns:e=...>`)
  are valid. Whether Betha's server validates these requests strictly is not known here; the
  finding names both fixes.
- 2 lack the `ds:Signature` the schema requires (`Pedido` in a cancel request,
  `EnviarLoteRpsEnvio`).
- 3 are valid.

ISSNet 1.00, 20 distinct files (18 distinct root elements):

- 8 are valid (queries and cancel requests, members in varied order).
- 9 are templates with empty values (`<Cnpj></Cnpj>`, `<NumeroLote/>`).
- 2 carry both `Cpf` and `Cnpj` inside `CpfCnpj`, a choice of one.
- 1 cancel request has `<Pedido>` in no namespace (the message namespace is required).
- 1 reply has a real `Competencia` (`201304`) that the published pattern refuses (above).

Also changed: a child present in the wrong namespace was reported twice (ABR-002 for the
namespace, then ABR-004 "required and missing"); it is now reported once, for every layout.
Ginfes's test was updated to match.

City list: OpenAC.Net.NFSe lists two cities on Betha 1.00 (Cruzeiro do Sul/AC,
Epitaciolândia/AC) and none on ISSNet 1.00 (its six ISSNet cities run 2.04).

Not done: Betha's reply schemas (broken as published), a real Betha or ISSNet city rejection,
the other 1.0x providers in the list (IPM 1.01 with 7 cities, ISSDSF 1.00 with 4, SimplISS 1.00,
DBSeller 1.00, IPM 1.00 with 3 each, ...).
