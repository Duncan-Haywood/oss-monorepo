# Artist onboarding intake + market launch command center

## Sources

- Print Atelier orchestrator backlog (artist onboarding intake, market launch command center, webhook ledger persistence).
- Existing in-repo patterns: `src/lib/capture.ts` localStorage stub, `buildInvestorSnapshot`, `buildAdCatalogSyncHealth`, `calculateReplyToListingCompression`.

## Rationale

Market launch requires a self-serve artist intake path before Convex persistence ships. Artists referred from outreach need profile + consent + capture linkage in one flow, not scattered portal pages.

The investor dashboard needs a single command center that answers: can we onboard artists, accept payments, and scale ads? Supply velocity (reply→live compression), demand sync (ad catalog health), and checkout readiness must appear together — not as separate labs.

Stripe webhook ledger scaffolding records `transfer.created` and `payment_intent.succeeded` events in-memory until Convex order persistence ships.

## Strategic implication

Digital stock launch is blocked when any of supply intake, demand sync, or checkout fails. The command center makes "do not scale" explicit with per-gate blockers instead of hiding readiness inside individual portal routes.
