# AWS IAM Policy Risk Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/aws-iam-policy-risk-check/>

A free browser tool (and small Node CLI) for anyone writing AWS IAM: **paste one
policy, trust policy or bucket policy as JSON and see its score, every admin
wildcard, privilege-escalation action, Allow+NotAction grant and public
principal, each with a fix to review.** It never calls AWS and the pasted text
is not uploaded.

After using this, you can now **catch the policy that is one `iam:PassRole` away
from administrator before it ships**, without an AWS account, an agent, or a
paid scanner, which used to mean a manual read against a blog post's escalation
list.

## Use

1. Open `index.html`, paste the policy JSON (the output of
   `aws iam get-policy-version` or `get-role` works as is).
2. CLI: `node cli.mjs policy.json` (`-` reads stdin, `--json` for machine output).
   Exit 1 when a critical or high finding exists, so it can gate CI on a
   Terraform/CloudFormation-rendered policy; exit 2 on input it cannot read.

## Rules

- **admin**: `Action "*"` on `Resource "*"`.
- **escalation**: policy/keys/login/trust edits, `iam:PassRole`, `sts:AssumeRole`,
  including wildcards that expand to them (identity policies only).
- **wildcards**: `svc:*`, Allow+`NotAction`/`NotResource`, write actions on `*`.
- **sensitive-read**: secrets, parameters, KMS decrypt, S3/DynamoDB reads on `*`.
- **principals**: `Principal "*"` with/without Condition; whole other account trusted.

Score is 100 minus 25 per critical, 10 per high, 4 per medium. Not modelled:
permission boundaries, SCPs, session policies, attachment, Condition
correctness. A clean result is not proof of safety. No warranty; see the page
footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private
dependencies, no personal data.
