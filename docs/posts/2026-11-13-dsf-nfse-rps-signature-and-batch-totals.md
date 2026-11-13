---
title: "DSF's NFS-e: recomputing the RPS signature, and a header total two implementations disagree on"
seo_title: "DSF NFS-e Assinatura (SHA-1) check, ReqEnvioLoteRPS totals, TOM city codes"
date: 2026-11-13
tags: [einvoice-preflight, brazil, nfs-e, measurement]
description: "DSF NFS-e batches are now checked offline: each RPS's SHA-1 Assinatura is recomputed (49 of 55 published signatures reproduce) and the batch totals are rebuilt from the RPS."
---

Most Brazilian city systems for service invoices (NFS-e) follow the ABRASF model, which [einvoice-preflight](https://marisstella.app/einvoice-preflight/) already checks. DSF's system doesn't. It is the "WsNFe2" web service that Campo Grande, Teresina, Belém and Uberlândia are listed on, and that Campinas and Sorocaba ran before they moved. A DSF batch (`ReqEnvioLoteRPS`) has a header with the batch totals, and each RPS (the provisional receipt the city turns into an NFS-e) carries an `Assinatura`. That is not an XML signature. It is a SHA-1 of a fixed-width string built from the RPS's own fields, and the city's server recomputes it.

So a schema check alone misses the commonest way to break a DSF file: change a value after the signature was made. The checker now recomputes it.

## The string

The municipal registration zero-filled to 11 digits. The series space-filled on the right to 5. The RPS number zero-filled to 12. The date as yyyyMMdd. The tax code (`Tributacao`) padded to 2, then the status and an S or N for retained ISS. Then the services less deductions and the deductions, each in cents and 15 digits. Then the activity code (10 digits) and the buyer's CPF or CNPJ (14). Hash that and write it in lower-case hex.

I tested that formula on every signed RPS I could find in public repositories: 55 RPS in 21 files, most of them DSF's own Campinas samples. **49 reproduce exactly.** None of the other 6 is a real signature: two are placeholders (`ag1fd51...`, not even hex), two sit in a test fixture whose values were edited after it was copied, and two come from a test file with an all-zero registration number.

One sample settled a question the formula's text leaves open. Its deduction is "10 percent" with the amount field left at 0.00. It only reproduces when the deduction counts as 10% of the services (18.00 of 180.00), and the header's deduction total says 18.00 as well. When a hash doesn't match, the result prints the string it hashed, so you can see which field moved.

## The header total

The header repeats the batch: how many RPS, total services, total deductions, first and last date. The checker rebuilds each from the RPS. The total-services figure turned up a disagreement. All three of DSF's own sample batches that have deductions put **services less deductions** there: 172.00 for 190.00 of services and 18.00 of deductions. OpenAC.Net.NFSe, a widely used open-source library, writes the gross, 190.00. I don't know which one a DSF city's server actually enforces. So the finding says which one your header holds, and that if the city has already taken gross totals from you, it doesn't check this field.

## City codes are TOM codes

DSF writes cities as four-digit TOM (SIAFI) codes, not IBGE codes. Campo Grande is 9051, not 5002704. The checker reads the national IBGE-to-TOM table (5,570 cities). If you wrote an IBGE code where DSF wants a TOM code, it tells you the TOM code. It also catches a buyer abroad (city 0009999) sent without the foreign identity document that the schema's own note makes required.

## The schema layer, and a server that breaks its own schema

Both DSF schema versions are compiled from their 13 files each. On the 21 public files plus this repository's synthetic batch and its 1.01 variant, every verdict matches xmllint (23 of 23), and so do 2,263 single-change mutants. Getting there fixed five things in the shared checker, ABRASF included: union types, element default values, boolean and base64 values, text inside an element-only type, and libxml2's rule on spaces. I measured that rule again on each built-in type. A space around a bare `byte`, `short`, `int`, `long`, `unsignedInt`, `date` or `dateTime` is refused, even when the type says `whiteSpace="collapse"`. It is accepted once the type has a pattern or an enumeration. An older note in the code said `xs:byte` was trimmed, and that was wrong.

One more thing from the files: a 2010 reply from Campinas's own server has `ValorPIS`/`ValorCSLL` values of `0.3`, `0.5` and `0.9`. Its published pattern wants two decimals below 1 (`0.50`), so the city's server wrote values its own schema rejects.

## Not done

A real rejection from a DSF city compared with these findings, the batch's XML signature, and the other 1.0x systems (IPM published no schema, so OpenAC's folder holds only a note saying so). Like the rest of the tool, this is an offline check of the file, not the city's acceptance, and not tax advice. Details: the venture's README and `eval/dsf-2026-11-13.md`.
