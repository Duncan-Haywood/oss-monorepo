# ADR 0006: Review tiers and autopilot gates

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The promise is to apply for grants on the org's behalf. But a submission is a public, binding act made
in the org's name. Reviewing every application section by section takes too much time for small
grants. Letting the system submit everything is reckless for large or high-likelihood ones, where
quality and relationships matter most. We need a predictable, explainable rule for how much human
attention each application gets, and the org has to control it.

## Decision

After verification, `stepRoute` calls the pure function `decideReviewTier()`
(`services/review/policy.ts`), which assigns one of three **review tiers**. The tier is stored on the
application with the human-readable reasons.

1. **`full_review`** (a person reviews section by section) if any of these is true: the ask is above
   `fullReviewAboveCents` (default $100k), the likelihood is at or above `highLikelihoodThreshold`
   (default 0.6), or a blocker flag is still open.
2. **`auto`** (submitted with no person involved) only if **every autopilot gate** passes:
   - autopilot is on for the org (`autopilotEnabled`, default **off**; turning it on records the
     `autopilot_submission` consent);
   - the ask is known and at or below `autoSubmitMaxCents` (default $10k);
   - the fit score is known and at or above `minFitScoreForAuto` (default 80);
   - the likelihood is known and below `highLikelihoodThreshold`;
   - it is not the org's first submission to this funder (when `reviewFirstSubmissionPerFunder`, default
     on);
   - the org has made fewer than `maxAutoSubmissionsPerMonth` auto submissions this month (default 5);
   - the grounding report `passed`, no blockers are open, and every cited fact is `confirmed`;
   - the funder's submission channel can be used without a person (today only email to a single safe
     address; Grants.gov always goes through the org's AOR on the `manual` channel).
3. **`one_click`** for everything else: a person sees the prepared package, the executive summary and
   the flags, and approves with one click (`POST /reviews/:applicationId/decision`).

Unknown values always fail their gate. If a reviewer requested changes, the revised draft is
downgraded from `auto` to `one_click`, so a person approves it again. The tier and its reasons are
stored on the application (`reviewTier`, `reviewTierReason`). The gates live in one pure, unit-tested function, and the
settings UI uses the same rules for its routing preview (`routes/org/settings/routing-preview.ts`).
Before routing, an application with open `missing_info` blockers goes to `needs_info` instead.

Autopilot *drafting* is separate. After scoring, `runAutopilotDrafting` drafts the top `autoDraftTopN`
matches (default 3; fit at least 60, at least 10 days to the deadline). Every draft still goes through
the tiers above.

## Consequences

- An org can explain every automatic submission: the reasons are stored on the application and written
  to `audit_log`.
- Most applications land in `one_click` until the org has confirmed facts, set an ask limit and submitted
  to a funder once. That is the intended slow start.
- Gates are conservative and add up. Loosening one (for example allowing auto submission for
  high-likelihood grants) needs an ADR update, not just a settings change.
- The policy runs in one place, so tests cover each gate (`review/policy.test.ts`).

## Alternatives considered

- **A person always approves.** The safest option, but it removes the autopilot value that small orgs
  need most. It remains the default, since autopilot is off.
- **One confidence score with a threshold.** Simpler to show, but opaque. People can't tell *why*
  something was auto-submitted, and one strong signal can hide a failed hard rule.
- **Learned routing from reviewer feedback.** Possible later, using `feedback` and outcomes. It would
  still sit underneath these hard gates.

## Amendment (2026-11-19): automation levels and safety rails

`org_settings.automationLevel` is a preset with per-stage overrides, resolved by
`resolveAutomation()` (`services/review/automation.ts`); `decideReviewTier` uses the result.

| Level | Auto-drafts | Auto-submits | Default checkpoints |
| --- | --- | --- | --- |
| `manual` | no | no | every draft gets a full review |
| `assisted` | no | no | one-click or full review |
| `prepared` (default) | top `autoDraftTopN` | no | a person approves every submission |
| `supervised` | yes | low-risk only (the gates above) | today's autopilot |
| `full` | yes | anything that passes the safety rails, within the monthly cap | amount, likelihood and fit thresholds do not apply |

Overrides (null = preset default): `requireMatchApproval` (only `shortlisted` matches are
auto-drafted), `requireFactConfirmation` (forced on at supervised/full), `requireDraftReview`
(forces `full_review`), `requireSubmissionApproval` (forced on below supervised),
`requireFollowupApproval` (no funder follow-ups are sent today), `twoPersonRuleAboveCents` (two
different approvers above the ask, counted on `reviews` by `services/approvals`). A row without a
level keeps its old behaviour: `autopilotEnabled` true → `supervised`, false → `prepared`.
PATCH /settings keeps `autopilotEnabled` in sync, so moving into or out of supervised/full records
the `autopilot_submission` consent (admin only).

**Safety rails** (`services/review/safety-rails.ts`) are not configurable and apply at every level.
Autopilot never submits when grounding did not pass, a blocker is open, a claim cites an unconfirmed
fact, the funder email is unverified, the `autopilot_submission` consent is not granted, the
deadline passed, a person edited the draft since the last approval, billing is not active, or a
source document behind a cited fact has an injection warning. They are applied at routing and again
from D1 right before any funder email sent without a person (`submitApplication`).
