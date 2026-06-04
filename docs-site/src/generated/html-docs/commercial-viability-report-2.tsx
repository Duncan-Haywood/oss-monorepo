/* eslint-disable */
// AUTO-GENERATED from docs/commercial-viability-report.html — do not edit by hand.
import { HtmlDoc } from "@/components/HtmlDoc";
import type { GeneratedHtmlDoc } from "@/lib/generated-html";

export const htmlDoc: GeneratedHtmlDoc = {
  slug: "commercial-viability-report-2",
  title: "ShootFlow Commercial Viability Assessment",
  sourceFile: "commercial-viability-report.html",
  styles: `:root {
      --bg: #0f1419;
      --surface: #1a2332;
      --surface-2: #243044;
      --text: #e7ecf3;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --accent-2: #818cf8;
      --green: #34d399;
      --yellow: #fbbf24;
      --orange: #fb923c;
      --red: #f87171;
      --border: #334155;
      --max-width: 980px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.65;
      font-size: 16px;
    }
    .hero {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #172554 100%);
      border-bottom: 1px solid var(--border);
      padding: 3rem 1.5rem 2.5rem;
    }
    .hero-inner, main { max-width: var(--max-width); margin: 0 auto; }
    h1 { font-size: 2.2rem; margin: 0 0 .5rem; letter-spacing: -.02em; }
    .subtitle { color: var(--muted); font-size: 1.05rem; max-width: 720px; }
    .meta { margin-top: 1.25rem; display: flex; flex-wrap: gap; gap: .75rem; font-size: .875rem; color: var(--muted); }
    .meta span { background: var(--surface); border: 1px solid var(--border); padding: .35rem .75rem; border-radius: 999px; }
    main { padding: 2rem 1.5rem 4rem; }
    h2 {
      font-size: 1.45rem;
      margin: 2.5rem 0 1rem;
      padding-bottom: .5rem;
      border-bottom: 1px solid var(--border);
      color: #f1f5f9;
    }
    h3 { font-size: 1.1rem; margin: 1.5rem 0 .75rem; color: #cbd5e1; }
    p { margin: 0 0 1rem; }
    a { color: var(--accent); }
    .verdict {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin: 1.5rem 0 2rem;
    }
    @media (max-width: 700px) { .verdict { grid-template-columns: 1fr; } }
    .verdict-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem 1.35rem;
    }
    .verdict-card.primary { border-color: #475569; background: linear-gradient(180deg, #1e293b, #172033); }
    .verdict-label { font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: .35rem; }
    .verdict-value { font-size: 1.75rem; font-weight: 700; }
    .verdict-value.moderate { color: var(--yellow); }
    .verdict-value.conditional { color: var(--orange); }
    .verdict-value.strong { color: var(--green); }
    .verdict-value.weak { color: var(--red); }
    .verdict-note { font-size: .9rem; color: var(--muted); margin-top: .5rem; }
    .callout {
      background: var(--surface);
      border-left: 4px solid var(--accent);
      padding: 1rem 1.25rem;
      border-radius: 0 8px 8px 0;
      margin: 1.25rem 0;
    }
    .callout.warn { border-left-color: var(--orange); }
    .callout.good { border-left-color: var(--green); }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0 1.5rem;
      font-size: .925rem;
    }
    th, td {
      border: 1px solid var(--border);
      padding: .65rem .8rem;
      text-align: left;
      vertical-align: top;
    }
    th { background: var(--surface-2); color: #e2e8f0; font-weight: 600; }
    tr:nth-child(even) td { background: rgba(255,255,255,.02); }
    .score-bar-wrap { margin: .35rem 0; }
    .score-bar {
      height: 8px;
      background: var(--surface-2);
      border-radius: 999px;
      overflow: hidden;
    }
    .score-bar > span {
      display: block;
      height: 100%;
      border-radius: 999px;
    }
    .score-num { font-weight: 700; font-variant-numeric: tabular-nums; }
    .pill {
      display: inline-block;
      padding: .15rem .55rem;
      border-radius: 999px;
      font-size: .75rem;
      font-weight: 600;
    }
    .pill.green { background: rgba(52,211,153,.15); color: var(--green); }
    .pill.yellow { background: rgba(251,191,36,.15); color: var(--yellow); }
    .pill.orange { background: rgba(251,146,60,.15); color: var(--orange); }
    .pill.red { background: rgba(248,113,113,.15); color: var(--red); }
    .pill.blue { background: rgba(56,189,248,.15); color: var(--accent); }
    ul, ol { margin: 0 0 1rem; padding-left: 1.35rem; }
    li { margin-bottom: .4rem; }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    @media (max-width: 700px) { .grid-2 { grid-template-columns: 1fr; } }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1.1rem;
    }
    .card h4 { margin: 0 0 .5rem; font-size: .95rem; }
    .card p { font-size: .9rem; color: var(--muted); margin: 0; }
    .timeline {
      border-left: 2px solid var(--border);
      margin: 1rem 0 1.5rem 1rem;
      padding-left: 1.25rem;
    }
    .timeline-item { margin-bottom: 1.25rem; position: relative; }
    .timeline-item::before {
      content: "";
      position: absolute;
      left: -1.42rem;
      top: .45rem;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent);
      border: 2px solid var(--bg);
    }
    .timeline-item.done::before { background: var(--green); }
    .timeline-item.gap::before { background: var(--red); }
    .timeline-item.partial::before { background: var(--yellow); }
    .footnote {
      font-size: .85rem;
      color: var(--muted);
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
    }
    .toc {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-bottom: 2rem;
    }
    .toc ol { margin: 0; }
    .toc a { text-decoration: none; }
    .toc a:hover { text-decoration: underline; }
    .math-box {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      font-family: ui-monospace, monospace;
      font-size: .875rem;
      overflow-x: auto;
      margin: 1rem 0;
    }`,
  bodyHtml: `<header class="hero">
    <div class="hero-inner">
      <h1>ShootFlow Commercial Viability Assessment</h1>
      <p class="subtitle">
        Deep evaluation of whether ShootFlow can become a realistically profitable,
        scalable business — based on repository state, product strategy docs, test
        coverage, competitive landscape, and market economics as of June 2026.
      </p>
      <div class="meta">
        <span>Prepared: June 3, 2026</span>
        <span>438 passing tests</span>
        <span>~40,000 lines of Python</span>
        <span>32 core modules</span>
        <span>Zero third-party dependencies</span>
      </div>
    </div>
  </header>

  <main>
    <nav class="toc">
      <strong>Contents</strong>
      <ol>
        <li><a href="#executive-summary">Executive summary</a></li>
        <li><a href="#product-state">What exists today</a></li>
        <li><a href="#market">Market opportunity</a></li>
        <li><a href="#competition">Competitive landscape</a></li>
        <li><a href="#differentiation">Differentiation &amp; moat</a></li>
        <li><a href="#business-model">Business model &amp; unit economics</a></li>
        <li><a href="#scalability">Scalability analysis</a></li>
        <li><a href="#scoring">Viability scoring matrix</a></li>
        <li><a href="#risks">Risk register</a></li>
        <li><a href="#recommendations">Recommendations for a more successful business</a></li>
        <li><a href="#decision">Go / pivot / stop decision framework</a></li>
      </ol>
    </nav>

    <section id="executive-summary">
      <h2>1. Executive summary</h2>

      <div class="verdict">
        <div class="verdict-card primary">
          <div class="verdict-label">Overall commercial viability (today)</div>
          <div class="verdict-value conditional">Conditional — 4.2 / 10</div>
          <div class="verdict-note">
            Strong engineering foundation and credible market pain, but no shippable
            product, no customers, and no validated willingness to pay yet.
          </div>
        </div>
        <div class="verdict-card">
          <div class="verdict-label">Viability if Phase 1 ships (12–18 months)</div>
          <div class="verdict-value moderate">Moderate — 6.5 / 10</div>
          <div class="verdict-note">
            Achievable niche SaaS if Mac UI + real culling/grading + pilot customers
            land before well-funded incumbents absorb the full pipeline wedge.
          </div>
        </div>
      </div>

      <div class="callout warn">
        <strong>Bottom line:</strong> ShootFlow is not a business yet — it is an
        unusually rigorous <em>workflow orchestration engine</em> with excellent
        safety contracts, pilot analytics, and business documentation. The pain it
        targets is real and growing. The wedge ("card dump → safe ingest → graded
        social drafts") is differentiated on paper. But the repo today delivers
        almost none of the customer-visible value that photographers pay for:
        no native Mac app, no real AI culling, no real color grading, no real
        video rendering, and no paying users.
      </div>

      <p>
        <strong>Is it worth pursuing?</strong> Yes, but only with eyes open about
        what remains. This is a high-upside, high-execution-risk opportunity in a
        market already served by funded competitors (Aftershoot, Imagen, Narrative,
        FilterPixel). The project's unusual depth in safety, resumability, and
        pilot measurement is a genuine strategic asset — but only if converted
        into a product photographers can install and feel within months, not years.
      </p>

      <p>
        <strong>Is it realistically profitable and scalable?</strong>
        <em>Eventually, possibly.</em> The addressable market is large enough
        (~$720M photography studio software in 2025, growing ~13.5% CAGR per industry
        reports). Pro photographers already spend $100–$1,000+/week on editing or
        lose 10–20 hours/week on post-production — enough headroom for $30–$80/month
        SaaS if ShootFlow saves measurable time. Scalability is favorable once real
        compute adapters exist: per-asset work parallelizes, local-first defaults
        keep COGS low, and optional cloud burst can be margin-protected. Today,
        scalability of <em>revenue</em> is zero because there is nothing to sell.
      </p>
    </section>

    <section id="product-state">
      <h2>2. What exists today — honest product maturity</h2>

      <h3>Engineering maturity: unusually strong for pre-product stage</h3>
      <table>
        <thead>
          <tr><th>Dimension</th><th>Evidence</th><th>Assessment</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Test coverage</td>
            <td>438 unittest tests, all passing; 28 test modules</td>
            <td><span class="pill green">Strong</span></td>
          </tr>
          <tr>
            <td>Codebase size</td>
            <td>~40,034 lines across src + tests; 32 Python modules; 429 commits</td>
            <td><span class="pill green">Substantial</span></td>
          </tr>
          <tr>
            <td>Architecture</td>
            <td>Deterministic job graphs, checksum manifests, resumable status, adapter registry, observe-only workflow authority</td>
            <td><span class="pill green">Production-grade design</span></td>
          </tr>
          <tr>
            <td>Business planning</td>
            <td>PRODUCT_STRATEGY.md, BUSINESS_PLAN.md, TERMS draft, pilot metrics, cohort reporting</td>
            <td><span class="pill green">Above average</span></td>
          </tr>
          <tr>
            <td>Shippable product</td>
            <td>CLI-only Python core; no Mac app, no installer, no UI</td>
            <td><span class="pill red">Not shippable</span></td>
          </tr>
          <tr>
            <td>Core AI/color value</td>
            <td>All production adapters are deterministic stand-ins (placeholders, byte-copy proxies, fake VLM JSON)</td>
            <td><span class="pill red">Not built</span></td>
          </tr>
          <tr>
            <td>Real rendering</td>
            <td>dry-run-local adapter only; no ffmpeg, Core Image, Metal, or Resolve integration</td>
            <td><span class="pill red">Not built</span></td>
          </tr>
          <tr>
            <td>Market validation</td>
            <td>No pilots, no revenue, no user interviews recorded in repo</td>
            <td><span class="pill red">Unvalidated</span></td>
          </tr>
        </tbody>
      </table>

      <h3>Pipeline completion map</h3>
      <div class="timeline">
        <div class="timeline-item done">
          <strong>Safe ingest + manifests</strong> — Checksum copy, no-delete, conflict detection, CLI preview/confirm flow. Real and tested.
        </div>
        <div class="timeline-item done">
          <strong>Storage discovery &amp; route recommendation</strong> — Mounted volume scan, macOS metadata adapter, capacity gating. Real contracts; native UI not wired.
        </div>
        <div class="timeline-item done">
          <strong>Production/render orchestration</strong> — Status manifests, schedulers, stale-lease recovery, adapter registry, bounded parallelism. Exceptionally thorough.
        </div>
        <div class="timeline-item done">
          <strong>Pilot analytics layer</strong> — Dashboard, cohort report, cohort brief, acceptance thresholds (90% completion, ≤20% intervention). Built before customers exist.
        </div>
        <div class="timeline-item partial">
          <strong>Storyline selection logic</strong> — Deterministic ranking from VLM scores exists; VLM itself is fake/local probe only.
        </div>
        <div class="timeline-item gap">
          <strong>Real VLM analysis</strong> — analysis-production-local writes schema-compatible JSON from byte hashes, not semantic understanding.
        </div>
        <div class="timeline-item gap">
          <strong>Real scene clustering &amp; look development</strong> — Stand-in JSON artifacts only.
        </div>
        <div class="timeline-item gap">
          <strong>Real color grading</strong> — grade-production-local writes deterministic stand-ins, not graded media.
        </div>
        <div class="timeline-item gap">
          <strong>Real deliverable rendering</strong> — Reels, carousels, photo sets not actually rendered.
        </div>
        <div class="timeline-item gap">
          <strong>Mac native app (SwiftUI/menu bar)</strong> — Explicitly planned; zero implementation in repo.
        </div>
        <div class="timeline-item gap">
          <strong>Review UI</strong> — Approve/retry/tweak grade intent — planned, not built.
        </div>
      </div>

      <div class="callout">
        <strong>Interpretation:</strong> ShootFlow has built the <em>operating system</em>
        for a media automation product — job planning, safety invariants, resumability,
        measurement — but not the <em>product surface</em> that creates customer value.
        Roughly 60–70% of engineering effort to date appears invested in orchestration
        infrastructure; roughly 5–10% in customer-visible media intelligence; 0% in
        distribution-ready packaging.
      </div>
    </section>

    <section id="market">
      <h2>3. Market opportunity</h2>

      <h3>Problem validation: strong</h3>
      <p>
        Professional photographers and videographers face recurring, expensive post-production
        pain. Industry surveys suggest ~78% of pros now consider AI-assisted culling essential.
        Wedding shoots of 3,000–6,000 images still consume 2–5+ hours of culling alone;
        full post (cull, color, social packaging) can consume 10–20 hours/week or
        $100–$1,000+/week in editor spend. ShootFlow's own ICP definition (wedding/event
        teams, portrait studios, real-estate media) matches the highest-volume, highest-willingness-to-pay segment.
      </p>

      <h3>Market size: sufficient for a focused SaaS</h3>
      <table>
        <thead>
          <tr><th>Segment</th><th>Estimate</th><th>Relevance</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Photography studio software (global)</td>
            <td>~$720M (2025) → ~$1.36B (2030), ~13.5% CAGR</td>
            <td>Broad TAM; ShootFlow needs a narrow wedge</td>
          </tr>
          <tr>
            <td>AI photography tools (adjacent)</td>
            <td>~$3.8B projected by 2026 (industry marketing estimates)</td>
            <td>Validates AI budget exists; also signals crowding</td>
          </tr>
          <tr>
            <td>Serviceable obtainable market (realistic)</td>
            <td>~50,000–150,000 high-volume pro photo/video operators globally</td>
            <td>At $40/mo avg → $24M–$72M ARR ceiling for focused wedge</td>
          </tr>
          <tr>
            <td>Early realistic target</td>
            <td>500–2,000 paying studios in 24 months post-launch</td>
            <td>$240K–$1.9M ARR at $40/mo — viable indie/small-team business</td>
          </tr>
        </tbody>
      </table>

      <h3>Why the timing is both good and bad</h3>
      <div class="grid-2">
        <div class="card">
          <h4>Tailwinds</h4>
          <p>AI culling/editing normalized; creators need more social output; local-first privacy concerns favor on-device processing; workflow automation undervalued vs. point AI tools.</p>
        </div>
        <div class="card">
          <h4>Headwinds</h4>
          <p>Aftershoot claims 100K+ users and unlimited culling from $10/mo; Imagen bundles cull+edit; Adobe/Lightroom adding AI; buyer fatigue; high bar for "another tool."</p>
        </div>
      </div>
    </section>

    <section id="competition">
      <h2>4. Competitive landscape</h2>

      <table>
        <thead>
          <tr>
            <th>Competitor</th>
            <th>Strength</th>
            <th>Pricing (approx.)</th>
            <th>ShootFlow gap</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Aftershoot</strong></td>
            <td>Local AI cull + edit + retouch; 100K+ users; offline; flat-rate unlimited</td>
            <td>$10–$60/mo</td>
            <td>Has shippable product, brand, integrations; weaker on full ingest-to-IG pipeline</td>
          </tr>
          <tr>
            <td><strong>Imagen</strong></td>
            <td>Cloud cull + personalized AI edit; Lightroom integration; style learning</td>
            <td>$49+/mo or per-image</td>
            <td>Strong edit quality story; cloud dependency; less ingest safety focus</td>
          </tr>
          <tr>
            <td><strong>Narrative Select</strong></td>
            <td>Fast macOS culling UX; moments grouping; offline</td>
            <td>$0–$60/mo tiers</td>
            <td>Best-in-class cull UX; no end-to-end social packaging</td>
          </tr>
          <tr>
            <td><strong>FilterPixel</strong></td>
            <td>Value tier; volume/event workflows; per-image economics</td>
            <td>~$19/mo+</td>
            <td>Price pressure at low end</td>
          </tr>
          <tr>
            <td><strong>Lightroom + plugins</strong></td>
            <td>Incumbent catalog; ecosystem lock-in</td>
            <td>$10–$55/mo Adobe stack</td>
            <td>ShootFlow must integrate, not replace, for adoption</td>
          </tr>
          <tr>
            <td><strong>CapCut / social editors</strong></td>
            <td>Free/cheap reel assembly</td>
            <td>Freemium</td>
            <td>Different job — ShootFlow targets pro RAW/video pipelines</td>
          </tr>
        </tbody>
      </table>

      <div class="callout warn">
        <strong>Competitive reality:</strong> ShootFlow is entering a market where
        incumbents already sell the <em>visible</em> value (culling, editing) at
        $10–$50/month with mature UX. ShootFlow's orchestration depth is not visible
        to buyers until it ships a Mac app and produces real outputs. The window to
        own "card → IG-ready drafts" as a category is narrowing as Aftershoot and
        Imagen expand horizontally.
      </div>
    </section>

    <section id="differentiation">
      <h2>5. Differentiation &amp; defensibility</h2>

      <h3>Claimed wedge (from product docs)</h3>
      <ul>
        <li><strong>Media safety first</strong> — never delete source, never overwrite different bytes, checksum manifests, explicit confirm gates</li>
        <li><strong>End-to-end pipeline</strong> — ingest → proxy → analysis → scene/look → grade → story → package → render, not just culling</li>
        <li><strong>Resumable at scale</strong> — 10,000+ asset shoots with stale-lease recovery and deterministic job IDs</li>
        <li><strong>Scene-consistent grading</strong> — rejoin at scene/look before per-asset grade (quality thesis)</li>
        <li><strong>IG-native deliverables</strong> — reels, carousels, photo sets as first-class outputs</li>
      </ul>

      <h3>Moat assessment</h3>
      <table>
        <thead>
          <tr><th>Moat type</th><th>Current strength</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Technical (orchestration/safety)</td>
            <td><span class="pill yellow">Medium</span></td>
            <td>Deep, tested, hard to replicate quickly — but invisible to customers until productized</td>
          </tr>
          <tr>
            <td>Data / style learning</td>
            <td><span class="pill red">None</span></td>
            <td>No user data, no learned looks, no VLM training loop</td>
          </tr>
          <tr>
            <td>Network effects</td>
            <td><span class="pill red">None</span></td>
            <td>No team features, no marketplace, no sharing loop yet</td>
          </tr>
          <tr>
            <td>Brand / distribution</td>
            <td><span class="pill red">None</span></td>
            <td>No GTM execution, no content engine, no community</td>
          </tr>
          <tr>
            <td>Switching costs</td>
            <td><span class="pill orange">Low today</span></td>
            <td>Could rise if manifests + look profiles + studio presets lock in workflows</td>
          </tr>
          <tr>
            <td>Integration depth</td>
            <td><span class="pill orange">Potential</span></td>
            <td>Lightroom/Capture One/Resolve handoff planned but not built</td>
          </tr>
        </tbody>
      </table>

      <p>
        <strong>Verdict on differentiation:</strong> The safety + end-to-end thesis
        is credible and under-served by point solutions, but it is not yet
        <em>demonstrated</em>. Aftershoot's "offline unlimited cull+edit" is an easier
        sell today. ShootFlow wins only if it proves measurably faster
        <em>ingest-to-published-draft</em> turnaround with fewer manual steps — not
        just safer manifests.
      </p>
    </section>

    <section id="business-model">
      <h2>6. Business model &amp; unit economics</h2>

      <h3>Proposed model (from BUSINESS_PLAN.md)</h3>
      <ul>
        <li><strong>Starter/Solo</strong> — local ingest + baseline automation</li>
        <li><strong>Pro</strong> — higher throughput, look presets, collaboration</li>
        <li><strong>Usage boost</strong> — optional cloud VLM/render credits</li>
      </ul>

      <h3>ROI anchor (customer side)</h3>
      <div class="math-box">
        Assumption: pro saves 8 hours/week at $75/hr effective rate → $600/week value
        ShootFlow price: $40–$80/month → $10–$20/week
        ROI: ~30–60× if time savings are real and trusted

        Assumption: studio spends $400/week on editor coordination
        ShootFlow replaces 25–50% of that → $100–$200/week saved
        At $60/month → positive ROI if intervention rate stays low
      </div>

      <h3>Unit economics (operator side — modeled)</h3>
      <table>
        <thead>
          <tr><th>Scenario</th><th>Price</th><th>COGS/user/mo</th><th>Gross margin</th><th>Break-even subs</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Local-first (default)</td>
            <td>$40/mo</td>
            <td>$2–$5 (support + infra)</td>
            <td>88–95%</td>
            <td>~200–400 subs @ $15K/mo opex</td>
          </tr>
          <tr>
            <td>Pro + cloud burst</td>
            <td>$60/mo + credits</td>
            <td>$8–$25 (GPU/VLM)</td>
            <td>58–87%</td>
            <td>Higher; needs usage caps</td>
          </tr>
          <tr>
            <td>Studio tier (3 seats)</td>
            <td>$120/mo</td>
            <td>$10–$30</td>
            <td>75–92%</td>
            <td>Lower sub count needed</td>
          </tr>
        </tbody>
      </table>

      <p>
        Local-first defaults (explicit in product strategy) are the right economic
        choice: they keep gross margins SaaS-like and align with pro trust concerns
        about uploading wedding RAWs. Optional cloud burst must be priced with
        margin guardrails — the business plan already notes this.
      </p>

      <div class="callout good">
        <strong>Economics conclusion:</strong> If the product works, the business
        model is viable. Pricing at $30–$80/month against 6–15 hours/week saved
        is an easy ROI story for wedding/event pros. The hard part is not pricing —
        it is proving the time savings with real AI and a usable Mac app.
      </div>
    </section>

    <section id="scalability">
      <h2>7. Scalability analysis</h2>

      <h3>Technical scalability: strong architecture, unproven load</h3>
      <ul>
        <li>Per-asset proxy, analysis, and grading jobs are embarrassingly parallel — architecture supports bounded concurrency and resumability</li>
        <li>Deterministic job IDs and manifest fingerprints enable caching, retries, and distributed workers later</li>
        <li>Local-first processing scales with customer hardware (Apple Silicon advantage on Mac ICP)</li>
        <li>Cloud workers can be added behind the same adapter registry without rewriting orchestration</li>
        <li>Risk: real VLM and video rendering at 10K assets will stress I/O, thermals, and support — needs perf engineering</li>
      </ul>

      <h3>Business scalability: depends on GTM and support model</h3>
      <table>
        <thead>
          <tr><th>Scale lever</th><th>Feasibility</th><th>Bottleneck</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Self-serve SaaS (solo pros)</td>
            <td><span class="pill yellow">Medium</span></td>
            <td>Needs polished onboarding; pro users still want support for data loss fears</td>
          </tr>
          <tr>
            <td>Studio/team expansion</td>
            <td><span class="pill yellow">Medium</span></td>
            <td>Team features not built; multi-seat sales are slower</td>
          </tr>
          <tr>
            <td>Content-led GTM (Instagram demos)</td>
            <td><span class="pill green">High fit</span></td>
            <td>Requires real before/after workflow videos — not CLI demos</td>
          </tr>
          <tr>
            <td>International expansion</td>
            <td><span class="pill yellow">Later</span></td>
            <td>Mac-first, English docs; localization deferred appropriately</td>
          </tr>
          <tr>
            <td>Support burden at scale</td>
            <td><span class="pill orange">Risk</span></td>
            <td>Media edge cases (corrupt cards, exotic codecs) generate tickets; safety UX must be excellent</td>
          </tr>
        </tbody>
      </table>

      <p>
        <strong>Scalability verdict:</strong> The <em>architecture</em> scales. The
        <em>business</em> does not scale until: (1) a native app reduces support
        friction, (2) real AI reduces manual intervention below the 20% pilot
        threshold, and (3) GTM produces repeatable demo content showing card-to-IG
        throughput gains.
      </p>
    </section>

    <section id="scoring">
      <h2>8. Viability scoring matrix</h2>
      <p>Scores 1–10 based on current repo evidence and external market data.</p>

      <table>
        <thead>
          <tr><th>Factor</th><th>Weight</th><th>Score</th><th>Weighted</th><th>Rationale</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Market pain &amp; willingness to pay</td>
            <td>15%</td>
            <td class="score-num">8.5</td>
            <td>1.28</td>
            <td>Validated by competitor traction and pro spend patterns</td>
          </tr>
          <tr>
            <td>Product-market fit (today)</td>
            <td>20%</td>
            <td class="score-num">2.0</td>
            <td>0.40</td>
            <td>No shippable product, no users, no validated workflows</td>
          </tr>
          <tr>
            <td>Technical foundation</td>
            <td>15%</td>
            <td class="score-num">8.0</td>
            <td>1.20</td>
            <td>Exceptional orchestration, tests, safety contracts</td>
          </tr>
          <tr>
            <td>Customer-visible value delivery</td>
            <td>20%</td>
            <td class="score-num">1.5</td>
            <td>0.30</td>
            <td>Stand-in adapters only; no real cull/grade/render</td>
          </tr>
          <tr>
            <td>Competitive position</td>
            <td>10%</td>
            <td class="score-num">4.0</td>
            <td>0.40</td>
            <td>Differentiated thesis but late vs. funded incumbents</td>
          </tr>
          <tr>
            <td>Business model clarity</td>
            <td>5%</td>
            <td class="score-num">7.5</td>
            <td>0.38</td>
            <td>Clear ICP, pricing anchors, pilot metrics defined</td>
          </tr>
          <tr>
            <td>GTM readiness</td>
            <td>5%</td>
            <td class="score-num">3.0</td>
            <td>0.15</td>
            <td>Strategy docs exist; demo fixtures exist; no live GTM</td>
          </tr>
          <tr>
            <td>Scalability (technical + ops)</td>
            <td>5%</td>
            <td class="score-num">7.0</td>
            <td>0.35</td>
            <td>Architecture ready; ops untested</td>
          </tr>
          <tr>
            <td>Team / execution velocity</td>
            <td>5%</td>
            <td class="score-num">6.0</td>
            <td>0.30</td>
            <td>429 commits show sustained work; heavy infra vs. product bias</td>
          </tr>
          <tr>
            <td><strong>Weighted total</strong></td>
            <td>100%</td>
            <td></td>
            <td><strong>4.76 / 10</strong></td>
            <td><span class="pill orange">Conditional viability</span></td>
          </tr>
        </tbody>
      </table>

      <h3>Score visualization</h3>
      <div class="score-bar-wrap">Market pain (8.5)
        <div class="score-bar"><span style="width:85%;background:var(--green)"></span></div>
      </div>
      <div class="score-bar-wrap">Technical foundation (8.0)
        <div class="score-bar"><span style="width:80%;background:var(--green)"></span></div>
      </div>
      <div class="score-bar-wrap">Business model clarity (7.5)
        <div class="score-bar"><span style="width:75%;background:var(--green)"></span></div>
      </div>
      <div class="score-bar-wrap">Scalability architecture (7.0)
        <div class="score-bar"><span style="width:70%;background:var(--yellow)"></span></div>
      </div>
      <div class="score-bar-wrap">Competitive position (4.0)
        <div class="score-bar"><span style="width:40%;background:var(--orange)"></span></div>
      </div>
      <div class="score-bar-wrap">GTM readiness (3.0)
        <div class="score-bar"><span style="width:30%;background:var(--orange)"></span></div>
      </div>
      <div class="score-bar-wrap">Product-market fit today (2.0)
        <div class="score-bar"><span style="width:20%;background:var(--red)"></span></div>
      </div>
      <div class="score-bar-wrap">Customer-visible value (1.5)
        <div class="score-bar"><span style="width:15%;background:var(--red)"></span></div>
      </div>
    </section>

    <section id="risks">
      <h2>9. Risk register</h2>
      <table>
        <thead>
          <tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Never ships customer-facing Mac app</td>
            <td><span class="pill orange">Medium</span></td>
            <td><span class="pill red">Fatal</span></td>
            <td>Freeze orchestration features; hire/partner for SwiftUI shell; 90-day UI milestone</td>
          </tr>
          <tr>
            <td>AI output quality below pro bar</td>
            <td><span class="pill orange">Medium-High</span></td>
            <td><span class="pill red">High</span></td>
            <td>Human-in-loop review UI; conservative defaults; measure intervention rate</td>
          </tr>
          <tr>
            <td>Incumbent copies full pipeline wedge</td>
            <td><span class="pill yellow">Medium</span></td>
            <td><span class="pill orange">High</span></td>
            <td>Move fast on ingest safety + IG packaging combo; build brand in wedding niche</td>
          </tr>
          <tr>
            <td>Over-engineering continues</td>
            <td><span class="pill orange">Medium</span></td>
            <td><span class="pill orange">High</span></td>
            <td>Cap new orchestration work; tie commits to pilot outcomes</td>
          </tr>
          <tr>
            <td>Support load from media edge cases</td>
            <td><span class="pill yellow">High</span></td>
            <td><span class="pill yellow">Medium</span></td>
            <td>Strict ICP; excellent safety UX; phased codec support</td>
          </tr>
          <tr>
            <td>Cloud COGS erode margins</td>
            <td><span class="pill yellow">Medium</span></td>
            <td><span class="pill yellow">Medium</span></td>
            <td>Local default; metered burst; transparent credit pricing</td>
          </tr>
          <tr>
            <td>Legal/trust incident (data loss perception)</td>
            <td><span class="pill yellow">Low-Medium</span></td>
            <td><span class="pill red">Fatal</span></td>
            <td>Never delete source; visible manifests; TERMS draft already aligned</td>
          </tr>
          <tr>
            <td>No paying pilots within 6 months of Mac alpha</td>
            <td><span class="pill orange">Medium</span></td>
            <td><span class="pill red">High</span></td>
            <td>Pre-sell pilot slots; weekly workflow proof demos with real media</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section id="recommendations">
      <h2>10. Recommendations for a more successful business</h2>

      <p>Ordered by impact. Stop building orchestration primitives until the top three are underway.</p>

      <h3>Tier 1 — Must do (business survival)</h3>
      <ol>
        <li>
          <strong>Ship a Mac menu-bar MVP in 90 days.</strong>
          Wrap existing <code>card-dump-workflow</code>, ingest preview/confirm, and
          <code>plan-production</code> in SwiftUI. The Python core is CLI-ready;
          the missing piece is entirely native UX for route approval and copy confirmation.
          Without this, there is no business.
        </li>
        <li>
          <strong>Integrate one real AI culling provider before building custom VLM.</strong>
          Partner with or wrap Aftershoot/Narrative API patterns, or embed a proven
          local culling model. Replace <code>analysis-production-local</code> stand-ins
          with semantic selects. Pros pay for culling today — not manifest schemas.
        </li>
        <li>
          <strong>Run 10 paid pilot studios before broad launch.</strong>
          Use existing <code>pilot-dashboard</code> thresholds as the contract:
          ≥90% completion, ≤20% manual intervention, ≥1 materialized output.
          Charge $50–$100/mo during pilot. Learn where intervention happens.
        </li>
        <li>
          <strong>Produce one real workflow demo weekly for Instagram GTM.</strong>
          "Card in → 45 min → 3 reel drafts + carousel + graded selects" with
          real wedding footage. The cohort demo fixture is useful internally but
          cannot substitute for authentic social proof.
        </li>
      </ol>

      <h3>Tier 2 — High leverage (differentiation &amp; retention)</h3>
      <ol start="5">
        <li>
          <strong>Lightroom/Capture One export handoff, not replacement.</strong>
          Meet pros where they live. ShootFlow's wedge is operations + social packaging,
          not killing Lightroom. Export graded masters and XMP sidecars; import look references.
        </li>
        <li>
          <strong>Real proxy + grade path on Apple Silicon.</strong>
          Replace stand-ins with ffmpeg/Metal downsampled proxies and a conservative
          LUT/CDL grade layer tied to scene/look JSON. Quality bar: "good first draft,"
          not final delivery — align with intervention metrics.
        </li>
        <li>
          <strong>Review UI for approve / retry / tweak intent.</strong>
          The workflow authority model is ahead of the market — use it in UI to
          build trust. Show why a job is retryable; never auto-delete or overwrite.
        </li>
        <li>
          <strong>Look profile learning from reference edits.</strong>
          Let pros upload 10–20 reference exports; build deterministic look JSON.
          This is harder to copy than generic AI filters and increases switching costs.
        </li>
        <li>
          <strong>Named reel variants (hero, BTS, fast cut) as the social differentiator.</strong>
          Storyline logic already exists in <code>shootflow.story</code>. Render real
          MP4 previews. This is the "more deliverables per shoot" promise made tangible.
        </li>
      </ol>

      <h3>Tier 3 — Scale enablers (after first revenue)</h3>
      <ol start="10">
        <li>
          <strong>Pricing:</strong> Launch at $39/mo Solo (local cull + ingest + drafts),
          $69/mo Pro (look profiles + faster scheduling + collaboration),
          $99/mo Studio (3 seats). Annual discount 20%. Optional burst credits at cost+40%.
        </li>
        <li>
          <strong>Vertical landing pages:</strong> Wedding, real estate, event — same engine,
          different presets and demo content. Avoid horizontal "AI editor for everyone" positioning.
        </li>
        <li>
          <strong>Editor handoff packages:</strong> Sell to studios that keep human editors
          but want deterministic task lists + progress files (already built). B2B2Editor
          may be an easier first sale than replacing editors entirely.
        </li>
        <li>
          <strong>iPhone companion for review only.</strong> Defer capture/import on mobile;
          ship approve/reject/annotate for reels and grade notes. Matches Mac-first strategy.
        </li>
        <li>
          <strong>Measure and publish intervention rate benchmarks.</strong>
          Turn pilot-dashboard metrics into marketing: "ShootFlow pilots median 12%
          intervention vs. 35% industry manual rework" — once true.
        </li>
        <li>
          <strong>Freeze orchestration scope.</strong> No new scheduler/report schema versions
          until Mac MVP ships. The workflow authority v3/v4 work is sufficient for years.
        </li>
        <li>
          <strong>Hire or partner for GTM, not just engineering.</strong>
          Aftershoot's moat includes 100K users and content marketing. Engineering
          excellence alone does not create distribution.
        </li>
      </ol>

      <h3>What to deprioritize</h3>
      <ul>
        <li>Additional dry-run adapter variants — the contract is proven</li>
        <li>More pilot report schema versions — v2 dashboard + cohort brief is enough for now</li>
        <li>iPhone as primary execution platform</li>
        <li>Casual creator / hobbyist tier until support burden is understood</li>
        <li>Guaranteed virality or revenue outcome messaging (already correctly excluded in business plan)</li>
      </ul>
    </section>

    <section id="decision">
      <h2>11. Go / pivot / stop decision framework</h2>

      <table>
        <thead>
          <tr><th>Decision</th><th>When</th><th>Signal</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="pill green">GO (continue investing)</span></td>
            <td>Now</td>
            <td>If team can pivot next 6 months to Mac MVP + real culling + 10 paying pilots. Market and architecture justify continued investment.</td>
          </tr>
          <tr>
            <td><span class="pill yellow">PIVOT</span></td>
            <td>If Mac MVP slips past 6 months</td>
            <td>Sell orchestration as B2B SDK for editing apps/agencies; or narrow to ingest-safety-only tool ("SafeCard") at lower price</td>
          </tr>
          <tr>
            <td><span class="pill orange">PIVOT</span></td>
            <td>If AI quality cannot hit ≤20% intervention</td>
            <td>Position as workflow ops layer (ingest + handoff + task lists) without claiming AI edit quality</td>
          </tr>
          <tr>
            <td><span class="pill red">STOP</span></td>
            <td>If no paid pilots after Mac alpha + 90 days GTM</td>
            <td>Market rejection despite working product — sunk cost in orchestration does not justify ongoing full-time build</td>
          </tr>
        </tbody>
      </table>

      <div class="callout good">
        <strong>Final assessment:</strong> ShootFlow is a <em>conditionally viable</em>
        business opportunity. The problem is real, the market is growing, the architecture
        is unusually disciplined, and the business plan is coherent. But commercial viability
        today is <strong>~4.8/10</strong> because the product does not yet exist for
        customers — only the engine underneath it does. With focused execution on Mac UI,
        real AI culling/grading, and paid pilots, viability rises to <strong>~6.5–7.5/10</strong>
        within a realistic productization horizon. Without that pivot from infrastructure to
        product, this remains an impressive engineering project with low probability of
        becoming a profitable standalone business.
      </div>
    </section>

    <p class="footnote">
      Methodology: Analysis based on full review of ShootFlow repository (32 modules,
      438 tests, docs/PRODUCT_STRATEGY.md, docs/BUSINESS_PLAN.md, docs/DESIGN_DECISIONS.md),
      CLI capability inventory, and external market/competitor research (photography studio
      software market reports, Aftershoot/Imagen/Narrative pricing pages, 2026 AI culling
      comparisons). Market size figures cite third-party industry reports and should be
      treated as directional, not audited financial data. This document is strategic analysis,
      not investment advice.
    </p>
  </main>`,
};

export default function GeneratedHtmlPage() {
  return <HtmlDoc doc={htmlDoc} />;
}
