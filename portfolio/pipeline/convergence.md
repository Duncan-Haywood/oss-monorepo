# What six independent screening passes agreed on

On 2026-08-18 the hourly agent fleet ran the same brief — AI-heavy or software,
no employees, low capital, low liability, agent-operable — six separate times.
Each run started from a fresh checkout with no knowledge of the others, and each
opened its own pull request: [#17](https://github.com/Duncan-Haywood/monorepo-projects/pull/17),
[#18](https://github.com/Duncan-Haywood/monorepo-projects/pull/18),
[#20](https://github.com/Duncan-Haywood/monorepo-projects/pull/20),
[#27](https://github.com/Duncan-Haywood/monorepo-projects/pull/27),
[#30](https://github.com/Duncan-Haywood/monorepo-projects/pull/30),
[#34](https://github.com/Duncan-Haywood/monorepo-projects/pull/34).

That was expensive duplication. It also produced, by accident, something a
single run could not: six independent samples of the same question. This file
records what they agreed on, because the agreement is worth more than any one
of the six write-ups.

## The archetypes, by how many runs found them

Thirty-six proposed candidates across six runs reduce to roughly nine
archetypes. Slug names differ; the businesses do not.

| Archetype | Runs | Example slugs |
|---|---|---|
| Accessibility conformance / remediation | 6 of 6 | `eaa-remediation-pipeline`, `a11y-regression-gate`, `accessibility-remediation-bot`, `accessibility-evidence-agent`, `accessibility-regression-guard`, `a11y-conformance-ci` |
| Public bid / tender / public-record monitoring | 5 of 6 | `tender-radar`, `public-bid-radar`, `public-bid-matchmaker`, `local-bid-radar`, `public-record-signal-feed` |
| Agent or MCP infrastructure | 5 of 6 | `agent-permission-harness`, `mcp-gateway-service`, `agent-ready-api-gateway`, `agent-ready-commerce`, `api-to-mcp-gateway` |
| Regulatory deadline / diff feed | 3 of 6 | `regulation-diff-feed`, `regulatory-deadline-feed`, `public-record-watch` |
| CRA / SBOM compliance evidence | 2 of 6 | `cra-evidence-desk`, `cra-sbom-autopilot` |
| MCP supply-chain security | 2 of 6 | `mcp-supply-chain-watch`, `mcp-supply-chain-scanner` |
| Dependency upgrade automation | 2 of 6 | `dependency-upgrade-agent`, `upgrade-migration-agent` |
| Documentation drift | 2 of 6 | `docs-debt-service`, `docs-drift-agent` |
| Singletons (one run each) | 1 of 6 | `einvoice-preflight`, `coi-compliance-tracker`, `repo-localization-agent`, `local-answer-visibility`, `token-margin-analytics`, `llm-feature-assurance`, `chatbot-disclosure-monitor`, `brand-watch-intelligence`, `multi-location-listing-guard` |

## What to read into that

**Convergence is evidence about the constraints, not about the market.** Six
runs sharing a brief and a training distribution will land in the same place;
that is close to a tautology and it is not market validation. What it does
establish is that the *constraint set* — no advice-of-record, no personal data,
no employees, low capital — admits a genuinely narrow space. Every archetype
above is some version of "watch a public or customer-supplied source, detect a
change, produce evidence." That is what survives when you remove every business
that needs a licence, a salesforce, or a balance sheet.

**Deadline-driven compliance dominates because it solves distribution, not
because it is a better business.** Four of the top five archetypes are
compliance-shaped. The reason is that a statutory date supplies urgency and a
price anchor without paid acquisition — which is precisely the resource this
portfolio lacks. The risk attached is equally consistent: every one of them sits
one positioning error away from advice-of-record liability, which is why the
gates in [README.md](README.md) are gates rather than weights.

**The singletons are where the disagreement is, and disagreement is
information.** Nine archetypes were found by exactly one run. Most were screened
out here on incumbents or distribution (see [screened-out.md](screened-out.md)),
but a candidate only one run found is not thereby worse — it is less
over-determined by the shared prior, and worth more scrutiny than a sixth
restatement of the accessibility idea.

**Nobody proposed a business with a customer.** All thirty-six candidates are
things that could be built. Not one was sourced from an existing conversation,
inbound request, or a customer of an existing venture. Six independent runs
reproduced the portfolio's actual bottleneck — distribution — rather than
addressing it, and four of the seven evaluated candidates in this directory score
4 or 5 on that dimension. The next unit of effort is worth more spent testing
one candidate against a real buyer than generating a tenth archetype.

## Cost note

Six runs producing one directory of usable output is the failure mode
[CLAUDE.md](../../CLAUDE.md) describes. Recorded in
[portfolio/ledger/2026-08.yaml](../ledger/2026-08.yaml) as wasted spend rather
than as six deliverables.
