---
kind: analysis
subjects: [ai-bookkeeper]
date: 2026-11-04
tagged: auto
---
# ai-bookkeeper: bunq payee (2026-11-04)

`bank.mjs`: `detectColumns` picks `name` as desc when the header has interest date, counterparty, name and description; `sniffBank` label `bunq`. Header from memory. Probed the same day and left alone: Clover payments export (no description column, rows arrive with an empty payee; layout uncertain), Lili (sniffed as amex, values right). Divvy reads right.
