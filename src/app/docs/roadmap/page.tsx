import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

export default function RoadmapDocPage() {
  return (
    <DocPage
      title="Roadmap"
      subtitle={`Phased plan for ${brand.legalEntity} — digital presence bundles`}
      related={[
        { href: "/docs/product-bundles", label: "Product bundles" },
        { href: "/docs/architecture", label: "Architecture" },
        { href: "/docs/launch-checklist", label: "Launch checklist" },
        { href: "/docs/compliance", label: "Compliance" },
      ]}
    >
      <h2>Phased bundle rollout</h2>
      <table>
        <thead>
          <tr>
            <th>Phase</th>
            <th>Delivers</th>
            <th>Tier</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>0</td>
            <td>Scaffold</td>
            <td>—</td>
          </tr>
          <tr>
            <td>1, 3, 5</td>
            <td>Website + Stripe + deploy</td>
            <td>Starter ($500)</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Platform voice sells bundles</td>
            <td>All tiers</td>
          </tr>
          <tr>
            <td>6</td>
            <td>Marketing engine</td>
            <td>Growth ($500 + $99/mo)</td>
          </tr>
          <tr>
            <td>7</td>
            <td>Client AI phone</td>
            <td>Complete ($500 + $199/mo)</td>
          </tr>
          <tr>
            <td>8</td>
            <td>Stripe catalog</td>
            <td>Commerce (+$300 + $49/mo)</td>
          </tr>
        </tbody>
      </table>

      <h2 id="phase-0">Phase 0 — Scaffold (complete)</h2>
      <ul>
        <li>Next.js + dashboard + preview + checkout routes</li>
        <li>TSX documentation at /docs/*</li>
        <li>Two-layer branding ({brand.legalEntity})</li>
        <li>Marketing and voice code scaffolds</li>
      </ul>

      <h2 id="phase-1">Phase 1 — Website foundation</h2>
      <p>
        Shipped: category templates + tier cards on preview; Convex + SQLite lead persistence;
        manual lead entry; CSV import for operator-owned lists; lead email persistence for
        outreach. Remaining: dashboard auth, preview subdomain hosting. See{" "}
        <DocLink href="/docs/process">process log</DocLink>.
      </p>

      <h2 id="phase-2">Phase 2 — Outreach + platform voice</h2>
      <p>
        Shipped: Resend outreach + receipt templates, CAN-SPAM footer, unsubscribe +
        suppression list. Remaining: Vapi/Retell platform voice and bundle explanation tools.
      </p>

      <h2 id="phase-3-payments">Phase 3 — Payments (code complete; operator config open)</h2>
      <p>
        Checkout API creates real Stripe Checkout Sessions per tier (see{" "}
        <code>src/lib/pricing/bundles.ts</code> and <code>/api/stripe/checkout</code>). Tier
        selection UI live at <DocLink href="/checkout">/checkout</DocLink>. Webhook verifies
        signatures, marks leads paid, and sends receipt email when configured. Bootstrap Prices
        via <code>ALLOW_STRIPE_BOOTSTRAP=1</code> + <code>POST /api/stripe/bootstrap-prices</code>
        . Operator still must run bootstrap (or Dashboard) for test + live — see{" "}
        <DocLink href="/docs/launch-checklist">launch checklist</DocLink>.
      </p>

      <h2>Phase 4 — Data ingestion</h2>
      <p>
        CSV import shipped for operator-owned contacts. Google Places API remains after legal
        review. No Maps/Facebook scrapers.
      </p>

      <h2>Phase 5 — Production deploy</h2>
      <p>
        Custom domain handoff after paid checkout, contact form routing, clientLeads stub —
        still open (webhook currently marks paid + receipt only).
      </p>

      <h2>Phase 6 — Marketing engine</h2>
      <p>LLM generators, Buffer scheduling, Growth/Complete recurring billing.</p>

      <h2>Phase 7 — Client AI phone</h2>
      <p>Twilio provisioning, client webhook, Cal.com booking, Complete tier automation.</p>

      <h2>Phase 8 — Commerce</h2>
      <p>Catalog JSON, Stripe sync, menu/retail templates, order emails.</p>

      <p>
        Read <DocLink href="/docs/compliance">Compliance</DocLink> before any outreach code.
      </p>
    </DocPage>
  );
}
