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

## No owner review: threats get controls instead

Later the same day the owner went further: "we want to avoid that generally
unless it is really human dependent ... move to systems that remove human
review as much as possible"; "any things that need human review on a general
basis should generally not be the case ... the threats and risks ...
identified and ... a thorough assurance system to avoid those risks"; and "I
don't need to review. just be extra careful for adversarial changes."

So nothing in a PR waits for a person. The owner is needed only for what a
person must physically or legally do (an account signup, a card, a secret
value only they hold), never to read a diff. Note that agent PRs are opened
under the owner's own GitHub identity, and GitHub does not let anyone approve
their own PR, so the old approval gate could never have been satisfied for
them anyway.

## How a PR is reviewed

1. **Locally**, before opening the PR:

   ```
   python3 platform/security/risk_review.py            # vs origin/main
   ```

   Paste its output into the PR body as a "Risk review" section and answer
   each triggered check (tick or annotate). Fix whatever a check turns up.
2. **In CI**, the required `risk-review` check
   (`.github/workflows/priv-risk-review.yml`) runs **main's** copy of the
   script over the PR's diff with `--gate`. It fails on anything in the
   "Blocked" list below. There is no approval that overrides it: fix the PR.
3. **After merge**, `control_plane_guard.py --audit-commit` fails the run on
   `main` if a commit touched a sensitive file without a passing `risk-review`
   check from main's workflow (an admin bypass, or a faked check).

## Threats and controls

The adversary we design for: an agent session that has been prompt-injected
(by a web page, an issue, a fork PR, a tool result) or is simply wrong, and
that can push branches and open and merge PRs under the owner's identity.

| Threat | Control (automatic) | Evidence |
|---|---|---|
| A PR weakens the reviewer, then a later PR walks through | CI runs main's reviewer (`pull_request_target`, base checkout), never the PR's. Changes to the gate's own files (`GATE_PATHS`) may only add: dropping an owned path, ruleset rule, required check, secret pattern, check id, protected section or workflow anchor is blocked | `risk-review` check; `test_risk_review.py` |
| A PR fakes the required check with a same-named job | `ci_policy_check.py` refuses unprivileged jobs named like a required check; the post-merge audit only accepts `risk-review` from `priv-risk-review.yml` on `pull_request_target` | `ci-policy` check; `control_plane_guard.py --audit-commit` |
| The review runs attacker code | The PR's commits are fetched as git objects and diffed; never checked out, imported or executed. Token is `contents: read`, no secrets, `python3 -I` | the workflow file |
| A secret is committed | Blocked (`SECRET_PATTERNS`); rotate it, since the push already published it | `risk-review` check |
| Guardrails or hard limits are cut (legal, financial, ethical liability) | Protected sections are append-only; any removed line inside them is blocked | `risk-review` check |
| Existing code is relicensed to something not chosen | Changing an existing licence is blocked unless the new text is in `ALLOWED_LICENCES` (MIT, FSL-1.1-MIT) | `risk-review` check |
| A workflow exfiltrates a secret on its first run (before any review) | Owner approval never stopped this: a same-repo PR's workflow runs with secrets before merge. The real control is moving secrets out of GitHub into AWS Secrets Manager behind OIDC roles only `main` can assume (task `secrets-to-aws`); meanwhile `ci_policy_check.py` keeps unprivileged workflows secret-free | `ci-policy` check |
| Agent instructions are steered (later sessions told to fetch or trust outside content, widen their powers) | The `C-instructions` check on every such PR, answered in the PR body; guardrails append-only | PR body; `risk-review` |
| Hooks / MCP config run code at session start | Reported as **sensitive** for the hardest look; `C-autorun` check | PR body |

**Sensitive files** are everything `.github/CODEOWNERS` lists. CODEOWNERS no
longer means "owner approval" (the ruleset's `require_code_owner_review` is
off); it is the list of files that get the closest review, and the post-merge
audit.

**What is left for a person** is in `python3 portfolio/ledger/decision_queue.py`
and is limited to account signups, cards and bank details, secret values only
the owner holds, and settings only a GitHub or cloud admin can apply (for
example importing `.github/rulesets/main.json` once).

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
  checklist is guidance; the controls that do not depend on its honesty are
  the blocked list, main's reviewer in CI, the post-merge audit, and next an
  AI reviewer that is not the PR's author (task `risk-review-ci`).
- The ruleset only enforces required checks once it is applied on GitHub
  (decision queue, `cloudflare-mail-and-ruleset`).
