# Contributing

All changes follow the repository's [engineering principles](ENGINEERING-PRINCIPLES.md)
and [developer workflow](docs/DEV-WORKFLOW.md). The short version is: if it is
not tested, it is broken.

Before implementation, state the customer outcome, acceptance criteria, risks,
test strategy, telemetry, security/privacy implications, and rollback plan.
During implementation, make the smallest reversible change and add meaningful
tests. Before review, run:

```bash
bash scripts/dev-verify.sh
```

The change description must include test/scan evidence, coverage effect,
operational and data implications, rollout/rollback, and any explicit exception
with an owner and expiry. Production completion additionally requires the exact
Git SHA and artifact digest, GitOps reconciliation, readiness/smoke results, and
verification that relevant customer and data-quality signals remain healthy.
