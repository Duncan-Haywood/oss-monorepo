# CI for spend-guards (a sketch for the owner, not a workflow)

Workflows under `.github/workflows/` are the owner's control plane, so this
stack ships no workflow. When the shared AWS plan/apply workflow lands (from
the foundation stacks), spend-guards joins it with these settings:

| | Plan (pull requests) | Apply (`main` only) |
|---|---|---|
| Role | `gha-oss-monorepo-spend-guards-plan` (read-only) | `gha-oss-monorepo-spend-guards-apply`, environment `aws-prod` |
| Working dirs | `platform/aws/spend-guards`, then `platform/aws/spend-guards/member` once per member account | same |
| Inputs | `TF_VAR_alert_emails` from the `aws-prod` secret `AWS_ALERT_EMAILS`; `TF_VAR_deploy_role_arn` per role | same |
| Before plan | `python3 -m unittest discover -s platform/aws/spend-guards/lambda`, `tofu test` in all three dirs | — |

Steps for a job (pin each action by commit SHA, no secrets on PRs):

```yaml
permissions: { id-token: write, contents: read }
steps:
  - uses: actions/checkout@<sha>
  - uses: opentofu/setup-opentofu@<sha>   # with tofu_version: 1.10.7
  - uses: aws-actions/configure-aws-credentials@<sha>
    with: { role-to-assume: <plan or apply role ARN>, aws-region: us-east-1 }
  - run: python3 -m unittest discover -s platform/aws/spend-guards/lambda
  - run: tofu -chdir=platform/aws/spend-guards init -backend-config=backend.hcl
  - run: tofu -chdir=platform/aws/spend-guards test
  - run: tofu -chdir=platform/aws/spend-guards plan -out=tfplan   # apply job: tofu apply tfplan
```

`backend.hcl` is written by the job from the bootstrap stack's bucket name
(an environment variable, not a secret).
