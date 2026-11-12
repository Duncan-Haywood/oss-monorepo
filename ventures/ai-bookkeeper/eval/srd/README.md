# ExpressExpense SRD receipts: US phone photos, totals read by eye

`labels.jsonl` holds one line for each of the 200 free receipt photos in
ExpressExpense's "large receipt image dataset" (SRD,
https://expressexpense.com/blog/free-receipt-images-ocr-machine-learning-dataset/).
Most are US restaurant and shop receipts on thermal paper, photographed with a
phone. The photos are **not** committed. `../srd-fetch.mjs` fetches them at run
time from a public MIT-licensed GitHub copy
(amannirala13/Bill-Segmentation-OpenCV, `Dataset/receipt/p/`, commit
`a98b578a`).

Fields: `id` (the file name without `.jpg`); `total`, `subtotal` and `tax` as
printed, or null; `currency`; `handwritten` (true when a tip or total was
written in by hand); `note` (every judgement call); and `duplicate_of` on the two
photos that repeat another (their total is null, so they are not scored twice).

How the labels were made (2026-11-12): four agent sessions each read 50 photos
by eye, from the photos alone with no OCR text in front of them, to one brief:

- `total` is the last machine-printed amount the customer was charged. A
  printed tip, gratuity or service charge is included. A handwritten tip or
  total is ignored. On a split check, it is the "Receipt Total" printed last.
  It is null when the amount is cut off or too blurred to read.
- `tax` is the printed tax line, or the sum of several tax lines (said in `note`).

Checks: on 172 receipts with a subtotal and tax, 146 add up exactly. Each of the
other 26 has a printed reason in its note (service charge, printed tip, discount,
a void after tax, a split check, a receipt one cent off itself). Three labels
were checked again from the photos by another reader, and all matched. A misread
digit is still possible. Misses are scored as they stand, not removed.

Score: `node ../cord-receipts.mjs labels.jsonl --ocr <dir>[,<dir2>...] [--settled]`
(the parent README, "US receipt photos", gives the full recipe).
