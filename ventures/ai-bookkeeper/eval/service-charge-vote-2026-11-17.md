# A service charge in the tax vote (2026-11-17)

Flagship item (5), receipts OCR. The last run
([`cord-tax-split-2026-11-16.md`](cord-tax-split-2026-11-16.md)) found that CORD test-14's
tax was lost on a tie because the vote checks subtotal + tax = total, and that receipt
prints a service charge between them (238,000 + service 17,850 + PB1 25,585 = 281,435). It
asked for the rule to be chosen on validation and SRD first.

## What could be measured this session

- **CORD photos: not this session.** huggingface.co refused the parquet download (proxy 403),
  and no OCR readings of CORD photos are committed, so CORD validation and test photos were not
  read. Their numbers are unchanged from the last note only in the sense that nobody scored them.
- **SRD photos (ExpressExpense, 200 US receipts):** fetched from GitHub (`eval/srd-fetch.mjs`)
  and read through `eval/srd-cli.mjs` (tesseract 5.3.4, ImageMagick, 4 shards, ~30 min). SRD
  has 20-odd receipts with a printed service charge or gratuity (labels' `note`).
  Split fixed before scoring: receipts at even line index in `srd/labels.jsonl` to choose on,
  odd index held out and scored once at the end.
- **CORD dataset text** (`eval/cord/*.jsonl`, hand-corrected words, no OCR noise), read as
  three identical readings so `parseReceiptPasses` reaches `voteTax`: train to choose, validation
  and test as regression checks.

Main's `receipts.mjs` (`d9b39f2da`) on these readings reproduces the last measurement: SRD
CLI totals 154 of 196, tax 133 / 12 / 40 (right / wrong / none).

## What changed (`receipts.mjs` `serviceAmounts`, `voteTax`)

`serviceAmounts` collects every amount on a service, gratuity or tip line in any reading
(in that reading's own number style, under 30% of the total; lines that say suggested, guide,
recommend, or name a tax are skipped). Then in `voteTax`:

1. **The vote's arithmetic bonus** (two points when a subtotal plus the tax is the total) also
   counts subtotal + service + tax. The same test replaces the plain one in the two later
   guards (a two-tax-line sum, and the one-digit misread repair), so a tax that closes with the
   service charge is not "repaired" away.
2. **No tax read, total settled:** after the existing "total less a subtotal, within 15%",
   the total less a subtotal **and** a service charge, when exactly one such amount is within
   15% and some reading prints a tax line. The receipt says so ("the total less the subtotal and
   the service charge, check the tax").

The tax-line condition in (2) came from CORD train-361 and -614: they print "Service" and
"Others" with no tax word and no labelled tax; without it both read a tax (a third, test-41,
read 0.32 from "Service Charge 5% + 48982.68" before the condition was added; test was being
used as a regression check, so it was seen, but the condition was chosen on the two train cases).

## Results

| set | main | this run |
|---|---|---|
| SRD photos, choose half (99 totals labelled, 93 taxes) | totals 80, tax 65 / 9 / 19 | totals 80, **tax 66 / 8 / 19** |
| SRD photos, held-out half (97 / 92), scored once | totals 74, tax 68 / 3 / 21 | same |
| SRD photos, CLI `--four-pass`, all 200 | totals 154 / 196, tax 133 / 12 / 40 | totals 154, **tax 134 / 11 / 40** |
| SRD photos, page (`--settled`) | totals 153, tax 134 / 12 / 39 | totals 153, **tax 135 / 11 / 39** |
| CORD train text (three readings) | tax 324 / 7 / 21, unlabelled read 2 | **tax 326 / 7 / 19**, unlabelled 2 |
| CORD validation text | tax 46 / 0 / 1 | same |
| CORD test text | tax 41 / 0 / 0 | same |

The one SRD receipt that moved is 1182: the first reading lost the resort tax and read 2.80,
the second added both tax lines (2.80 + 0.80 = 3.60), and a third read the printed 18% tip of
7.20. 40.00 + 7.20 + 3.60 = 50.80, so 3.60 now wins the tie that the first reading used to.
The two CORD train receipts are train-1 (`PB1` with its amount a line above) and train-429
(`TAX` with its amount on the next line), both read now as total − subtotal − service.

The held-out half did not move, either way. The gain is small: on SRD most receipts with a
service charge miss their tax for other reasons (1022's total is misread "7.07" and the cash
less change that would confirm 37.37 is lost to "HANGE"; 1112's tax is two lines OCR mangled;
1126's total is wrong).

## What is left

- CORD validation and test photos, once huggingface.co answers: test-14 is the case the rule
  was written for, but test stays held out, so score validation first.
- SRD 1022: a change line read as "HANGE" (`totalChecks` looks for `change|kembali|baki`).

## Reproduce

```
apt-get install -y tesseract-ocr     # ImageMagick was already installed
node eval/srd-fetch.mjs $P
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs $P $O $k/4 & done; wait
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr $O/psm6,$O/psm4,$O/g6,$O/g4 [--settled]
```

Main's numbers: `git archive d9b39f2da ventures/ai-bookkeeper | tar -x -C old` and run the
same scorer from `old/`. Tests: `receipt-crosscheck.test.mjs` ("a printed tip or service
charge counts in the tax vote's arithmetic", "an unreadable tax line is the total less the
subtotal and the service charge"; both fail on main).
