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

      <h3>Owner ROI vs subscription (planning frame)</h3>
      <p>
        The offer must clear a simple owner test: monthly fee &lt; documented
        upside from one habit change. Illustrative mechanics (see{" "}
        <Link to="/roi">ROI scenarios</Link>) — not guarantees:
      </p>
      <DataTable
        headers={["Owner outcome", "Illustrative annual upside", "Core tier cost", "Payback feel"]}
        rows={[
          [
            "+1 sale/week at €350 AOV",
            "€9k–€23k gross revenue",
            "€1.8k–€3k / year",
            "One extra bag/month covers subscription",
          ],
          [
            "+€40 AOV on 3 sales/day",
            "€30k gross revenue",
            "Margin+ tier",
            "Upsell coaching pays for itself in weeks",
          ],
          [
            "Clear 2 slow SKUs",
            "€1.5k–€4k margin + cash freed",
            "Often one quarter of fees",
            "Inventory story sells faster than CV specs",
          ],
          [
            "4 h/week labor avoided",
            "€1.4k–€2.4k / year",
            "Core tier",
            "Staffing alignment is an easy first win",
          ],
        ]}
      />
      <p>
        Commercial conversations lead with <strong>€/week the owner controls</strong>
        (conversion, AOV, dead stock), then privacy and install — not camera
        resolution. If M3 does not produce a named weekly action, do not renew at
        list price.
      </p>

      <h2>6. Go-to-market</h2>
      <DataTable
        headers={["Stage", "Motion", "Success metric"]}
        rows={[
          [
            "0 — Design partner",
            "Single Italy leather boutique; subsidized setup",
            "M4 live 7d; owner weekly ritual",
          ],
          [
            "1 — Reference cluster",
            "3–5 stores same city/street; owner introductions",
            "≥3 paying; shared anonymized benchmark optional",
          ],
          [
            "2 — Channel",
            "POS reseller / camera installer playbook (kit + 2h install)",
            "Partner closes without founder on every site",
          ],
          [
            "3 — Expand SKU",
            "Second POS vendor, second vertical (e.g. eyewear)",
            "CAC payback &lt; 6 months on Core tier",
          ],
        ]}
      />
      <p>
        Marketing is proof-led: before/after conversion chart, one desirability-gap
        save story, one window experiment — not feature lists. Italian trade
        fairs and municipal business associations are low-cost trust channels.
      </p>

      <h3>Sales assets & demo motion</h3>
      <DataTable
        headers={["Asset", "Purpose", "When used"]}
        rows={[
          [
            "Sales portal (pnpm portal:dev)",
            "Password-gated walkthrough of illustrative KPIs, funnel, experiments",
            "First meeting before site visit; no live store data",
          ],
          [
            "Weekly owner report (1 page)",
            "Conversion, €/entrant, one experiment result",
            "Post-M3; renewal and reference intros",
          ],
          [
            "DPIA + privacy one-pager",
            "Trust under GDPR; Garante-ready posture",
            "Before camera live (M4 gate)",
          ],
          [
            "Install kit BOM + 2h checklist",
            "Partner-delivered setup without founder travel",
            "Stage 2 cluster in same city",
          ],
          [
            "Anonymized street benchmark (opt-in)",
            "3–5 stores on same high street compare bands",
            "Stage 1 reference cluster only",
          ],
        ]}
      />
      <p>
        Demo data in the portal is explicitly labeled illustrative — never
        conflate with the design partner&apos;s live metrics in proposals.
      </p>

      <h3>Channel economics (indicative)</h3>
      <DataTable
        headers={["Partner type", "They bring", "We offer", "Economics"]}
        rows={[
          [
            "POS reseller / integrator",
            "Trust, export/API access, install slot",
            "White-label report, rev share on MRR",
            "15–25% of year-1 MRR or €150–€250 per activated store",
          ],
          [
            "Camera / security installer",
            "Mount, cable, edge PC placement",
            "Kit BOM + remote handoff script",
            "€200–€400 install fee (customer-paid); we certify playbook",
          ],
          [
            "Boutique consultant",
            "Owner intro, merchandising credibility",
            "Margin+ tier co-sell",
            "One-time €300–€500 referral or 10% year-1",
          ],
        ]}
      />

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

      <h3>Break-even (bootstrap, no salary)</h3>
      <DataTable
        headers={["Assumption", "Value", "Implication"]}
        rows={[
          ["Blended MRR per paid store", "€220", "Mix of Core + early Margin+"],
          ["Variable COGS / store / month", "€35", "Support + minimal cloud"],
          ["Fixed monthly (tools, counsel, travel)", "€800–€1.5k", "Founder time excluded"],
          ["Paid stores to cover fixed @ €185 contribution", "5–9", "Y1 target band is plausible"],
        ]}
      />
      <p>
        Pilot setup fees fund hardware and DPIA work in year one; recurring
        margin scales once M3 ritual sticks. Raising capital shifts the table
        toward faster POS adapter #2 and partner enablement, not headcount.
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

      <h2>10. Product–delivery alignment</h2>
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

      <h2>11. Risks & mitigations</h2>
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

      <h2>12. Retention & expansion</h2>
      <p>
        Churn in micro-retail is usually <em>non-use</em>, not price. Expansion is
        tier upsell after trust, not feature dumps.
      </p>
      <DataTable
        headers={["Signal", "Healthy", "At-risk action"]}
        rows={[
          [
            "Owner opens weekly report",
            "≥3 of 4 weeks",
            "15-min call; simplify to one KPI",
          ],
          [
            "Documented € experiment / quarter",
            "≥1 with measured outcome",
            "Co-design next test; pause Margin+ upsell",
          ],
          [
            "Conversion or €/entrant trend",
            "Named story (up or explained flat)",
            "Re-baseline season; check POS lag",
          ],
          [
            "POS sync & door tally",
            "Green per /metrics",
            "Fix adapter before selling window add-on",
          ],
        ]}
      />
      <p>
        <strong>Expansion path:</strong> Core → Margin+ when ranks 2–3 on{" "}
        <Link to="/roi">ROI matrix</Link> are live; Street add-on only after M3
        plateau and owner cites pass-by as bottleneck. Multi-door family groups
        are one contract, per-store LAN — not a premature SaaS multi-tenant
        rewrite.
      </p>

      <h2>13. Company metrics (what we track)</h2>
      <DataTable
        headers={["Metric", "Target (indicative)", "Why"]}
        rows={[
          ["Pilot → paid conversion", "≥80% after 90d live", "Proves M4 + ritual"],
          ["Logo churn (annual)", "<15%", "Owner € outcomes drive renewal"],
          ["Gross margin on MRR", "≥65% at 25 stores", "Support must not scale linearly"],
          ["CAC payback", "<7 months", "Channel motion viability"],
          ["Time to M3 (first € action named)", "<45 days from install", "Sales promise = delivery"],
          ["Partner-sourced % of new logos", "≥40% by Y2", "Founder not on every truck roll"],
        ]}
      />

      <h2>14. Operating plan & team (lean)</h2>
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

      <h2>15. Funding & use of capital (optional)</h2>
      <p>
        The pilot can bootstrap on setup fees and founder time. If raising, use
        of funds priority: (1) POS adapter #2, (2) repeatable install kit +
        docs, (3) case-study marketing in Italy, (4) not premature multi-cloud
        infra.
      </p>

      <h2>16. Immediate next actions</h2>
      <DataTable
        headers={["Action", "Owner", "Gate / link"]}
        rows={[
          [
            "Replace pilot assumptions with owner books (AOV, margin, footfall)",
            "Founder + owner",
            <Link to="/roi">ROI assumptions</Link>,
          ],
          [
            "Lock pilot terms: setup fee, case-study rights, data processing role",
            "Founder + counsel",
            "Before M4",
          ],
          [
            "Ship M1–M3 per roadmap; no window SKU in contract",
            "Engineering",
            <Link to="/roadmap">Roadmap M1–M3</Link>,
          ],
          [
            "DPIA draft + signage; Privacy page → owner sign-off",
            "Counsel",
            <Link to="/privacy">Privacy</Link>,
          ],
          [
            "Run portal demo in first peer boutique meeting",
            "Sales",
            "Home → sales portal",
          ],
          [
            "Pre-write 2 reference intro emails (same street)",
            "Founder",
            "After first documented € win",
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
