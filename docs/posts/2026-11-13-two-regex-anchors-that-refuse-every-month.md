---
title: "Two characters that refuse every month: what checking ISSNet and Betha NFS-e files taught the validator"
seo_title: "ISSNet and Betha NFS-e XML validation: xs:all and XSD regex anchors"
date: 2026-11-13
tags: [einvoice-preflight, brazil, nfs-e, measurement]
description: "The NFS-e checker now reads ISSNet 1.00 and Betha 1.00 schemas: 36 of 36 published files and 1,151 of 1,151 mutants match xmllint, after two fixes."
---

The [e-invoice checker](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) checks a Brazilian municipal NFS-e against the schema of the provider each city runs. Two older provider layouts were still out of reach, each for a different reason. **ISSNet 1.00** builds most of its types from `<xs:all>`, a group whose members can come in any order. **Betha 1.00** is an *unqualified* schema: only the message's root element sits in Betha's namespace, and everything below it sits in no namespace at all. As of today the checker reads both.

## Betha: where the namespace stops

Of the 22 Betha 1.00 files we found in public repositories, 17 start like this:

```xml
<EnviarLoteRpsEnvio xmlns="http://www.betha.com.br/e-nota-contribuinte-ws">
  <LoteRps>...
```

That looks harmless, but a default `xmlns` passes down to every child, so `LoteRps` lands in Betha's namespace. Betha's schema wants it in none, and xmllint refuses all 17 files. The library many integrators build on, OpenAC.Net.NFSe, writes `<LoteRps xmlns="">` to undo the inheritance. The four samples that put the namespace on a prefixed root (`<e:EnviarLoteRpsEnvio xmlns:e="...">`) pass. We can't tell from here whether Betha's server checks this strictly. So the finding gives the schema fact once per child, with both fixes, and says no more than that.

Betha's *reply* schemas can't be read at all. They refer to types (`TcNfse`, `tcMensagemRetorno`) that the published types file never defines, and xmllint won't load them either. So only the six request schemas, the files you actually send, are checked.

## Two places the checker was wrong

We tested the new code the usual way. We validated every file with xmllint on the same schema files and with the checker, then changed each valid file in one place at a time and compared again. The first run disagreed twice, and both times the checker was the one at fault.

**`^` and `$` are not anchors in XSD.** ISSNet 1.00 defines the tax month (`Competencia`) with the pattern `^20(09|[1-9]\d)(0[1-9]|1[0-2])$`. In most regex dialects that reads as "a year from 2009 on, then a month". XML Schema patterns, though, always match the whole value and have no anchors, so `^` and `$` are ordinary characters. A strict validator therefore wants a literal caret at the start and a dollar sign at the end, and refuses `201304`. The checker had read them as anchors and let the value through. It now reads them the way XSD does, and the finding says that no ordinary value can pass that pattern. Across every layout the checker reads, this is the only pattern with the problem. It sits in reply files, so a sender won't hit it, but one published ISSNet reply, for the month `201304`, fails ISSNet's own schema.

**libxml2 sometimes trims spaces after all.** The checker warned that libxml2, the library behind xmllint and PHP's validator, refuses a value like `" 1"` in an `xs:int` field. For a bare `xs:int` that holds. Today's comparison turned up the exception: once the type has a pattern or an enumeration, even one inherited from a parent type, libxml2 trims the space and accepts the value. Range facets and `totalDigits` don't have that effect. The warning now fires only where libxml2 would actually refuse.

## Numbers

With both fixes, on 36 distinct ISSNet and Betha 1.00 files from 12 public repositories:

- **36 of 36** got the same valid-or-invalid verdict from xmllint and the checker;
- **1,151 of 1,151** one-change variants of the 10 valid files did too.

One smaller change applies to every layout. A child element in the wrong namespace used to be reported twice, once for the namespace and once as "required and missing". It's now reported once.

## Not done

Betha's replies, a real city's rejection to compare against, and the 1.0x providers still unread (IPM 1.01 with seven cities in OpenAC.Net.NFSe's list, ISSDSF 1.00 with four, and a long tail). The full measurement is in `ventures/einvoice-preflight/eval/issnet-betha-1x-2026-11-13.md`. As always, this is an offline check, not the city's acceptance, and not tax advice.
