# Red team 2026-11-26: billing Worker, catalogue, and the dropped renewal key

Target: the shared Paddle billing code (`platform/billing/worker.mjs`,
`catalogue.mjs`), the money path behind every paid pack, chosen because
neither file had been mutated before.

## Real defect, patched

`checkLicence` in all seven `ventures/*/licence.mjs` called the shared
`checkKey` without `onRenewed` and returned only `{ valid, reason }`. When a
lapsed subscription key renewed from the billing Worker, the new key was
verified and then thrown away. The buyer kept the expired key: it went on
unlocking only while the browser was online and the Worker answered, which
contradicts the "keep a copy: it unlocks this pack on any device" promise in
`client.mjs`. Only `wall-framing-takeoff` is a subscription in
`catalogue.mjs` today, so that is the product it hit.

Fix: `checkLicence` now returns `renewed` (the new key) when a renewal
happened, and the wall-framing page writes it into the key box with a
message to keep a copy. Guard: `platform/billing/testkit.mjs`
(`assertPackLicence`, which every pack's own suite already calls) now signs a
lapsed subscription key for the pack's product and requires `renewed` back.
This holds whatever the catalogue says, so a pack that switches to a
subscription is covered. It fails 3 suites on the old code.

## Mutants

12 seeded (8 in worker.mjs, 4 in catalogue.mjs): 7 caught, 5 escaped, all
gaps, all caught after the new tests (58% to 100%). The gaps:
- the Worker's CORS was tested with one allowed origin only, so dropping the
  request's origin, or falling back to the wrong allowed origin, passed;
- the Worker's catch-all 500 was never reached;
- `productConfig`'s error text was never read.

## For the next run

The billing files left unmutated: `keygen.mjs` (no suite). Page-level
renewal for the six one-off packs isn't wired, since they never renew. If one
moves to `billing: "subscription"`, copy the two-line `v.renewed` handling
from `ventures/wall-framing-takeoff/index.html`.
