import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function BusinessPlanPage() {
  return (
    <DocLayout
      title="Business plan"
      subtitle="Retail Pilot Intel — privacy-first store intelligence for micro-format luxury retail (Italy pilot → repeatable offer)"
      footer={
        <>
          <Link to="/gtm">GTM strategy &amp; target customers →</Link>
          {" · "}
          <Link to="/roi">Initiative ROI matrix →</Link>
          {" · "}
          <Link to="/roadmap">Delivery roadmap →</Link>
        </>
      }
    >
      <Card variant="ok">
        <p>
          <strong>One-line thesis:</strong> Small luxury retailers already pay for
          footfall and POS, but cannot connect them to weekly € decisions. We sell
          a <em>store-local</em> join layer (door + POS + experiments) that
          improves conversion, AOV, and inventory cash — without cloud video or
          shopper identity. The Italy leather boutique is the design partner; the
          business is a repeatable per-store offer for similar formats.
        </p>
      </Card>

      <h2>Product build priority (financial)</h2>
      <p>
        Engineering and GTM stay aligned to the{" "}
        <Link to="/roi">ROI matrix</Link> — sell and ship in this order:
      </p>
      <DataTable
        headers={["Priority", "Capability", "€ lever for the pilot"]}
        rows={[
          ["1", "Door + POS conversion baseline", "Revenue per visitor; staffing"],
          ["2", "SKU desirability gap", "Working capital on slow leather SKUs"],
          ["3", "Upsell / basket patterns", "AOV (belts, care kits)"],
          ["Later", "Window / outdoor funnel", "Only after rank 1 baseline exists"],
        ]}
      />
      <p className="stub">
        Pricing anchors to one incremental sale per month, not sensor count — see
        section 5.
      </p>

      <h2>1. Executive summary</h2>
      <DataTable
        headers={["Dimension", "Summary"]}
        rows={[
          [
            "Product",
            "Edge analytics + POS intelligence: conversion funnel, SKU desirability gaps, experiment registry",
          ],
          [
            "Initial customer",
            "Owner-operated ~10 m² leather boutique, urban Italy (GDPR-first)",
          ],
          [
            "Why now",
            "Affordable edge compute; POS export APIs; owners under margin pressure post-tourism volatility",
          ],
          [
            "Revenue model",
            "Pilot setup fee + monthly store subscription; optional hardware kit margin",
          ],
          [
            "Proof point",
            "Owner cites weekly conversion or € action from joined data within 30 days of M4",
          ],
          [
            "12-month goal",
            "1 live pilot → 5 paying stores in same segment → documented € case study",
          ],
          [
            "GTM motion",
            "Digital-first: portal + docs proof → sales-assist close; channel by M2 playbook",
            "Founder travel only for install/DPIA, not every evaluation",
          ],
        ]}
      />

      <h2>2. Problem & customer</h2>
      <p>
        Independent luxury micro-stores (leather, accessories, designer footwear)
        run on thin labor and high SKU value. Owners see daily footfall and daily
        Z-reports but cannot answer:
      </p>
      <ul>
        <li>What is conversion this week vs last season?</li>
        <li>Which SKUs get attention but never sell (cash trap)?</li>
        <li>Did the window change or bundle test pay for itself in €?</li>
      </ul>
      <p>
        Enterprise retail analytics (Traffix, RetailNext-class) are priced and
        architected for chains with IT teams. Generic people-counters give
        entries without margin context. Cloud “AI retail” platforms often
        require video upload and erode trust under EU privacy law.
      </p>
      <p>
        <strong>Buyer:</strong> store owner or family operator;{" "}
        <strong>user:</strong> same person, 15 minutes/week.{" "}
        <strong>Champion:</strong> occasionally a bookkeeper or boutique consultant
        who wants margin reports, not heatmaps.
      </p>

      <h3>Ideal customer profile (ICP)</h3>
      <p>
        Y1 focus is one wedge ICP; adjacent segments open only after a signed
        case study and a repeatable install playbook. Italy&apos;s retail base is
        highly fragmented (regional independents, not national chain procurement),
        which favors digital proof and partner-led scale over enterprise field
        sales.
      </p>
      <DataTable
        headers={["Tier", "Profile", "Fit signals", "Y1 priority"]}
        rows={[
          [
            "Beachhead (A)",
            "Owner-operated luxury micro-store: leather, accessories, designer footwear; 8–50 m²; 1–3 staff; urban Italy",
            "AOV €150–€600; digital POS export or nightly file; owner cites conversion or dead stock weekly; refuses cloud video",
            "Primary — design partner + 3–5 reference cluster",
          ],
          [
            "Cluster peer (B)",
            "Same street / trade association; same format; no shared IT",
            "Warm intro from design partner; willing 15-min weekly ritual; DPIA path acceptable",
            "Primary — founder-assisted, async close after portal demo",
          ],
          [
            "Family micro-group (C)",
            "2–5 doors, one family operator, same city",
            "Margin+ across doors; bookkeeper champion; standard POS per site",
            "Secondary — after 1 paid reference store",
          ],
          [
            "Adjacent format (D)",
            "Eyewear, jewelry, high-end footwear; same economics",
            "POS adapter proven; privacy story portable",
            "Secondary — Y2 after adapter #2",
          ],
          [
            "Consultant-influenced (E)",
            "Boutique coach / fractional CFO serving 5–20 clients",
            "Wants anonymized benchmark; introduces 2+ stores/quarter",
            "Channel — digital playbook + rev share, not direct sales",
          ],
        ]}
      />

      <h3>Buyer personas</h3>
      <DataTable
        headers={["Persona", "Role", "Cares about", "Digital touchpoint"]}
        rows={[
          [
            "Owner-operator",
            "Economic buyer + daily user",
            "€/week actions, seasonality, no surveillance feel",
            "LAN dashboard, weekly ritual email, portal walkthrough",
          ],
          [
            "Family partner",
            "Risk / spend approver",
            "Lock-in, privacy, payback vs one sale/month",
            "Privacy page, pilot term sheet PDF, payback table on /roi",
          ],
          [
            "Bookkeeper",
            "Data skeptic",
            "POS truth, tally accuracy, export hygiene",
            "Funnel vs Z-report reconciliation doc; async Loom, not live demo",
          ],
          [
            "POS integrator",
            "Technical gatekeeper",
            "API stability, support burden, referral economics",
            "Integration one-pager, sandbox export sample, partner sheet",
          ],
          [
            "Boutique consultant",
            "Champion / introducer",
            "Client outcomes, reputational risk",
            "Anonymized case chart, benchmark opt-in, intro template",
          ],
        ]}
      />
      <p>
        <strong>Buying triggers:</strong> post-season inventory hangover; new
        neighbor competition on the same street; POS upgrade (Italy RT/fiscal
        compliance cycles); failed footfall counter that never tied to margin;
        consultant mandate to “show conversion in writing.”
      </p>

      <h3>Anti-personas (defer)</h3>
      <ul>
        <li>
          National or franchise chains with centralized IT and 12+ month
          procurement — wrong ACV and motion for bootstrap GTM
        </li>
        <li>
          High-volume, low-AOV formats (convenience, telecom kiosks) — ROI
          story breaks; subscription not justified by incremental sale
        </li>
        <li>
          Stores without machine-readable POS export — revenue join blocked;
          partner motion required first
        </li>
        <li>
          Owners seeking real-time heatmaps, staff surveillance, or cross-store
          shopper IDs — conflicts with privacy positioning and v1 scope
        </li>
      </ul>

      <h2>3. Market opportunity (indicative)</h2>
      <p>
        Figures below are planning ranges — validate with ISTAT / trade association
        data before investor materials.
      </p>
      <DataTable
        headers={["Layer", "Definition", "Indicative scale"]}
        rows={[
          [
            "TAM (EU)",
            "Independent specialty retail with POS + storefront",
            "Hundreds of thousands of doors",
          ],
          [
            "SAM",
            "Single-site luxury / leather / accessories, &lt;50 m², AOV €150+",
            "Italy: low tens of thousands; EU: larger multiple",
          ],
          [
            "SOM (36 mo)",
            "Stores we can serve with one POS adapter + door CV playbook",
            "50–200 stores via direct + installer channel",
          ],
        ]}
      />
      <p>
        Italy is the wedge: dense historic centers, tourism seasonality, strong
        privacy culture, and high-street display competition. Success in one
        visible street propagates to neighboring boutiques without multi-store
        contracts.
      </p>

      <h2>4. Solution & differentiation</h2>
      <p>
        See <Link to="/vision">Product vision</Link> and{" "}
        <Link to="/architecture">Architecture</Link>. Commercial differentiation:
      </p>
      <DataTable
        headers={["Capability", "Us", "Typical alternative"]}
        rows={[
          [
            "Data residency",
            "Aggregates on store LAN; no raw video cloud",
            "SaaS video analytics",
          ],
          [
            "Revenue join",
            "Normalized POS baskets + entry funnel",
            "Footfall-only counters",
          ],
          [
            "SKU economics",
            "Desirability gap (attention vs sale)",
            "Generic traffic dashboards",
          ],
          [
            "Decision cadence",
            "Weekly € experiments",
            "Real-time alert noise",
          ],
          [
            "Compliance posture",
            "GDPR/DPIA by design",
            "Retrofit privacy after sales",
          ],
        ]}
      />

      <h2>5. Business model & pricing</h2>
      <h3>Pilot (design partner)</h3>
      <ul>
        <li>
          <strong>Setup:</strong> €1.5k–€3k one-time (edge kit install, POS
          adapter, DPIA support, 2 weeks onsite/remote tuning) — can be
          discounted for case-study rights
        </li>
        <li>
          <strong>Hardware:</strong> pass-through or modest margin on edge PC +
          door camera (€400–€900 COGS depending on spec)
        </li>
        <li>
          <strong>Success fee (optional):</strong> share of documented gross
          profit uplift above baseline quarter — aligns incentives, harder to
          administer
        </li>
      </ul>
      <h3>Commercial offer (post-pilot)</h3>
      <DataTable
        headers={["Tier", "Includes", "Indicative price"]}
        rows={[
          [
            "Core",
            "Door + POS join, weekly conversion report, LAN dashboard",
            "€149–€249 / store / month",
          ],
          [
            "Margin+",
            "SKU zones, desirability gap, experiment registry",
            "€299–€449 / store / month",
          ],
          [
            "Street",
            "Outdoor window funnel + display experiment hooks",
            "+€100–€150 / month add-on",
          ],
        ]}
      />
      <p>
        Pricing anchors to <em>one incremental sale per month</em> at pilot AOV
        (€180–€450), not to sensor count. Annual prepay discount (~2 months) for
        cash-flow predictability.
      </p>

      <h3>Design partner commercial framework</h3>
      <p>
        The Italy leather boutique is both product validation and the first
        reference sale. Terms should be written before M2 (camera live) so
        expectations stay aligned with{" "}
        <Link to="/privacy">Privacy &amp; GDPR</Link> and{" "}
        <Link to="/roadmap">milestone gates</Link>.
      </p>
      <DataTable
        headers={["Term", "Typical range", "Trade-off"]}
        rows={[
          [
            "Setup fee",
            "€0–€1.5k (subsidized)",
            "Lower fee ↔ case-study rights + intro to 2 peer stores",
          ],
          [
            "Monthly during pilot",
            "€0–€99 for months 1–3",
            "Free trial ↔ weekly owner ritual + written € actions",
          ],
          [
            "Go-live (M4)",
            "Move to Core or Margin+ list price",
            "Price lock 12 mo if DPIA signed on schedule",
          ],
          [
            "Data & publicity",
            "Anonymized charts only; no store name without consent",
            "Trust in Italy &gt; logo on website",
          ],
          [
            "Exit",
            "30-day notice; kit buyback or return playbook",
            "Reduces owner fear of lock-in",
          ],
        ]}
      />

      <h3>Owner ROI vs subscription (planning frame)</h3>
      <p>
        The offer must clear a simple owner test: monthly fee &lt; documented
        upside from one habit change. Illustrative mechanics (see{" "}
        <Link to="/roi">ROI scenarios</Link>) — not guarantees:
      </p>
      <DataTable
        headers={["Owner outcome", "Illustrative annual upside", "Tier", "Payback feel"]}
        rows={[
          [
            "+1 sale/week at €350 AOV",
            "€9k–€23k gross revenue",
            "Core",
            "One extra bag/month covers subscription",
          ],
          [
            "+€40 AOV on 3 sales/day",
            "€30k gross revenue",
            "Margin+",
            "Upsell coaching pays for itself in weeks",
          ],
          [
            "Clear 2 slow SKUs",
            "€1.5k–€4k margin + cash freed",
            "Core",
            "Inventory story sells faster than CV specs",
          ],
          [
            "4 h/week labor avoided",
            "€1.4k–€2.4k / year",
            "Core",
            "Staffing alignment is an easy first win",
          ],
        ]}
      />
      <p>
        Lead with <strong>€/week the owner controls</strong>, then privacy and
        install. If M3 does not produce a named weekly action, do not renew at
        list price.
      </p>

      <h2>6. Go-to-market</h2>
      <Card variant="ok">
        <p>
          <strong>Digital-first principle:</strong> At €149–€449/mo ACV, field
          events and founder-heavy onsite selling do not scale. Acquisition,
          education, and trust build through async assets — secure demo portal,
          ROI and privacy pages, recorded walkthroughs, and partner-distributed
          PDFs — with human touch reserved for design-partner onboarding,
          DPIA sign-off, and install QA. Hybrid motion: product-led discovery →
          sales-assist close when privacy or POS integration needs a call.{" "}
          Deep dive:{" "}
          <Link to="/gtm">GTM strategy &amp; target customers</Link> (ICP tiers,
          personas, anti-ICP, funnel metrics).
        </p>
      </Card>

      <h3>GTM stages</h3>
      <DataTable
        headers={["Stage", "Primary motion", "Digital layer", "Success metric"]}
        rows={[
          [
            "0 — Design partner",
            "Founder-led install + weekly ritual coaching",
            "Portal labeled illustrative; privacy + term sheet shared as links before M2",
            "M4 live 7d; owner weekly ritual",
          ],
          [
            "1 — Reference cluster",
            "Warm intros; 20-min portal + /roi scoping call",
            "Case-study page (anonymized charts); 2 peer intro email templates; WhatsApp follow-up",
            "≥3 paying; optional street benchmark",
          ],
          [
            "2 — Channel",
            "Installer + POS reseller closes kit install",
            "Partner portal pack: BOM, 2h script, owner week-1 PDF, co-branded landing stub",
            "Partner closes without founder on every site",
          ],
          [
            "3 — Expand SKU",
            "Self-serve discovery for adapter #2 verticals",
            "SEO/content for “conversion + POS” queries; comparison one-pagers vs footfall-only",
            "CAC payback &lt; 6 months on Core tier",
          ],
        ]}
      />

      <h3>Digital acquisition funnel</h3>
      <p>
        Funnel stages map to assets we already ship in-repo; no separate
        marketing site required for Y1.
      </p>
      <DataTable
        headers={["Stage", "Goal", "Primary asset", "Exit criterion"]}
        rows={[
          [
            "Awareness",
            "Owner learns “footfall + POS join” exists",
            "Consultant forward, association newsletter, localized LinkedIn post",
            "Clicks through to docs or portal",
          ],
          [
            "Education",
            "Understand privacy + € payback",
            "/privacy, /roi, this page §7 payback",
            "Requests portal link or intro call",
          ],
          [
            "Evaluation",
            "See product shape without travel",
            "Secure portal (`pnpm portal:dev`) — funnel, SKU gap, experiments",
            "Names one weekly € decision they would track",
          ],
          [
            "Commit",
            "Sign design-partner or Core terms",
            "Term sheet PDF + DPIA timeline",
            "M2 scheduled; POS export path confirmed",
          ],
          [
            "Activate",
            "First joined conversion week",
            "LAN dashboard + ritual checklist",
            "≥1 logged experiment or inventory action in 14 days",
          ],
          [
            "Expand",
            "Margin+ or Street add-on",
            "In-product signal: 4+ healthy ritual weeks",
            "Upsell or referral ask",
          ],
        ]}
      />

      <h3>Digital channels (Y1–Y2)</h3>
      <DataTable
        headers={["Channel", "Why digital-first fits", "Tactic", "Avoid"]}
        rows={[
          [
            "Secure demo portal",
            "Replaces first showroom visit; spouse can review async",
            "Password-shared link; Atelier Linea illustrative → pilot screenshots when live",
            "Promising window funnel before rank-1 baseline",
          ],
          [
            "Docs site (this repo)",
            "SEO + sales enablement single source",
            "Italian + English titles on problem/payback; link from email signature",
            "Feature dumps without € story",
          ],
          [
            "Founder content",
            "High trust in micro-retail; low ad budget",
            "90s Loom: “one desirability gap save”; before/after conversion chart",
            "Generic AI retail thought leadership",
          ],
          [
            "Partner co-marketing",
            "Italy buys through regional POS/installers",
            "White-label one-pager; referral link in integrator newsletter",
            "Exclusive marketplace fees before 10 live stores",
          ],
          [
            "Associations / municipal",
            "Low-cost credibility",
            "Guest article on seasonality + conversion; webinar recording hosted on docs",
            "Booth spend at trade fairs (poor ACV fit)",
          ],
          [
            "Paid search (test)",
            "Capture high-intent integrators and owners",
            "Long-tail IT: POS export boutique, conteggio visitatori negozio piccolo",
            "Broad “retail AI” keywords (wrong ICP)",
          ],
        ]}
      />

      <h3>Proof library (build order)</h3>
      <ol>
        <li>
          Anonymized conversion trend (design partner) — hero for cluster stage
        </li>
        <li>
          One desirability-gap inventory save with € margin cited by owner
        </li>
        <li>
          DPIA summary + “no raw video cloud” architecture diagram (link /architecture)
        </li>
        <li>
          Partner install timelapse or checklist completion photo (trust, not surveillance)
        </li>
        <li>
          Optional street benchmark PDF when ≥3 stores consent
        </li>
      </ol>
      <p>
        Marketing stays proof-led, not feature-led. Italian trade associations
        and municipal business programs are <em>digital</em> distribution
        (newsletter, recorded talk), not booth-heavy field marketing.
      </p>
      <h3>Sales demo & evaluation</h3>
      <p>
        The secure sales portal (<code>pnpm portal:dev</code>, port 5174) shows
        illustrative joined KPIs — conversion, revenue per entrant, funnel,
        experiments, and trust posture — without live store data. Use it in
        discovery calls after the ROI conversation; never substitute it for the
        owner&apos;s own books during pilot contracting.
      </p>
      <DataTable
        headers={["Buyer step", "Asset", "Outcome"]}
        rows={[
          [
            "Problem fit (10 min)",
            "ROI page scenarios + owner footfall/POS reality",
            "Agree one € metric for pilot success",
          ],
          [
            "Trust (10 min)",
            "Privacy page + LAN-only architecture sketch",
            "DPIA path credible before camera install",
          ],
          [
            "Product feel (15 min)",
            "Sales portal login (demo credentials in repo README)",
            "Owner sees weekly ritual, not heatmaps",
          ],
          [
            "Commercial (async)",
            "Design partner terms (§5 below)",
            "Signed scope before M1 hardware spend",
          ],
        ]}
      />

      <h3>Channel partner economics</h3>
      <p>
        Scale depends on installers and POS resellers closing without the founder
        on every site. Partners are paid for install quality and first-month
        activation, not for shelf-ware dashboards.
      </p>
      <DataTable
        headers={["Partner type", "Role", "Indicative economics"]}
        rows={[
          [
            "Camera / IT installer",
            "Mount door camera, edge PC, LAN check",
            "€150–€250 install fee + €50/quarter health check",
          ],
          [
            "POS reseller / integrator",
            "Enable export API or nightly file; first-line support",
            "10–15% of year-1 subscription or €200 referral bounty",
          ],
          [
            "Boutique consultant",
            "Intro + weekly ritual coaching",
            "€100 intro + optional rev share on Margin+ upsell",
          ],
        ]}
      />
      <p>
        Partner playbook ships with M2: BOM checklist, 2h install script, and a
        one-page “owner first week” PDF tied to the{" "}
        <Link to="/roi">15-minute weekly ritual</Link>.
      </p>

      <h2>7. Unit economics (illustrative)</h2>
      <DataTable
        headers={["Item", "Pilot store", "Steady-state store"]}
        rows={[
          ["Monthly revenue (Core)", "€0–€99 (discounted)", "€199"],
          ["COGS (hosting/support)", "€15–€30", "€25–€40"],
          ["Hardware amortization (36 mo)", "—", "€15–€25"],
          ["Install/support burden", "High (learning)", "2h/quarter remote"],
          ["Gross margin %", "Negative → breakeven", "65–75% target"],
        ]}
      />
      <p>
        <strong>CAC hypothesis:</strong> €800–€1.2k fully loaded for
        channel-led install (partner fee + first-month support).{" "}
        <strong>LTV:</strong> €199 × 24 months × 70% margin ≈ €3.3k contribution
        before churn. Payback requires &lt;7 months average life — retention
        tied to owner seeing € outcomes (see <Link to="/roi">ROI page</Link>).
      </p>

      <h3>Pilot payback (worked example)</h3>
      <p>
        Using the same indicative store economics as the{" "}
        <Link to="/roi">ROI matrix</Link> — not a guarantee, but the commercial
        story we use in sales conversations:
      </p>
      <DataTable
        headers={["Input", "Assumption", "Implication"]}
        rows={[
          ["Entries / day", "~50", "350/week funnel numerator"],
          ["AOV", "€350", "One incremental sale ≈ €350 gross/week"],
          ["Core subscription", "€199/mo", "≈ 0.6 incremental sales/month to break even on fee"],
          [
            "+0.3 pp conversion",
            "~1.5 extra sales/week at 50 entries",
            "€18k+ gross/year — fee is noise if owner acts",
          ],
          [
            "2 slow SKUs cleared",
            "€800 cost each, 60% margin",
            "€960 margin + cash unlocked — often faster than conversion lift",
          ],
        ]}
      />
      <p>
        The pitch is not “analytics for €199” but “one belt or bag per month pays
        for the system; everything else is upside.” Margin+ tier is justified when
        desirability-gap actions appear in the weekly ritual (Phase 2).
      </p>

      <h3>Monthly P&amp;L per store (illustrative)</h3>
      <p>
        Bridges unit economics to company roll-up — replace with signed pilot
        actuals after the owner books workshop.
      </p>
      <DataTable
        headers={["Line (per store / month)", "Pilot (discounted)", "Steady Core"]}
        rows={[
          ["Subscription", "€49", "€199"],
          ["Support COGS", "€40", "€30"],
          ["Hosting / telemetry (optional)", "€5", "€10"],
          ["Gross profit", "€4", "€159"],
          ["Gross margin %", "~8%", "~80%"],
        ]}
      />
      <DataTable
        headers={["Company roll-up", "Y1 (5 stores EoY)", "Y2 (25 stores)"]}
        rows={[
          ["MRR (blended €175)", "€875", "€4.4k"],
          ["Annualized run-rate", "~€10.5k", "~€53k"],
          ["Founder + contractor opex (planning)", "~€45k", "~€85k"],
          ["Net (pre-fundraise)", "Negative", "Approaching breakeven"],
        ]}
      />

      <h3>Bootstrap break-even (company, no founder salary)</h3>
      <DataTable
        headers={["Assumption", "Value", "Implication"]}
        rows={[
          ["Blended MRR per paid store", "€220", "Mix of Core + early Margin+"],
          ["Variable COGS / store / month", "€35", "Support + minimal cloud"],
          ["Fixed monthly (tools, counsel, travel)", "€800–€1.5k", "Founder time excluded"],
          ["Paid stores to cover fixed @ ~€185 contribution", "5–9", "Aligns with Y1 EoY target"],
        ]}
      />
      <p>
        Pilot setup fees fund hardware and DPIA in year one; recurring margin
        scales once the M3 ritual sticks.
      </p>

      <h2>8. Three-year outlook (scenarios)</h2>
      <p>Not forecasts — sensitivity frames for planning.</p>
      <DataTable
        headers={["Year", "Stores (EoY)", "ARR (indicative)", "Notes"]}
        rows={[
          ["Y1", "1 pilot + 4 paid", "€12k–€18k", "Founder-led; one case study"],
          ["Y2", "25", "€60k–€90k", "1–2 install partners; 2 POS adapters"],
          ["Y3", "80", "€190k–€280k", "Core + Margin+ mix; churn &lt;15% annual"],
        ]}
      />
      <p>
        Upside if multi-store family groups adopt Margin+ across 3–8 doors;
        downside if privacy review delays M4 or POS vendor blocks export.
      </p>

      <h2>9. Competitive landscape</h2>
      <DataTable
        headers={["Competitor type", "Strength", "Gap we exploit"]}
        rows={[
          [
            "People counters / door beams",
            "Cheap, simple",
            "No POS join, no SKU margin story",
          ],
          [
            "Enterprise in-store analytics",
            "Deep features",
            "Price, complexity, cloud video",
          ],
          [
            "POS reporting alone",
            "Trusted revenue data",
            "No traffic funnel, no attention",
          ],
          [
            "Manual owner intuition",
            "Free",
            "No experiment discipline, season blind spots",
          ],
        ]}
      />

      <h2>10. Customer success &amp; retention</h2>
      <p>
        Churn risk is “owner stopped acting,” not “model drift.” Success is
        measured in documented € experiments, not login counts.
      </p>
      <DataTable
        headers={["Signal", "Healthy", "At risk"]}
        rows={[
          [
            "Weekly ritual",
            "Owner opens dashboard + names one action",
            "No login 14 days post M4",
          ],
          [
            "Conversion trend",
            "Tracked vs prior week / season",
            "Flat 4+ weeks with no experiment logged",
          ],
          [
            "Support tickets",
            "Install or POS sync only",
            "Repeated “numbers feel wrong” without tally check",
          ],
          [
            "Expansion",
            "Asks for Margin+ or window add-on",
            "Asks to remove camera before season ends",
          ],
        ]}
      />
      <ul>
        <li>
          <strong>Onboarding (week 1):</strong> replace indicative AOV/margin
          with owner books; baseline conversion week
        </li>
        <li>
          <strong>Activation (weeks 2–4):</strong> one staffing or greeting
          experiment; first desirability-gap action when Phase 2 live
        </li>
        <li>
          <strong>Retention:</strong> quarterly business review — € outcomes, not
          feature roadmap
        </li>
        <li>
          <strong>Expansion:</strong> Core → Margin+ when ROI ranks 2–3 are live;
          Street add-on only after M3 plateau; multi-door families = one contract,
          per-store LAN (no premature multi-tenant rewrite)
        </li>
      </ul>

      <h2>11. Sales enablement</h2>
      <p>
        External buyers see proof before architecture. The secure sales demo
        portal (<code>pnpm portal:dev</code>) shows illustrative KPIs, funnel,
        SKU gaps, and experiments for “Atelier Linea” — clearly labeled as demo
        data until the Italy pilot is live.
      </p>
      <DataTable
        headers={["Asset", "Audience", "When to use"]}
        rows={[
          [
            "Portal overview + funnel",
            "Owner, spouse, bookkeeper",
            "First meeting after intro",
          ],
          [
            "Weekly owner report (1 page)",
            "Owner",
            "Post-M3; renewal and peer intros",
          ],
          [
            "Anonymized street benchmark (opt-in)",
            "3–5 stores same high street",
            "Reference cluster stage 1 only",
          ],
          [
            "ROI page (/roi)",
            "Technical champion, integrator",
            "Scoping call — build order",
          ],
          [
            "This business plan",
            "Investor, association, partner",
            "Pricing, market, scale path",
          ],
          [
            "Privacy page + DPIA draft",
            "Owner, counsel",
            "Before M4 camera go-live",
          ],
        ]}
      />
      <p>
        Do not demo window funnel in portal until rank 1 baseline exists in the
        real pilot — matches the commercial promise table below.
      </p>

      <h2>12. Company KPIs (internal)</h2>
      <DataTable
        headers={["KPI", "Y1 target", "Why"]}
        rows={[
          ["Pilot M4 date", "Locked with owner + counsel", "Revenue story starts"],
          ["Paid stores (EoY)", "5", "Proves repeatability beyond design partner"],
          ["Gross margin %", "≥60% on subscription", "Sustainable bootstrap"],
          ["Logo churn (annual)", "<20%", "€ outcomes drive renewals"],
          ["CAC payback (months)", "<7 on channel-led", "Partner motion viable"],
          ["Owner-documented € actions", "≥1/week/store post M4", "Leading indicator of retention"],
          ["Time to M3 (first € action named)", "<45 days from install", "Sales promise = delivery"],
          ["Partner-sourced new logos (Y2)", "≥40%", "Founder not on every install"],
        ]}
      />

      <h2>13. Product–delivery alignment</h2>
      <p>
        Engineering and sales promises stay synchronized via the{" "}
        <Link to="/roi">ROI-ranked backlog</Link> and{" "}
        <Link to="/roadmap">value-gated milestones</Link>. We do not sell window
        analytics until rank #1 conversion baseline exists — prevents
        over-promising outdoor CV on day one.
      </p>
      <DataTable
        headers={["Commercial promise", "Technical gate"]}
        rows={[
          ["“Know your conversion”", "M3 joined funnel"],
          ["“Find dead inventory attention”", "Phase 2 SKU signals"],
          ["“Test your window”", "Phase 3 + rank 1 baseline"],
          ["“GDPR-safe in Italy”", "M4 DPIA + Privacy controls"],
        ]}
      />

      <h2>14. Risks & mitigations</h2>
      <DataTable
        headers={["Risk", "Impact", "Mitigation"]}
        rows={[
          [
            "GDPR / Garante scrutiny",
            "Pilot halt",
            "DPIA, no identity, local aggregates; counsel before M4",
          ],
          [
            "POS API access denied",
            "No revenue join",
            "Start with export file / one vendor; revenue share with integrator",
          ],
          [
            "Owner does not act on insights",
            "Churn",
            "15-min weekly ritual; success = documented € experiment",
          ],
          [
            "CV accuracy distrust",
            "Adoption",
            "±5% manual tally week; transparent bounce rules",
          ],
          [
            "Founder-only delivery",
            "Scale cap",
            "Installer playbook by M2; standard kit BOM",
          ],
        ]}
      />

      <h2>15. Operating plan & team (lean)</h2>
      <ul>
        <li>
          <strong>Now:</strong> founder-engineer + design-partner owner; legal
          counsel on retainer for DPIA
        </li>
        <li>
          <strong>At 10 stores:</strong> part-time support/install contractor;
          POS integration maintainer
        </li>
        <li>
          <strong>At 50 stores:</strong> first dedicated CS + partner manager;
          keep edge software releases monthly not daily
        </li>
      </ul>

      <h2>16. Funding & use of capital (optional)</h2>
      <p>
        The pilot can bootstrap on setup fees and founder time. If raising, use
        of funds priority: (1) POS adapter #2, (2) repeatable install kit +
        docs, (3) case-study marketing in Italy, (4) not premature multi-cloud
        infra.
      </p>
      <DataTable
        headers={["Use of funds (if €150k–€300k pre-seed)", "Share", "Rationale"]}
        rows={[
          ["POS + edge engineering", "45%", "Second adapter unlocks channel"],
          ["Install kit + partner playbook", "25%", "Founder off every site visit"],
          ["Italy case study + associations", "15%", "Proof-led GTM, not ads"],
          ["Legal / DPIA / counsel", "10%", "Pilot halt risk is existential"],
          ["Buffer", "5%", "Hardware lead times, one failed install"],
        ]}
      />

      <h2>17. Immediate next actions</h2>
      <DataTable
        headers={["Action", "Owner", "Done when"]}
        rows={[
          [
            "Owner books workshop (AOV, margin, seasonality)",
            "Founder + boutique owner",
            "ROI assumptions table updated on /roi",
          ],
          [
            "Sign design-partner term sheet (setup, M4 pricing, publicity)",
            "Founder",
            "Before M2 door camera install",
          ],
          [
            "Run one discovery (ROI page + sales portal); log objections",
            "Founder",
            "Objections captured in term sheet or backlog",
          ],
          [
            "Deliver M1–M3 per roadmap",
            "Engineering",
            "Owner names one € action/week on joined funnel",
          ],
          [
            "DPIA draft + counsel review",
            "Founder + legal",
            "Signed before M4 go-live",
          ],
          [
            "Record portal walkthrough (illustrative → pilot screenshots when live)",
            "Founder",
            "Sales deck + 2 peer intro emails ready",
          ],
          [
            "Identify one installer + one POS contact in Milano cluster",
            "Founder",
            "Partner economics sheet shared",
          ],
          [
            "Document installer BOM + 2h commissioning checklist",
            "Founder",
            "Channel stage 2 ready without founder travel",
          ],
          [
            "Publish digital GTM pack (portal walkthrough Loom, intro emails, partner one-pager)",
            "Founder",
            "Linked from /business-plan §6; used in first 3 cluster outreaches",
          ],
          [
            "Draft Italian SEO titles for docs (conversion + POS boutique)",
            "Founder",
            "At least 3 indexed pages with €-led meta descriptions",
          ],
        ]}
      />

      <Card variant="warn">
        <p>
          This document supports internal planning and partner conversations. It
          is not legal, tax, or investment advice. Financial figures are
          illustrative until validated against signed pilot data.
        </p>
      </Card>
    </DocLayout>
  );
}
