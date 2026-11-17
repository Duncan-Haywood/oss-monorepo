# Mexican postal codes on public files (2026-11-12)

What `eval/mx-address-public-files.mjs` printed on public CFDI files whose Carta Porte or
Comercio Exterior complement holds a Mexican address. The files are third-party (some are
real stamped invoices and waybills), so none is copied into this tree.

## Getting the files

1. For each of `CartaPorte31`, `CartaPorte30`, `CartaPorte20`, `ComercioExterior20` and
   `ComercioExterior11`: `GET https://api.github.com/search/code?q=<term>+extension:xml&per_page=100&page=N`
   for N = 1..10 until a page fails (2,287 results on 2026-11-12, 1,600 distinct URLs).
2. Turn each `html_url` into its raw.githubusercontent.com address and download it
   (1,595 downloaded; five URLs with characters curl rejects were skipped).
3. `node eval/mx-address-public-files.mjs <downloaded files>`.

## Result

```
1595 files read; 189 distinct CFDIs with a Carta Porte or Comercio Exterior complement and a Mexican Domicilio; 408 Mexican addresses
stamps: real PAC 56, test or placeholder 62, none 71
written as a code / as a name: Municipio 227/11, Localidad 111/5, Colonia 129/7
postal codes whose catalogue row names a municipality: 380 of 408; with colonias listed: 380
  Colonia not the postal code's: PAC 0, test 0, none 1
  Estado not a c_Estado code: PAC 0, test 1, none 6
  Municipio not the postal code's: PAC 0, test 4, none 0
  postal code in another state: PAC 0, test 0, none 1
```

Every one of the 56 real-PAC files (155 Mexican addresses, from ten repositories: PAC SDK
samples, a waybill integration, two accounting tools) prints "no disagreement". In those
addresses 19 municipality, 13 locality and 19 colonia codes sat at a postal code whose
catalogue row fills that column, so those were the comparisons actually made; the other
addresses carry only a state and a postal code.

The disagreements (counted per address in distinct files; the per-file lines are not reproduced):
Odoo's Carta Porte 3.0 test template, Municipio 032 at 20928 (c_CodigoPostal: AGU 005),
in 8 files (4 distinct) with the `___ignore___` stamp; an unstamped Carta Porte 2.0 file (three copies) with
Estado MIC at 20928, an Aguascalientes code; one unstamped Comercio Exterior 1.1 file with
colonia 0048 at 53040 (c_Colonia lists only 2285); and states written as names
("Coahuila", "Mexico City") or as DIF, the Federal District's code until it became CMX,
in a 2017 file with the placeholder stamp AAA010101AAA.
