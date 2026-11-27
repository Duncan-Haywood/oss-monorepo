# The paid layer on a Worker answers like the Node host (2026-11-26)

Question: can the paid API run on Cloudflare Workers + D1 (no new host account) without changing
any answer? `docs/HOSTING.md` had left it unmeasured.

## Method

- Node host: `PORT=8797 node pro/server.mjs` (memory store), with `slimdom@4.3.5` and
  `fontoxpath@3.34.0` installed (`npm i --no-save`), so the official rules run on the plain route.
- Worker: `node worker/build.mjs && wrangler dev` (wrangler 4.165.0, workerd, local D1).
- `node eval/worker-parity.mjs <node> <worker>`: one trial account on each, then every
  `examples/*.xml` and `*.pdf` (42 files) to `POST /v1/check?lang=en&schematron=1&fix=1`; the
  two JSON bodies compared after parsing.
- CPU per invoice: `runPlain` (plain-node.mjs) on each example in Node, once to warm the rule cache
  and JIT, then 5 runs timed with `process.cpuUsage`.

## Result

**42 of 42 responses identical** (status, findings, explanations, safe fixes and their
re-validation, the official-rules status). Run twice, before and after moving the entry into
`worker/`. Both sides ran the plain route, so this tests the port, not Saxon against plain.

Warm CPU per invoice, plain route (ms):

| File | Sets | CPU |
|---|---|---|
| xrechnung-cii-credit-note.xml | en16931 + xrechnung | 46 |
| nlcius-cii-invoice.xml | en16931 + nlcius | 40 |
| pint-current-jp-invoice.xml | pint-jp-1 | 50 |
| cii-invoice.xml | en16931 | 76 |
| ubl-invoice.xml | en16931 + xrechnung | 114 |
| hr-invoice.xml | en16931 + cius-hr | 139 |
| ubl-credit-note-with-defects.xml | en16931 + peppol | 158 |
| peppol-credit-note.xml | en16931 + peppol | 228 |
| pt-invoice.xml | en16931 + cius-pt | 439 |

Bundle: 11.0 MB, 2.0 MB gzipped (`wrangler deploy --dry-run`). Start-up: importing the Worker in
Node takes 382 ms of CPU.

## What it means

- The free plan's 10 ms CPU is 4 to 44 times too little; Workers Paid (already on the owner's
  account for Grant Autopilot) fits with room, so hosting needs no new account or card.
- Local workerd enforces no CPU limit, so the numbers are Node's; re-read them from Workers
  Metrics after the first deploy.
