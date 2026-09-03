import type { Metadata } from "next";
import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";
import {
  monthlyMarketingEmailCount,
  monthlyMarketingSocialPostCount,
} from "@/lib/marketing/monthly-pack";
import { docPageMetadata } from "@/lib/seo";
import {
  bundlePriceHeadingLabel,
  commerceAddonPriceHeadingLabel,
  getBundle,
  minBundleSetupPriceUsd,
} from "@/lib/pricing/bundles";

export const metadata: Metadata = docPageMetadata("/docs/business-model");

export default function BusinessModelDocPage() {
  return (
    <DocPage
      title="Business model"
      subtitle={`Public brand: ${brand.name} · Legal: ${brand.legalEntity}`}
      related={[
        { href: "/docs/product-bundles", label: "Product bundles" },
        { href: "/docs/voice-agent-flow", label: "Voice agent flow" },
        { href: "/docs/marketing-automation", label: "Marketing automation" },
      ]}
    >
      <h2>Value proposition</h2>
      <p>
        Digital presence bundles for local businesses — preview before purchase, zero human
        sales friction. Customers get a link, talk to AI for changes, pick a bundle self-serve.
      </p>

      <h2>Pricing — bundles</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Bundle</th>
            <th scope="col">Price</th>
            <th scope="col">Includes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Starter</td>
            <td>{bundlePriceHeadingLabel(getBundle("starter")!)}</td>
            <td>Landing page, contact form, maps, SEO, domain handoff</td>
          </tr>
          <tr>
            <td>Growth</td>
            <td>{bundlePriceHeadingLabel(getBundle("growth")!)}</td>
            <td>
              Starter + AI marketing ({monthlyMarketingSocialPostCount()} social/GBP +{" "}
              {monthlyMarketingEmailCount()} emails/mo)
            </td>
          </tr>
          <tr>
            <td>Complete</td>
            <td>{bundlePriceHeadingLabel(getBundle("complete")!)}</td>
            <td>Growth + full marketing + client AI phone agent</td>
          </tr>
          <tr>
            <td>Commerce add-on</td>
            <td>{commerceAddonPriceHeadingLabel()}</td>
            <td>Stripe checkout, catalog ≤50 SKUs</td>
          </tr>
          <tr>
            <td>
              <DocLink href="/docs/eaa-evidence">Accessibility evidence</DocLink>
            </td>
            <td>Indicative EUR range; checkout not live</td>
            <td>Dated record for obligated EU shops — not a certificate</td>
          </tr>
        </tbody>
      </table>
      <p>
        Invoices and Stripe receipts show <strong>{brand.legalEntity}</strong>. Outreach uses
        the public brand. Until <code>NEXT_PUBLIC_BRAND_NAME</code> is a non-placeholder value,{" "}
        <DocLink href="/dashboard">/dashboard</DocLink> shows a rose brand-copy banner via{" "}
        <code>assessBrandNameEnvReadiness</code> so Email 1 cannot silently ship as{" "}
        <code>Your Brand</code>.
      </p>

      <h2>Automated funnel</h2>
      <ol>
        <li>Discover business (API/CSV)</li>
        <li>Auto-generate preview site</li>
        <li>Email with preview link</li>
        <li>Customer views preview, self-serve checkouts, or replies for tweaks</li>
        <li>Stripe checkout — self-serve</li>
        <li>Automated production deploy + DNS handoff</li>
      </ol>
      <p>
        No sales calls: platform voice (an AI assistant that calls or answers for{" "}
        {brand.name} itself) is unbuilt — see{" "}
        <DocLink href="/docs/roadmap">Roadmap</DocLink> and{" "}
        <DocLink href="/docs/voice-agent-flow">Voice agent flow</DocLink>.
      </p>

      <h2>Outreach — Email 1</h2>
      <p>
        <strong>From:</strong> {brand.name}
        <br />
        <strong>Subject:</strong> {"{BusinessName}"} — we built your website (free preview)
      </p>
      <ol>
        <li>Preview link on subdomain</li>
        <li>Checkout on preview — bundles from ${minBundleSetupPriceUsd()}</li>
        <li>CAN-SPAM footer: public brand + {brand.legalEntity} address</li>
      </ol>

      <h2>Outreach — Email 2 / 3 (follow-ups)</h2>
      <p>
        Operator-triggered from <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>{" "}
        (not an auto-cron). Persists <code>outreachStep</code> + <code>lastOutreachAt</code> on
        the lead before Resend (persist-then-notify). Cadence defaults: Email 2 after 3 days,
        Email 3 after 4 more days. Suppression list still blocks sends. Action-level Vitest in{" "}
        <code>send-follow-up-action.test.ts</code> locks the dashboard Follow-up glue beside
        the outreach-followups helpers.
      </p>

      <h2>Starter CRM — inquiry Reply</h2>
      <p>
        Operator reply from the leads inbox marks the inquiry <code>replied</code> before
        Resend (persist-then-notify / <code>INQUIRY_REPLY_CONVEX_PRIMARY</code>) so unreplied
        metrics stay accurate across Convex-first instances. Action-level Vitest in{" "}
        <code>reply-to-inquiry-action.test.ts</code> locks the dashboard Reply glue beside
        reply-persist / reply.ts helpers. Mark-read (composer open) and Archive use the same
        requireConvex surface without Resend;{" "}
        <code>update-inquiry-status-action.test.ts</code> locks that status-only glue.
      </p>

      <h2>Cold-lead Re-engage / Close</h2>
      <p>
        After Email 1–3 silence, operators Re-engage (reset cadence, optional Email 1) or Close
        from the Cold panel. Disposition writes use{" "}
        <code>COLD_DISPOSITION_CONVEX_PRIMARY</code>; optional Email 1 marks outreach before
        Resend. Action-level Vitest in <code>dispose-cold-lead-action.test.ts</code> locks that
        dashboard glue beside cold-archive helpers.
      </p>

      <h2>Stage dropdown + Email 1</h2>
      <p>
        Manual funnel moves on <code>/dashboard/leads</code> use{" "}
        <code>LEAD_STAGE_CONVEX_PRIMARY</code> so stage changes cannot succeed only in
        instance-local SQLite. Moving to <code>outreach_sent</code> marks Email 1 before
        Resend (<code>OUTREACH_CADENCE_CONVEX_PRIMARY</code>) and returns{" "}
        <code>success:false</code> when <code>sendOutreachEmail</code> resolves{" "}
        <code>{`{ success: false }`}</code> (suppression / Resend) — same contract as
        follow-ups / cold re-engage. Action-level Vitest in{" "}
        <code>update-lead-stage-action.test.ts</code> locks that dashboard glue beside
        stage-persist helpers.
      </p>

      <h2>Discovery-call / Email 3 notes</h2>
      <p>
        Saving free-text call outcomes on <code>/dashboard/leads</code> uses{" "}
        <code>LEAD_NOTES_CONVEX_PRIMARY</code> so notes cannot succeed only in instance-local
        SQLite — getLeads / Work next search-over-notes read Convex-first. Action-level Vitest
        in <code>update-lead-notes-action.test.ts</code> locks that dashboard glue beside
        notes-persist helpers (auth, soft cap, clear/trim, requireConvex fail-closed).
      </p>

      <h2>Add lead (manual create)</h2>
      <p>
        Manual inventory create on <code>/dashboard/leads</code> uses{" "}
        <code>LEAD_UPSERT_CONVEX_PRIMARY</code> so new leads cannot succeed only in
        instance-local SQLite — getLeads / Work next / outreach eligibility read Convex-first.
        Existing-slug collisions reject without calling <code>upsertLead</code>. Creating at{" "}
        <code>outreach_sent</code> with an email marks Email 1 before Resend (
        <code>OUTREACH_CADENCE_CONVEX_PRIMARY</code>) and surfaces{" "}
        <code>!sent.success</code> the same way as the stage dropdown. Action-level Vitest in{" "}
        <code>add-lead-action.test.ts</code> locks that dashboard glue beside upsert-persist
        helpers.
      </p>

      <h2>Import CSV (bulk create)</h2>
      <p>
        Bulk inventory create on <code>/dashboard/leads</code> uses the same{" "}
        <code>LEAD_UPSERT_CONVEX_PRIMARY</code> per row. Existing-slug collisions skip with a
        row warning (no overwrite of stage/outreach/notes/snooze). Per-row Convex failures
        surface a retry message while siblings in the same batch can still import.
        Action-level Vitest in <code>import-leads-csv-action.test.ts</code> locks that
        dashboard glue beside csv-import / upsert-persist helpers.
      </p>

      <h2>Mark live / Assign Vercel / Save domain (fulfill)</h2>
      <p>
        Closing a paid deploy handoff on <code>/dashboard/leads</code> uses{" "}
        <code>DEPLOY_HANDOFF_CONVEX_PRIMARY</code> so Mark live cannot succeed only in
        instance-local SQLite — paidNotLive / open handoffs / the stage funnel read Convex-first.
        Missing handoffs return not-found (no false live). Action-level Vitest in{" "}
        <code>mark-handoff-live-action.test.ts</code> locks that dashboard glue beside
        handoff-persist helpers. Assign Vercel project (dedicated Domains API target) and Save
        domain (Host→preview) share the same fail-closed surface — locked by{" "}
        <code>assign-vercel-project-action.test.ts</code> and{" "}
        <code>assign-custom-domain-action.test.ts</code>.
      </p>

      <h2>Save domain (Host→preview)</h2>
      <p>
        Saving a client&apos;s own domain on the handoff card uses the same{" "}
        <code>DEPLOY_HANDOFF_CONVEX_PRIMARY</code> surface so Host→preview routing cannot succeed
        only in instance-local SQLite — <code>src/proxy.ts</code> and other instances read
        Convex-first. Whitespace-only clears the domain (<code>null</code>). Missing handoffs
        return not-found. Action-level Vitest in{" "}
        <code>assign-custom-domain-action.test.ts</code> locks that dashboard glue beside
        handoff / custom-domain-routing helpers.
      </p>

      <h2>Assign Vercel project (isolation)</h2>
      <p>
        Pointing a handoff at a dedicated Vercel project (or clearing back to the shared
        default) uses the same <code>DEPLOY_HANDOFF_CONVEX_PRIMARY</code> surface so Domains API
        provisioning cannot target a project id that only exists in instance-local SQLite.
        Whitespace-only clears the dedicated id (<code>null</code>). Action-level Vitest in{" "}
        <code>assign-vercel-project-action.test.ts</code> locks that dashboard glue beside
        handoff helpers.
      </p>

      <h2>Work next snooze / Unsnooze</h2>
      <p>
        Parking a hot lead off Work next (1d / 3d / 7d) or clearing an early return uses{" "}
        <code>LEAD_SNOOZE_CONVEX_PRIMARY</code> so park / Unsnooze cannot succeed only in
        instance-local SQLite — follow-ups-due and digest footnotes read Convex-first.
        Action-level Vitest in <code>snooze-lead-action.test.ts</code> locks that dashboard
        glue beside snooze-persist helpers.
      </p>
      <ul>
        <li>
          <strong>Email 2</strong> — short nudge with preview + checkout links
        </li>
        <li>
          <strong>Email 3</strong> — soft close / last note before the sequence stops
        </li>
      </ul>

      <h2>Bundle upsell touchpoints</h2>
      <ul>
        <li>Preview site tier comparison cards</li>
        <li>
          Post-purchase upgrade emails — operator <strong>Upsell</strong> on paid/live Starter
          leads (<code>/dashboard/leads</code> panel + row action) → Growth/Complete checkout;
          the same candidates also appear in the operator daily digest
        </li>
        <li>
          Second-step upgrade — operator <strong>Upsell to Complete</strong> on paid/live
          Growth-only leads (own panel + row action) → Complete checkout, pitching the AI phone
          agent, appointment booking, and seasonal promos Growth doesn&apos;t include; also
          surfaced in pipeline health and the daily digest
        </li>
      </ul>

      <h2>Operator workflow</h2>
      <p>Monitoring only — weekly metrics, alert on failures, monthly script tuning. No daily outreach or discovery calls.</p>

      <p>
        Full tier scope: <DocLink href="/docs/product-bundles">Product bundles</DocLink>
      </p>
    </DocPage>
  );
}
