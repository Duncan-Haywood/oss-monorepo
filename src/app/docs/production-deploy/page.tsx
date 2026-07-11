import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

export default function ProductionDeployDocPage() {
  return (
    <DocPage
      title="Production deploy"
      subtitle={`Phase 5 handoff after paid checkout — ${brand.name}`}
      related={[
        { href: "/docs/launch-checklist", label: "Launch checklist" },
        { href: "/docs/architecture", label: "Architecture" },
        { href: "/docs/process", label: "Process log" },
      ]}
    >
      <p>
        When Stripe fires <code>checkout.session.completed</code>, the webhook marks the lead{" "}
        <code>paid</code>, sends a receipt, then enqueues a <strong>production deploy handoff</strong>.
        That record holds DNS instructions, a suggested production hostname, and the contact-form
        endpoint for the site.
      </p>

      <h2>What ships automatically</h2>
      <ol>
        <li>
          Persist a <code>deploy_handoffs</code> row (SQLite today; Convex table can follow).
        </li>
        <li>
          Suggested host: <code>{"{slug}."}{"{NEXT_PUBLIC_PRODUCTION_DOMAIN}"}</code> (or derived
          from <code>NEXT_PUBLIC_PREVIEW_DOMAIN</code>).
        </li>
        <li>
          Best-effort Vercel Domains API call when <code>VERCEL_TOKEN</code> +{" "}
          <code>VERCEL_PROJECT_ID</code> are set; otherwise status stays{" "}
          <code>awaiting_dns</code> with operator notes.
        </li>
        <li>
          Email the buyer DNS steps + preview URL (in addition to the receipt).
        </li>
        <li>
          Contact form at <code>POST /api/contact/[slug]</code> (UI wired on{" "}
          <code>/preview/[slug]</code>) forwards inquiries to the lead email (or support){" "}
          <strong>and</strong> persists them to the operator Inquiries inbox.
        </li>
      </ol>

      <h2>Operator steps to mark live</h2>
      <ol>
        <li>
          Open <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> — open handoffs appear
          above the pipeline table.
        </li>
        <li>Add the listed DNS records (or finish Vercel domain verification).</li>
        <li>
          Click <strong>Mark live</strong> — sets handoff status and lead stage to{" "}
          <code>live</code>.
        </li>
      </ol>

      <h2>Client inquiry inbox</h2>
      <p>
        Every contact-form POST creates a <code>client_inquiries</code> row (SQLite always;
        Convex <code>clientInquiries</code> when <code>NEXT_PUBLIC_CONVEX_URL</code> is set).
        Operators see new messages on the leads dashboard, can mark them read or archive, and
        still get the email notify. Preview pages already include the contact form UI (
        <code>preview-conversion-finish</code>, PR #12).
      </p>

      <h2>Env vars</h2>
      <ul>
        <li>
          <code>NEXT_PUBLIC_PRODUCTION_DOMAIN</code> — root for suggested hosts (optional).
        </li>
        <li>
          <code>NEXT_PUBLIC_PREVIEW_DOMAIN</code> — fallback root if production domain unset.
        </li>
        <li>
          <code>VERCEL_TOKEN</code>, <code>VERCEL_PROJECT_ID</code>, optional{" "}
          <code>VERCEL_TEAM_ID</code> — enable automated domain registration.
        </li>
      </ul>

      <h2>What is still stubbed</h2>
      <ul>
        <li>Per-client Vercel project isolation (shared project + path/host routing for now).</li>
        <li>Automatic DNS at the registrar (buyer or operator must still create records).</li>
        <li>
          Per-client login to view their own inquiries (operator inbox only for the MVP).
        </li>
      </ul>

      <p>
        Engineering ownership and decisions: <DocLink href="/docs/process">process log</DocLink>.
      </p>
    </DocPage>
  );
}
