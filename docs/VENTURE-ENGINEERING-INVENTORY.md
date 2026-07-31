# Venture engineering inventory

Evidence for the first control in [the engineering roadmap](ENGINEERING-ROADMAP.md):
*"Inventory every active venture's verify commands, test types, coverage,
production path, data classes, security boundaries, telemetry, and owner."*

Compiled 2026-07-31 by reading the tree, not by asking. Every row was checked
against the files cited. Where a venture's own documentation and its actual
behaviour disagree, this records the behaviour.

This is a snapshot, and a snapshot rots. The closing section proposes the
validator that would keep it from rotting.

## Summary table

| Venture | Verify command | In CI catalog | Tests | Coverage | Production | Data classes | Telemetry |
|---|---|---|---|---|---|---|---|
| ai-engineering-academy | `npm run build` / `npm test` in `site/` | **no** | site build assertions | none | Argo CD, image nothing builds | public | none |
| ai-first-markets | `verify-component.sh ai-first-markets` | yes | contract only (1 file) | none | Cloudflare Workers | credentials, operator PII | none |
| local-site-studio | disputed — two gates disagree | yes | 124 unit + route | none | Vercel *and* Argo CD | customer-pii, payment | none |
| mat-470-real-analysis | none | **no** | none | none | none | third-party-licensed | none |
| photo-editing | `pytest tests` | yes (+ docs-site) | 438 unit/contract/CLI | none | none (docs site only) | photos, credentials | none |
| photos-import-tools | `pytest tests` | yes | 19 unit | none | runs on the author's Mac | photos | local logs |
| print-atelier | `verify-component.sh print-atelier` | yes | 217 unit | none | none | payment, customer-pii, consent | **none** |
| quick-pick-survey | `npm run verify` | yes | 54 + 13 integration | none | Argo CD, digest-pinned | human-subject, credentials | first-party usage events |
| real-estate-agent-photo-app | `npm test` in `pipeline/` | yes (sub-package only) | 5 hand-rolled | none | Cloudflare Pages (live) | photos, agent PII | none |
| retail-pilot-intel | `pnpm run ci` | yes | **1 test case** | none | GitHub Pages / Vercel | retailer commercial | none |
| ubuntu-agent-server | `pytest tests` | yes | 22 unit | none | manual Ansible | credentials | local logs |

Owner is `duncan` for all eleven. Stage is `prototype` for all eleven.
Coverage is measured for **zero of eleven**.

## Findings that need a decision

Ordered by what they cost if left alone. Items 1–3 are the ones worth acting on
before any venture takes money.

### 1. print-atelier has no authentication or authorization, on money paths

`ventures/print-atelier` handles Stripe checkout, artist payouts, and artist
consent records. It has no `middleware.ts`, no session handling, and no auth
check on any of its seven API routes. Three specific consequences:

- `POST /api/stripe/checkout` accepts `body.lineItems` and passes the client's
  `retailPrice` into Stripe `unit_amount` unmodified —
  `unitAmountCents: Math.round(item.retailPrice * 100)` in
  `buildCheckoutSessionPayload` (`src/lib/checkout.ts`), consumed by
  `src/lib/stripe-checkout-server.ts`.
  `buildCheckoutReadiness` looks the artwork up by slug and checks consent, but
  never compares the submitted price against the server catalogue. A caller can
  set their own price. The same client-supplied numbers flow into
  `artistTransferTotal` in Stripe metadata, which the webhook then pays out on.
- `POST /api/ad-catalog/sync` and `/api/credentials/vercel-pull` are
  unauthenticated and wield server-held Meta/Google/Pinterest tokens
  (`src/lib/ad-catalog-sync-http.ts:133`).
- `verifyStripeWebhookSignature` validates the HMAC but checks no timestamp
  tolerance, and nothing de-duplicates by event id before fulfilment is queued
  (`src/lib/stripe-webhook-server.ts`, `src/app/api/stripe/webhook/route.ts`).
  A captured valid webhook replays indefinitely.

Nothing is exposed today — the venture has no production deployment. That is
precisely why this is cheap to fix now and expensive to fix after launch.
`print-atelier` also carries the largest budget cap in the portfolio ($60/mo)
and is the venture whose hypothesis is explicitly about payout economics.

Related: all of its "persistence" is module-scoped arrays
(`src/lib/order-persistence.ts:26`, `consent-ledger-persistence.ts:39`), so
consent and payout records do not survive a restart. Artist consent that cannot
be produced later is the legal exposure, not just an engineering one.

