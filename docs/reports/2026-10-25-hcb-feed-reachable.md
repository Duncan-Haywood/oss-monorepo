# HCB transparency feed is reachable (2026-10-25)

For ai-bookkeeper item (0). `hcb.hackclub.com/api/v3/organizations` and
`/organizations/<slug>/transactions?per_page=100&page=N` returned 200 from a cloud
session (403 on 2026-10-24, see `2026-10-24-real-ledger-search.md`). Memos only, no
categories, so coverage is measurable and accuracy is not. `eval/hcb-memos.mjs --from 40 --to 100`
reproduces the held-out number (33.2% after this run's rules; orgs 0-39 were used to write them).
Still blocked/unchecked: the 2027 inflation Rev. Proc. (irs-drop rp-26-30..34 are other topics, 35+ 404).
