---
kind: milestone
date: 2026-11-26
---
# E-invoice fix-and-explain (bet #3): Terms, Privacy Policy and DPA in German and French

2026-11-26, private PR 281 (merged, squash `db5fc6e`). Part of item 2 under "Next" in
`private-monorepo/apps/einvoice-preflight/ROADMAP.md` (claim `legal-pages-de-fr`).

## Why

The buyers are German and French accountants and SMEs. The workspace UI was already DE/FR/EN,
but the three legal pages were English only, and an accountant needs to read the GDPR Art. 28
processing agreement before uploading a client's invoices.

## What landed

- `pro/legal/{de,fr}/{terms,privacy,dpa}.md` are served at `/app/de/...` and `/app/fr/...` and
  listed under `translations` in `GET /v1/legal`. Each page links its other languages with
  `hreflang`. In German and French, the workspace's legal links open the translation.
- Each translation opens with "convenience translation; the English text governs". The DPA
  translations add that the SCCs apply as published in the Official Journal.
- **Sync rule:** a translation is served only when its `**Version**` date equals the English
  file's. A stale one is not served (302 to English) and `pro/legal.test.mjs` fails. The test also
  checks that the headings, table rows and every number match the English text. **When you change
  an English legal page, change both translations and bump their dates in the same PR.**

## Verified

`node --test pro/*.test.mjs`: 150 pass. The imported checker suite: 2,218 pass, 1 fail. The
failure is `repair-facturx.test.mjs` "poppler opens the repaired PDF": this container's
`pdfdetach` wrapper has saving switched off, so it is not this change. CI on the PR was starved
(no runner, `ci_starvation.py` exit 1, twice).

## Still open

- EUR-Lex was 403 at the proxy again, so the SCC clause choices, and the German and French SCC
  wording against the official language versions, are still unchecked.
- Hosting (ROADMAP item 1, an owner step) still blocks everything customer-facing: the
  workspace is not served anywhere yet.
