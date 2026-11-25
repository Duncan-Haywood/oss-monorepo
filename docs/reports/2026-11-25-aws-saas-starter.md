---
kind: brief
topics: [everything-as-code, hosting]
date: 2026-11-25
---
# aws-saas-starter: state for the next session (2026-11-25)

Built: `platform/aws/saas-starter/` (apps-account stack, `payments/` stack, `runtime/`,
`examples/hello/`, `ci/` draft workflow) and `platform/aws/modules/app-*` (network, database,
auth, push, service, job, entitlements, paddle-webhook). README in `saas-starter/` has the apply
order, owner steps, cost table and the Workers → AWS migration table.

Verified here (output in `prompts/runs/2026-11-25-session_01XpHqyemh9faFayXEcBV4PP.json`):
runtime 9/9 (incl. Postgres 16 e2e), tofu fmt/validate/test in 10 dirs (26 runs), Checkov 265/0/25.

Next session (`aws-move-products`, grants first):
1. Read `apps/grants/docs/ARCHITECTURE.md` in the private repo (this session's access was
   refused) and check every binding against the README's migration table; add shims for any
   binding it uses that is missing (Queues, KV).
2. Decide grants' outbound path: Bedrock endpoint or NAT (product Lambdas have no internet).
3. Contract with sibling stacks: `alarm_topic_arn` (security/spend stack), the DNS alias from
   `api_domain_target`, the regional ACM cert, `ses_identity_arn` (SES stack). Names are the
   variables in `saas-starter/variables.tf` and `modules/app-service/variables.tf`.
4. Trivy was not run (release downloads 404 through the session proxy); add it to the workflow.
