# ai-bookkeeper: held-out HCB reading (2026-10-25)

For the next run on flagship 1. `node eval/hcb-memos.mjs --orgpage 2 --from 0 --to 100`
fetches organisations 100-199 of the HCB transparency feed (works from the cloud proxy; it
403'd earlier the same day, so probe first). 284 card charges, 17.6% suggested. Fixed:
`lumen` and `power` utility rules over-matching (`categorize.mjs` line 70). Still open: a
ledger with labels over this kind of tail; the IRS 2027 inflation Rev. Proc. is not out
(irs-drop `rp-26-NN.pdf` exists up to 34, none is the inflation one), so item (9) waits.
