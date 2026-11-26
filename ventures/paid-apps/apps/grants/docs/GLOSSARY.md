# Glossary

The domain terms used in the code, the UI and the docs. The enum values are defined in
`src/shared/enums.ts` and the content contracts in `src/shared/content.ts`.

## Knowledge

**Fact**
: One atomic, checkable statement about the org, a project or its context, such as "Served 412 families
  in Gallup in 2025." It is stored in `facts` with a `category`, an optional structured `value`
  (`FactValue`: number, unit, year), provenance (`sourceType`: `document` | `interview` |
  `user_entered` | `website`, plus the source document, chunk, interview or turn), a verbatim
  `sourceQuote`, a `status` and a `sensitivity`. Drafts may only assert what facts state (ADR 0004).
  The **fact base** is all of an org's facts.

**Proposed / confirmed** (fact status)
: `proposed` means the system extracted the fact and no person has checked it yet. Drafts may cite it
  (when `allowUnconfirmedFactsInDrafts` is on), but every such citation is flagged, and autopilot is
  blocked until it is confirmed. `confirmed` means a person confirmed it (or entered it themselves), so
  autopilot may use it. The other statuses are `rejected` (a person said it is wrong, so it is never
  used) and `superseded` (replaced by a newer fact through `supersededById`, never used).

**Sensitivity**
: `public` | `internal` | `restricted`. `restricted` facts, such as facts about individual clients, are
  never sent to drafting.

**Coverage**
: How well the fact base answers the topics funders usually ask about (`KNOWLEDGE_CHECKLIST`). Each
  topic is `missing`, `thin` or `good`. It is shown so the org knows what to upload or discuss in an
  interview.

## Drafting and verification

**Claim** (`factual` / `framing`)
: The smallest unit of a draft (`ApplicationContent` → section → paragraph → claim). A **factual**
  claim asserts something checkable and must cite at least one fact id (`factIds`). A **framing** claim
  is connective or persuasive language with no checkable assertion ("We welcome the opportunity
  to…"). It may contain no numbers, proper nouns, dates, outcomes or superlatives.

**Gap**
: A funder question the facts cannot answer. The drafter records it on the section
  (`{ question, why }`) instead of writing text. Every gap becomes a `missing_info` blocker and a
  gap-fill interview question, and the application moves to `needs_info` until someone answers.

**Flag** (`blocker` / `warning` / `info`)
: An issue on one version of an application (`application_flags`), with a `kind` (for example
  `unsupported_claim`, `numeric_mismatch`, `unconfirmed_fact`, `missing_info`, `restricted_data`,
  `length_limit`), a message and often a suggested question. A **blocker** has to be resolved by a
  person, or fixed by a redraft, before the application can be submitted. Any open blocker forces
  `full_review` and blocks autopilot. A **warning** is shown to reviewers but does not block. Some
  flags (`unconfirmed_fact`, partially supported or uncheckable claims) are blockers when the org has
  autopilot on and warnings otherwise. Flags are `open`, `resolved` or `dismissed`.

**Grounding report**
: The verifier's result for one application version (`GroundingReport`, stored on
  `application_versions.grounding_report`). It counts claims, supported, partially supported and
  unsupported claims, numeric mismatches, citations to unconfirmed facts and gaps, and it holds one
  `ClaimVerdict` per claim. `passed` is true only when there are zero unsupported claims, zero numeric
  mismatches and zero gaps. It is produced by the independent grounding verifier (ADR 0005).

**Application version**
: An immutable snapshot of a draft (`application_versions`). Every draft, edit or regeneration creates a
  new version and runs verification again.

## Routing and autopilot

**Review tier**
: How much human attention an application gets (`decideReviewTier`, ADR 0006). With **`auto`** the
  system submits it with no person involved. With **`one_click`** a person reviews the prepared
  package, summary and flags and approves with one click. With **`full_review`** a person reviews it
  section by section; this applies to large asks, high-likelihood grants and anything with open
  blockers.

**Autopilot gates**
: The conditions that must *all* hold for the `auto` tier: autopilot is on, the ask is known and at most
  `autoSubmitMaxCents`, fit is at least `minFitScoreForAuto`, likelihood is below
  `highLikelihoodThreshold`, it is not the first submission to the funder (if configured), the monthly
  auto-submission cap is not reached, grounding `passed`, there are zero open blockers, every cited fact
  is confirmed, and the funder's channel accepts automatic submission. A missing value fails its gate.
  Separately, **autopilot drafting** starts drafts for the top `autoDraftTopN` matches after scoring.

## Opportunities

**Opportunity**
: A grant from the global public catalog (Grants.gov or the sample catalog), or a private one an org
  imported (`private_to_org_id`). It has requirements (`OpportunityRequirements`) parsed from the RFP.

**Match** (fit / likelihood / expected value)
: One org's assessment of one opportunity (`opportunity_matches`). **Fit** (`fitScore`, 0–100) is how
  well the opportunity matches the org's mission, programs, population and geography. **Likelihood**
  (0–1) is a conservative, calibrated probability of an award if the org applies, capped by funder type.
  **Expected value** (`expectedValueCents`) is likelihood × suggested ask, used to rank matches and pick
  autopilot drafts. A match also has `eligibility`, reasons that cite facts, and a status (`new`,
  `shortlisted`, `dismissed`, `drafting`, `applied`).

## Submission

**Submission package**
: The exact, immutable record of what was submitted: the org's identity fields, the approved
  application version, the funder's requirements, the review tier and a grounding summary, stored as
  `orgs/{orgId}/submissions/{id}/package.json` (plus `package.md`) with its SHA-256 in
  `submissions.package_sha256`. It contains no generated text beyond the approved claims. It is sent by
  email, or submitted by the org itself on the `manual` channel (always used for Grants.gov) and then
  confirmed with an external reference.

**Follow-up**
: A tracked task tied to an application or submission (`followups`), of kind `deadline_reminder`,
  `status_check`, `report_due`, `thank_you`, `resubmission` or `custom`, with a due date and a status
  (`pending` | `done` | `skipped`). Each one is unique by `dedupeKey`. The cron sweep every 30 minutes
  (`followups.run_due`) emails the team when a follow-up is due.

## Privacy

**Consent scope**
: One thing a person agreed to, recorded append-only in `consent_records` with the policy version, time
  and a hashed IP: `terms_of_service`, `privacy_policy`, `data_processing`, `document_upload`,
  `website_crawl`, `ai_interview`, `voice_recording`, `autopilot_submission`. Org-level scopes
  (`data_processing`, `document_upload`, `website_crawl`, `voice_recording`, `autopilot_submission`)
  need admin+ and switch the matching setting on or off. Revoking `autopilot_submission` turns autopilot
  off.

**Tenant**
: An organization. Everything it owns hangs off `organization.id` (ADR 0003).
