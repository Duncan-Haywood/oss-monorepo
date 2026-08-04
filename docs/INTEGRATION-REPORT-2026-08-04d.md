# Integration report — 2026-08-04d — print-atelier

Branch: `agent/print-atelier-integration-2026-08-04`, based on `main` at
`c817cada`. Absorbs the two unmerged print-atelier branches and the one defect
the merge itself created.

Integrated in a separate clone rather than a worktree. A concurrent agent held
the shared working tree at the time (30 modified files, gate-repair work) and
worktrees in this repository have twice been deleted mid-run.

## What was merged

| Branch | Commits | What it carries |
| --- | --- | --- |
| `agent/print-atelier-deployable-2026-08-04` | 3 | installable/lintable/buildable again under Next 16, a Dockerfile, `.gitea/workflows/print-atelier-image.yml` |
| `agent/print-atelier-fulfillment-2026-08-04` | 7 | the charge-total fix, the buyer-address fix, real-estate-agent-photo-app claim fixes, the commercial-surface audit |

One merge base (`233c558b`), one overlapping file (`CheckoutLab.tsx`), no
conflicts. This is not the criss-cross shape that has previously dropped
definitions with no conflict to show for it.

## The two commercial defects this moves to a merge candidate

Both were reviewed independently of their authors' summaries, and both guards
were mutation-checked — reintroducing the original bug must turn the suite red,
or the guard is decoration.

**Charging less than the summary quotes.** The order summary rendered a bolded
Total of subtotal + shipping + tax; the Stripe session carried only the print
line items. A US cart of one $85 print displayed $99.11 and charged $85.00.
Shipping is now a Stripe shipping rate and is actually collected. Tax is
deliberately *not* collected: nothing registers the venture for sales tax or VAT
anywhere and the rate table is hardcoded, so the summary now states whether tax
is charged instead of displaying an amount the buyer is never asked for.
`automatic_tax` is set only where a deployment declares a registration via
`STRIPE_AUTOMATIC_TAX=enabled`. Collecting VAT that cannot be remitted would
have been the worse of the two failures, and the fix takes the honest side.

Mutation-checked two ways against
`tests/checkout-charges-what-it-quotes.test.ts`: folding `taxEstimate` back into
`total` fails 5 cases; zeroing `shippingAmountCents` in the Stripe payload fails
8.

**Shipping paid orders to a placeholder.** Printful submissions substituted
`123 Market St, San Francisco` and Gelato `10 Market Street, London` when buyer
metadata was absent — the real delivery address of every paid order. Orders with
incomplete buyer metadata are now refused rather than invented.

Mutation-checked two ways against `tests/buyer-shipping-address.test.ts`:
reintroducing a placeholder constant into `printful-orders.ts` fails the source
contract; making `resolveBuyerShippingAddress` return `ok` regardless of missing
fields fails 6 cases. The placeholder guard reads the *source*, not a mocked
module, which is why the first mutation is visible to it at all.

## The defect the merge created

`ventures/real-estate-agent-photo-app/pipeline/node_modules` arrived as a
tracked symlink whose committed target was
`/Users/duncan/Projects/monorepo-projects/...` — a path that exists on one
machine. A symlink is committed as a blob holding its target, so that absolute
path travels in the history; in any other clone it resolves to nothing.

It got in because `.gitignore` said `node_modules/`, and a trailing slash
matches directories only. A symlink of that name is not a directory, so the rule
passed over it. No other control could see it either: to the coverage ratchet,
the SAST scan and the claims audit it is an ordinary tracked file, because
nothing in the repository read link targets.

Both halves are fixed. The pattern lost its slash, and
`scripts/ci/tracked_symlinks.py` + `tests/test_tracked_symlinks.py` now fail on
any tracked symlink whose target is absolute or climbs out of the repository. It
runs as the named gate `Tracked Symlink Contract` in `scripts/test-ci.sh` and
under the repo pytest run. Targets are read from the index, so a link cleaned
from the working tree but still staged is still reported.

Mutation-checked six ways: never reporting absolute targets (6 fail), never
reporting escaping ones (2), asymmetric `resolve()` (4), CLI exiting 0 on
findings (2), a failed scan reported as clean (2), and an off-by-one in the
batched `cat-file` read (1). The escape test uses `normpath` rather than
`resolve` deliberately — `resolve()` rewrites `/tmp` to `/private/tmp` on macOS,
and an implementation that resolves only one side reports every link in a
temporary repository as escaping, which is how a correct-looking control ends up
switched off.

## Evidence

- `ventures/print-atelier` declared verify, run verbatim on Node 22.22.3:
  `npm run typecheck && npm run lint && npm test && npm run build` — **744 pass,
  0 fail**, 57 static pages generated, exit 0.
- Repo pytest: **13 failed / 466 passed**, against **16 failed / 447 passed** at
  `main` HEAD. No new failures; three `test_audit_exceptions` failures fixed by
  the merge; the 16 added tests are the new symlink control.
- `scripts/ci/image_release_path.py`: print-atelier is no longer among the
  images with no build path (4 remain: ai-engineering-academy, ai-first-markets,
  real-estate-photo-app, retail-pilot-intel).

## Not verified, and what it would take

- **The image does not build here.** Docker is unavailable in this environment,
  so `docker build` and the container smoke test in
  `print-atelier-image.yml` are unexecuted. The workflow is the first thing to
  watch on merge; until it runs green, "print-atelier has a build path" is a
  claim about a file, not about an image.
- **No browser testing.** `AGENTS.md` requires real-browser checks for
  user-visible change and the checkout summary is user-visible. Browser tooling
  does not come up in scheduled runs. The summary's rendered states — including
  the new "tax not charged" line — are unobserved.
- **print-atelier is still a mutable reference.** The workflow publishes an
  immutable `:sha` tag and stops there; `platform/k8s/apps/print-atelier/
  deployment.yaml` still pins `:latest`. Promotion is deliberately left as an
  owner's decision, since this venture holds live Stripe Connect and payout code.
- **The 13 remaining pytest failures are untouched here.** They are the
  route-posture registry counts, the coverage baseline, the kill-criteria
  register, the integration-debt budget and the killed-venture audit — all being
  repaired concurrently in the shared working tree. Merging this branch does not
  make `main` green and does not claim to.

## Revenue, honestly

This does not earn a dollar. It removes two reasons a dollar that arrives would
be wrong — an undercharge on every order and a delivery address that was not the
buyer's — and it gives the venture a build path it did not have. The first
actual sale still waits on a human: a Stripe account, a tax position, and a
promotion decision. That has been true of every venture in this portfolio and
remains the binding constraint.
