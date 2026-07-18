import type { Metadata } from "next";
import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";
import { docPageMetadata } from "@/lib/seo";

export const metadata: Metadata = docPageMetadata("/docs/production-deploy");

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
        <code>paid</code>, enqueues a <strong>production deploy handoff</strong>, then sends a
        receipt (and DNS next-steps email) on the first delivery only. The handoff enqueue is
        idempotent on slug + stripeSessionId and still runs on Stripe redelivery so a partial
        first attempt cannot permanently skip Phase 5. If the payment or handoff write fails, the
        webhook returns <code>500</code> so Stripe retries (emails stay best-effort after durable
        writes). That record holds DNS instructions, a suggested production hostname, and the
        contact-form endpoint for the site.
      </p>

      <h2>What ships automatically</h2>
      <ol>
        <li>
          Persist a <code>deploy_handoffs</code> / Convex <code>deployHandoffs</code> row
          (Convex-first when <code>NEXT_PUBLIC_CONVEX_URL</code> is set; SQLite fallback
          otherwise — same pattern as suppressions after the multi-instance gap fix).
        </li>
        <li>
          Suggested host: <code>{"{slug}."}{"{NEXT_PUBLIC_PRODUCTION_DOMAIN}"}</code> (or derived
          from <code>NEXT_PUBLIC_PREVIEW_DOMAIN</code>).
        </li>
        <li>
          Best-effort Vercel Domains API call when <code>VERCEL_TOKEN</code> is set and a project
          resolves — either this handoff&apos;s dedicated <code>vercelProjectId</code> (see below)
          or the shared <code>VERCEL_PROJECT_ID</code>; otherwise status stays{" "}
          <code>awaiting_dns</code> with operator notes. Until{" "}
          <code>VERCEL_TOKEN</code> is a non-placeholder secret,{" "}
          <DocLink href="/dashboard">/dashboard</DocLink> shows a blue automation banner via{" "}
          <code>assessVercelTokenEnvReadiness</code>. Until shared{" "}
          <code>VERCEL_PROJECT_ID</code> is a non-placeholder id, dashboards show an indigo
          shared-project banner via <code>assessVercelProjectIdEnvReadiness</code>.
        </li>
        <li>
          Email the buyer DNS steps + preview URL (in addition to the receipt).
        </li>
        <li>
          Contact form at <code>POST /api/contact/[slug]</code> (UI wired on{" "}
          <code>/preview/[slug]</code>) persists an inquiry to the operator inbox first, then
          best-effort emails the lead (or support). Persist failure returns{" "}
          <code>503</code> — never <code>{"{ ok: true }"}</code> without a durable CRM trail.
          When Convex is configured, the route passes <code>CONTACT_FORM_CONVEX_PRIMARY</code>{" "}
          so a mutation failure fails closed instead of SQLite-only success. Route-level Vitest
          in <code>src/app/api/contact/[slug]/route.test.ts</code> locks that orchestration.
        </li>
      </ol>

      <h2>Operator steps to mark live</h2>
      <ol>
        <li>
          Open <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> — open handoffs appear
          above the pipeline table. The same non-live handoffs also list under{" "}
          <strong>Production handoffs open</strong> in the operator daily digest (Send daily
          digest) so go-live debt is visible without opening the dashboard. A lead marked{" "}
          <code>stage=paid</code> with no handoff row at all (e.g. a CSV-imported legacy client)
          won&rsquo;t appear there — the digest&rsquo;s separate{" "}
          <strong>Paid, not yet live</strong> section catches that case directly from lead stage.
          Separately, email-critical leads with no usable address list under{" "}
          <strong>Leads missing email</strong> in the same digest (Email 1 / follow-ups cannot
          leave without one).
        </li>
        <li>Add the listed DNS records (or finish Vercel domain verification).</li>
        <li>
          Click <strong>Mark live</strong> — sets handoff status and lead stage to{" "}
          <code>live</code>.
        </li>
      </ol>

      <h2>Per-client Vercel project isolation</h2>
      <p>
        Every handoff has an optional <code>vercelProjectId</code>. Leave it blank and the shared{" "}
        <code>VERCEL_PROJECT_ID</code> project is used, same as before. To isolate a client onto
        their own Vercel project — for build/deploy independence, or a client who wants their own
        Vercel account billed separately — create that project yourself in the Vercel dashboard
        (or via <code>vercel projects add</code>), paste its ID into the{" "}
        <strong>Dedicated Vercel project ID</strong> field on that handoff&apos;s card in{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>, and click{" "}
        <strong>Save + provision</strong>. Domain provisioning immediately retries against the new
        project. This is deliberately manual: creating and configuring a full Vercel project
        (build settings, env vars, deploy source) for a one-off client isn&apos;t something this
        app should do unattended yet — assigning the ID just tells the domain API which project to
        target once the project already exists.
      </p>

      <h2>Custom domain routing</h2>
      <p>
        Every handoff card on <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> has a{" "}
        <strong>Client&apos;s own domain</strong> field. Once the operator (or client) points that
        domain&apos;s DNS at this deployment and saves it here, <code>src/proxy.ts</code> rewrites
        requests for <code>/</code> on that Host to the lead&apos;s{" "}
        <code>/preview/[slug]</code> — the client&apos;s domain shows their site, not the{" "}
        {brand.name} marketing page. Saving also retries the best-effort Vercel Domains API call
        against <code>customDomain</code> (falling back to <code>suggestedHost</code> when unset).
        Only the root path is rewritten; <code>/api/*</code> and <code>/dashboard/*</code> already
        address a lead by slug and are unaffected by Host. Orchestration Vitest in{" "}
        <code>src/proxy.test.ts</code> locks that contract (plus preview-subdomain ordering and
        unrecognized-label <code>next()</code>). The <em>read</em> path (
        <code>getLeadSlugByCustomDomain</code>, used by <code>src/proxy.ts</code>) is Convex-first
        with a SQLite fallback, same as every other <code>src/lib/db.ts</code> lookup. The{" "}
        <strong>write</strong> path is different: when Convex is configured, saving a custom
        domain, assigning a dedicated Vercel project, or clicking <strong>Mark live</strong> all
        pass <code>requireConvex</code> (<code>DEPLOY_HANDOFF_CONVEX_PRIMARY</code>) so a
        Convex mutation failure surfaces as a retry message instead of silently succeeding against
        instance-local SQLite only — otherwise the routing/project/live-status change could be
        invisible to every other instance, which reads Convex-first. Action-level Vitest in{" "}
        <code>mark-handoff-live-action.test.ts</code> locks the Mark live glue (auth, empty
        slug, no-handoff, requireConvex fail-closed, success revalidate),{" "}
        <code>assign-vercel-project-action.test.ts</code> locks Assign Vercel project (auth,
        empty slug, trim/clear project id, no-handoff, requireConvex fail-closed, success
        revalidate), and <code>assign-custom-domain-action.test.ts</code> locks the Save domain
        glue (auth, empty slug, trim-to-null clear, no-handoff, requireConvex fail-closed,
        success revalidate) beside handoff-persist / custom-domain-routing helpers. A later
        bundle checkout
        (Starter→Growth upsell or re-purchase) rebuilds the handoff for the new Stripe session —
        <code>preserveDeployHandoffOperatorFields</code> keeps the saved domain (and any dedicated{" "}
        <code>vercelProjectId</code>), plus <code>live</code>/<code>provisioned</code> status
        and operator notes, so routing and Mark live progress do not silently break after an
        upsell payment.
      </p>

      <h2>Client inquiry inbox</h2>
      <p>
        Every contact-form POST creates a <code>client_inquiries</code> row (SQLite always;
        Convex <code>clientInquiries</code> when <code>NEXT_PUBLIC_CONVEX_URL</code> is set)
        before claiming success. Persist is required: if the inbox write fails, the endpoint
        returns <code>503</code> and the preview form shows an error — never{" "}
        <code>{"{ ok: true }"}</code> without a durable CRM trail (Starter sold promise). When
        Convex is configured, the insert passes <code>requireConvex</code> (
        <code>CONTACT_FORM_CONVEX_PRIMARY</code>) so a Convex mutation failure does not
        silently fall back to instance-local SQLite — dashboard/other instances read
        Convex-first and would never see the inquiry. Email notify runs only after a
        successful insert (best-effort; notify failure does not undo the row; the route
        inspects <code>sendEmail</code>&apos;s <code>{"{ success }"}</code> shape and returns{" "}
        <code>notifySent</code> so a suppression/Resend failure is logged against the inquiry
        id rather than treated as a silent no-op; dynamic fields in the notify HTML are
        escaped). Operators see new messages on the leads dashboard,
        can <strong>Reply</strong> via Resend (honors suppression, stores{" "}
        <code>operatorReply</code> / <code>repliedAt</code>, status <code>replied</code>),
        mark read/archive. Preview pages already include the contact form UI (
        <code>preview-conversion-finish</code>, PR #12).
      </p>

      <h2>Env vars</h2>
      <ul>
        <li>
          <code>NEXT_PUBLIC_PRODUCTION_DOMAIN</code> — root for suggested hosts. Until it is a
          bare public production root (not missing / whitespace / localhost /{" "}
          <code>example.com</code> / <code>preview.*</code>),{" "}
          <DocLink href="/dashboard">/dashboard</DocLink> and{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> show a cyan production-root
          banner via <code>assessProductionDomainEnvReadiness</code> (
          <code>src/lib/deploy/production-domain-env-readiness.ts</code>). Env presence only —
          does not resolve DNS; <code>NEXT_PUBLIC_PREVIEW_DOMAIN</code> fallback does not count
          as ready.
        </li>
        <li>
          <code>NEXT_PUBLIC_PREVIEW_DOMAIN</code> — fallback root if production domain unset.
        </li>
        <li>
          <code>VERCEL_TOKEN</code> — required for Domains API automation; until set, dashboards
          show a blue readiness banner (<code>assessVercelTokenEnvReadiness</code>).{" "}
          <code>VERCEL_PROJECT_ID</code> — shared project fallback when a handoff has no
          per-client Assign project id; until set, dashboards show an indigo readiness banner (
          <code>assessVercelProjectIdEnvReadiness</code>). Optional <code>VERCEL_TEAM_ID</code>.
        </li>
      </ul>

      <h2>What is still stubbed</h2>
      <ul>
        <li>
          Automated Vercel <em>project creation</em> per client — operators assign an existing
          project&apos;s ID (see above); the app doesn&apos;t call the Vercel Projects API to
          create one.
        </li>
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
