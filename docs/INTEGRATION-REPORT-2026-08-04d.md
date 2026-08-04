# Integration report — 2026-08-04d — print-atelier, and a control the merge needed

Branch: `agent/tracked-symlink-control-2026-08-04`, based on `main` after
`d2cd000c`.

## What happened, in the order it happened

This run began by integrating the two unmerged print-atelier branches
(`-deployable`, 3 commits; `-fulfillment`, 7) in a separate clone — a concurrent
agent held the shared working tree with 30 modified files, and worktrees in this
repository have twice been deleted mid-run. The merge was clean: one merge base
(`233c558b`), one overlapping file (`CheckoutLab.tsx`), no conflicts.

Thirty minutes later that concurrent agent merged **the same two branches**
into `main` directly (`0af3bfa3`, `bfe3fd1e`). Both runs then independently hit
the same defect the merge creates, and both fixed it — `d2cd000c` on main, and
the first commit of this branch.

So the merge half of this report is redundant and has been dropped; `main`
already has it. What survives is the part `main` does not have, and the review
evidence for what it took.

**This is the third recorded instance of the fleet duplicating an integration**
(see [2026-08-04c](INTEGRATION-REPORT-2026-08-04c.md)). Two agents spent two
independent runs on the same ten commits within one hour. Neither duplication
control noticed, because both read the *tree*, and the tree was identical by
construction. The cheap check that would have caught it — `git log --oneline -5`
on the shared repo before starting, and again before pushing — is not in any
runbook. It is now the first line of the handoff section below.

## The gap `main` still has

`d2cd000c` removed the offending symlink. It did not close the hole that let it
in, and added no control, so the same defect can land again tomorrow:

- `.gitignore` still said `node_modules/`. **A trailing slash matches
  directories only** — a *symlink* named `node_modules` is not a directory, so
  the rule passed straight over it. This branch drops the slash.
- Nothing in the repository read link targets. A symlink is committed as a blob
  holding its target, so `/Users/duncan/Projects/monorepo-projects/...`
  travelled in the history as a literal absolute path. To the coverage ratchet,
  the SAST scan and the claims audit it was an ordinary tracked file — correct
  on one laptop, unresolvable in every clone and on every runner.

`scripts/ci/tracked_symlinks.py` + `tests/test_tracked_symlinks.py` now fail on
any tracked symlink whose target is absolute or climbs out of the repository,
wired as the named gate `Tracked Symlink Contract` in `scripts/test-ci.sh` and
enforced under the repo pytest run. Targets are read from the **index**, so a
link cleaned from the working tree but still staged is still reported.

Mutation-checked six ways: never reporting absolute targets (6 tests fail),
never reporting escaping ones (2), asymmetric `resolve()` (4), CLI exiting 0 on
findings (2), a failed scan reported as clean (2), and an off-by-one in the
batched `cat-file` read (1).

Escape detection uses `normpath`, not `resolve`, deliberately. `resolve()`
rewrites `/tmp` to `/private/tmp` on macOS, so an implementation that resolves
only one side reports every link in a temporary repository as escaping. That is
how a correct-looking control ends up switched off by the first person it
inconveniences.

## Independent review of what `main` took

Both commercial defects were reviewed against the diff rather than their
authors' summaries, and both guards were mutation-checked — reintroducing the
original bug must turn the suite red, or the guard is decoration.

**Charging less than the summary quotes.** The order summary rendered a bolded
Total of subtotal + shipping + tax; the Stripe session carried only the print
line items. A US cart of one $85 print displayed $99.11 and charged $85.00.
Shipping is now a Stripe shipping rate and is actually collected. Tax is
deliberately *not* collected: nothing registers the venture for sales tax or VAT
anywhere and the rate table is hardcoded, so the summary now states whether tax
is charged rather than displaying an amount the buyer is never asked for.
`automatic_tax` is set only where a deployment declares a registration via
`STRIPE_AUTOMATIC_TAX=enabled`. Collecting VAT that cannot be remitted would
have been the worse of the two failures, and the fix takes the honest side.

Mutation-checked against `tests/checkout-charges-what-it-quotes.test.ts`:
folding `taxEstimate` back into `total` fails 5 cases; zeroing
`shippingAmountCents` in the Stripe payload fails 8. **Confirmed binding.**

**Shipping paid orders to a placeholder.** Printful submissions substituted
`123 Market St, San Francisco` and Gelato `10 Market Street, London` when buyer
metadata was absent — the real delivery address of every paid order. Orders with
incomplete buyer metadata are now refused rather than invented.

Mutation-checked against `tests/buyer-shipping-address.test.ts`: reintroducing a
placeholder constant into `printful-orders.ts` fails the source contract; making
`resolveBuyerShippingAddress` return `ok` regardless of missing fields fails 6
cases. **Confirmed binding.** The placeholder guard reads the *source* rather
than a mocked module, which is the only reason the first mutation is visible to
it at all.

## Evidence

- `ventures/print-atelier` declared verify, run verbatim on Node 22.22.3:
  `npm run typecheck && npm run lint && npm test && npm run build` — **744 pass,
  0 fail**, 57 static pages generated, exit 0.
- Repo pytest on the integrated tree: **13 failed / 466 passed**, against
  **16 failed / 447 passed** at the pre-merge `main`. No new failures; three
  `test_audit_exceptions` failures fixed by the merge; the 16 added tests are
  the new symlink control.
- `scripts/ci/image_release_path.py`: print-atelier is no longer among the
  images with no build path. Four remain — ai-engineering-academy,
  ai-first-markets, real-estate-photo-app, retail-pilot-intel.
- `bash -n scripts/test-ci.sh` clean; the two gate entries are distinct
  commands, so `gate-wiring.test.mjs`'s repeated-command check is unaffected.

## Not verified, and what it would take

- **The image does not build here.** Docker is unavailable in this environment,
  so `docker build` and the container smoke test in `print-atelier-image.yml`
  are unexecuted. Until that workflow runs green, "print-atelier has a build
  path" is a claim about a file, not about an image. It is the first thing to
  watch on the next push.
- **No browser testing.** `AGENTS.md` requires real-browser checks for
  user-visible change and the checkout summary is user-visible — including the
  new "tax not charged" line, which is the buyer-facing half of the tax
  decision. Browser tooling does not come up in scheduled runs, so those states
  are unobserved.
- **print-atelier is still a mutable reference.**
  `platform/k8s/apps/print-atelier/deployment.yaml` pins `:latest`; the workflow
  publishes an immutable `:sha` tag and deliberately stops. Promotion is an
  owner's decision — this venture holds live Stripe Connect and payout code.
- **`main` is still red**, at 13 pre-existing pytest failures this branch does
  not touch: the route-posture registry counts, the coverage baseline, the
  kill-criteria register, the integration-debt budget, and the killed-venture
  audit. All were being repaired concurrently in the shared tree. This branch
  does not make `main` green and does not claim to.

## Handoff

1. **Read `git log --oneline -5` on the shared repo before starting and again
   before pushing.** Three integrations have now been done twice.
2. Watch `print-atelier-image.yml` on the next push to `main`. That is the only
   thing that can turn the Dockerfile from a file into an image.
3. Browser checks on the checkout summary are owed.

## Revenue, honestly

This earns nothing. It removes two reasons a dollar that arrives would be
wrong — an undercharge on every order, and a delivery address that was not the
buyer's — and it keeps a machine-specific path from re-entering the history. The
first actual sale still waits on a human: a Stripe account, a tax position, and
a promotion decision. That has been true of every venture in this portfolio and
remains the binding constraint.
