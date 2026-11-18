# SROIE merchant names with RapidOCR leading: the name line as the engine misreads it (2026-11-18)

Flagship item (5), receipts OCR. The open item from
[`sroie-five-readings-2026-11-18.md`](sroie-five-readings-2026-11-18.md), "Next": with RapidOCR
leading, merchant names on SROIE were 67.4% exact on dev against 84.8% from SROIE's own box text.
huggingface.co refused this session again (probed), so the row's CORD, WildReceipt and Russian
items were out of reach; SROIE is on GitHub.

**Short answer:** the names were mostly found. The parser then printed them as the engine misread
them, or a registration number in odd brackets made the right line ineligible. Changing only what
the parser does with the merchant line takes held-out exact merchants from **215 to 229 of 313
(68.7% to 73.2%)**: 14 receipts better and none worse. Dates and totals do not move.

## Setup

The same as the five-readings note: `zzzDavid/ICDAR-2019-SROIE` (MIT), sparse checkout of
`data/img`, `data/key` and `data/box`; RapidOCR 1.4.4 through `eval/rapidocr-photos.py`, 4 shards
(about 60 minutes for 626 scans on this container). The split was the earlier run's, fixed before
any change: ids `000`-`312` are dev, where the misses were read and the rules written; `313`-`625` are
held out, scored once on main and once with the final code.

Merchant and date follow the first reading in `parseReceiptPasses` (`--rapidocr --four-pass`)
whenever it has a merchant. RapidOCR found one on all 626 scans, so the five-reading merchant is
RapidOCR's own. Tesseract's four readings were therefore not run this time; `--ocr r` scores the
same merchants.

## What the 69 dev misses were (main)

| kind | dev receipts | fixed here |
|---|---|---|
| "SDN BHD" misread: `San Bhd`, `SIN BHD`, `SONBHD`, `5dn Bhd`, `SDN 3HD`, `SDN.BHZ`, `Sdn.Rhd`; "S/B" as `5/B`, `S/R`, `S/D` | 14 | yes |
| 0, 1 and 5 inside words: `C0.`, `F00DICI0US`, `S0ON`, `1DEA`, `D.1.Y.` | 6 | yes |
| registration number in full-width brackets (`(126926-H）`), left open, read `·`, with a comma after: the line failed the "words" test, so all four AEON slips took the address line under it | 7 | yes |
| boilerplate the engine glued or misspelt (`TQFORSHOPPINGWITHmyNEWS`, `GOODSSOLDARENOTRETURNABLE`, `For feedtack or ccpiaint`, `Company Reg. No. : 725186-V`) | 5 | skipped; the name under it is taken when it is a name |
| other letters misread (`PEIRO`, `Dwner`, `BEMEO`, `TIHES`, `NART`) | about 20 | no: not a pattern |
| the label is the legal entity, the slip prints a brand (`Chili's` for T.A.S LEISURE, `Harvey Norman`, `SOLARIS`) | about 10 | no |
| Domino's slips scanned upside down (`YZZIG S.ONINOO`) | 3 | no |

## The changes (`receipts.mjs`)

1. **`shopName`** cleans the chosen merchant line before it is returned:
   - "SDN BHD" in any of the misreads above, spaced or glued to the name, is written `SDN BHD`
     (`Sdn Bhd` in mixed case; the dot kept). Glued only when there is no space inside, so
     `HASAN BHD` stays a name. A final `5/B`, `S/R` or `S/D` is `S/B`.
   - In a token whose only digits are 0, 1 or 5, one or two of them between letters, or one before
     two letters, are O, I and S; `C0.` is `CO.`; a lone `1` between single dotted letters is `I`.
     `LOT10`, `OLIVE9`, `99SPEED`, `7-ELEVEN` and `TOKO 15 RIBU` are left.
   - A registration number left at the end after its opening bracket was misread
     (`578519537-X)`) is cut.
2. **Registration numbers** (`REGNO`): full-width brackets, a missing closing bracket, `·` or `.`
   for the dash, a digit for the check letter, and trailing `,.;` are read as the number.
3. **Boilerplate** (`BOILER`): `goods\s*sold`, `tq for`, `for feedback` with any character after
   "fee", and `Company Reg` / `Company Registration No` are not names.

## Results

| set | main | **this change** |
|---|---|---|
| SROIE dev 313, RapidOCR leading: merchant exact / contained / wrong | 211 / 33 / 69 (67.4%) | **239 / 31 / 43 (76.4%)** |
| **SROIE held out 313**, RapidOCR leading | 215 / 32 / 66 (68.7%) | **229 / 24 / 60 (73.2%)** |
| held out, per receipt | | 9 contained to exact, 5 wrong to exact, 1 wrong to contained, 0 worse |
| SROIE box text, dev / held out: merchant exact | 261 / 270 | **263 / 272** |
| SROIE dates and totals, dev and held out (RapidOCR and box text) | | unchanged |
| CORD hand-corrected text: train / val / test totals; taxes | 767 / 97 / 94; 328, 46, 41 | same |

The held-out gain is half the dev gain (+14 against +28), as expected of rules written from dev's
misses (dev's four AEON slips with the address line taken, for one, have no held-out twin). Held out also changed 63 already-exact names (the
scorer drops spaces) into readable ones: `GARDENIABAKERIES(KL)SDNBHD` now reads
`GARDENIABAKERIES(KL) SDN BHD`, which is what a person checks and what a bank line is matched
against.

## Integrity notes

- The held-out half was scored once on main and once on the final code; no rule changed after.
- The box-text "held out" figure is not a clean held-out measure: box-text aggregates for both
  halves were printed while writing the rules (no misses were read from them).
- Russian slips are unmeasured (huggingface.co refused). `russianSeller` runs first and is
  untouched; `shopName` acts only on Latin letters and digits, so a Cyrillic seller is unchanged.

## Next

- Held-out leftovers worth a rule: `(1U79369-P)` and `(Co. No:20154-T)` (a registration number
  with a letter or label inside) are still printed after the name; `AEON CO.(M) BHO`.
- The brand-vs-entity misses need a second line (the entity under the brand); no rule tried.
- Upside-down scans: a 180-degree retry when the first reading's text is mostly reversed words.

## Reproduce

```
python3 -m venv v && v/bin/pip install rapidocr-onnxruntime==1.4.4
git clone --depth 1 --filter=blob:none --sparse https://github.com/zzzDavid/ICDAR-2019-SROIE sroie
(cd sroie && git sparse-checkout set data/img data/key data/box)
for k in 1 2 3 4; do OMP_NUM_THREADS=1 v/bin/python eval/rapidocr-photos.py sroie/data/img r $k 4 & done; wait
# dev / held: a folder per half with key/ (symlinks to sroie/data/key/<id>.json, ids 000-312 / 313-625) and box/
node eval/sroie-receipts.mjs <half> --ocr r --misses merchant
```

Tests: `receipt-sroie-merchant.test.mjs` (4). The whole ai-bookkeeper suite passes (3,406 tests).
