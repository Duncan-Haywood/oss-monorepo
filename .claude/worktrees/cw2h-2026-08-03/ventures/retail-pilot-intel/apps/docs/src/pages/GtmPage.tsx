import { Link } from "react-router-dom";
import { Card, DataTable, Diagram } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function GtmPage() {
  return (
    <DocLayout
      title="GTM & target customers"
      subtitle="Digital-first go-to-market for privacy-preserving store intelligence — Italy wedge, EU repeatability"
      footer={
        <>
          <Link to="/business-plan">Business plan →</Link>
          {" · "}
          <Link to="/roi">ROI matrix →</Link>
        </>
      }
    >
      <Card variant="ok">
        <p>
          <strong>GTM thesis:</strong> Our buyer is an owner-operator who will
          not sit through enterprise sales cycles or upload store video to a US
          cloud. We win with <em>proof before pitch</em>: a self-serve demo
          portal, anonymized case charts, and a remote install kit — then expand
          street-by-street via owner introductions and digital partner
          enablement. Physical trade fairs and on-site founder visits are
          accelerators, not the primary motion.
        </p>
      </Card>

      <h2>1. Ideal customer profile (ICP)</h2>
      <p>
        The ICP is narrow on purpose. Every store outside this profile increases
        POS adapter cost, support burden, and privacy review time without
        improving payback.
      </p>
      <DataTable
        headers={["Attribute", "Primary ICP", "Why it matters"]}
        rows={[
          [
            "Format",
            "Single-site micro boutique, 8–40 m²",
            "One door, one POS, one owner decision-maker",
          ],
          [
            "Vertical (wedge)",
            "Leather goods, artisan accessories, designer footwear",
            "High AOV, slow SKU turns, display-led conversion",
          ],
          [
            "Geography (phase 1)",
            "Urban Italy — Milano, Firenze, Roma, Bologna historic centers",
            "Tourism seasonality, GDPR sensitivity, dense referral clusters",
          ],
          [
            "Economics",
            "AOV €150–€600; gross margin 55–70%",
            "One incremental sale/month covers Core subscription",
          ],
          [
            "Traffic",
            "30–120 entries/day; owner knows regulars by face",
            "Funnel signal is actionable without ML novelty",
          ],
          [
            "Tech stack",
            "Modern POS with export API or nightly file (e.g. Tilby, Lightspeed-class)",
            "Revenue join is the product; footfall-only is a commodity",
          ],
          [
            "Buyer",
            "Owner or family operator; 15 min/week for weekly ritual",
            "No IT department; dashboard must answer one € question",
          ],
          [
            "Privacy posture",
            "Refuses cloud video analytics; asks about Garante / DPIA",
            "Our edge-local architecture is the trust unlock",
          ],
        ]}
      />

      <h3>ICP tiers (expansion order)</h3>
      <DataTable
        headers={["Tier", "Segment", "When", "Digital motion"]}
        rows={[
          [
            "A — Wedge",
            "Owner-operated leather / accessories, Italy",
            "Now (design partner → 5 stores)",
            "Portal demo → WhatsApp/email → remote install",
          ],
          [
            "B — Adjacent",
            "Eyewear, jewelry, premium footwear single-site",
            "After 3 paying leather references",
            "Same POS playbook; vertical one-pagers on site",
          ],
          [
            "C — Micro-chain",
            "Family group, 2–5 doors same city",
            "After Margin+ proof on desirability gap",
            "Multi-store portal view; annual prepay",
          ],
          [
            "D — EU beachhead",
            "Same format in France, Spain, Portugal historic centers",
            "After installer playbook + 2 POS adapters",
            "Localized landing pages; partner-led remote install",
          ],
        ]}
      />

      <h3>Anti-ICP (qualify out early)</h3>
      <ul>
        <li>
          Multi-store chains with central IT and existing Traffix / RetailNext
          contracts
        </li>
        <li>
          Stores without POS digital export (cash-only, legacy register with no
          file/API)
        </li>
        <li>
          High-volume fast fashion (&lt;€80 AOV) where one sale does not cover
          subscription
        </li>
        <li>
          Malls requiring landlord analytics approval we cannot satisfy in &lt;30
          days
        </li>
        <li>
          Buyers who want real-time heatmaps and shopper paths, not weekly €
          actions
        </li>
      </ul>

      <h2>2. Target customer personas</h2>
      <DataTable
        headers={["Persona", "Profile", "Pain", "Digital touchpoints", "Win message"]}
        rows={[
          [
            "Elena — Owner-operator",
            "52, runs 12 m² leather atelier near Duomo; 1 part-time staff",
            "Z-report shows revenue, not conversion; slow belts tie cash",
            "Instagram DMs from peers, WhatsApp voice notes, portal on iPad",
            "“One bag per month pays for this — see your conversion this week”",
          ],
          [
            "Marco — Family successor",
            "38, second-gen; wants data without betraying artisan brand",
            "Father’s intuition doesn’t scale; tourism swings hurt planning",
            "LinkedIn (quiet), email newsletter from trade assoc, YouTube install clip",
            "“GDPR-safe on your LAN — no video leaves the shop”",
          ],
          [
            "Giulia — Boutique consultant",
            "Independent merchandising advisor to 6–12 stores",
            "Clients ask for margin reports; she lacks traffic join",
            "PDF case study, shared portal link, Notion-style playbook",
            "“Give every client a weekly € action without you on-site”",
          ],
          [
            "Luca — POS integrator",
            "Regional Tilby/Lightspeed reseller, 40 SMB retail clients",
            "Footfall vendors don’t connect to POS; support tickets pile up",
            "Partner portal page, API doc, €200 referral bounty landing",
            "“15% year-1 rev share — you enable export, we close the story”",
          ],
        ]}
      />
      <p>
        <strong>Primary economic buyer:</strong> Elena or Marco.{" "}
        <strong>Champion:</strong> Giulia or Luca. Sales cycles shorten when
        Giulia introduces Elena to a portal link she has already explored —
        digital discovery before the first call.
      </p>

      <h2>3. Market context (planning ranges)</h2>
      <p>
        Independent specialty retail dominates Italian fashion wholesale —
        JOOR reports ~87% of GMV through independent retailers vs department
        stores, with ~11k Italian retailers active on their platform (2024).
        Euromonitor and trade data put Italy luxury goods at tens of billions
        EUR annually; our SAM is the long tail of single-site doors, not
        flagship conglomerates.
      </p>
      <DataTable
        headers={["Layer", "Scope", "Indicative scale", "Source / note"]}
        rows={[
          [
            "TAM (EU)",
            "Independent specialty retail with POS + street-facing door",
            "Hundreds of thousands of doors",
            "Eurostat retail + POS penetration — validate before investor deck",
          ],
          [
            "SAM",
            "Single-site luxury/accessories, &lt;50 m², AOV €150+, EU",
            "Italy: low tens of thousands",
            "Historic-center density; leather/accessories cluster",
          ],
          [
            "SOM (36 mo)",
            "Stores servable with one POS adapter + door CV playbook",
            "50–200 stores",
            "Digital + partner-led; not founder on every site",
          ],
        ]}
      />

      <h2>4. Digital-first GTM principles</h2>
      <DataTable
        headers={["Principle", "Practice", "Avoid"]}
        rows={[
          [
            "Proof before pitch",
            "Portal demo with illustrative → pilot screenshots; ROI page as scoping doc",
            "Feature decks without € outcome",
          ],
          [
            "Async-first sales",
            "Recorded portal walkthrough, Loom-style install preview, email nurture",
            "Mandatory in-person demo before pricing",
          ],
          [
            "Privacy as headline",
            "DPIA summary PDF, edge architecture diagram, no cloud video claim",
            "“AI-powered” without GDPR specifics",
          ],
          [
            "One city cluster",
            "Milano street referrals before national ads",
            "Spray EU LinkedIn ads day one",
          ],
          [
            "Partner digital kits",
            "Installer PDF + BOM + 2h video; POS integrator one-pager",
            "Partner training only in person",
          ],
          [
            "Measure leading indicators",
            "Portal sessions → intro calls → M4 weekly ritual",
            "Vanity traffic without qualified ICP fit",
          ],
        ]}
      />

      <h2>5. GTM stages & channels</h2>
      <DataTable
        headers={["Stage", "Goal", "Primary digital channels", "Success metric"]}
        rows={[
          [
            "0 — Design partner",
            "1 live Italy leather boutique; case-study rights",
            "Direct relationship; portal co-branded when live",
            "M4 go-live; ≥1 owner € action/week",
          ],
          [
            "1 — Reference cluster",
            "3–5 paying stores same city/street",
            "Owner WhatsApp intro, anonymized benchmark PDF, Google Business peer map",
            "≥3 Core+ paid; CAC &lt;€600 digital-assisted",
          ],
          [
            "2 — Digital partner scale",
            "Install + POS partners close without founder",
            "Partner landing page, referral form, shared Notion playbook",
            "≥50% new stores partner-sourced",
          ],
          [
            "3 — Vertical + geo expand",
            "Second vertical (eyewear) + second POS adapter",
            "Vertical landing pages, SEO (“conversion boutique GDPR”), assoc newsletters",
            "CAC payback &lt;6 mo on Core",
          ],
        ]}
      />

      <h3>Digital acquisition channel mix (stage 1–2)</h3>
      <DataTable
        headers={["Channel", "ICP fit", "Content / asset", "CAC hypothesis"]}
        rows={[
          [
            "Sales demo portal",
            "Owner, bookkeeper, consultant",
            "pnpm portal:dev — funnel, SKU gap, experiments (illustrative → pilot)",
            "€0 marginal; target 30% intro-call conversion from qualified visits",
          ],
          [
            "Owner peer referrals",
            "Elena persona, same street",
            "“Share portal link” + anonymized before/after chart",
            "€100–€200 intro bounty optional",
          ],
          [
            "WhatsApp / email outbound",
            "Owner-operators in target zip codes",
            "3-touch sequence: privacy hook → portal link → ROI one-pager",
            "€200–€400 fully loaded if 5% meeting rate",
          ],
          [
            "Trade association digital",
            "Confartigianato, CNA, camera di commercio newsletters",
            "Guest article + DPIA-friendly case study",
            "Low CAC; slow cycle; high trust",
          ],
          [
            "POS integrator co-marketing",
            "Luca persona",
            "Joint webinar “POS + conversion senza cloud”",
            "10–15% year-1 rev share",
          ],
          [
            "Consultant enablement",
            "Giulia persona",
            "Margin+ playbook PDF, multi-client portal seats (future)",
            "€100 intro + upsell share",
          ],
          [
            "LinkedIn / Instagram (organic)",
            "Marco persona, brand-conscious owners",
            "Weekly € action screenshots (anonymized), privacy explainer reels",
            "Brand building; not primary paid channel Y1",
          ],
          [
            "SEO (long-tail)",
            "Owners searching compliance + analytics",
            "“Analytics negozio GDPR”, “conversione negozio POS” articles",
            "Compounds in Y2; Italian language required",
          ],
        ]}
      />
      <p>
        Physical channels (trade fairs, municipal business desks) remain useful
        for trust in Italy but should always drive to a digital next step —
        portal link, calendar booking, or partner form — not a paper brochure
        alone.
      </p>

      <h2>6. Buyer journey (digital-first)</h2>
      <Diagram>{`Awareness          Consideration           Decision              Success
     │                    │                     │                    │
     ▼                    ▼                     ▼                    ▼
Peer mention /      Portal demo +          Design-partner or    Weekly ritual +
assoc newsletter    /roi scoping           Core term sheet       documented € action
     │                    │                     │                    │
     └─ Privacy hook      └─ Async walkthrough └─ Remote install    └─ Case study
        (no cloud video)     (recorded)            + DPIA gate          + referral ask`}</Diagram>
      <DataTable
        headers={["Stage", "Owner action", "Our digital deliverable", "Gate"]}
        rows={[
          [
            "Aware",
            "Hears “conversion without cloud video”",
            "60s privacy explainer; link to /privacy",
            "ICP fit quiz (informal: format, POS, AOV)",
          ],
          [
            "Evaluate",
            "Opens portal on phone between customers",
            "Overview + funnel pages; clearly labeled demo data",
            "Invite to /roi assumptions workshop (async form)",
          ],
          [
            "Commit",
            "Signs design-partner or Core terms",
            "DocuSign + DPIA draft PDF; install scheduling link",
            "Counsel review before M4 camera live",
          ],
          [
            "Activate",
            "Week 1: baseline conversion; week 2–4: one experiment",
            "Email drip: ritual reminders; tally-check guide",
            "Owner names one € action on joined funnel",
          ],
          [
            "Expand",
            "Asks for Margin+ or window add-on",
            "Upsell one-pager tied to desirability-gap screenshot",
            "Rank #1 conversion baseline exists (see /roi)",
          ],
          [
            "Advocate",
            "Introduces peer on same street",
            "Referral portal link + anonymized benchmark",
            "Consent for publicity",
          ],
        ]}
      />

      <h2>7. Competitive positioning (digital shelf)</h2>
      <p>
        Buyers compare us to footfall-only counters and cloud analytics. Digital
        GTM must make the differentiation scannable in 30 seconds on a phone.
      </p>
      <DataTable
        headers={["Alternative", "Typical price", "Gap we exploit", "Our digital proof"]}
        rows={[
          [
            "IR / beam counters (SensMax-class)",
            "Hardware + SaaS; footfall only",
            "No POS join, no SKU margin",
            "Side-by-side funnel + revenue per entrant in portal",
          ],
          [
            "Cloud people counting (Hoxton ~€900/yr, Niage €49–69/mo)",
            "Multi-store dashboards; cloud-first",
            "Privacy trust in Italy; no desirability gap",
            "Architecture page + zero raw video retention",
          ],
          [
            "POS reporting alone",
            "Included with POS",
            "No traffic funnel",
            "Joined conversion chart in demo portal",
          ],
          [
            "Enterprise in-store analytics",
            "€10k+ ACV, IT project",
            "Price, complexity, identity risk",
            "Core €149–249/mo anchor; 2h remote install story",
          ],
        ]}
      />

      <h2>8. Pricing & packaging (GTM view)</h2>
      <p>
        Full commercial detail lives on the{" "}
        <Link to="/business-plan">Business plan</Link>. GTM-relevant anchors:
      </p>
      <DataTable
        headers={["Offer", "Price signal", "Digital sales motion"]}
        rows={[
          [
            "Design partner",
            "€0–€1.5k setup; €0–€99/mo months 1–3",
            "Term sheet PDF; case-study rights in exchange",
          ],
          [
            "Core",
            "€149–€249 / store / mo",
            "Self-serve quote after portal demo; annual prepay −2 mo",
          ],
          [
            "Margin+",
            "€299–€449 / store / mo",
            "Upsell email when desirability gap live in pilot",
          ],
          [
            "Street add-on",
            "+€100–€150 / mo",
            "Not sold until rank #1 baseline — digital waitlist only",
          ],
        ]}
      />
      <p>
        Anchor pitch: <em>one incremental sale per month</em> at pilot AOV — not
        sensor count. The <Link to="/roi">ROI matrix</Link> is the pricing
        justification page.
      </p>

      <h2>9. Partner digital enablement</h2>
      <DataTable
        headers={["Partner", "Digital kit (ship by M2)", "Economics"]}
        rows={[
          [
            "Camera / IT installer",
            "BOM PDF, 2h install video, health-check checklist form",
            "€150–€250 install + €50/quarter remote check",
          ],
          [
            "POS reseller",
            "API/export setup guide, co-branded portal link, referral form",
            "10–15% year-1 sub or €200 bounty",
          ],
          [
            "Boutique consultant",
            "Weekly ritual PDF, anonymized benchmark template",
            "€100 intro + Margin+ rev share",
          ],
        ]}
      />

      <h2>10. GTM metrics & targets</h2>
      <DataTable
        headers={["Metric", "Y1 target", "Tool / source"]}
        rows={[
          ["Qualified portal demos", "40", "Portal analytics (post-pilot: pilot screenshots)"],
          ["Intro calls from digital", "≥60% of pipeline", "CRM tag: source=portal|referral|partner"],
          ["Design partner → paid conversion", "100% at M4 if ritual holds", "Owner weekly € action log"],
          ["Paid stores EoY", "5", "Billing"],
          ["Partner-sourced stores", "≥2 of 5", "Referral form"],
          ["CAC (digital-assisted)", "<€800", "Setup subsidy + partner fee loaded"],
          ["CAC payback", "<7 months", "Core €199/mo × 70% margin"],
          ["Logo churn (annual)", "<20%", "€ outcomes drive renewals"],
        ]}
      />

      <h2>11. 90-day digital GTM playbook</h2>
      <DataTable
        headers={["Week", "Action", "Output", "Owner"]}
        rows={[
          [
            "1–2",
            "Record 8-min portal walkthrough (illustrative data labeled)",
            "YouTube unlisted + sales email embed",
            "Founder",
          ],
          [
            "2–3",
            "Publish privacy one-pager + architecture diagram for sharing",
            "PDF on /privacy; WhatsApp-shareable link",
            "Founder",
          ],
          [
            "3–4",
            "Build 20-account ICP list (Milano leather/accessories)",
            "Sheet: name, POS, Instagram, intro path",
            "Founder",
          ],
          [
            "4–6",
            "3-touch outbound: privacy hook → portal → ROI link",
            "≥5 intro calls booked",
            "Founder",
          ],
          [
            "6–8",
            "Identify 1 installer + 1 POS contact; ship partner digital kit",
            "Partner landing + referral form live",
            "Founder",
          ],
          [
            "8–10",
            "Design-partner term sheet signed; M2 install scheduled",
            "Before camera live",
            "Founder + owner",
          ],
          [
            "10–12",
            "First anonymized conversion chart from pilot (with consent)",
            "Peer referral email template",
            "Founder + owner",
          ],
        ]}
      />

      <h2>12. Messaging matrix (digital copy)</h2>
      <DataTable
        headers={["Audience", "Headline", "Proof", "CTA"]}
        rows={[
          [
            "Owner",
            "“Know your conversion — without sending video to the cloud”",
            "Portal funnel + /privacy",
            "Book 20-min async demo",
          ],
          [
            "Consultant",
            "“One weekly € action for every client — from joined door + POS data”",
            "ROI page + ritual PDF",
            "Partner intro form",
          ],
          [
            "POS integrator",
            "“Turn your export API into conversion analytics — rev share”",
            "Architecture + adapter doc",
            "Technical scoping call",
          ],
          [
            "Association / press",
            "“GDPR-by-design analytics for Italy’s independent specialty retailers”",
            "DPIA summary + JOOR independent-retail stat",
            "Guest article pitch",
          ],
        ]}
      />

      <h2>13. Risks to digital GTM</h2>
      <DataTable
        headers={["Risk", "Mitigation"]}
        rows={[
          [
            "Owners distrust demo data",
            "Label clearly; swap to pilot screenshots at M4; offer tally week",
          ],
          [
            "WhatsApp outbound feels spammy",
            "Peer intro only until 3 references; legitimate-interest B2B with opt-out",
          ],
          [
            "Partner kits outdated",
            "Version partner PDF with roadmap gate; quarterly refresh",
          ],
          [
            "Over-promising window analytics",
            "Digital waitlist; sell only after /roi rank #1 baseline",
          ],
          [
            "Single-language limits EU expand",
            "Italian first; English partner docs; FR/ES landing in stage 3",
          ],
        ]}
      />

      <Card variant="warn">
        <p>
          Planning ranges and competitor pricing are indicative — refresh
          quarterly. JOOR independent-retail GMV share (~87%) refers to fashion
          wholesale platform data, not all Italian retail doors. This page
          supports internal GTM planning; not legal advice on outbound
          prospecting — review legitimate-interest outreach with counsel.
        </p>
      </Card>
    </DocLayout>
  );
}
