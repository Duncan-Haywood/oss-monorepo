# Terraform Plan Secret Exposure Check

A free tool that reads a Terraform *structured* plan (`terraform show -json`)
and reports every attribute value that looks like a real secret — an AWS
access key, a PEM private key, a JWT, or a URL with embedded credentials —
which the provider schema did **not** mark `sensitive`.

**What it is not:** a Terraform state scanner, a secrets-manager audit, or a
policy engine. It answers one narrow question per attribute — does this
unmarked value match a known secret shape — deterministically, from the plan
JSON you already have, with no model, no account, and no network call.

After using this, you can now **catch a missing `sensitive` flag in the same
CI run that generates the plan**, which used to take **a credential sitting
in plaintext in a CI log until someone happened to notice it, then rotating
it and figuring out everywhere the log had already been read.**

## Why this exists

`sensitive` in Terraform is a manual annotation a provider's schema author
has to remember to add to every attribute that can hold a secret. It is
documented, recurring failure: HashiCorp's own issue tracker carries multiple
separately-reported instances of a provider attribute printing a credential
in plaintext because the schema never marked it
(hashicorp/terraform#16554, #26185, #27577). `cloudposse-archives/tfmask` —
a community tool built to mask this exact class of leak by piping CI output
through regex substitution — is now archived, which means its userbase lost
its tool with nothing else filling the gap.

A missed flag does not just affect an interactive `terraform apply`. The same
plaintext value prints into whatever CI log captured the plan step, a bot's
pull-request comment, or a saved plan file shared to debug an issue — all
reaching a much wider audience than the apply itself ever would.

See [the docs page](why-terraform-plan-json-leaks-secrets.html) for how
`sensitive` actually works and exactly which four value shapes this checks.
Already run a general secret scanner like Gitleaks over your repo? See
[how this checker differs from Gitleaks](vs-gitleaks.html) — short version,
they catch different things and a CI pipeline commonly wants both.

## Try it without installing anything

[`index.html`](index.html) reads a plan file you load or paste entirely in
the browser, and reports every unmarked attribute matching a known secret
shape, redacted to the first and last four characters. No fetch happens from
the page itself, so nothing you load ever leaves your device.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the file you name — no
network call, ever.

```sh
terraform plan -out=tfplan && terraform show -json tfplan > plan.json
node cli.mjs check plan.json                    # human-readable; exits 1 if anything unmarked is found
node cli.mjs check plan.json --json
```

Wire it in right before whatever job applies the plan:

```yaml
- name: Check plan for unmarked secrets
  run: |
    terraform show -json tfplan > plan.json
    node cli.mjs check plan.json
```

**Scope, stated plainly.** This matches four fixed, high-confidence patterns
— AWS access key IDs, PEM private key headers, JWTs, and `user:pass@host`
URLs — against every attribute value Terraform's own `before_sensitive`/
`after_sensitive` maps did not already mark sensitive. It does not scan your
state file, does not read your provider's source, and cannot catch a secret
in a shape none of the four match. See the docs page for the full breakdown.

## Disclaimers

This tool reports pattern matches against unmarked values in the plan JSON
you supplied. It is **not** security, legal, or compliance advice, and it is
not a guarantee that a clean report means no secret is exposed anywhere in
your infrastructure. Verify and rotate any credential it flags, the same as
any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`, `file_loaded`) in `localStorage` only — never
transmitted, never tied to your plan or a specific secret. Do Not Track and
Global Privacy Control are honoured, and a button on the page turns it off
entirely. The CLI records nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The checking engine and
CLI are built and tested; no external user contact has happened yet — that is
the next, non-code step (see `kill_criteria` in `VENTURE.yaml`).
