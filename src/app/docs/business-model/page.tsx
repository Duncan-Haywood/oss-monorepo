import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

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
            <th>Bundle</th>
            <th>Price</th>
            <th>Includes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Starter</td>
            <td>$500 one-time</td>
            <td>Landing page, contact form, maps, SEO, domain handoff</td>
          </tr>
          <tr>
            <td>Growth</td>
            <td>$500 + $99/mo</td>
            <td>Starter + AI marketing (8 social/GBP + 2 emails/mo)</td>
          </tr>
          <tr>
            <td>Complete</td>
            <td>$500 + $199/mo</td>
            <td>Growth + full marketing + client AI phone agent</td>
          </tr>
          <tr>
            <td>Commerce add-on</td>
            <td>+$300 + $49/mo</td>
            <td>Stripe checkout, catalog ≤50 SKUs</td>
          </tr>
        </tbody>
      </table>
      <p>
        Invoices and Stripe receipts show <strong>{brand.legalEntity}</strong>. Outreach uses
        the public brand.
      </p>

      <h2>Automated funnel</h2>
      <ol>
        <li>Discover business (API/CSV)</li>
        <li>Auto-generate preview site</li>
        <li>Email with preview link (+ optional outbound voice)</li>
        <li>Customer views preview or calls AI assistant</li>
        <li>Voice discovery updates preview (optional)</li>
        <li>Stripe checkout — self-serve</li>
        <li>Automated production deploy + DNS handoff</li>
      </ol>

      <h2>Outreach — Email 1</h2>
      <p>
        <strong>From:</strong> {brand.name}
        <br />
        <strong>Subject:</strong> {"{BusinessName}"} — we built your website (free preview)
      </p>
      <ol>
        <li>Preview link on subdomain</li>
        <li>Callback number for AI assistant</li>
        <li>Checkout on preview — bundles from $500</li>
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
        Resend (<code>OUTREACH_CADENCE_CONVEX_PRIMARY</code>). Action-level Vitest in{" "}
        <code>update-lead-stage-action.test.ts</code> locks that dashboard glue beside
        stage-persist helpers.
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
        <li>Platform voice after customization</li>
        <li>
          Post-purchase upgrade emails — operator <strong>Upsell</strong> on paid/live Starter
          leads (<code>/dashboard/leads</code> panel + row action) → Growth/Complete checkout;
          the same candidates also appear in the operator daily digest
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
