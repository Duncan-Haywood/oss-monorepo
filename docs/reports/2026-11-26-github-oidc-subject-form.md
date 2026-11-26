---
kind: brief
topics: [everything-as-code, hosting]
date: 2026-11-26
---
# GitHub OIDC subject form: trusts move to the ID form; configure.sh checks the prefix

2026-11-26. For whoever next touches an AWS trust, `platform/aws/github/configure.sh`
or the payments resource control policy. Companion to
`docs/reports/2026-11-26-github-oidc-immutable-subject.md` (PR #19507, the trust changes).

## Evidence

- Apply run 45905276526 was refused (`AccessDenied ... AssumeRoleWithWebIdentity`).
  CloudTrail showed `sub = repo:Duncan-Haywood@49566815/oss-monorepo@1315497858:environment:aws-prod`,
  and every trust expected `repo:Duncan-Haywood/oss-monorepo:...`.
- The owner set the template `{"use_default":false,"include_claim_keys":["repo","context"]}`.
  GitHub's read-back was `{"use_default":false,"use_immutable_subject":true,
  "include_claim_keys":["repo","context"],"sub_claim_prefix":"repo:Duncan-Haywood@49566815/oss-monorepo@1315497858"}`.
  The next apply (run 45906725339) was refused the same way. That read-back and
  the refusal reached this session from the session that ran the setup. This
  session confirmed from the API that run 45906725339 exists and failed; it
  could not read GitHub's documentation, because docs.github.com is blocked here.

So the claim keys set only the context. The prefix comes from
`use_immutable_subject`: while it is true, the template cannot give a
name-only subject. Whether it can be set to false has not been tested.

## Decision: the ID form

This replaces the first draft of this report, which kept name-only subjects
pinned by the template. That premise was wrong (above).

- **The trusts accept both forms for now.** PR #19507 changes the bootstrap
  github-plan/github-apply roles, `stacks/llm`, `stacks/app-identity`,
  `stacks/cutover-access` and the payments RCP.
- **The ID form is the stronger one.** `repo:<owner>@<id>/<name>@<id>` does
  not match a repository that later takes the same name. The name form is
  open to that if the owner account or a repository is ever renamed or
  deleted and the name is taken.
- **It is what GitHub issues.** It is the repository's default, and the only
  form the setup has seen working since 2026-11-26.
- **Next step: drop the name form** from the trusts once the first apply has
  passed with the ID form. Before applying `stacks/github-oidc` and
  `stacks/site`/`modules/static-site`, they need the same change; they still
  build name-only subjects. private-monorepo's ID is 1441455568.

Not chosen: turning `use_immutable_subject` off to keep name-only trusts. It
is untested, it gives up the stronger form, and it would depend on a GitHub
setting staying put.

## configure.sh

`pin_oidc_sub` runs for oss-monorepo and private-monorepo, on every full run
and on its own with `--oidc-sub`. It:

1. PUTs `{"use_default":false,"include_claim_keys":["repo","context"]}`. The
   trusts' contexts (`pull_request`, `environment:<env>`,
   `ref:refs/heads/main`) need exactly these keys. That is also what the
   repository reads now.
2. Reads back `use_default`, `include_claim_keys`, `use_immutable_subject` and
   `sub_claim_prefix`, and prints them.
3. Fails unless the prefix is `repo:<owner>/<name>` or
   `repo:<owner>@<owner-id>/<name>@<repo-id>`, with the IDs looked up from the
   API. Those are the two forms the trusts accept. A reply with no prefix
   counts as the name form, unless immutable subjects are on; then it fails
   and points at CloudTrail.

`platform/aws/tests/test_oidc_subject.py` runs the script against a stub `gh`:
the ID form, the name form, a foreign prefix, a wrong ID, and immutable with
no prefix. A check of the keys alone passed while the subject stayed
ID-qualified (run 45906725339). That is the failure these tests guard against.

## The payments RCP

Allow-side trusts fail closed on an unexpected form. A deny on `sub` fails
open. The payments RCP denied only `repo:Duncan-Haywood/oss-monorepo:*`, so
an ID-form token from the public repository did not match it. PR #19507 adds
the exact ID form to that Deny.

PR #19501 (merged) added gate allowlist entries for a variant this PR first
carried and then dropped to avoid conflicting with #19507:
`repo:<owner>@*/<name>@*:*` and `repo:*/*@<repo-id>:*`. The second still
matches after a rename of the public repository, which the exact form does
not. Those entries match nothing now. Reuse them if the Deny gains the
rename-proof pattern, or remove them.
