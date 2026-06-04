/** Converted from docs/commercial-viability-report.html — edit here; re-run convert-html-to-tsx.ts to refresh from HTML. */
import { Link } from "react-router-dom";
import { DocLayout } from "../../components/DocLayout";
import { CommercialViabilitySubnav } from "../../components/CommercialViabilitySubnav";

export function CommercialViabilityReportPage() {
  return (
    <DocLayout
      title={"Commercial Viability Assessment"}
      subtitle={"Retail Pilot Intel · Privacy-first store intelligence for micro-format luxury retail · Assessment date: 3 June 2026 · Repository snapshot: pre-pilot / M0–M1 technical stage"}
      footer={
        <>
          <Link to="/commercial-viability">← Commercial viability hub</Link>
          {" · "}
          <Link to="/business-plan">Business plan</Link>
          {" · "}
          <Link to="/roi">ROI</Link>
        </>
      }
    >
      <CommercialViabilitySubnav />
      <div className="doc-prose">

    <section id="executive-summary">
      <h2>Executive summary</h2>
      <div className="score-hero">
        <div className="score-card primary">
          <div className="score-big" style={{ color: "var(--warn)" }}>5.4<span style={{ fontSize: "1.2rem", color: "var(--muted)" }}>/10</span></div>
          <div className="score-label">Overall commercial viability (weighted)</div>
          <p className="verdict" style={{ marginTop: "0.75rem" }}>Conditionally worth pursuing — not as a venture-scale bet yet</p>
        </div>
        <div className="score-card">
          <div className="score-big" style={{ color: "var(--accent)" }}>62%</div>
          <div className="score-label">Probability of reaching €50k+ ARR within 36 months (with committed founder + design partner)</div>
          <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: "var(--muted)" }}>
            Without a signed Italy pilot and one POS adapter, drops to ~25%.
          </p>
        </div>
      </div>

      <div className="callout warn">
        <p><strong>Bottom line:</strong> The <em>problem</em> is real, the <em>wedge ICP</em> is well chosen, and the <em>go-to-market collateral</em> in this repo is unusually strong for a pre-revenue product. What is <strong>not</strong> yet proven is that owners will pay recurring fees for joined door+POS intelligence, that edge CV can be installed reliably in historic Italian storefronts, or that the business can scale beyond founder-led delivery. Today this is a <strong>credible bootstrap niche SaaS + services</strong> play—not a default path to a large, capital-efficient software company without substantial execution risk reduction.</p>
      </div>

      <table>
        <thead>
          <tr><th>Dimension</th><th>Score</th><th>Signal</th></tr>
        </thead>
        <tbody>
          <tr><td>Problem &amp; buyer pain</td><td><span className="pill pill-high">7.5/10</span></td><td>Micro luxury retailers lack conversion + margin joins; enterprise tools are mis-fit.</td></tr>
          <tr><td>Market &amp; timing</td><td><span className="pill pill-mid">6.5/10</span></td><td>Growing footfall+POS segment; Italy wedge sensible; TAM large but SAM execution-heavy.</td></tr>
          <tr><td>Product–market fit evidence</td><td><span className="pill pill-low">2.5/10</span></td><td>No live pilot, no paying customers, no validated € outcomes from real store data.</td></tr>
          <tr><td>Technical delivery vs. promise</td><td><span className="pill pill-low">3.5/10</span></td><td>Schemas + SQLite funnel exist; CV, POS adapters, LAN dashboard, experiments are stubs or docs-only.</td></tr>
          <tr><td>Competitive differentiation</td><td><span className="pill pill-mid">5.5/10</span></td><td>Privacy + € ritual + POS join is coherent; not unique—many vendors chase conversion KPIs.</td></tr>
          <tr><td>Unit economics &amp; pricing</td><td><span className="pill pill-mid">6/10</span></td><td>€149–€449/mo anchored to one sale/month is credible; CAC and install burden threaten margins.</td></tr>
          <tr><td>GTM readiness</td><td><span className="pill pill-high">7.5/10</span></td><td>Business plan, ROI matrix, demo portal, privacy narrative—sales enablement ahead of product.</td></tr>
          <tr><td>Scalability</td><td><span className="pill pill-low">4/10</span></td><td>Low ACV, hardware, DPIA, per-store install; channel model unproven until M2 playbook ships.</td></tr>
          <tr><td>Regulatory / trust risk</td><td><span className="pill pill-mid">5/10</span></td><td>GDPR-first design helps; camera analytics still triggers DPIA and owner anxiety in Italy.</td></tr>
        </tbody>
      </table>
    </section>

    <section id="what-this-is">
      <h2>What is being evaluated</h2>
      <p>
        <strong>Retail Pilot Intel</strong> targets owner-operated luxury micro-boutiques (8–50 m²), starting with an Italy leather-goods design partner (~10 m²). The product joins <strong>door traffic aggregates</strong> with <strong>POS basket data</strong> on a store-local edge stack—no cloud video, no shopper identity—to drive weekly € decisions: conversion, desirability gap (attention vs. sale), upsell, and controlled experiments.
      </p>
      <p>Revenue model (from in-repo business plan): pilot setup €1.5k–€3k, then Core €149–€249/mo, Margin+ €299–€449/mo, optional Street add-on. Y1 goal: 1 pilot + 4 paid stores (~€12k–€18k ARR); Y3 scenario: ~80 stores, ~€190k–€280k ARR.</p>

      <h3>Repository reality check (technical maturity)</h3>
      <table>
        <thead>
          <tr><th>Commercial promise</th><th>Repo state (Jun 2026)</th><th>Gap severity</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Door line-crossing / entry counts</td>
            <td><code>packages/edge</code> — sample JSON only; RTSP/CV not connected</td>
            <td><span className="pill pill-low">Critical</span></td>
          </tr>
          <tr>
            <td>POS revenue join</td>
            <td><code>packages/pos</code> — sample sale events; no vendor adapters</td>
            <td><span className="pill pill-low">Critical</span></td>
          </tr>
          <tr>
            <td>Conversion funnel KPIs</td>
            <td><code>packages/analytics</code> — daily entries/purchases/conversion in SQLite</td>
            <td><span className="pill pill-mid">Partial</span></td>
          </tr>
          <tr>
            <td>Desirability gap, experiments, upsell</td>
            <td>Documented in docs/portal; <strong>zero implementation</strong> in packages</td>
            <td><span className="pill pill-low">Critical</span></td>
          </tr>
          <tr>
            <td>LAN owner dashboard</td>
            <td>Architecture described; production dashboard not in repo (portal uses illustrative demo data)</td>
            <td><span className="pill pill-low">Critical</span></td>
          </tr>
          <tr>
            <td>GDPR / DPIA go-live</td>
            <td>Privacy page + principles; no signed DPIA artifact in repo</td>
            <td><span className="pill pill-mid">Process</span></td>
          </tr>
          <tr>
            <td>Sales &amp; investor narrative</td>
            <td>Rich TSX docs site + passcode demo portal + CI — <strong>production-ready collateral</strong></td>
            <td><span className="pill pill-high">Strength</span></td>
          </tr>
        </tbody>
      </table>
      <p className="mermaid-note">CI pipeline passes: typecheck, lint, build, bootstrap smoke (sample events → SQLite → daily report). That validates engineering hygiene, not market validation.</p>
    </section>

    <section id="market">
      <h2>Market opportunity</h2>
      <p>
        Broader retail analytics is a multi-billion-dollar category growing at high teens CAGR, with increasing emphasis on <strong>POS-integrated conversion</strong> rather than footfall alone. Independent and specialty retailers are a recognized sub-segment: price-sensitive, outcome-oriented, often buying through POS integrators or landlord programs rather than enterprise RFPs.
      </p>
      <ul>
        <li><strong>TAM (EU independent specialty with POS):</strong> Very large—hundreds of thousands of doors—but irrelevant without a repeatable wedge motion.</li>
        <li><strong>SAM (Italy/EU luxury micro, AOV €150+, &lt;50 m²):</strong> Plausible low tens of thousands in Italy; expansion requires adapter and privacy playbook per country.</li>
        <li><strong>SOM (36 months, in-repo plan):</strong> 50–200 stores via direct + installers—<em>ambitious</em> given current stage; 15–40 stores is a more realistic bootstrap ceiling without funding.</li>
      </ul>
      <div className="callout ok">
        <p><strong>Why the wedge works on paper:</strong> Italy historic centers combine tourism volatility, high privacy sensitivity, dense referral clusters (same street), and owner-operators who already pay for POS and sometimes footfall counters—but rarely get margin-linked weekly actions. Selling “one extra bag per month pays for this” matches how they think about money.</p>
      </div>
      <div className="callout bad">
        <p><strong>Why the wedge may not scale fast:</strong> Each store is a mini integration project (camera mount, edge PC, POS export, DPIA). Competitors and POS vendors can add “conversion rate” dashboards; owners may treat insights as interesting but not habit-forming—churn driver called out correctly in the business plan.</p>
      </div>
    </section>

    <section id="competition">
      <h2>Competitive landscape</h2>
      <table>
        <thead>
          <tr><th>Alternative</th><th>Threat level</th><th>Your counter-position</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Cheap door counters / beams</td>
            <td>High on price, low on features</td>
            <td>POS join + € ritual; must prove join is worth 10× counter price</td>
          </tr>
          <tr>
            <td>Enterprise in-store analytics (Traffix-class)</td>
            <td>Low direct (wrong buyer)</td>
            <td>Simplicity, LAN privacy, micro-store pricing</td>
          </tr>
          <tr>
            <td>POS-native reporting</td>
            <td>Medium–high</td>
            <td>Traffic funnel + attention metrics POS cannot see; risk if POS adds footfall partner</td>
          </tr>
          <tr>
            <td>AI footfall startups (camera + Jetson + mobile dashboard)</td>
            <td>Medium</td>
            <td>EU privacy, no cloud video, experiment discipline; many claim 96% accuracy + POS APIs</td>
          </tr>
          <tr>
            <td>Owner intuition + accountant</td>
            <td>High default</td>
            <td>Weekly experiment registry + documented € actions—behavior change product</td>
          </tr>
          <tr>
            <td>Boutique consultants</td>
            <td>Partner or substitute</td>
            <td>Rev-share channel; consultants may resist “software replacing advice”</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Moat assessment:</strong> At current maturity there is no durable moat—only positioning. A moat could emerge from (1) Italy street-level anonymized benchmarks with owner consent, (2) POS adapter depth for Tilby/Lightspeed-class Italy stack, (3) proven install playbook under 2 hours via partners, and (4) retention tied to inventory cash recovery stories. None exist in production yet.
      </p>
    </section>

    <section id="economics">
      <h2>Unit economics &amp; profitability</h2>
      <p>Using illustrative figures from the in-repo business plan (not audited):</p>
      <table>
        <thead>
          <tr><th>Metric</th><th>Plan assumption</th><th>Assessment</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Core ARPU</td>
            <td>~€199/mo steady state</td>
            <td>Reasonable if owner sees weekly € action; discounting during pilot will drag Y1 blended ARPU</td>
          </tr>
          <tr>
            <td>Gross margin target</td>
            <td>65–75% on subscription</td>
            <td>Achievable <em>after</em> install learning curve; pilot months look ~8% in their own P&amp;L table</td>
          </tr>
          <tr>
            <td>CAC (channel-led)</td>
            <td>€800–€1.2k</td>
            <td>Optimistic until partner closes 3+ stores without founder; first 5 stores likely founder-heavy → higher CAC</td>
          </tr>
          <tr>
            <td>LTV (24 mo × 70% margin)</td>
            <td>~€3.3k contribution</td>
            <td>Requires &lt;7 month payback and &lt;20% annual churn—unproven in luxury seasonal retail</td>
          </tr>
          <tr>
            <td>Company breakeven (excl. founder salary)</td>
            <td>5–9 paid stores @ ~€185 contribution/mo</td>
            <td>Aligned with Y1 target; founder living expenses not covered—bootstrap lifestyle stage</td>
          </tr>
          <tr>
            <td>Y2 roll-up</td>
            <td>~€53k ARR, ~€85k opex → approaching breakeven</td>
            <td>Requires 25 stores and partner-sourced installs—steep jump from 5 stores Y1</td>
          </tr>
        </tbody>
      </table>

      <h3>Is it realistically profitable?</h3>
      <p><strong>Per store:</strong> Yes, <em>if</em> hardware is amortized, support is bounded to ~2h/quarter, and churn stays low because the owner documents € wins. One incremental €350 sale/month covers Core tier—math is believable for leather AOV.</p>
      <p><strong>As a company:</strong> Profitable as a <strong>small founder-led business</strong> at roughly 15–25 paying stores without outside hires; not profitable at venture expectations without either (a) multi-door family groups on Margin+, or (b) successful POS/integrator channel at scale.</p>
      <p><strong>As a scalable software business:</strong> Challenging. €200/mo × 1,000 stores = €2.4M ARR but 1,000 edge installs with GDPR support is an operations company, not a pure SaaS margin story. PE-style rollup of micro-SaaS is possible but not automatic.</p>
    </section>

    <section id="gtm">
      <h2>Go-to-market feasibility</h2>
      <p>The repo’s GTM strategy is one of its strongest assets: digital-first discovery, async demo portal, ROI-led copy, narrow ICP, anti-personas, partner economics, PQL rules, and proof-library build order.</p>

      <div className="bar-row">
        <div className="bar-label"><span>Sales collateral completeness</span><span>8/10</span></div>
        <div className="bar-track"><div className="bar-fill" style={{ width: "80%", background: "var(--ok)" }}></div></div>
      </div>
      <div className="bar-row">
        <div className="bar-label"><span>Founder network / design partner access (unknown)</span><span>?</span></div>
        <div className="bar-track"><div className="bar-fill" style={{ width: "40%", background: "var(--muted)" }}></div></div>
      </div>
      <div className="bar-row">
        <div className="bar-label"><span>Channel partner traction</span><span>1/10</span></div>
        <div className="bar-track"><div className="bar-fill" style={{ width: "10%", background: "var(--bad)" }}></div></div>
      </div>
      <div className="bar-row">
        <div className="bar-label"><span>Proof assets (case study, live charts)</span><span>1/10</span></div>
        <div className="bar-track"><div className="bar-fill" style={{ width: "10%", background: "var(--bad)" }}></div></div>
      </div>

      <p>
        <strong>Digital-first at €149–€449 ACV is correct.</strong> Field sales and trade fairs are correctly deprioritized. The bottleneck is not “more marketing pages”—it is <strong>one undeniable anonymized before/after conversion story</strong> from a real Italy pilot.
      </p>
    </section>

    <section id="scenarios">
      <h2>Outcome scenarios (36 months)</h2>
      <div className="scenario-grid">
        <div className="scenario">
          <h4>Bootstrap lifestyle</h4>
          <p className="prob">Probability: ~35%</p>
          <p>8–20 stores, €20k–€50k ARR, founder + part-time install support. Covers tools and modest income; slow growth.</p>
        </div>
        <div className="scenario">
          <h4>Regional niche winner</h4>
          <p className="prob">Probability: ~20%</p>
          <p>40–80 stores Italy + adjacent EU, €100k–€250k ARR, 2 POS adapters, working partner channel. Requires flawless pilot + cluster referrals.</p>
        </div>
        <div className="scenario">
          <h4>Stalled pilot</h4>
          <p className="prob">Probability: ~30%</p>
          <p>Design partner never reaches M4; GDPR delay; POS export blocked; owner does not weekly ritual. Remains consulting/docs project.</p>
        </div>
        <div className="scenario" style={{ gridColumn: "1 / -1", maxWidth: "100%" }}>
          <h4>Venture-scale exit</h4>
          <p className="prob">Probability: &lt;5% without category expansion or 10× ACV uplift</p>
          <p>ACV and services load are misaligned with typical SaaS fund returns unless repositioned to multi-door groups, franchise rollups, or white-label platform for integrators.</p>
        </div>
      </div>
    </section>

    <section id="risks">
      <h2>Critical risks (ranked)</h2>
      <ol>
        <li><strong>No validated pilot</strong> — Entire commercial story rests on illustrative portal data until M3/M4 with real owner € actions.</li>
        <li><strong>Behavior change churn</strong> — Product value = owner acts weekly; analytics without ritual = cancellation after season.</li>
        <li><strong>POS access fragility</strong> — Revenue join is the product; file export fallback may be enough but increases support load.</li>
        <li><strong>Install + DPIA friction</strong> — Historic storefronts, camera perception, Garante scrutiny can pause deals 4–12 weeks.</li>
        <li><strong>Founder bottleneck</strong> — Business plan acknowledges; playbook not shipped until M2.</li>
        <li><strong>Feature creep vs. ROI order</strong> — Docs wisely gate window CV; commercial pressure may erode discipline.</li>
        <li><strong>Commoditization</strong> — POS or camera vendors bundle conversion KPIs at lower price.</li>
      </ol>
    </section>

    <section id="verdict">
      <h2>Verdict: should you pursue this?</h2>
      <table>
        <thead>
          <tr><th>Pursuit mode</th><th>Recommendation</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Side project without Italy store access</td>
            <td><strong>Do not pursue</strong> — collateral is strong but distribution and proof require local trust.</td>
          </tr>
          <tr>
            <td>Bootstrap with signed design partner + 6–12 months runway</td>
            <td><strong>Pursue</strong> — focus M1–M4 only; defer Margin+ selling until rank-1 baseline trusted 14+ days.</td>
          </tr>
          <tr>
            <td>Raise pre-seed on docs + portal alone</td>
            <td><strong>Not recommended</strong> — investors will require live pilot metrics and retention signal.</td>
          </tr>
          <tr>
            <td>Build agency/consulting wrapper around installs</td>
            <td><strong>Viable bridge</strong> — setup fees fund engineering; risk is staying services-heavy permanently.</td>
          </tr>
        </tbody>
      </table>

      <div className="callout ok">
        <p><strong>What makes this more viable than typical pre-pilot startups:</strong> disciplined ROI ordering, honest anti-personas, privacy as sales enabler, pricing tied to owner language (€/week), and a complete async sales funnel in-repo. The team has thought like operators, not feature factories.</p>
      </div>
      <div className="callout warn">
        <p><strong>What blocks “highly scalable business” today:</strong> sub-€3k ACV, hardware on-site, unbuilt core product, no moat, crowded adjacent solutions, and success tied to human habit formation in a low-tech buyer.</p>
      </div>
    </section>

    <section id="recommendations">
      <h2>Recommendations for a more successful business</h2>
      <p>Ordered by impact on viability and scale. These go beyond what the business plan already lists—focusing on gaps exposed by code vs. docs.</p>
      <ol className="rec">
        <li>
          <strong>Close the design partner before more GTM assets.</strong>
          Sign term sheet, POS export path, and M4 pricing lock. Without this, commercial viability stays theoretical. Success metric: owner names one € action/week on <em>real</em> joined data within 45 days of install.
        </li>
        <li>
          <strong>Ship “boring M3” before Margin+ or window CV.</strong>
          One POS adapter (even nightly CSV), door counts ±5% vs manual tally, LAN dashboard with 4 KPIs only. Portal can stay for sales; production UI must show live pilot screenshots within 60 days of M3.
        </li>
        <li>
          <strong>Productize the weekly ritual, not the dashboard.</strong>
          Monday email/PDF: conversion vs last week, one suggested experiment, one inventory action. Login counts are irrelevant—documented € experiments are the retention KPI (already in plan; needs software enforcement).
        </li>
        <li>
          <strong>Pick one POS integrator as co-seller #1.</strong>
          Offer 10–15% year-1 rev share + certified export checklist. Italy market buys through regional POS; this matters more than SEO in Y1.
        </li>
        <li>
          <strong>Standardize hardware BOM and 2-hour install script now.</strong>
          Fixed edge PC + camera SKU, VLAN diagram, commissioning checklist. Target: third-party installer completes without founder—non-negotiable for scale.
        </li>
        <li>
          <strong>Publish one anonymized case study with owner quote in €.</strong>
          Even a single-store “+0.3pp conversion → X bags/month” chart beats feature docs. Build proof library item #1 before cluster outreach (plan says this; execute urgently).
        </li>
        <li>
          <strong>Instrument portal for PQL (privacy-safe).</strong>
          Time-on-page for funnel + value routes, fit Typeform, referral codes—enables 24h founder assist without guessing intent.
        </li>
        <li>
          <strong>Pre-sell annual prepay with hardware bundle.</strong>
          Improves cash flow and filters serious owners; 2 months free aligns with seasonal retail cash cycles.
        </li>
        <li>
          <strong>Define churn save playbook.</strong>
          If no ritual 14 days post-M4: 30-min tally reconciliation call, not feature upsell. Prevents “numbers feel wrong” death spiral.
        </li>
        <li>
          <strong>Explore multi-door family pricing early (Tier C).</strong>
          3–5 doors × Margin+ raises ACV 3–8× without new architecture if each site stays LAN-local—best path to improve scalability without enterprise sales.
        </li>
        <li>
          <strong>Validate desirability gap without extra scanners first.</strong>
          Use POS velocity + dwell proxy from door zones only if needed; RFID/scanners (rank 7) should stay deferred per ROI—reduces COGS and install time.
        </li>
        <li>
          <strong>Legal: complete DPIA before camera marketing.</strong>
          Counsel sign-off is existential in Italy; use privacy page as sales footer, not hero—plan is correct.
        </li>
        <li>
          <strong>Kill or defer Street add-on sales until rank-1 baseline 14 days.</strong>
          Prevents over-promising outdoor CV—already in roadmap; hold commercial team to it.
        </li>
        <li>
          <strong>Consider integrator white-label if direct sales stall at 10 stores.</strong>
          Lower margin but transfers install/support; may be faster path to 50 stores than founder cluster sales.
        </li>
      </ol>
    </section>

    <section id="milestones">
      <h2>Suggested viability gates (go / no-go)</h2>
      <table>
        <thead>
          <tr><th>Gate</th><th>Pass criteria</th><th>If fail</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>G0 — Partner signed</td>
            <td>Design partner term sheet + POS export confirmed</td>
            <td>Stop hardware spend; run discovery only</td>
          </tr>
          <tr>
            <td>G1 — M3 technical</td>
            <td>7 days stable joined funnel; ±5% entry tally</td>
            <td>Do not sell second store</td>
          </tr>
          <tr>
            <td>G2 — M3 commercial</td>
            <td>4 consecutive weeks with logged owner € action</td>
            <td>Fix ritual UX; do not raise price to Core list</td>
          </tr>
          <tr>
            <td>G3 — First paid conversion</td>
            <td>2nd store pays Core without founder travel for demo</td>
            <td>Channel/digital GTM not working; reassess ICP</td>
          </tr>
          <tr>
            <td>G4 — Unit economics</td>
            <td>3rd store onboarded by partner installer &lt; €1.2k CAC</td>
            <td>Stay founder-led services; delay scale hiring</td>
          </tr>
          <tr>
            <td>G5 — Scale decision</td>
            <td>5 paying stores, &lt;20% logo churn annualized, ≥60% gross margin</td>
            <td>Continue bootstrap; avoid fundraise narrative</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section id="methodology">
      <h2>Methodology</h2>
      <p>This report synthesizes:</p>
      <ul>
        <li>Full repository review: README, packages (edge, pos, analytics, schemas), apps/docs business plan &amp; GTM pages, apps/portal demo, roadmap/ROI/privacy narratives</li>
        <li>CI/bootstrap execution confirming technical smoke path</li>
        <li>Comparison to adjacent market offerings (footfall+POS, SMB retail analytics, privacy-first positioning)</li>
        <li>Explicit separation of <em>planning quality</em> vs. <em>market proof</em></li>
      </ul>
      <p>Figures cited from the in-repo business plan are illustrative planning ranges—not audited financials. External market sizes are directional from industry reports; validate with ISTAT and trade association data before investor materials.</p>
    </section>

    <footer>
      <p>Retail Pilot Intel — internal commercial assessment. Not legal, tax, or investment advice.</p>
      <p>Generated for repository planning. View in docs: <Link to="/commercial-viability/report">Commercial viability report</Link></p>
    </footer>
  </div>
    </DocLayout>
  );
}
