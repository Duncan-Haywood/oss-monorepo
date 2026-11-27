---
kind: note
topics: [redteam]
date: 2026-11-27
---
# Red team 2026-11-27: PayApps billing, the app-URL host check and checkout tokens

Targets (bet #1, `ventures/payapps/packages/billing/src/`): `paddle-webhook.ts`,
`checkout-token.ts` and `entitlement.ts`, 8 mutants each. Suites run in under a second.

## Seeded faults

| file | caught | escaped | triage |
|---|---|---|---|
| `paddle-webhook.ts` | 7 | 1 | 1 gap |
| `checkout-token.ts` | 6 | 2 | 2 equivalent |
| `entitlement.ts` | 8 | 0 | n/a |

Catch rate 21/24 (0.875) before, 1.0 after the fix (equivalents excluded).

- **Gap:** `webhookUrl` refuses hosts that are not a public domain name with the regex
  `^([a-z0-9-]+\.)+[a-z][a-z0-9-]*$`. A mutant changed the first class to `[a-z0-10-]`,
  which refuses every label with a digit from 2 to 9 (`app2.example.com`), and no test
  noticed: every host in the tests was `payapps.marisstella.app` or a host that should be
  refused. A deploy to a numbered staging host would have failed at the Paddle setup step.
- **Equivalent:** the token length cap `> 128` becoming `> 129`. A good token is exactly
  89 characters and the two shape regexes reject anything else, so nothing changes.
- **Equivalent at runtime:** `ok: false` becoming `ok: true` inside the `TokenResolution`
  type. Node strips types, so `node --test` cannot see it. Applied by hand, `tsc --noEmit`
  fails with TS2322 four times, and `payapps-ci.yml` runs `pnpm typecheck`, so CI catches
  it. Type-only mutants like this one will keep escaping `redteam.py`, which runs only the
  test command.

## Guard left behind

`payPageUrl` in `paddle-checkout-page.ts` had a copy of the same check, line for line. A
fix to one copy would have missed the other. Both now call `appOriginWith` in the new
`app-origin.ts`. Tests in `paddle-webhook.test.ts` and `paddle-checkout-page.test.ts` check
hosts with every digit and hyphens, plus `https://[::1]` as a refused host. With the mutant
applied by hand to `app-origin.ts`, two tests fail (one per caller).

## Real defects

None found. I read the webhook path from start to finish: `verifyPaddleSignature`, the
checkout-token binding, `decideSubscriptionUpdate` and the app's `handleBillingWebhook` in
`apps/payapps/src/worker/services/billing.ts`. It refuses a blank secret, a stale
timestamp, a token signed for another org, a replay by a second subscription, a different
customer taking over an org, and staff-only plans. `toleranceSeconds: NaN` would turn off
the staleness check (`x > NaN` is false), but nothing sets it from config today. Fixing it
would be hardening, not a fix for a defect.

## For the next run

- If `toleranceSeconds` is ever read from an env var, validate that it is a finite number
  of 0 or more first.
- `redteam.py` could run a venture's typecheck along with its tests for TypeScript
  targets, so type-only mutants count as caught when CI would catch them.
