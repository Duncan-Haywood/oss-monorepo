# private-monorepo

Proprietary, paid products (see `LICENSE`). Each app is either:

- **a subscription**: serving a customer costs money every month (model calls, a
  server, stored data, a rule set we keep current), so it is priced cost-plus, as
  `apps/grants/docs/PRICING.md` does it; or
- **a one-off licence**: the product runs in the customer's browser or on their
  machine, so a single purchase or a yearly licence key covers it.

| App | Model | Source |
|---|---|---|
| `apps/grants` (Grant Autopilot) | subscription, cost-plus | built here |
| `apps/wall-framing-takeoff` | one-off licence | imported from oss-monorepo (`PROVENANCE.md`) |
| `apps/seller-books` (Seller Books) | subscription (paid path dark) | built here |
| `apps/seller-books-site` | marketing site + early-access list for Seller Books (working name; product in `apps/seller-books`) | built here |
| `apps/jobshop-quote` (Job Shop Quote: RFQ to quote for CNC/fab shops) | subscription, cost-plus (paid path dark) | built here |
| `apps/jobshop-site` | marketing site + early-access list for RFQ Desk, RFQ-to-quote for job shops (working name; product in `apps/jobshop-quote`) | built here |
| `apps/einvoice-preflight` (e-invoice fix-and-explain: DE/FR/EN explanations, safe fixes, accountant workspace, metered API) | subscription (paid path dark) | imported from oss-monorepo (`PROVENANCE.md`) + paid layer `pro/` built here |
| `apps/einvoice-site` (marketing site, e-invoice fix-and-explain) | subscription, cost-plus (`docs/PRICING.md`, proposal) | built here; early access |

Shared packages: `packages/cad-features` reads part geometry from DXF and STEP files for job-shop
quoting, with zero dependencies and safe to run in a Worker (`packages/cad-features/README.md`).

## Moving a product in from oss-monorepo

The owner's direction (2026-11-24) moves the public repository's products, the
ventures with real depth that are not lead magnets, here under a proprietary
licence. The small free tools stay MIT and public and send visitors to these
products. The move list, its order and the reasons are in oss-monorepo
`portfolio/monetization/transition.json` and `LICENSING_TRANSITION.md`.

```bash
node scripts/import-venture.mjs <slug> --from ../oss-monorepo --dry-run
```

```bash
node scripts/import-venture.mjs <slug> --from ../oss-monorepo
```

The script copies the venture, keeps the imported baseline's MIT notice (code
already published under MIT stays MIT), marks later changes as proprietary, and
writes `PROVENANCE.md` with a checklist to finish before the first paid release.
Tests: `node --test scripts/import-venture.test.mjs`.

Imported apps keep their own zero-dependency style and test runner (an app
`biome.json` turns the root lint off for them). Run an app's tests from its
directory, e.g. `cd apps/wall-framing-takeoff && node --test engine.test.mjs`.