### 2. Seven of eight GitOps applications deploy a mutable tag

[Engineering principle 4](../ENGINEERING-PRINCIPLES.md) says mutable tags "are
never deployment inputs". The desired state says otherwise:

| Argo CD application | Resolved image | Pinned |
|---|---|---|
| quick-pick-survey | `pairwise-app@sha256:831599f3…` | yes |
| ai-engineering-academy | `…/ai-engineering-academy:latest` | no |
| ai-first-markets | `…/ai-first-markets:latest` | no |
| local-site-studio | `…/local-site-studio:latest` | no |
| marisstella-homepage | `…/marisstella-homepage:latest` | no |
| print-atelier | `…/print-atelier:latest` | no |
| real-estate-photo-app | `…/real-estate-photo-app:latest` | no |
| retail-pilot-intel | `…/retail-pilot-intel:latest` | no |

Every one of these Argo applications runs with `automated: {prune: true,
selfHeal: true}`. `quick-pick-survey` is the one that gets it right, via
`platform/ci/promote-pairwise-gitops.sh` — the pattern already exists and works.

Two aggravating details:

- **Nothing builds most of these images.** `ai-engineering-academy`,
  `local-site-studio`, `print-atelier`, `real-estate-photo-app` and
  `retail-pilot-intel` have no Dockerfile in the repository and no workflow that
  publishes to `git.marisstella.dev`. The cluster is reconciling toward an image
  no pipeline produces.
- **The check that looks like it covers this does not.**
  `.gitea/workflows/deploy-services.yml` has a "Reject mutable image tags" step,
  and it triggers on changes to `platform/k8s/apps/**` — but it greps a Helm
  render of `platform/terraform/helm/web-service` with an injected
  `image.tag=ci-${{ github.sha }}`. It never reads the kustomizations that
  actually define desired state. It has passed every time while seven manifests
  said `latest`.

### 3. The verify contract diverges from itself, per venture

The roadmap's second control asks for *one* fail-closed verify command that is
both the local and the CI contract. Today there are two registries that disagree:

| Venture | `platform/ci/src/pipeline.mjs` catalog | `scripts/ci/verify-component.sh` |
|---|---|---|
| local-site-studio | typecheck, lint, test | lint, test, **build** |
| quick-pick-survey | typecheck, lint, test | prisma generate, typecheck, lint, test, **build** |
| ai-first-markets | typecheck, lint, test, build | + **cf:build** |
| print-atelier | typecheck, lint, test, build | identical (kept in step deliberately) |

For `local-site-studio` — the venture that handles Stripe payments and customer
PII — no path runs all four gates. A type error passes the shell gate; a broken
build passes the pipeline gate.

Three more gaps in the same family:

- **`retail-pilot-intel`'s test step verifies nothing.** Root `test` is
  `pnpm -r run test`, and only `@retail-pilot/analytics` defines a `test`
  script — one test case for the whole workspace. `packages/edge`,
  `packages/pos`, `packages/schemas`, `apps/docs` and `apps/portal` (including
  both auth gates and the unvalidated inbox ingestion in
  `packages/analytics/src/sync-inbox.ts`) are skipped silently. The Node path in
  `pipeline.mjs` throws when a catalog-claimed script is missing; the pnpm path
  has no equivalent assertion.
- **`ai-first-markets` deploys without running its tests.**
  `.gitea/workflows/ai-first-markets-deploy.yml` runs typecheck, lint, build and
  `cf:build`, then deploys. `npm test` is not in that sequence.
- **`verifyPythonHost` reports success when there is nothing to run.**
  `verifyPythonHost` in `platform/ci/src/pipeline.mjs` guards on
  `fs.existsSync(checkPath)` and prints `PASSED` if the test directory is
  absent. `verifyNodeHost` in the same file fails closed on a stale catalog
  entry — it throws when the catalog claims a script `package.json` does not
  define — and the Python path has no equivalent assertion. Both Node and Python
  paths also return `true` when the component directory itself is missing.

### 4. Two ventures are outside CI entirely

`ai-engineering-academy` and `mat-470-real-analysis` appear in no catalog entry,
no `verify-component.sh` case, and no workflow. `resolveAffectedComponents`
matches nothing for them, so a change confined to either prints "Components to
verify: None" and exits 0.

`mat-470-real-analysis` is defensible — it is five files, two of them textbooks,
with no code. It should be recorded as deliberately excluded rather than left
silently absent.

