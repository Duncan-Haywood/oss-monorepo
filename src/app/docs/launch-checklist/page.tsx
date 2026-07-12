import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

export default function LaunchChecklistDocPage() {
  return (
    <DocPage
      title="Launch checklist"
      subtitle={`Operator steps to take ${brand.name} from demo → first paid order`}
      related={[
        { href: "/docs/process", label: "Process log" },
        { href: "/docs/roadmap", label: "Roadmap" },
        { href: "/docs/compliance", label: "Compliance" },
      ]}
    >
      <p>
        Agents can ship code; only a human operator can finish Stripe, DNS, and legal setup.
        Work this list top-to-bottom before the first outreach batch.
      </p>

      <h2>1. Payments (blocks every sale)</h2>
      <ol>
        <li>
          Confirm Stripe account is under <strong>{brand.legalEntity}</strong> (not a personal
          account).
        </li>
        <li>
          Set <code>STRIPE_SECRET_KEY</code>, <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>, and{" "}
          <code>STRIPE_WEBHOOK_SECRET</code> in the deployment environment.
        </li>
        <li>
          Create Prices: set <code>ALLOW_STRIPE_BOOTSTRAP=1</code>,{" "}
          <code>POST /api/stripe/bootstrap-prices</code>, paste the returned{" "}
          <code>envSnippet</code> into secrets, then <strong>unset</strong> the bootstrap flag.
        </li>
        <li>
          Point the Stripe webhook to <code>/api/stripe/webhook</code> for{" "}
          <code>checkout.session.completed</code> (test mode first, then live).
        </li>
        <li>
          Smoke-test: open a demo preview → Checkout (confirm business name / email prefilled from
          slug) → pay with a test card → confirm lead stage becomes <code>paid</code> on{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>.
        </li>
      </ol>

      <h2>2. Operator dashboard auth (blocks safe outreach at scale)</h2>
      <ol>
        <li>
          Set a strong <code>OPERATOR_DASHBOARD_PASSWORD</code> in the deployment environment.
          Until set, <code>/dashboard</code> stays open for demos — do not import real contacts
          or flip stages to <code>outreach_sent</code> without it.
        </li>
        <li>
          Open <DocLink href="/dashboard/login">/dashboard/login</DocLink>, sign in, confirm
          lead mutations still work, then use Sign out.
        </li>
      </ol>

      <h2>3. Outreach (blocks top-of-funnel)</h2>
      <ol>
        <li>
          Set <code>RESEND_API_KEY</code>, <code>EMAIL_FROM</code>, and a real{" "}
          <code>NEXT_PUBLIC_COMPANY_ADDRESS</code> (CAN-SPAM).
        </li>
        <li>Configure SPF / DKIM / DMARC on the sending domain.</li>
        <li>
          Import a small operator-owned CSV on the leads dashboard (or add one lead manually
          with email), move stage to <code>outreach_sent</code>, confirm the email (or mock log)
          and unsubscribe path.
        </li>
        <li>
          After a few days (or by forcing <code>lastOutreachAt</code> older in SQLite for a
          test lead), confirm the Follow-ups due panel offers Email 2 / Email 3 and that
          suppression still blocks sends.
        </li>
        <li>
          On <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>, confirm the{" "}
          <strong>Work next</strong> panel ranks real CSV/manual leads above demos, surfaces
          missing-email leads as Blocked, and the Quality column sorts the table by score.
        </li>
        <li>
          Open a preview with <code>?src=outreach</code> (or after stage is{" "}
          <code>outreach_sent</code>), confirm <code>lastPreviewOpenAt</code> appears as an
          Opened badge on the leads table and that Follow-ups due ranks openers first.
        </li>
      </ol>

      <h2>4. Persistence</h2>
      <ol>
        <li>
          Optional but recommended for multi-instance deploys: provision Convex (
          <code>NEXT_PUBLIC_CONVEX_URL</code>). Local SQLite is the zero-config fallback.
        </li>
        <li>
          Confirm lead <code>email</code> persists after save — outreach depends on it.
        </li>
      </ol>

      <h2>5. Branding + legal</h2>
      <ol>
        <li>
          Set <code>NEXT_PUBLIC_BRAND_NAME</code> before customer-facing launches.
        </li>
        <li>
          Privacy and Terms are live at <DocLink href="/privacy">/privacy</DocLink> and{" "}
          <DocLink href="/terms">/terms</DocLink> — review with counsel before paid ads or
          cold email at scale.
        </li>
        <li>
          Do not enable Google Places ingestion until legal review (
          <DocLink href="/docs/compliance">Compliance</DocLink>). CSV / manual entry is the
          approved path today.
        </li>
      </ol>

      <h2>6. Definition of “ready for revenue”</h2>
      <ul>
        <li>Test checkout completes and webhook marks the lead paid</li>
        <li>
          <code>OPERATOR_DASHBOARD_PASSWORD</code> set; dashboard login works
        </li>
        <li>At least one outreach email can send (or clearly mock) with unsubscribe</li>
        <li>Operator can add leads via form or CSV without engineering help</li>
        <li>Public brand + Colorado postal address present on outbound email</li>
        <li>
          After a test payment, a deploy handoff appears on the leads dashboard (see{" "}
          <DocLink href="/docs/production-deploy">Production deploy</DocLink>)
        </li>
        <li>
          <DocLink href="/dashboard/leads">Pipeline health</DocLink> shows recorded revenue,
          stage funnel, open handoffs, and leads missing email (no row-scanning required)
        </li>
        <li>
          <DocLink href="/dashboard/leads">Work next</DocLink> quality scores prioritize
          outreach (real contacts above demos; blocked when email is missing)
        </li>
        <li>
          Operator can open <strong>Notes</strong> on a lead row, save call outcomes, and find
          them again via search — notes stay off the public preview site
        </li>
      </ul>

      <h2>7. After the first paid order (Phase 5)</h2>
      <ol>
        <li>
          Optional: set <code>VERCEL_TOKEN</code> + <code>VERCEL_PROJECT_ID</code> (and{" "}
          <code>NEXT_PUBLIC_PRODUCTION_DOMAIN</code>) so domain registration is attempted
          automatically.
        </li>
        <li>
          Complete DNS from the handoff panel, then <strong>Mark live</strong>. Confirm
          paid-not-live and open-handoff counts drop on pipeline health.
        </li>
        <li>
          Point client site forms at <code>/api/contact/[slug]</code>. Submissions land in the
          operator Inquiries panel on the leads dashboard (and still email the business).
        </li>
      </ol>

      <p>
        Track engineering backlog in the <DocLink href="/docs/process">process log</DocLink>.
        Stripe Price bootstrap remains an operator-owned todo until secrets are pasted.
      </p>
    </DocPage>
  );
}
