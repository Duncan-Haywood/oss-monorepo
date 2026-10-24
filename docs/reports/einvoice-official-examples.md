# einvoice-preflight on the official EN 16931 examples (2026-10-24)

For the next run on this flagship.

- Clone `ConnectingEurope/eInvoicing-EN16931` (read access works through the session proxy; `add_repo` first) and run `node ventures/einvoice-preflight/eval/official-examples.mjs <checkout>`.
- Baseline before the fixes: 0 of 41 passed. After: 1 of 31 readable files clean. Per-rule table in the venture README, "Measured on the official examples".
- New shared module `linenet.mjs` / `src/einvoice_preflight/linenet.py` holds line-net and per-rate tax arithmetic. Parsed UBL/CII invoices carry `source_format`; their totals sum the stated line nets (BR-CO-10), draft JSON sums quantity times price.
- Not done: HUF/JPY whole-unit rounding (INV-018/038 use cents); INV-012 on the 12 examples whose stated nets disagree with quantity times price is intentional; the `plain/` Schematron route was untouched; the Python CII reader (`facturx.py`) was not changed.
- The 413 above 1 MB (a FatturaPA example with an attachment) is the server body limit, not a bug.
