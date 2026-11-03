# ai-bookkeeper seventh gap probe (2026-10-30)

`eval/probe7.mjs` + `probe7.test.mjs`: 64 made-up descriptors, tuned on themselves. New rules sit at the top of `BUILT_IN` in `categorize.mjs`.
Lessons for the next probe: check the repo's convention first (`grep -n name categorize.mjs`: supply houses 6100, postage 6070, Printify software pinned by `gaps-retail-trades.test.mjs`); words like "electric" hit the utilities rule, so supplier names need a rule ahead of it.
Still wanted: a real labelled export (see README Next). Full suite: 2116 pass.
