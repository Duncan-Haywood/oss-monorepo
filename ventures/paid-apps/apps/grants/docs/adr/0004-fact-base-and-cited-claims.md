# ADR 0004: Draft only from a fact base, with a citation on every factual claim

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

A grant application that states a false number, a partner that doesn't exist or an outcome that never
happened can cost an org its funder relationship, and in federal programs it can create legal liability.
This is the product's core risk. LLMs write fluent, plausible text whether or not their sources support
it. Asking a model to "write from these documents" doesn't let anyone see which sentence came from where.

## Decision

1. **The org's knowledge is stored as atomic facts** (`facts` table, `services/knowledge`). Each fact
   has:
   - a `category` and a one-sentence `statement`, plus an optional structured `value` (`FactValue`:
     number, unit, year) so numbers can be checked mechanically;
   - provenance: `sourceType` (`document` | `interview` | `user_entered` | `website`), the source
     document, chunk, interview or turn, and a verbatim `sourceQuote`;
   - a `status`: `proposed` (machine-extracted), `confirmed` (a person confirmed it), `rejected` or
     `superseded` (`supersededById`);
   - a `sensitivity`: `public` | `internal` | `restricted`.
   Extraction (`knowledge.extract_facts`, `knowledge.extract_interview_facts`) only *proposes* facts.
   Facts a person enters themselves (`POST /facts`) are confirmed automatically.
2. **The drafter receives facts, not documents.** `usableFacts()` drops `rejected`, `superseded` and
   `restricted` facts. Retrieved chunks from top-rated past applications are style examples only. They
   are never a source of claims.
3. **Drafts are structured.** `ApplicationContent` (`src/shared/content.ts`) is a list of sections, each
   a list of paragraphs, each a list of claims. Every claim is either:
   - `factual`: asserts something checkable and must list at least one fact id in `factIds`; or
   - `framing`: connective or persuasive language with no numbers, names, dates or outcomes.
4. **Gaps, not invention.** When the facts can't answer a funder's question, the drafter returns a
   `gap` (`{ question, why }`) for that section. Gaps become `missing_info` blocker flags and a gap-fill
   interview, and the application moves to `needs_info`.
5. **Proposed facts may be cited** (`org_settings.allowUnconfirmedFactsInDrafts`, default true), but
   every claim that cites one is flagged, and autopilot requires every cited fact to be `confirmed`
   (ADR 0006).

## Consequences

- Every sentence in a submitted package can be traced to a fact, and from the fact to a quote in a
  source. The UI can show the citation for each claim, and the grounding verifier has something concrete
  to check (ADR 0005).
- Drafts are only as good as the fact base. New orgs see more gaps at first, so onboarding (document
  upload, AI interview, the coverage checklist in `knowledge/checklist.ts`) exists to fill the fact
  base quickly.
- Prose is slightly stiffer, because the drafter can't add colour that the facts don't support.
- People have to confirm facts before autopilot can run, which costs an org some time once.
- Prompt caching works well: the fact list is a large, stable context block for each org
  (`drafting.section`).

## Alternatives considered

- **Plain RAG over document chunks with citations added afterwards.** Chunks are long and mix many
  assertions, so a citation shows only where a claim *might* come from. Checking numbers this way is
  unreliable.
- **Human-written templates with merge fields.** Zero fabrication risk, but this can't answer the
  funder-specific questions that RFPs ask. That is the work the product exists to do.
- **Fine-tuning on the org's past applications.** Costly, slow to update, and it remembers old numbers.
  It also puts tenant data into model weights, which our data-use policy forbids.
