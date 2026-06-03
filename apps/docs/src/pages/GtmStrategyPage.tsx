import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function GtmStrategyPage() {
  return (
    <DocLayout
      title="GTM strategy & target customers"
      subtitle="Digital-first go-to-market for Retail Pilot Intel — Italy wedge, owner-led luxury micro-retail"
      footer={
        <>
          <Link to="/business-plan">Business plan →</Link>
          {" · "}
          <Link to="/roi">ROI matrix →</Link>
          {" · "}
          <Link to="/privacy">Privacy &amp; GDPR →</Link>
        </>
      }
    >
      <Card variant="ok">
        <p>
          <strong>GTM thesis:</strong> Micro-format luxury boutiques do not buy
          through enterprise procurement. They discover solutions digitally,
          validate trust via a self-serve demo and privacy materials, and close
          through a light sales-assist motion (owner + bookkeeper + installer).
          Field scale comes from partners, not a founder on every doorstep.
        </p>
      </Card>

      <h2>1. Digital-first principles</h2>
      <p>
        “Digital-first” here means <em>acquisition, education, and evaluation</em>{" "}
        happen online before anyone schedules an onsite visit. Hardware install
        stays physical; the commercial journey should not require it until the
        buyer has seen € logic and GDPR posture.
      </p>
      <DataTable
        headers={["Principle", "What we do", "What we avoid"]}
        rows={[
          [
            "Proof before pitch",
            "Portal demo + anonymized pilot charts",
            "Feature decks without conversion join story",
          ],
          [
            "Async trust",
            "Italian privacy one-pager, DPIA draft, /privacy",
            "“We’ll send security after the call”",
          ],
          [
            "Niche content",
            "Topic clusters: conversion + POS + GDPR boutique Italy",
            "Generic “retail AI” SEO",
          ],
          [
            "Low-touch default",
            "Self-serve demo → PQL → 30-min sales-assist",
            "Gated “contact sales” for every visitor",
          ],
          [
            "Partner fulfillment",
            "Installer + POS integrator playbooks (digital PDF)",
            "Founder-led install at scale",
          ],
        ]}
      />

      <h2>2. Ideal customer profile (ICP)</h2>
      <h3>Primary ICP — beachhead</h3>
      <DataTable
        headers={["Dimension", "Profile"]}
        rows={[
          ["Format", "1–2 physical doors; ~8–50 m² selling floor; mono-brand or tight multibrand"],
          [
            "Vertical",
            "Leather goods, designer accessories, contemporary footwear, eyewear",
          ],
          ["Geo (wedge)", "Urban Italy — historic centers, resort corridors, fashion districts"],
          [
            "Economics",
            "AOV €150–€450+; 55–70% gross margin; 25–80 entries/day; 1–2 staff on floor",
          ],
          [
            "Management",
            "Owner-operator or family; buyer = owner; user = owner or store manager",
          ],
          [
            "Tech maturity",
            "POS + spreadsheets; no IT headcount; anxious about cloud video / GDPR",
          ],
          [
            "Job to be done",
            "Connect footfall to € weekly — conversion, slow SKU cash, one experiment at a time",
          ],
        ]}
      />

      <h3>Secondary ICP — expansion (post-pilot)</h3>
      <DataTable
        headers={["Segment", "Why next", "GTM note"]}
        rows={[
          [
            "3–8 door family group (same city)",
            "Margin+ across locations; one DPIA pattern",
            "Digital: multi-site demo route; sales-assist for rollout",
          ],
          [
            "Multibrand contemporary (80–200 m²)",
            "Higher SKU count; desirability gap ROI",
            "Same POS adapter; zone config differs",
          ],
          [
            "Resort / tourist-heavy street",
            "Seasonality pain; conversion vs last season",
            "Content: seasonality benchmarks (anonymized cluster)",
          ],
          [
            "POS reseller’s existing book",
            "Trust transfer; export API already enabled",
            "Partner marketplace + referral bounty",
          ],
        ]}
      />

      <h3>Anti-ICP (qualify out early)</h3>
      <ul>
        <li>Chains with central IT and Traffix-class contracts already in place</li>
        <li>Flagship experience labs seeking heatmaps and shopper identity</li>
        <li>Pure e-commerce or market-only (no storefront funnel)</li>
        <li>Stores that refuse POS export or nightly sales file</li>
        <li>Buyers who want real-time alert dashboards, not weekly € actions</li>
      </ul>

      <h2>3. Buyer personas</h2>
      <DataTable
        headers={["Persona", "Role", "Cares about", "Digital touchpoints"]}
        rows={[
          [
            "Owner-curator",
            "Signs contract; sets assortment and display",
            "One extra sale/month; no surveillance feel; season vs last year",
            "Portal overview, ROI page, 15-min ritual PDF, peer intro email",
          ],
          [
            "Store manager / senior SA",
            "Daily floor; may open dashboard",
            "Simple weekly number; staffing/greeting experiments",
            "Portal funnel view; WhatsApp-style weekly summary (future)",
          ],
          [
            "Bookkeeper / external accountant",
            "Validates numbers; sometimes blocks spend",
            "POS join accuracy; subscription vs one belt sale",
            "ROI payback table; export reconciliation note",
          ],
          [
            "Boutique consultant",
            "Introduces tools to client book",
            "Repeatable outcome story; rev share clarity",
            "Partner one-pager; anonymized case chart",
          ],
          [
            "Installer / POS integrator",
            "Closes technical feasibility",
            "2h install script; BOM; L1 support boundary",
            "Install checklist PDF; partner economics sheet",
          ],
        ]}
      />
      <p>
        <strong>Rule:</strong> Marketing and demo paths speak to the owner-curator;
        procurement packs (DPA, sub-processors) speak to bookkeeper/counsel — both
        must be findable without a meeting.
      </p>

      <h2>4. Customer journey (digital-first funnel)</h2>
      <DataTable
        headers={["Stage", "Motion", "Asset", "Success signal"]}
        rows={[
          [
            "Awareness",
            "IT/EN content: conversion + POS + GDPR boutique",
            "Blog posts, association newsletter, LinkedIn proof snippets",
            "Inbound request or partner forward",
          ],
          [
            "Interest",
            "Self-serve sales portal (pnpm portal:dev)",
            "Atelier Linea illustrative KPIs — labeled demo",
            "≥3 screens viewed; funnel + SKU gap opened",
          ],
          [
            "Evaluation",
            "Async trust pack",
            "/privacy, DPIA draft, architecture LAN diagram",
            "Counsel or bookkeeper does not block on “unknown cloud video”",
          ],
          [
            "Decision",
            "Sales-assist (30–45 min)",
            "Live walkthrough + owner books workshop",
            "Design-partner or Core term sheet sent",
          ],
          [
            "Activation",
            "Installer + POS enablement",
            "M1–M4 per roadmap; weekly ritual starts at M4",
            "Owner names one € action within 7 days of M4",
          ],
          [
            "Expansion",
            "In-product + email",
            "Margin+, window add-on when rank-1 baseline exists",
            "Upsell after documented conversion or inventory action",
          ],
        ]}
      />

      <h2>5. GTM stages (aligned to business plan)</h2>
      <DataTable
        headers={["Stage", "Motion", "Digital emphasis", "Metric"]}
        rows={[
          [
            "0 — Design partner",
            "Single Italy leather boutique; subsidized setup",
            "Record portal walkthrough; capture anonymized charts for site",
            "M4 live 7d; owner weekly ritual",
          ],
          [
            "1 — Reference cluster",
            "3–5 stores same street/city; owner introductions",
            "Peer email template + shared benchmark opt-in",
            "≥3 paying; optional street benchmark",
          ],
          [
            "2 — Channel",
            "Installer + POS reseller playbook",
            "Partner portal folder: BOM, install script, economics",
            "Partner closes without founder every site",
          ],
          [
            "3 — Scale content",
            "Second vertical (eyewear) + second POS adapter",
            "Niche landing pages per vertical; AEO-friendly comparisons",
            "CAC payback < 6 months on Core",
          ],
        ]}
      />

      <h2>6. Digital acquisition channels (priority order)</h2>
      <DataTable
        headers={["Channel", "Priority", "Tactic", "Owner"]}
        rows={[
          [
            "Sales demo portal",
            "P0",
            "Single link; illustrative → pilot screenshots when live",
            "Founder",
          ],
          [
            "Docs site (this TSX site)",
            "P0",
            "ROI, privacy, business plan, GTM — crawlable internal + export PDF",
            "Founder",
          ],
          [
            "Proof-led content",
            "P1",
            "Before/after conversion; one desirability-gap story; one experiment",
            "Founder + owner quote",
          ],
          [
            "Italian trade / municipal associations",
            "P1",
            "Low-cost trust; newsletter guest post on €/visitor not AI",
            "Founder",
          ],
          [
            "POS integrator co-marketing",
            "P2",
            "Export-enablement guide; 10–15% Y1 rev share",
            "Partner manager (founder until 10 stores)",
          ],
          [
            "Shopify / Lightspeed ecosystem",
            "P2",
            "Listing when adapter stable; fiscal Italy story adjacent",
            "Engineering + founder",
          ],
          [
            "Paid search",
            "P3",
            "Only after organic proof; long-tail IT keywords",
            "Defer until CAC measured",
          ],
        ]}
      />

      <h2>7. Messaging pillars</h2>
      <DataTable
        headers={["Pillar", "Message", "Proof"]}
        rows={[
          [
            "€ per visitor",
            "One belt or bag per month pays for the system",
            "ROI payback table; joined funnel",
          ],
          [
            "Store-local privacy",
            "Aggregates on LAN; no raw video cloud; no shopper ID",
            "Architecture + /privacy + DPIA",
          ],
          [
            "Weekly discipline",
            "15-minute ritual → one documented experiment",
            "Experiment registry in portal demo",
          ],
          [
            "Not surveillance retail",
            "Boutique-grade intelligence without enterprise complexity",
            "Anti-ICP contrast vs cloud video analytics",
          ],
        ]}
      />
      <p>
        Locale: lead Italian for owner-facing one-pagers and association
        submissions; English for export-minded boutiques and partner technical
        docs.
      </p>

      <h2>8. Sales motion: PLG + sales-assist</h2>
      <p>
        Target ACV (Core €149–€249/mo) favors hybrid GTM: product-led evaluation,
        human assist only when complexity spikes.
      </p>
      <DataTable
        headers={["Signal", "Motion"]}
        rows={[
          ["Demo completed + owner email", "Automated follow-up + book 30-min call"],
          ["Multi-store or family group", "Sales-assist rollout plan"],
          ["Counsel asks for DPA / sub-processors", "Send trust pack same day (digital)"],
          ["POS vendor blocks API", "Integrator intro; file-based fallback"],
          ["≥2 stores in cluster within 90 days", "Street benchmark offer"],
        ]}
      />
      <p>
        Do not put enterprise procurement (security questionnaires, custom MSAs) in
        front of a 10 m² owner — it kills digital-first velocity. Standard terms +
        DPIA + buyback exit on the design-partner sheet (
        <Link to="/business-plan">business plan §5</Link>).
      </p>

      <h2>9. Partner-led digital enablement</h2>
      <p>
        Partners sell fulfillment, not shelf-ware. All partner assets are digital
        first (PDF/checklist/video), install is the only required onsite step.
      </p>
      <DataTable
        headers={["Partner", "Digital asset", "Economics (indicative)"]}
        rows={[
          [
            "Camera / IT installer",
            "BOM + 2h install script + health-check QR",
            "€150–€250 install + €50/quarter",
          ],
          [
            "POS reseller",
            "Export setup guide + L1 support script",
            "10–15% Y1 subscription or €200 referral",
          ],
          [
            "Boutique consultant",
            "Case chart + intro email template",
            "€100 intro + optional Margin+ rev share",
          ],
        ]}
      />

      <h2>10. GTM metrics</h2>
      <DataTable
        headers={["Metric", "Y1 target", "Why"]}
        rows={[
          ["Portal/demo sessions (qualified)", "Track monthly", "Leading indicator of pipeline"],
          ["Demo → sales-assist call rate", "≥25%", "Validates digital funnel"],
          ["Time to term sheet (days)", "<21 from first demo", "Digital-first speed"],
          ["Design partner → peer intro emails", "≥2 ready at M4", "Reference cluster motion"],
          ["Partner-sourced installs", "≥1 by EoY", "Proves channel without founder"],
          ["CAC (digital + partner)", "<€1.2k loaded", "Matches business plan payback"],
          ["Owner-documented € actions / week", "≥1 post-M4", "Retention leading indicator"],
        ]}
      />

      <h2>11. Product–GTM gates</h2>
      <p>
        Commercial promises must match shipped capability — same table as{" "}
        <Link to="/business-plan">business plan §13</Link>:
      </p>
      <DataTable
        headers={["Sell when", "Do not sell yet"]}
        rows={[
          ["M3 joined funnel live", "Window/street funnel in portal demo as “coming soon”"],
          ["Phase 2 SKU signals", "Desirability gap as headline before data exists"],
          ["M4 DPIA signed", "“GDPR-safe” without counsel-reviewed pack"],
          ["Rank-1 conversion baseline", "Window experiment as day-one hook"],
        ]}
      />

      <h2>12. Immediate GTM actions</h2>
      <DataTable
        headers={["Action", "Owner", "Done when"]}
        rows={[
          [
            "Publish portal walkthrough video (illustrative data)",
            "Founder",
            "Link on home + outbound emails",
          ],
          [
            "Italian one-pager: €/visitor + privacy (PDF from /privacy + /roi)",
            "Founder",
            "Attached to every sales-assist invite",
          ],
          [
            "Peer intro email template (post-M4)",
            "Founder + design partner",
            "2 warm intros scheduled",
          ],
          [
            "Partner folder: install script + economics",
            "Founder",
            "Shared with one Milano installer + one POS contact",
          ],
          [
            "Content plan: 3 posts (conversion join, slow SKU cash, GDPR boutique)",
            "Founder",
            "Drafts in docs or external blog",
          ],
        ]}
      />

      <Card variant="warn">
        <p>
          Market sizing and competitor claims in the{" "}
          <Link to="/business-plan">business plan</Link> remain indicative — refresh
          with ISTAT / trade association data before investor-facing materials.
          This GTM doc is for internal planning and partner alignment.
        </p>
      </Card>
    </DocLayout>
  );
}
