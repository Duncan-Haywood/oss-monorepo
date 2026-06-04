/* eslint-disable */
// AUTO-GENERATED from docs/COMMERCIAL_VIABILITY_REPORT.html — do not edit by hand.
import { HtmlDoc } from "@/components/HtmlDoc";
import type { GeneratedHtmlDoc } from "@/lib/generated-html";

export const htmlDoc: GeneratedHtmlDoc = {
  slug: "commercial-viability-report",
  title: "ShootFlow — Commercial Viability Assessment",
  sourceFile: "COMMERCIAL_VIABILITY_REPORT.html",
  styles: `:root {
      --bg: #0f1419;
      --surface: #1a2332;
      --surface2: #243044;
      --text: #e7ecf3;
      --muted: #8b9cb3;
      --accent: #3d9cf5;
      --green: #3dd68c;
      --amber: #f5b83d;
      --red: #f55d5d;
      --border: #2d3d52;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      font-size: 16px;
    }
    .wrap { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    h1 { font-size: 1.75rem; font-weight: 650; margin: 0 0 0.5rem; letter-spacing: -0.02em; }
    .meta { color: var(--muted); font-size: 0.9rem; }
    h2 {
      font-size: 1.25rem;
      margin: 2.5rem 0 1rem;
      color: var(--accent);
      font-weight: 600;
    }
    h3 { font-size: 1.05rem; margin: 1.5rem 0 0.75rem; color: var(--text); }
    p { margin: 0.75rem 0; }
    .verdict {
      background: linear-gradient(135deg, #1e3a5f 0%, var(--surface) 60%);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem 1.75rem;
      margin: 1.5rem 0;
    }
    .verdict-score {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--amber);
      line-height: 1.2;
    }
    .verdict-label { font-size: 1.1rem; color: var(--muted); margin-top: 0.25rem; }
    .pill {
      display: inline-block;
      padding: 0.2rem 0.65rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      margin-right: 0.35rem;
      margin-bottom: 0.35rem;
    }
    .pill-high { background: rgba(61, 214, 140, 0.2); color: var(--green); }
    .pill-mid { background: rgba(245, 184, 61, 0.2); color: var(--amber); }
    .pill-low { background: rgba(245, 93, 93, 0.2); color: var(--red); }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
      margin: 1rem 0;
    }
    th, td {
      border: 1px solid var(--border);
      padding: 0.65rem 0.85rem;
      text-align: left;
      vertical-align: top;
    }
    th { background: var(--surface2); color: var(--muted); font-weight: 600; }
    tr:nth-child(even) td { background: rgba(26, 35, 50, 0.5); }
    .score-bar {
      height: 8px;
      background: var(--surface2);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 0.35rem;
    }
    .score-fill { height: 100%; border-radius: 4px; }
    ul, ol { margin: 0.5rem 0 1rem; padding-left: 1.4rem; }
    li { margin: 0.35rem 0; }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin: 1rem 0;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1.1rem;
    }
    .card strong { display: block; font-size: 1.4rem; color: var(--accent); }
    .card span { font-size: 0.85rem; color: var(--muted); }
    .risk { border-left: 3px solid var(--red); padding-left: 1rem; margin: 1rem 0; }
    .opportunity { border-left: 3px solid var(--green); padding-left: 1rem; margin: 1rem 0; }
    .footnote {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      font-size: 0.85rem;
      color: var(--muted);
    }
    code { background: var(--surface2); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.88em; }
    .mermaid-note { font-style: italic; color: var(--muted); font-size: 0.9rem; }`,
  bodyHtml: `<div class="wrap">
    <header>
      <h1>ShootFlow — Commercial Viability Assessment</h1>
      <p class="meta">Generated: 3 June 2026 · Repository snapshot · 438 passing tests · ~40k lines Python (src + tests)</p>
    </header>

    <section class="verdict" aria-labelledby="executive-summary">
      <h2 id="executive-summary" style="margin-top:0;border:none;color:inherit;">Executive summary</h2>
      <p class="verdict-score">52 / 100</p>
      <p class="verdict-label">Conditional pursue — strong foundation, not yet a business</p>
      <p>
        ShootFlow addresses a <strong>real, paid pain</strong> (10–20 hours/week or $100–$1,000+/week on editing and ops)
        with unusually mature <strong>workflow engineering</strong> for an early-stage tool. Commercial viability as a
        <em>profitable, scalable software company</em> is <strong>plausible but unproven</strong>: revenue depends on shipping
        a Mac product, real media quality (not deterministic stand-ins), and winning trust in a crowded AI-editing market.
      </p>
      <p>
        <span class="pill pill-high">Problem / ICP: strong</span>
        <span class="pill pill-high">Engineering discipline: strong</span>
        <span class="pill pill-mid">Differentiation thesis: credible</span>
        <span class="pill pill-low">Shippable product: weak</span>
        <span class="pill pill-low">Revenue infrastructure: none</span>
        <span class="pill pill-low">Output quality proof: none</span>
      </p>
    </section>

    <h2>1. What ShootFlow is today</h2>
    <p>
      ShootFlow is a <strong>stdlib-only Python workflow engine</strong> for photographers and videographers: safe ingest,
      manifest-backed production planning, resumable job orchestration, Instagram-oriented deliverable contracts, and
      read-only pilot analytics. It is explicitly an <strong>early-stage personal tool and product concept</strong> — not
      a launched SaaS or desktop app.
    </p>
    <div class="card-grid">
      <div class="card"><strong>31</strong><span>Python modules in <code>src/shootflow</code></span></div>
      <div class="card"><strong>22+</strong><span>CLI subcommands (ingest → production → render → pilot)</span></div>
      <div class="card"><strong>438</strong><span><code>unittest</code> tests, ~1:1 test-to-source ratio</span></div>
      <div class="card"><strong>0</strong><span>Third-party dependencies; no billing, auth, or UI</span></div>
    </div>
    <p>
      <strong>Built and tested:</strong> checksum ingest, storage discovery, production/render schedulers with leases and
      compare-write safety, workflow authority (observe-only handoffs), workspace health/index, pilot dashboard/cohort/brief,
      card-dump workflow for native shell integration.
    </p>
    <p>
      <strong>Not built:</strong> SwiftUI/Mac app, real ffmpeg/Metal/VLM workers, visual review UI, payments, cloud workers,
      iPhone companion, LICENSE file. All production adapters except byte-copy proxy are <strong>deterministic stand-ins</strong>;
      render has only <code>dry-run-local</code>.
    </p>

    <h2>2. Market and customer viability</h2>
    <h3>Initial customer (ICP)</h3>
    <p>
      Documented primary ICP: professional photographers/videographers and small studios with <strong>recurring client
      delivery</strong> (weddings, events, portrait/editorial, real-estate media). These buyers already spend money and
      time weekly — a prerequisite for B2B-style software ROI.
    </p>
    <table>
      <thead>
        <tr><th>Signal</th><th>Assessment</th><th>Score (1–10)</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Pain frequency &amp; willingness to pay</td>
          <td>Weekly batches; editor spend and overtime are well documented in internal strategy docs.</td>
          <td>8</td>
        </tr>
        <tr>
          <td>Measurable value proposition</td>
          <td>Hours saved, deliverables/week, turnaround — easier to sell than “viral reels.”</td>
          <td>8</td>
        </tr>
        <tr>
          <td>Market size (service pros)</td>
          <td>Large global base; fragmented, competitive, price-sensitive at low end.</td>
          <td>6</td>
        </tr>
        <tr>
          <td>Instagram/social packaging demand</td>
          <td>Real for creators; pros often still delegate social cuts — wedge must stay ops-first.</td>
          <td>7</td>
        </tr>
      </tbody>
    </table>

    <h3>Wedge positioning</h3>
    <p class="opportunity">
      <strong>Winning wedge (documented):</strong> “Card dump → organized, graded, IG-ready <em>draft</em> package with safety
      guarantees” — operational throughput before perfect AI creativity. This is strategically sound: it competes on
      trust and workflow, not only on model quality.
    </p>
    <p>
      Risk: buyers may still judge the product primarily on <strong>grade and reel quality</strong>, where Aftershoot,
      Imagen AI, and Lightroom-centric tools already market heavily. ShootFlow must not over-promise “one-click perfect edit”
      (correctly avoided in docs).
    </p>

    <h2>3. Competitive landscape</h2>
    <table>
      <thead>
        <tr>
          <th>Competitor / category</th>
          <th>Strength vs ShootFlow</th>
          <th>ShootFlow counter</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Aftershoot</strong> (cull + edit + retouch, offline, flat ~$40–60/mo)</td>
          <td>Shipped desktop app, style learning, unlimited volume, strong wedding/event fit.</td>
          <td>End-to-end ingest safety, manifests, IG package orchestration, video/reel pipeline intent.</td>
        </tr>
        <tr>
          <td><strong>Imagen AI</strong> (Lightroom, per-image cloud)</td>
          <td>Proven color consistency in LR; established pay-per-image economics.</td>
          <td>Non-destructive ingest-first; multi-deliverable assembly; local-default privacy story.</td>
        </tr>
        <tr>
          <td><strong>Lightroom / Capture One / DaVinci</strong></td>
          <td>Category incumbents; entrenched workflows and trust.</td>
          <td>Automation layer and social packaging — “remove boring ops,” not replace NLE.</td>
        </tr>
        <tr>
          <td><strong>Generic AI editors</strong> (CapCut-class, cloud reels)</td>
          <td>Faster time-to-cool demo; lower price.</td>
          <td>Pro safety, resumable jobs, audit trails — enterprise/studio trust angle.</td>
        </tr>
        <tr>
          <td><strong>Editors / agencies</strong> (human)</td>
          <td>Quality and relationships.</td>
          <td>Reduce coordination and prep; handoff packages for editors.</td>
        </tr>
      </tbody>
    </table>
    <p>
      <strong>Competitive verdict:</strong> The market is <strong>not empty</strong>. ShootFlow’s documented differentiation
      (media safety, parallel job graph, scene-before-grade coherence, archive-aware pipeline) is <strong>meaningful for
      studios</strong> but is <strong>not yet demonstrable in output quality</strong> because stand-in adapters do not
      produce client-ready media. Until real grading and reel export exist, competitors with shipped apps hold distribution
      and proof advantage.
    </p>

    <h2>4. Product &amp; technical readiness</h2>
    <table>
      <thead>
        <tr><th>Dimension</th><th>Evidence</th><th>Score</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Workflow / orchestration moat</td>
          <td>Fingerprint-bound manifests, adapter capabilities, lease-aware schedulers, <code>workflow_authority</code>, schema versioning.</td>
          <td>9</td>
        </tr>
        <tr>
          <td>Test &amp; safety culture</td>
          <td>438 tests; explicit no-delete/no-overwrite invariants; pilot thresholds (≥90% completion, ≤20% intervention).</td>
          <td>9</td>
        </tr>
        <tr>
          <td>GTM / pilot instrumentation</td>
          <td><code>pilot-dashboard</code>, cohort report/brief, demo fixtures without real media.</td>
          <td>7</td>
        </tr>
        <tr>
          <td>Native product surface</td>
          <td>CLI + JSON handoffs only; no Swift/Xcode; macOS metadata adapter is Python-side contract.</td>
          <td>2</td>
        </tr>
        <tr>
          <td>Real media pipeline</td>
          <td>Proxy byte-copy only; VLM/grade/story/package/render are deterministic probes.</td>
          <td>1</td>
        </tr>
        <tr>
          <td>Platform reach</td>
          <td>Linux/macOS (<code>fcntl</code>); Windows unsupported; iPhone Phase 3.</td>
          <td>4</td>
        </tr>
      </tbody>
    </table>

    <h3>Architecture maturity (strength)</h3>
    <p>
      The codebase treats <strong>trust boundaries</strong> as first-class: scheduler reports carry observe-only authority;
      pilot metrics cannot authorize file mutation; ingest requires explicit <code>--confirm</code>. For regulated or
      high-stakes wedding work, this is a credible long-term moat <em>if</em> paired with visible UI safety and counsel-reviewed terms
      (draft exists in <code>docs/TERMS_AND_CONDITIONS_DRAFT.md</code>).
    </p>

    <h3>Product gap (blocker)</h3>
    <p class="risk">
      <strong>Phase 2 is the business:</strong> real renderer adapters, review UI, look transfer. Without them, ShootFlow is
      an impressive <strong>integration prototype</strong>, not something pros will pay $30–80/month to run on every shoot.
    </p>

    <h2>5. Business model &amp; unit economics</h2>
    <p>Documented model: <strong>hybrid subscription + usage</strong> (Starter/Solo local-first, Pro collaboration/presets, Usage Boost for burst VLM/render).</p>
    <table>
      <thead>
        <tr><th>Element</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr><td>Pricing anchor vs editor spend</td><td>Well reasoned ($100–$1k/week → software as fraction of spend).</td></tr>
        <tr><td>ROI story (6–15 hrs/week saved)</td><td>Credible for pro ICP at $40–80/mo if quality holds.</td></tr>
        <tr><td>Implementation (Stripe, metering, license)</td><td><strong>None in repo.</strong></td></tr>
        <tr><td>Cloud COGS control</td><td>Local-first default; burst compute optional — good guardrail, unproven at scale.</td></tr>
        <tr><td>Support load</td><td>Docs correctly defer hobbyists; broad launch would inflate support.</td></tr>
      </tbody>
    </table>

    <h3>Illustrative unit economics (hypothetical)</h3>
    <p>Assumptions for a <strong>future</strong> Pro plan at <strong>$49/month</strong> after product exists:</p>
    <ul>
      <li><strong>Target:</strong> 500 paying pros → ~$294k ARR (before churn).</li>
      <li><strong>Variable cost:</strong> If 30% use hosted VLM/render heavily, cloud COGS could be $5–25/user/month without careful metering — margin risk.</li>
      <li><strong>CAC:</strong> Instagram/educator GTM is plausible for this niche; expect $50–200 blended CAC if demos convert; payback needs &lt;6 months at $49.</li>
      <li><strong>Break-even:</strong> Solo founder + contractors could reach operational break-even below 300–400 subs <em>if</em> support stays bounded to pro ICP — but only after Mac app + real pipeline ship.</li>
    </ul>
    <p>
      <strong>Verdict:</strong> Economics can work <strong>at pro price points and volume</strong>, aligned with Aftershoot-class
      pricing, but ShootFlow is <strong>pre-revenue by years of product work</strong>, not weeks of polish.
    </p>

    <h2>6. Scalability assessment</h2>
    <table>
      <thead>
        <tr><th>Scale dimension</th><th>Likelihood</th><th>Notes</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Technical (10k+ assets/shoot)</td>
          <td><span class="pill pill-mid">Medium</span></td>
          <td>Parallel job design supports scale; not load-tested; local disk and worker binding TBD.</td>
        </tr>
        <tr>
          <td>Team / multi-seat studios</td>
          <td><span class="pill pill-low">Low (now)</span></td>
          <td>Phase 3; no collaboration, client approvals, or shared presets in code.</td>
        </tr>
        <tr>
          <td>Geographic / platform</td>
          <td><span class="pill pill-mid">Medium</span></td>
          <td>Mac-first matches ICP; Windows omission limits some studios.</td>
        </tr>
        <tr>
          <td>Business (ARR &gt;$1M)</td>
          <td><span class="pill pill-mid">Conditional</span></td>
          <td>Requires category credibility, retention, and quality parity with incumbents on cull/grade at minimum.</td>
        </tr>
        <tr>
          <td>Business (ARR &gt;$10M)</td>
          <td><span class="pill pill-low">Uncertain</span></td>
          <td>Needs expansion beyond IG wedge or dominant studio workflow lock-in.</td>
        </tr>
      </tbody>
    </table>

    <h2>7. Risk register</h2>
    <table>
      <thead>
        <tr><th>Risk</th><th>Severity</th><th>Mitigation (in repo or recommended)</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Output quality fails vs Aftershoot/Imagen</td>
          <td>Critical</td>
          <td>Deterministic scene/look + human review loops; pilot intervention metrics (already defined).</td>
        </tr>
        <tr>
          <td>Trust incident (wrong drive, overwrite)</td>
          <td>Critical</td>
          <td>Strong invariants + UI surfacing; legal draft emphasizes advisory detection.</td>
        </tr>
        <tr>
          <td>Long build before revenue</td>
          <td>High</td>
          <td>Ship Mac ingest shell first; defer full AI stack; charge for ingest+organization early.</td>
        </tr>
        <tr>
          <td>Cloud cost creep</td>
          <td>Medium</td>
          <td>Local-default + transparent usage add-on (documented).</td>
        </tr>
        <tr>
          <td>Support explosion (wrong ICP)</td>
          <td>Medium</td>
          <td>Pro-first focus (documented).</td>
        </tr>
        <tr>
          <td>Commoditization of AI editing</td>
          <td>High</td>
          <td>Double down on safety + ops + multi-deliverable orchestration, not generic filters.</td>
        </tr>
        <tr>
          <td>No LICENSE / IP clarity</td>
          <td>Medium</td>
          <td>Add LICENSE before external contributors or commercial fork.</td>
        </tr>
      </tbody>
    </table>

    <h2>8. Composite scoring</h2>
    <table>
      <thead>
        <tr><th>Category</th><th>Weight</th><th>Score</th><th>Weighted</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Problem–solution fit (documented)</td>
          <td>15%</td>
          <td>8.0</td>
          <td>1.20</td>
        </tr>
        <tr>
          <td>Market attractiveness</td>
          <td>10%</td>
          <td>6.5</td>
          <td>0.65</td>
        </tr>
        <tr>
          <td>Competitive position (today)</td>
          <td>15%</td>
          <td>4.0</td>
          <td>0.60</td>
        </tr>
        <tr>
          <td>Technical / workflow moat</td>
          <td>20%</td>
          <td>8.5</td>
          <td>1.70</td>
        </tr>
        <tr>
          <td>Shippable product readiness</td>
          <td>25%</td>
          <td>2.5</td>
          <td>0.63</td>
        </tr>
        <tr>
          <td>Monetization &amp; GTM readiness</td>
          <td>10%</td>
          <td>5.0</td>
          <td>0.50</td>
        </tr>
        <tr>
          <td>Scalability path</td>
          <td>5%</td>
          <td>5.5</td>
          <td>0.28</td>
        </tr>
        <tr>
          <td><strong>Total</strong></td>
          <td>100%</td>
          <td>—</td>
          <td><strong>5.56 → 56/100</strong> (rounded 52–56 band)</td>
        </tr>
      </tbody>
    </table>
    <p class="mermaid-note">
      Interpretation: scores reflect <em>current repository state</em>, not founder execution ability. A team that ships Phase 2
      in 12–18 months could move “product readiness” from 2.5 → 7+ and lift composite into the low–mid 70s.
    </p>

    <h2>9. Is it worth pursuing?</h2>
    <p><strong>As a venture-scale bet today:</strong> No — insufficient product surface and no quality proof.</p>
    <p><strong>As a focused indie / studio SaaS bet:</strong> Yes, <em>conditionally</em>, if the team accepts:</p>
    <ol>
      <li>12–24 months to a paid Mac MVP with real ingest + at least one trusted grade/reel path.</li>
      <li>Validation via paid pilots (not demo fixtures) before broad marketing spend.</li>
      <li>Positioning as <strong>workflow infrastructure for high-volume pros</strong>, not another generic AI filter app.</li>
    </ol>
    <p>
      <strong>Walk-away signals:</strong> pilot intervention stays &gt;30% after real adapters; pros won’t pay for ingest-only;
      inability to match Aftershoot-class cull/grade on stills within one release cycle of launch.
    </p>

    <h2>10. Recommendations for a more successful business</h2>

    <h3>Priority A — Revenue-critical path</h3>
    <ol>
      <li>
        <strong>Ship a Mac menu-bar / SwiftUI shell</strong> around <code>card-dump-workflow</code>, <code>plan-import-route</code>,
        and <code>handoff-controls</code> — users pay for visible ingest safety, not Python CLI.
      </li>
      <li>
        <strong>Replace stand-ins incrementally:</strong> ffmpeg/Metal proxy → one real grade path (photo first) → one reel
        export path. Keep the same adapter boundaries already tested.
      </li>
      <li>
        <strong>Minimal review UI contract</strong> (approve / retry / tweak grade intent) — unlocks “draft package” wedge
        without full NLE.
      </li>
      <li>
        <strong>Paid pilot program</strong> (5–15 studios): use existing <code>pilot-dashboard</code> thresholds as contract
        SLAs; collect real intervention rates and turnaround deltas.
      </li>
    </ol>

    <h3>Priority B — Commercial infrastructure</h3>
    <ol start="5">
      <li>Add <strong>LICENSE</strong> (BSL or proprietary + API boundary) before partners or hires touch the repo.</li>
      <li>Implement <strong>telemetry opt-in</strong> aligned with pilot metrics (completion, intervention, materialized outputs) — no raw media upload by default.</li>
      <li>Launch with <strong>one plan + one upgrade</strong> (e.g. Solo $29, Pro $59) to avoid packaging paralysis.</li>
      <li>Counsel-review <code>TERMS_AND_CONDITIONS_DRAFT.md</code> before any card-ingest marketing claims.</li>
    </ol>

    <h3>Priority C — Differentiation &amp; retention</h3>
    <ol start="9">
      <li>
        <strong>Lightroom/DaVinci look import</strong> (documented bet) — reduces “new color science” risk vs training from scratch.
      </li>
      <li>
        <strong>Editor handoff packages</strong> (graded masters + storyline JSON + manifests) — B2B2editor channel, stickier than solo creators.
      </li>
      <li>
        <strong>Video parity narrative:</strong> competitors skew stills; ShootFlow’s multi-stage graph is differentiated if video proxies and reel assembly ship.
      </li>
      <li>
        <strong>Case studies over feature lists:</strong> hours saved, deliverables/week, zero card incidents — match documented GTM.
      </li>
    </ol>

    <h3>Priority D — De-risk scale</h3>
    <ol start="13">
      <li>Cap hosted compute with transparent **usage boost** pricing; never require cloud upload for core ingest.</li>
      <li>Hire or partner for **color science / ffmpeg** — Python orchestration is not the long pole; media fidelity is.</li>
      <li>Defer iPhone and team features until NPS &gt; 40 on Mac MVP cohort.</li>
      <li>Consider **integration partnerships** (Aftershoot export → ShootFlow package) before head-on stills editing competition.</li>
    </ol>

    <h2>11. Suggested validation roadmap</h2>
    <table>
      <thead>
        <tr><th>Stage</th><th>Gate</th><th>Success metric</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>0 — Now</td>
          <td>Internal demos only</td>
          <td>438 tests green; cohort demo explains safety + metrics.</td>
        </tr>
        <tr>
          <td>1 — Mac ingest MVP</td>
          <td>10 pros complete real card offload</td>
          <td>Zero destructive incidents; &lt;5 min to approved route.</td>
        </tr>
        <tr>
          <td>2 — Draft package MVP</td>
          <td>Real grade + 1 IG reel/carousel</td>
          <td>Pilot dashboard: ≥90% completion, ≤20% intervention on 3+ shoots.</td>
        </tr>
        <tr>
          <td>3 — Paid pilot</td>
          <td>15 studios × 8 weeks</td>
          <td>≥40% convert to annual; median 6+ hrs/week saved (self-report + logs).</td>
        </tr>
        <tr>
          <td>4 — GA</td>
          <td>Public Pro plan</td>
          <td>30-day retention ≥70%; support tickets &lt;0.5 per user/month.</td>
        </tr>
      </tbody>
    </table>

    <h2>12. Conclusion</h2>
    <p>
      ShootFlow is <strong>not a fantasy project</strong>: strategy docs, legal framing, pilot instrumentation, and workflow
      engineering are ahead of typical pre-seed repos. It is also <strong>not yet a business</strong>: no app, no real outputs,
      no payments, and fierce incumbents in AI culling/editing.
    </p>
    <p>
      <strong>Likelihood of becoming a profitable, scalable company:</strong> moderate if execution focuses on a narrow Mac
      pro wedge and ships real media quality within the existing contracts; low if the project remains a CLI orchestration
      layer without native UX and quality proof.
    </p>
    <p>
      <strong>Recommendation:</strong> Pursue as a <strong>capital-efficient, pro-studio workflow product</strong> with explicit
      kill criteria after paid pilots — not as a broad “AI editor for everyone” launch. The repository’s strongest commercial
      asset is <em>trustworthy automation contracts</em>; the weakest is <em>customer-visible value today</em>.
    </p>

    <p class="footnote">
      This report synthesizes repository artifacts (<code>README.md</code>, <code>docs/BUSINESS_PLAN.md</code>,
      <code>docs/PRODUCT_STRATEGY.md</code>, <code>docs/DESIGN_DECISIONS.md</code>, source modules, test suite) and
      public competitor positioning (Aftershoot, Imagen AI, 2025–2026 market summaries). It is analytical, not financial
      advice. Open in any browser: <code>docs/COMMERCIAL_VIABILITY_REPORT.html</code>.
    </p>
  </div>`,
};

export default function GeneratedHtmlPage() {
  return <HtmlDoc doc={htmlDoc} />;
}
