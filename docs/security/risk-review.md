# Risk review instead of waiting for the owner

The owner, 2026-11-24: "i really don't like all this stuff that is blocking
itself on my behalf. not a good practice in general. can we instead have maybe
a review process on cysec and legal risks instead?"

Until then, any PR that touched agent instructions (`CLAUDE.md`, `prompts/`
and the rest) waited for the owner's approval (`.github/CODEOWNERS`). The
ruleset that would have enforced it was never applied, so in practice agents
blocked themselves. From 2026-11-24, **every PR gets a cyber and legal risk
review instead**, and the owner sees a change only when it carries real
liability.

## How a PR is reviewed

1. **Generate the checklist** from the branch's diff:

   ```
   python3 platform/security/risk_review.py            # vs origin/main
   python3 platform/security/risk_review.py --strict   # exit 1 on a likely secret
   ```

   It prints the cyber and legal checks the diff triggers, each with the
   files and the question to answer, and says whether the owner is needed.
2. **Answer each triggered check in the PR body** (a "Risk review" section;
   paste the script's output and tick or annotate each line). A check that
   turns up a problem is fixed before merge, like any failing test.
3. **Merge** when CI is green and every check is answered, unless the
   script says "Owner review needed". Then the PR waits for the owner, and
   the PR body says why in one line.
4. **Later, automatically:** the same script runs in CI as a required check,
   with an AI reviewer answering the questions and the scanners from the
   `sec-scan-pipeline` task (`portfolio/work/tasks.yaml`) beside it. Task
   `risk-review-ci`.

## What still goes to the owner

Only these. Everything else is the reviewing agent's judgment.

| Trigger | Why it is the owner's |
|---|---|
| A likely secret in an added line | Rotating a credential is an account action; the commit is public at once |
| The owner-only core changes (below) | A review cannot protect its own definition, and these files run with secrets or at session start |
| Lines removed or rewritten inside the guardrails (`prompts/goals.md`, "Guardrails"; `CLAUDE.md`, "Public repository" and "Judgment first") | These are the hard limits on financial, legal and ethical liability |
| A licence changed on existing code | Relicensing is the copyright holder's decision |
| Switching on live charging, accounts, cards, publishing under the portfolio's name | Hard limits, owner-only actions |

### The owner-only core

What `.github/CODEOWNERS` still lists, and why each is there:

- `.github/CODEOWNERS`, `.github/rulesets/`, `platform/ci/control_plane_guard.py`,
  `platform/ci/agent_review/`, `platform/security/risk_review.py`: these
  define the gate and the review. An agent that could edit them could switch
  the review off.
- `.github/workflows/` and `.github/actions/`: workflows hold the publishing,
  deploy and payment secrets. A workflow edit can leak a secret on its first
  run, before any review sees the result.
- `.claude/`, `.cursor/`, `.mcp.json`, `platform/agents/`: hooks, MCP servers
  and environment scripts run by themselves at the start of every session,
  before any agent decides anything.
- `portfolio/router/requirements.txt`: installed by a job that holds a write
  token.

These change rarely. Agent instructions (`CLAUDE.md`, `AGENTS.md`,
`prompt.md`, `prompts/`, `.github/prompts/`) are **not** in the core any
more: they go through the review. The checks and the guardrail trigger are
written for the main risk there, a prompt-injected agent steering later
sessions: does the change weaken a guardrail, widen what agents do without
the owner, or tell agents to fetch or trust outside content?

## The checks

The script holds the full list (`CHECKS` in `platform/security/risk_review.py`).
In short:

**Cyber:** agent instructions; CI workflows; code agents run on their own;
dependencies; infrastructure as code; auth, session and payment code; risky
sinks (eval, innerHTML, shell); new outbound hosts.

**Legal:** licence text; third-party code and data; personal data, tracking
and forms; marketing and trust claims; email sending and outreach (CAN-SPAM,
GDPR, PECR); regulated-advice surfaces and their disclaimers; pricing and
checkout.

## Limits

- The triggers are patterns over the diff. They find where to look, not
  whether something is wrong. The answer is the reviewer's.
- A prompt-injected agent can answer its own checklist dishonestly. The
  guards against that are the owner-only core (it cannot switch off the
  review or reach the secrets), the post-merge audit in
  `control_plane_guard.py`, and, once `risk-review-ci` lands, a reviewer that
  is not the PR's author.