`ai-engineering-academy` is not defensible: it has a build and a passing test
script in `site/package.json`, it is ranked first for budget allocation, and it
has a live auto-syncing Argo CD application. Registering it is a small change.

### 5. Coverage is unmeasured everywhere

`ENGINEERING-PRINCIPLES.md` sets 90% line/function/statement and 85% branch for
production ventures, rising to 95%/90% for money, privacy and integrity paths.
No venture emits a coverage number, so no venture can show it meets the floor,
and the "changed code must not reduce coverage" rule is unenforceable by
construction. `print-atelier` (money) and `quick-pick-survey` (human-subject
data) are the two where this matters most.

### 6. Smaller items worth recording

- **`quick-pick-survey` stores no consent artifact.** The signup consent line is
  rendered and asserted in component tests, but no per-participant consent
  timestamp, version, or withdrawal record exists in `prisma/schema.prisma`. The
  venture collects partner-preference and relationship data from human subjects.
  Its IP handling is genuinely good — HMAC digests only, never raw
  (`src/lib/http.ts:19`) — which makes the consent gap the outlier.
- **`quick-pick-survey` has a single shared `ADMIN_KEY`** with no per-admin
  identity and no audit log of admin actions (`src/lib/adminAuth.ts`), guarding
  a CSV export of five tables.
- **`ai-first-markets` OAuth callback has no CSRF nonce.** The `state` parameter
  is consumed purely as a redirect path
  (`src/app/api/auth/google/callback/route.ts`).
- **`retail-pilot-intel` auth is client-side only, and says so.** An unsalted
  SHA-256 of the passcode is compiled into the bundle
  (`apps/docs/src/auth/docsAuth.ts`); the portal's operator/owner role is
  self-selected at login. Real protection depends on the hosting layer, which
  `README.md` documents. Its `links.production` points at a `pages.dev` URL with
  no Cloudflare config anywhere in the venture.
- **`real-estate-agent-photo-app` ships what it does not verify.** The catalog
  runs `npm test` in `pipeline/` only; `docs-site/` is the part that is actually
  live at `listing-lens-docs.pages.dev`, and it has no tests. Its Cloudflare
  Access policy exists as JSON but was never enabled
  (`process/blockers.ts:113`).
- **`ubuntu-agent-server`'s Ansible layer has no executable verification.** No
  molecule, no idempotence run. Six roles configure a root-privileged,
  internet-SSH-reachable host that autonomously executes model-authored code.
  Its gitleaks pre-push scan fails open when gitleaks is not installed
  (`roles/agent_runner/files/agent_runner.py:306`).
- **Ventures carry `.github/workflows/` files this monorepo never runs.**
  `ubuntu-agent-server`, `photo-editing`, `real-estate-agent-photo-app`,
  `print-atelier` and `retail-pilot-intel` each have one. The repository root
  `.github/workflows/` is empty; all real gating flows through `.gitea/`. These
  read as CI coverage and are inert.
- **`photo-editing`'s CI runner contradicts its own documentation.**
  `AGENTS.md` states the venture uses stdlib `unittest` with no test
  dependencies; the catalog runs `pytest`.

## What would keep this current

This document is worth what it costs to re-derive, which was eight parallel
readers over the whole tree. It will be wrong within weeks. The durable version
is a validator, in the same shape as `portfolio/router/validate_ventures.py`:
require an `engineering:` block in every `VENTURE.yaml` and check the claims
that are checkable against the tree rather than trusting them.

Three checks carry most of the value:

1. **`ci_component` cross-checked against the real `VENTURE_CATALOG` ids.**
   Catches finding 4, and catches a registration that later goes stale.
2. **`gitops.immutable_artifact` verified against the manifests.** Resolve the
   kustomization `images:` overrides against the deployment's `image:` values
   and require an `@sha256:` digest. Catches finding 2, and — unlike the current
   `deploy-services.yml` step — reads the manifests that actually ship. A
   venture may declare `immutable_artifact: false` honestly, but the exception
   should carry a reason and a review date that expires, per the AGENTS.md rule
   that exceptions need an owner, reason, issue and expiry.
3. **`security.data_classification` from a closed vocabulary.** What a venture
   handles decides which controls are mandatory, so it cannot be free text or
   absent.

`platform/VENTURE.template.yaml` already defines the `engineering:` block, and
`scripts/ci/test-engineering-policy.sh` already asserts that block exists — in
the template. It has never checked a real venture. Extending that assertion from
the template to the eleven contracts is the smallest change that turns this
inventory into a control.
