# ShootFlow Business Plan (Working Draft)

This is a practical operating plan for turning ShootFlow from a personal tool
into a viable software business for high-volume photographers/videographers.

## 1) Core problem and value

Target users are spending either:

- direct time (roughly 10-20 hours/week) on ingest, culling, color consistency,
  and social packaging, or
- direct money ($100-$1,000+/week) on outsourced editing and coordination.

ShootFlow's value proposition:

- Reduce time spent on repetitive post-production operations.
- Increase weekly content throughput (reels, carousels, graded photo sets).
- Preserve quality and consistency through deterministic scene/look pipelines.
- Reduce operational risk with non-destructive ingest and explicit manifests.

## 2) Initial ICP and wedge

## Initial ICP (v1)

Professional photographers/videographers and small studios with recurring
client delivery pressure:

- wedding/event teams,
- portrait/editorial studios,
- real-estate/media teams with recurring weekly turnaround.

## Wedge

"Card dump to organized, graded, IG-ready draft package with safety guarantees."

Why this wedge wins:

- It solves operational pain before perfect AI creativity is required.
- It is measurable (hours saved, faster turnaround, more deliverables/week).
- It differentiates against pure editing tools that ignore ingest/file safety.

## 3) Product scope by phase

## Phase 1: trusted automation core (current direction)

- SD/SSD/local source discovery and route recommendation.
- Safe ingest with checksums and immutable manifests.
- Parallelized analysis and grading plan contracts.
- Deterministic reel/carousel/photo-set assembly contracts.
- Dry-run worker scheduler/status reporting for resumable pipelines.

## Phase 2: productionized deliverables

- Real renderer adapters (ffmpeg/Core Image/Metal/Resolve workflows).
- Visual review UI for selects, grade feedback, and retry controls.
- Better look transfer and style consistency controls.

## Phase 3: workflow expansion

- iPhone companion (review, approve, annotate, publish prep).
- Team workflows, client approvals, and shared review artifacts.
- Optional burst compute add-ons for speed-sensitive jobs.

## 4) Monetization model

Use hybrid subscription + usage:

- **Starter / Solo:** local-first ingestion + baseline automation.
- **Pro:** higher throughput, stronger preset/look controls, collaboration.
- **Usage Boost:** optional accelerated processing/render credits for
  exceptionally large jobs.

Pricing anchor should be ROI vs:

- editor spend replaced/reduced,
- hours reclaimed per week,
- faster client turnaround and higher retained capacity.

## 5) Go-to-market plan

## Channel strategy

- **Primary:** Instagram-native demand capture (short demos of workflow speed,
  quality consistency, and output volume).
- **Secondary:** creator/photo education partners and professional communities.
- **Direct outreach:** targeted outreach to studio owners and high-volume
  freelancers.

## Messaging strategy

Lead with proof:

1. "No destructive ingest."
2. "Deterministic workflow with resumable jobs."
3. "More deliverables per week from the same footage."
4. "Hours saved and turnaround reduced."

Avoid guarantees:

- no guaranteed virality claims,
- no guaranteed revenue outcomes,
- no "one-click perfect edit" promises.

## 6) Success metrics

Track product and business metrics together:

- median ingest-to-first-draft time,
- median hours saved/user/week (self-reported + modeled),
- deliverables generated per shoot,
- manual intervention rate per 100 tasks,
- paid conversion from trial,
- retention at 30/90 days,
- expansion (seat upgrades or usage add-ons).

## 7) Key risks and mitigations

- **Risk:** perceived output quality is inconsistent.
  - **Mitigation:** prioritize deterministic scene/look consistency controls and
    review loops before broad generative features.
- **Risk:** trust breaks due to file safety concern.
  - **Mitigation:** preserve strict no-delete/no-overwrite rules and make safety
    evidence visible in UI and docs.
- **Risk:** support load from too-broad audience early.
  - **Mitigation:** enforce clear ICP focus on pro recurring workflows first.
- **Risk:** cloud cost creep for heavy jobs.
  - **Mitigation:** keep local-first default and meter optional burst compute.

## 8) Execution priorities for next iteration

1. Finish native Mac metadata and UI approval around the safe route recommendation + ingest assistant flow.
2. Add real renderer adapter shape (still honoring no-delete/no-overwrite rules).
3. Build a minimal review loop UI contract (approve, retry, tweak grade intent).
4. Instrument key product metrics at scheduler/report boundaries.
5. Start proof-based GTM content showing real workflows and outcomes.
