# The other NF-e reform events and the cancellation, 2026-11-14

What was built: `nfe-rtc-events.mjs` (rules BRE-030..BRE-034, with BRE-011, BRE-014 and
BRE-015 extended), called from `nfe-event.mjs` for every NT 2025.002-RTC event type except
211110 that has a schema in the v1.40 events package: 112110, 112130, 112140, 112150, 211124,
211128, 211130, 211140, 211150, 212110, 212120 and the cancellation 110001. Routed from the
main report and the Brazil page. README, "Brazil: the other reform events".

## Sources

| What | Source | Check |
|---|---|---|
| Twelve `e<tpEvento>_v1.00.xsd` and `tiposBasico_v1.03.xsd` | NT 2025.002 v1.40 events package (published 2026-07-27), as mirrored with its portal URL in `stackin-io/data-source` `data/nfe/esquemas-xml/` | SHA-256 pinned in `nfe-rtc-events.mjs` (`RTC_EVENTS[...].sha256`, `TIPOS_BASICO_SHA256`) and checked by the differential |
| Authors, field tables, rules 2P21-10, 2P24-10, 2P25-10, 2P26-10, 2P28-10, 2P29-10 (sections 8.6-8.8) and 1P06-10, 1P10-10, 1P20-10, 1P24-10, P23-10 (8.13) | NT 2025.002 v1.51 sections 8.1-8.18 transcribed at `higajooj/dfe_law_reference@7871ab40116f` `src/nfe/nt2025-002/08-eventos/` | |
| General event rules P12-14..P12-44 and 3P15-10 | MOC 5.8.4 as transcribed in the same repository (`src/nfe/moc-nfe/05-web-services/05-08-recepcaoevento-parte-geral.md`) | |

The package has no `e112120_v1.00.xsd` (ALC/ZFM import not converted into exemption) and no
`e211120`, although 110001's own schema lists both as cancellable types; those are named in
`skipped`, not checked. 412120/412130 are sent by the tax authority and are not read.

## What the schemas say that the NT does not

- Every one of the eleven event-specific schemas fixes `tpAutor` to a single value (1, 2 or 8);
  211110 alone allows two.
- `detEvento/@versao` is optional in all twelve schemas (only its value is fixed to 1.00).
- 212110 and 212120: the NT's section 8.9/8.10 tables print the description with
  "Operações de Sucessão"; the schemas enumerate "Operação de Sucessão". A system that copies
  the NT's text gets cStat 493. The checker names this case.
- 112130 (perishing in transport hired by the supplier) has a second `vIBS`/`vCBS` pair inside
  `gControleEstoque` (the credit to reverse); 211124 (the buyer's version) does not.
- 110001's `tpEventoAut` enumeration includes 112120 and 211120, for which no schema exists in
  the package.

## Schema agreement

`node eval/nfe-rtc-events-xsd-diff.mjs` (downloads the thirteen files and checks each SHA-256;
needs xmllint): each of the twelve events in `fixtures/nfe-events-rtc.xml` and
`fixtures/nfe-event-110001.xml` mutated one change at a time inside `detEvento` (each element
dropped, doubled, swapped with its next sibling, 38 bad values in each leaf, eight `nItem`
values, a repeated and a second item, four `versao` cases, an unknown trailing element, the
NT's description where it differs, the description without accents).

```
110001: 210 mutants, 0 disagree
112110: 210 mutants, 0 disagree
112130: 430 mutants, 0 disagree
112140: 348 mutants, 0 disagree
112150: 210 mutants, 0 disagree
211124: 348 mutants, 0 disagree
211128: 210 mutants, 0 disagree
211130: 516 mutants, 0 disagree
211140: 348 mutants, 0 disagree
211150: 264 mutants, 0 disagree
212110: 211 mutants, 0 disagree
212120: 211 mutants, 0 disagree
event types: 12, mutants: 3516 (2672 invalid under xmllint), agree: 3516, disagree: 0
```

The 211110 differential (`eval/nfe-event-xsd-diff.mjs`) still gives 199 of 199 after the
refactor.

## Public files

`node eval/nfe-rtc-events-corpus.mjs` runs the checker over the 48 XML files GitHub code search
returned for nine element names of these events (`eval/nfe-rtc-events-corpus-list.txt`, not
copied here). 10 are InvoiCy's own integration layout (`<EnvioEvento>`, not SEFAZ XML) and are
not read. 38 are read, 29 distinct (9 byte-identical copies between Unimake's two repositories).

- **No `detEvento` in any file breaks its schema.**
- Unimake's samples (Uninfe and DFe, 23 distinct) all use the made-up key
  `41112506117473000150000...`: check digit 0 where the other 43 digits give 6 (236), model
  digits 00 (618), month digits 25 (616: the key's AAMM reads as year 11, month 25) and
  NF-e number zero (619).
- Two Unimake samples carry another event's Id: the 112110 sample's Id starts `ID110001`, the
  212120 sample's `ID212110` (572), which looks like copy and paste between samples.
- freecorpsNFE's four fixtures read clean except `event-112110-other-author.xml`, whose author
  is not the issuer in the key (574); its name says it is a deliberate negative test.

Every public file is a library's sample or test, not a real event. Every finding matches the
rule text it cites.

## Not done

- A real event SEFAZ registered or rejected, of any of these types, to compare.
- The comparisons with the NF-e (1096-1101) on a real NF-e and event pair; only the made-up
  fixtures exercise them. Which IBS value SEFAZ compares for a monophase (fuel) item is not
  stated; the checker uses `gIBSCBSMono/vTotIBSMonoItem` and `vTotCBSMonoItem`.
- 112140's author is "the issuer of an advance-payment debit note (type 06)"; the NF-e's
  debit-note type is not checked against it.
- MOC 5.8.4's rules that need SEFAZ's database (duplicate across batches, the NF-e's status,
  the receiving state) and P13-10 (event dated in the future).
