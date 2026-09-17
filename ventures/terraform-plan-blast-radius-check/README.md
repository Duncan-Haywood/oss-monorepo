# Terraform Plan Blast Radius Check

A free tool that reads a Terraform *structured* plan (`terraform show -json`)
and answers one question before you apply it: **what does this take away?**

- Action counts (create / update / replace / destroy / no-op) grouped **by
  resource type** and **by module**.
- **Every destroy and replace, individually**, with the `replace_paths`
  attribute that forced it and the `action_reason` code, when the plan
  carries them.
- A loud flag when a **replace** lands on a resource type that holds data —
  a database, disk, bucket, DNS record, load balancer, secret, stateful
  Kubernetes object, queue, or search cluster. This is the destroy-and-
  recreate case that a plan summary buries.
- A **true-deletion** list: resources whose action is exactly `delete` and
  which nothing else in the plan re-creates at the same address.

**What it is not:** a policy engine (Sentinel, OPA, Conftest), a cost
estimator, a state scanner, or a Terraform Cloud clone. It reads one file you
already have and reports what that file says, deterministically, with no
model, no account, and no network call.

## Why this exists

A plan ends with one line — `Plan: 3 to add, 1 to change, 2 to destroy.` — and
**a replacement is counted in both the add column and the destroy column**. So
a plan that recreates your production database looks, at the bottom, exactly
like a plan that deletes two scratch resources. The information that separates
them is hundreds of lines up, in the part of the output a reviewer skims, a CI
log truncates, and a PR bot collapses.

There is a sharper version of it. An attribute a provider marked
`RequiresReplace` whose *own value did not change* is folded into the
`(N unchanged attributes hidden)` summary — so the plan can tell you a
resource must be replaced while hiding which field caused it. That was
reported as
[hashicorp/terraform#36097](https://github.com/hashicorp/terraform/issues/36097)
and **closed as working as designed**, so the text output is not going to
close the gap. The structured plan does not have it: `change.replace_paths`
carries the exact attribute paths either way, which is what this tool reads.

The failure it is built against is not hypothetical. GitLab's infrastructure
team published a corrective action,
[Improve safety around Terraform destroy operations (disks)](https://gitlab.com/gitlab-com/gl-infra/production-engineering/-/issues/24078),
after an accidental deletion of three Gitaly nodes cost roughly 30 minutes of
data loss on each. Its ask is this tool's default gate: *an apply should fail
if multiple critical resources containing data (disks) are being deleted.*

See [the docs page](why-terraform-replace-destroys-data.html) for how
`ForceNew`/`RequiresReplace` works, which three fields of the plan JSON answer
the question, and why a "true deletion" is not the same as the destroy count.

## Try it without installing anything

[`index.html`](index.html) reads a plan file you load or paste entirely in the
browser and renders the whole report there. No fetch happens from the page, so
nothing you load ever leaves your device — which matters more than usual here,
because a structured plan describes your entire infrastructure.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the file you name — no
network call, ever.

```sh
terraform plan -out=tfplan && terraform show -json tfplan > plan.json
node cli.mjs check plan.json                            # exit 1 if a replace hits something that holds data
node cli.mjs check plan.json --fail-on=delete-stateful  # also fail on destroying stored data outright
node cli.mjs check plan.json --fail-on=destructive      # fail on any destroy or replace at all
node cli.mjs check plan.json --fail-on=never            # report only, always exit 0
node cli.mjs check plan.json --json
```

Wire it in between plan and apply:

```yaml
- name: Blast radius of this plan
  run: |
    terraform show -json tfplan > plan.json
    node cli.mjs check plan.json
```

The default gate is `replace-stateful` rather than "any destroy" on purpose: a
gate that fires on every plan in a repository that uses `count` is one
somebody adds `continue-on-error` to within a week.

Exit codes: `0` nothing matched the chosen mode, `1` something did, `2` the
file could not be read or is not a structured plan.

## How it decides a resource type holds data

By the **type name**, split on underscores and matched against a token list
per category. Type names are the one part of a plan that is stable across
providers and needs no schema lookup, so this works offline against a provider
the tool has never seen — including your own.

It is **deliberately biased toward flagging**, because the costs are
asymmetric by orders of magnitude: an extra flag costs five seconds of
reading, a missed one costs a database. Two counterweights keep that from
becoming noise:

- Every flag names the **token that matched**, so a false positive is
  dismissable at a glance rather than on faith.
- Configuration sub-resources are **exempt by suffix** —
  `aws_db_parameter_group`, `aws_s3_bucket_policy`, `aws_lb_target_group_attachment`
  all carry a stateful token and hold no data of their own.

This heuristic has been tested against the fixtures in `engine.test.mjs` and
**not** against a corpus of real-world plans. If it misses a type you care
about, that is a bug worth reporting.

## Disclaimers

This tool is informational only. It is **not** legal, financial, security,
compliance, or other professional advice, and a clean report is **not** a
statement that an apply is safe — only that nothing in the plan matched the
patterns it checks. It does not read your state file or your provider's
source, and it cannot know that a resource you consider disposable is
load-bearing. **Read the real plan before you apply anything.**

**Not affiliated with HashiCorp, Terraform, OpenTofu, or any cloud provider.**
Terraform is a trademark of HashiCorp. This is an independent, unofficial tool
that reads a file those programs produce.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`, `file_loaded`) in `localStorage` only — never transmitted,
never tied to your plan or any resource in it. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns it off entirely. The CLI
records nothing and makes no network call.

## Related

[Terraform Plan Secret Exposure Check](../terraform-plan-secret-exposure-check/)
reads the same `terraform show -json` file for a different failure: attribute
values that look like real secrets which the provider schema never marked
`sensitive`. Neither subsumes the other — one is about what the plan *prints*,
this one is about what the apply *removes*.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The engine, CLI, and page
are built and tested; no external user contact has happened yet, and the
stateful-type heuristic has not been measured against a real-world plan corpus
— both are the next, non-code steps (see `hypotheses` and `kill_criteria` in
`VENTURE.yaml`).
