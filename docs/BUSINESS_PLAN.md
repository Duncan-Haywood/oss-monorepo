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
- Optional native Mac volume metadata handoff so route recommendations can use
  real removable/read-only/capacity facts while remaining advisory, plus typed
  macOS metadata filtering for ejectable, network, and system-volume cases before
  route review.
- Safe ingest with checksums and immutable manifests.
- Read-only post-ingest production reports that show asset counts, planned
  parallel work, and IG deliverables before downstream jobs write artifacts.
- A single card-dump workflow command that ties route discovery, capacity
  gating, ingest preview, optional confirmed copy, and post-ingest production
  reporting together for Mac app shells and demos.
- A workspace index handoff that summarizes trusted artifacts and review state
  for Mac app shells, background agents, and continuation runs without granting
  new media-write or deletion authority.
- A public demo-workspace CLI command that creates a tiny trusted render-task
  handoff for Mac UI shells, launch-agent smoke tests, GTM demos, and
  continuation agents.
- Parallelized analysis and grading plan contracts.
- Deterministic reel/carousel/photo-set assembly contracts.
- A `write-render-tasks` CLI handoff that turns trusted storyline selections and
  graded artifacts into `deliverables/render_tasks.json` from the manifest-backed
  production plan, while refusing to overwrite a different existing handoff.
- Safe render-status initialization plus dry-run worker scheduler/status
  reporting for resumable pipelines.
- Read-only render-workspace inspection that tells a Mac app, launch agent, or
  continuation automation whether to initialize, schedule, review blocked or
  retryable work, or review deliverables without mutating files.

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

## 6.1) Unit-economics guardrails (working assumptions)

Use pricing and packaging that stays obviously ROI-positive for the pro ICP:

- If a customer saves even 6-10 hours/week, price can be anchored against
  recovered billable time and reduced editor coordination.
- For customers currently spending $100-$1,000+/week on editing/coordination,
  software pricing should target a clear fraction of that spend, while proving
  better throughput and consistency.
- Optional compute add-ons should be margin-protected and transparent; local-first
  defaults reduce cloud cost volatility and preserve trust with large datasets.

## 6.2) Validation experiments before broad scale

Run practical experiments tied to this ICP-first plan:

1. **Workflow proof demos:** show end-to-end "card dump -> graded social draft"
   with concrete turnaround deltas and safety notes.
2. **Instagram demand tests:** short-form before/after process ads targeted to
   wedding/event/photo-video professionals.
3. **Problem-interview loop:** weekly interviews with active pros to validate
   top blockers (ingest risk, quality consistency, revision overhead).
4. **Pilot cohort pricing tests:** test one base plan + one pro plan + optional
   burst compute credits with usage telemetry.
5. **Quality confidence metric:** track how often users accept default selects/
   grades/deliverables vs requiring manual intervention.

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

1. Build the SwiftUI/menu-bar approval layer around the mounted-volume
   discovery, native metadata handoff, safe route recommendation, and ingest
   assistant flow. The
   `plan-import-route` + `preview-ingest` + `execute-ingest --confirm` CLI
   commands now expose the full operator-review-then-copy path, and
   `plan-production` exposes the next read-only post-ingest summary. The new
   `card-dump-workflow` command combines those steps into one native-shell
   contract and accepts native volume metadata JSON, so the next step is binding
   it to an approval screen before AI/color work starts.
2. Extend the post-ingest report toward a full card-dump demo. The render-task
   half now exists in both `shootflow.demo_workspace`, the public
   `create-demo-workspace` CLI command, and the real `write-render-tasks` CLI
   handoff; next, connect `card-dump-workflow` with trusted storyline/graded
   fixtures so one smoke path runs from detected card to persisted render tasks,
   status initialization, scheduler report, and reviewable outputs.
   `inspect-render-workspace` should be the read-only render state probe for
   that path, while `index-workspace` remains the broader UI/agent shoot-state
   snapshot.
3. Add real renderer adapter shape (still honoring no-delete/no-overwrite rules).
4. Build a minimal review loop UI contract (approve, retry, tweak grade intent).
5. Instrument key product metrics at scheduler/report boundaries.
6. Start proof-based GTM content showing real workflows and outcomes.
