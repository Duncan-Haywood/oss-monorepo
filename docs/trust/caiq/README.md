# CAIQ answer bank (for a possible CSA STAR Level 1 self-assessment)

**Status: draft answers. Nothing has been submitted to CSA or any registry.** Deciding whether to
submit is the owner's call (OWNER-CONFIRM.md §8).

## What the CAIQ is, and what could not be verified

The Consensus Assessments Initiative Questionnaire (CAIQ) is the Cloud Security Alliance's yes/no
questionnaire built on its Cloud Controls Matrix (CCM). A provider that fills it in can publish it on
the CSA STAR Registry as a **Level 1 self-assessment**. A self-assessment is a statement by us about
ourselves. It is not an audit or a certification, and must never be described as one.

The research step for this PR could not open CSA's pages (the session's network policy blocked them).
Search summaries, **not verified against CSA's own pages**, suggested:

- the current version is **CCM v4.1 / CAIQ v4.1** (released January 2026), with v4.0 still accepted
  for a transition period ending December 2027;
  candidate pages: https://cloudsecurityalliance.org/artifacts/star-level-1-security-questionnaire-caiq-v4-1
  and https://cloudsecurityalliance.org/blog/2026/02/19/ccm-v4-1-transition-timeline;
- CCM v4.1 has 17 domains; the question count was reported as 283;
- STAR submission: https://cloudsecurityalliance.org/star/self-assessment/ (fee and annual-update rule
  not found).

**Licence.** CSA's terms for the CCM/CAIQ could not be read. Until they are, this repository does
**not** reproduce CSA's question text or control wording. The answers below are written in our own
words, grouped by the 17 CCM domains (domain names as in CCM v4.0; confirm they are unchanged in
v4.1), and must be transferred into the official spreadsheet by hand after accepting CSA's terms on
its download page.

## How to use this

1. Download the official CAIQ (current version) from CSA and read its licence.
2. For each question, find the matching topic in [answers.md](answers.md) (same domain), and fill the
   spreadsheet's answer columns. CAIQ v4 has, per question: the yes/no/NA answer, the shared-
   responsibility owner (CSP-owned, CSC-owned, shared, or third-party outsourced), the CSP
   implementation description and the CSC responsibilities. *(Column names from CAIQ v4.0; check the
   v4.1 sheet.)*
3. Where a question asks for something not covered here, answer **No** or **NA** unless the code or
   an owner-confirmed fact supports Yes. Add the new topic to `answers.md` so the bank stays complete.
4. Every **Yes** below cites a file. Every answer that depends on an OWNER-CONFIRM item says so; do
   not answer Yes to it before the item is ticked.

## Scope

The answers describe **Grant Autopilot** (`apps/grants`), the live product, operated by Maris Stella
Labs LLC (Colorado), on Cloudflare. Differences for Seller Books are noted where they matter; a separate
submission per product would be needed if both were listed.
