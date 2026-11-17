# Dutch VAT checksum vs python-stdnum nl.btw (2026-11-17)

`pip install python-stdnum` (2.2), then
`PYTHONPATH=src python3 eval/nl-vat-stdnum-differential.py 30000 SEED out.json` (the CLI's
check) and `node eval/nl-vat-stdnum-differential.mjs out.json` (the page's). No network.

Since 1 January 2020 a Dutch sole trader's btw-identificatienummer no longer contains the BSN;
its two last digits make the whole string, `NL` and `B` included (N=23, L=21, B=11), equal 1 mod
97 (ISO 7064 mod 97-10, as an IBAN). Older numbers (and companies' RSIN-based numbers) pass the
elfproef. python-stdnum accepts a number when either holds, and refuses suffix `00` and a body of
nine zeros. INV-023 used the elfproef alone.

Draws: one third bodies built to pass the elfproef (random suffix 01-99), one third numbers built
to pass mod 97, one third uniform random; 30% of all get a one-digit typo.

## Before, seed 7 (page and CLI agree with each other)

30,000 numbers, **6,545** disagreements with stdnum:

| kind | drawn | valid (stdnum) | off |
|---|---|---|---|
| elfproef | 6,952 | 6,952 | 0 |
| elfproef + typo | 3,048 | 589 | 37 |
| mod97 | 7,060 | 7,060 | **6,406** |
| mod97 + typo | 2,940 | 283 | 0 |
| random | 6,990 | 725 | 66 |
| random + typo | 3,010 | 308 | 36 |

6,406 of 7,060 valid post-2020 numbers (91%) were reported as an INV-023 error; the other 654
pass the elfproef by chance. The rest are mod-97-valid random draws, plus suffix `00`.

## After

Seed 7: **0** of 30,000 off (page and CLI). Seed 11: **0** of 30,000 off (page and CLI).
The first after-run on seed 7 left 10 off, all suffix `B00` (stdnum refuses it; the elfproef
passed it): those now fail INV-023 too.

Not checked: any Belastingdienst text, or a real invoice carrying a post-2020 number.
