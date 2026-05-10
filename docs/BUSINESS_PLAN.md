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
- Typed native macOS volume metadata handoff for more accurate ejectable,
  removable, read-only, network, and system-volume filtering before route review.
- Safe ingest with checksums and immutable manifests.
- Read-only post-ingest production reports that show asset counts, planned
  parallel work, and IG deliverables before downstream jobs write artifacts.
- A single card-dump workflow command that ties route discovery, capacity
  gating, ingest preview, optional confirmed copy, and post-ingest production
  reporting together for Mac app shells and demos, plus a synthetic
  card-dump-to-render smoke workspace that proves the same path without real
  media.
- Resumable `production_status.json` initialization for pre-render proxy,
  analysis, grading, storyline, and packaging work, bound to the verified
  manifest-backed production plan, plus a status-backed next-wave handoff so
  workers can resume from durable succeeded/running/failed/retryable state
  instead of trusting caller-reported completion lists.
- Production-worker action/status helpers that plan dependency-ready jobs from
  trusted status, claim a matching attempt, verify declared outputs before
  success, and report retry/failure without cleanup or deletion authority.
- A deterministic dry-run production adapter that persists claim and result
  transitions through `production_status.json`, writes only declared placeholder
  file outputs, and preserves directory-style package outputs or output
  conflicts as retryable review states before real proxy/VLM/color/story workers
  are introduced.
- A local metadata production adapter that uses the same claim/result boundary
  but reads trusted local inputs, records file size and SHA-256 metadata, and
  writes deterministic JSON only to declared output files. This creates a first
  real input-fingerprint path for proxy/analysis/color/story work without
  granting copy, overwrite, cleanup, deletion, or arbitrary materialization
  authority.
- A dry-run production scheduler/CLI command that advances trusted pre-render
  jobs from `production_status.json` with bounded parallelism, explicit
  complete/blocked/retryable/failed/waiting state, and no cleanup or deletion
  authority. Previously retryable jobs require an explicit reviewed retry ID
  before a background run will attempt them again. The scheduler can also expire
  stale running production leases through guarded compare/write preconditions,
  turning interrupted jobs into retryable review states while preserving
  heartbeat-refresh conflicts. Each run can persist a
  `production_scheduler_report.json` bound to the final production status so
  UI/agent layers can show completed outputs, retry conflicts, blocked work,
  expired leases, lease conflicts, and failure messages without rerunning
  orchestration. The report now also carries derived product metrics so pilot
  analytics can track throughput and intervention rate from the trusted handoff.
- A workspace health/index handoff that summarizes trusted artifacts and review
  state for Mac app shells, background agents, and continuation runs without
  granting new media-write or deletion authority. It now covers production
  status and production scheduler reports as well as render handoffs, so
  pre-render progress, retryable conflicts, blocked jobs, and next safe actions
  are visible without custom manifest parsing. Workspace health schema v4 and
  workspace index schema v2 carry the shared observe-only `workflow_authority`
  contract so native UI and agent layers can separate presentation/diagnostic
  state from permission to copy, retry, materialize, overwrite, clean up, or
  delete files.
- Schema v2 CLI handoff summaries/receipts for `plan-import-route`,
  `preview-ingest`, `execute-ingest`, `plan-production`,
  `next-production-wave`, `write-render-tasks`, `card-dump-workflow`,
  render-workspace inspection, and no-real-media demo creation. These payloads
  may include next actions or `agent_handoff` review hints, but write-capable
  next actions are command-free and the root `workflow_authority` object keeps
  them presentation-only until a separate explicit command invocation supplies
  its confirmation/runtime arguments.
- A read-only pilot dashboard contract that consumes workspace health and
  validated scheduler product metrics to show activation, throughput, and manual
  intervention signals without parsing raw worker internals or granting copy,
  retry, cleanup, overwrite, materialization, or deletion authority.
- A read-only pilot cohort report that aggregates saved dashboard JSON payloads
  into pilot-ready workspace rate, median intervention rate, and first-draft
  output count so pilot operations can measure activation quality without
  spreadsheets or raw worker-log parsing.
- A pilot cohort demo fixture that creates multiple trusted no-real-media demo
  workspaces, saves one pilot-dashboard JSON payload per workspace, and writes a
  saved `pilot_cohort_report.json` so GTM demos can show cohort readiness without
  spreadsheets, real customer media, or raw worker-log parsing.
- A pilot cohort brief contract that reads the saved cohort report and emits
  presentation-ready readiness/intervention/throughput labels for native shells
  and GTM demos without exposing workflow commands. Its optional text output gives
  demo shells a readable cohort view while JSON remains the default integration
  contract.
- Parallelized analysis and grading plan contracts.
- Deterministic reel/carousel/photo-set assembly contracts.
- A `write-render-tasks` CLI handoff that turns trusted storyline selections and
  graded artifacts into `deliverables/render_tasks.json` from the manifest-backed
  production plan, while refusing to overwrite a different existing handoff and
  emitting observe-only root authority on its handoff summary.
- Safe render-status initialization plus dry-run worker scheduler/status
  reporting for resumable pipelines.
- Read-only render-workspace inspection that tells a Mac app, launch agent, or
  continuation automation whether to initialize, schedule, review blocked or
  retryable work, or review deliverables without mutating files; the summary now
  carries the same root no-authority contract as workspace health.

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
- pilot-ready workspace rate from trusted dashboard thresholds (default: >=90%
  completion, <=20% manual intervention, and >=1 materialized output),
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
6. **Pilot readiness gate:** count a shoot as dashboard-ready only from the
   schema v2 `pilot_acceptance` payload, not from raw worker logs or manual
   spreadsheet interpretation.

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

1. Bind native Mac metadata and UI approval around the safe route recommendation
   and ingest assistant flow. The core now has both portable mounted-volume
   discovery and a typed macOS metadata adapter; the `plan-import-route` +
   `preview-ingest` + `execute-ingest --confirm` CLI commands expose the full
   operator-review-then-copy path, and `plan-production` exposes the next
   read-only post-ingest summary. The `card-dump-workflow` command combines
   those steps into one native-shell contract, so the next step is binding it to
   a SwiftUI/menu-bar approval screen before AI/color work starts.
2. Extend the post-ingest report toward native UI proof. The render-task half
   now exists in both `shootflow.demo_workspace` and the real
   `write-render-tasks` CLI handoff, and the synthetic card-dump demo now runs
   from detected card to checksum ingest, persisted render tasks, status
   initialization, scheduler report, and reviewable outputs. `index-workspace`
   provides the UI/agent state snapshot and `inspect-render-workspace` provides
   the safe read-only state probe before initialization and after scheduler runs.
3. Add real renderer adapter shape (still honoring no-delete/no-overwrite rules).
4. Build a minimal review loop UI contract (approve, retry, tweak grade intent).
5. Bind the pilot-dashboard contract into the future Mac UI, continuation
   dashboards, and GTM demos so throughput, manual intervention, lease conflicts,
   review-required rates, and schema v2 pilot-readiness thresholds become visible
   from trusted handoff metrics. Use the structured `workflow_authority` JSON
   block from dashboards, cohort reports, and cohort briefs as the native UI's
   first safety gate before exposing any adjacent file-changing controls.
6. Use the saved pilot cohort demo fixture for proof-based GTM content while
   real pilot workspaces are still scarce; the demo should show readiness
   thresholds and safety boundaries, not imply automatic publishing or cleanup.
7. Start proof-based GTM content showing real workflows and outcomes.
