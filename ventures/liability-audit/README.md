# Liability Audit

Find what in your app could cost you a fine, a chargeback or a surprise
bill, before a regulator, a customer or your cloud provider finds it.
Liability Audit reads your repository or built site and reports legal and
financial exposure. Each finding comes with evidence (file and line), the
rule or law behind it, and the fix.

```
node cli.mjs scan .                         # text report
node cli.mjs scan . --format md             # a PR comment
node cli.mjs scan . --format sarif > la.sarif   # GitHub code scanning
node cli.mjs scan . --fail-on high          # CI gate
node cli.mjs sweep apps                     # one row per app in a monorepo
node cli.mjs rules                          # every rule and why it exists
```

Browser page (pick a folder, nothing uploaded):
<https://duncan-haywood.github.io/monorepo-projects/liability-audit/>.
Node 18+, no dependencies, no network.

## What it checks

| Rule | Severity | Raised when |
|---|---|---|
| `secret-in-tree` | high | a live Stripe, Anthropic, OpenAI, Google, AWS, GitHub or Slack key, or a private key, is in a tracked file (masked in every report; fixtures and `.env.example` skipped) |
| `llm-endpoint-no-spend-control` | high | server code reads a provider key from the environment and serves requests, with no budget, rate limit or auth gate in sight |
| `tracker-without-consent` | high | Google Analytics/Tag Manager, Meta Pixel, Hotjar, Clarity, Segment, Mixpanel, TikTok, LinkedIn, Amplitude, PostHog or Heap with no consent manager |
| `personal-data-no-privacy-notice` | high | email/phone/name inputs or trackers, and no privacy notice anywhere |
| `subscription-no-renewal-terms` | high | subscription checkout code, and no page says it renews or how to cancel |
| `llm-call-no-output-cap` | medium | an LLM SDK call with no `max_tokens` or equivalent |
| `payments-no-terms` | medium | payment or login code, and no terms of service |
| `affiliate-links-no-disclosure` | medium | an affiliate link before any disclosure on the page |
| `ai-output-no-disclosure` | medium | LLM calls in a web app, and no page mentions AI |
| `advice-without-disclaimer` | medium | a tool page (has inputs) on tax, legal, medical or financial topics, with no "not advice" or no-warranty line |
| `cloud-no-budget-alarm` | medium | Terraform/OpenTofu for AWS, Google Cloud or Azure with no budget resource |
| `copyleft-dependency` | medium | a non-dev GPL/AGPL/SSPL package in `package-lock.json` (dual-licensed `OR` skipped) |
| `comparison-no-trademark-notice` | low | a page titled "X vs <Brand>" with no non-affiliation line |
| `no-license` | low | no LICENSE at the root (inherited from the monorepo root in `sweep`) |

To keep it quiet enough to leave on in CI, code samples in `<pre>`/`<code>`
and Markdown fences, regex pattern lines, comments and strings are read as
documentation, not as integration.

## Why use this

What a small team has today: a lawyer (expensive, and not continuous);
hosted website scanners and privacy-compliance platforms (paid, and they see
the live site, not the code); single-topic checkers (one rule, one file); or
nothing.

What this does differently:

- **It reads the repository**, so it catches an issue in the PR that
  introduces it: a subscription checkout, a pixel, an LLM endpoint.
- **Legal and financial exposure in one report.** A leaked key or an open
  LLM endpoint lands on the owner the same way a fine does.
- **Evidence, not verdicts.** Every finding names a file and line, and the
  report says what the rule cannot see.
- **It runs with agents.** [`AGENT.md`](AGENT.md) is a playbook for an AI
  coding agent: scan, triage each finding against the code, fix the clear
  ones, bring the judgment calls (secrets, policies, licences, checkout) to
  a person.

## What we found on our own projects

On 2026-10-16 a `sweep` over this repository read 1,274 product directories
and 506 research projects in about 14 seconds:

- **Products:** 4 low findings (comparison pages naming a product with no
  non-affiliation line).
- **Deploy templates:** `platform/deploy/templates/{aws,gcp,azure}` deploy
  into a stranger's cloud account and declared no budget alarm. That is the
  exposure `cloud-no-budget-alarm` exists for. The same change fixed it:
  each template now takes an optional alert address (a billing account on
  Google Cloud) and creates a monthly budget that warns at 80% of actual
  and 100% of forecast spend.
- **Tuning:** the first version raised 153 findings, nearly all false. The
  causes were generic "vs" titles, "register for GST?" read as a sign-up,
  scanner pattern lists read as LLM calls, and API-key password boxes read
  as logins. Each one is now a test.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial or security
advice, and it does not replace a qualified professional. It
pattern-matches files: it can miss problems and flag non-problems, and a
clear report is not a finding that anything is lawful. **You are
responsible for reviewing and verifying its output before relying on it**,
and for your own compliance. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

## Privacy

The browser page reads the folder or text you choose in your own browser.
Nothing is uploaded, and there are no accounts, cookies or analytics
vendors. It counts two anonymous feature events in local storage, and you
can switch that off on the page. The CLI reads local files and makes no
network request. Secrets it finds are masked in every output format.

## Tests

```
node --test audit.test.mjs cli.test.mjs page.test.mjs
```

## Licence

MIT. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
Roadmap: [`ROADMAP.md`](ROADMAP.md).
