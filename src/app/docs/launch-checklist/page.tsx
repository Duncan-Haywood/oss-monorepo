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
          <code>STRIPE_WEBHOOK_SECRET</code> in the deployment environment. Until all three are
          present, <DocLink href="/dashboard">/dashboard</DocLink> and{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> show an amber core-secrets
          banner via <code>assessStripeCoreEnvReadiness</code> — missing{" "}
          <code>STRIPE_SECRET_KEY</code> blocks checkout create; missing{" "}
          <code>STRIPE_WEBHOOK_SECRET</code> is worse (Stripe can charge while CRM/handoff never
          records). Distinct from the rose Price-ID banner below.
        </li>
        <li>
          Create Prices: set <code>ALLOW_STRIPE_BOOTSTRAP=1</code>, open{" "}
          <DocLink href="/dashboard">/dashboard</DocLink> (or{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>), click{" "}
          <strong>Run bootstrap</strong> on the checkout-blocked banner, copy the returned{" "}
          <code>envSnippet</code> into secrets, then <strong>unset</strong> the bootstrap flag.
          (API twin: <code>POST /api/stripe/bootstrap-prices</code> — same gate via{" "}
          <code>assessStripeBootstrapGate</code>. Action-level Vitest in{" "}
          <code>src/app/dashboard/actions.test.ts</code> locks the banner path operators click.)
          Until every{" "}
          <code>STRIPE_PRICE_ID_*</code> from <code>BUNDLES</code> +{" "}
          <code>COMMERCE_ADDON</code> is set, those pages show a checkout-blocked banner (via{" "}
          <code>assessBundlePriceEnvReadiness</code>) — fix that before outreach that points at
          Checkout. Bootstrap stays operator-gated (flag + paste secrets); the banner button
          only removes the curl friction, it does not fake-complete{" "}
          <code>stripe-price-objects</code>.
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
        <li>
          Activate <strong>Customer Portal</strong> in the Stripe Dashboard (Settings → Billing →
          Customer portal) so Growth/Complete/Commerce subscribers can update cards and cancel.
          Then open <strong>Billing</strong> on a paid lead row, or{" "}
          <strong>Manage subscription</strong> on <code>/checkout/success</code> after a
          subscription checkout. If a lead has multiple eligible orders, Billing must open against
          the newest one (<code>listOrders</code> newest-first).
        </li>
        <li>
          After a Starter-only test payment (no Growth/Complete/Commerce), confirm the{" "}
          <strong>Starter → MRR upsell</strong> panel and row <strong>Upsell</strong> button
          appear on <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>. Send the nudge
          (mock log is fine without Resend) and confirm the checkout link preselects Growth
          (or Complete when <code>recommendedTier</code> is Complete). Billing and Upsell must
          not both show for the same lead.
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
          <code>NEXT_PUBLIC_COMPANY_ADDRESS</code> (CAN-SPAM). Until{" "}
          <code>RESEND_API_KEY</code> is a non-placeholder secret,{" "}
          <DocLink href="/dashboard">/dashboard</DocLink> and{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> show a sky
          outreach-blocked banner via <code>assessResendEmailEnvReadiness</code> — missing or{" "}
          <code>re_placeholder…</code> keys leave every automated send in silent mock mode
          (operators see success while no inbox is reached). Distinct from the Stripe core /
          Price-ID banners. Until <code>ANTHROPIC_API_KEY</code> is a non-placeholder secret,
          the same dashboards show a teal AI-packs-on-stub banner via{" "}
          <code>assessAnthropicEnvReadiness</code> — Growth/Complete{" "}
          <strong>Generate pack</strong> / Complete <strong>Generate voice</strong> still
          produce packs, but via Stub* template copy (sold AI quality gap).
        </li>
        <li>Configure SPF / DKIM / DMARC on the sending domain.</li>
        <li>
          Import a small operator-owned CSV on the leads dashboard (or add one lead manually
          with email), move stage to <code>outreach_sent</code>, confirm the email (or mock log)
          and unsubscribe path (<code>GET /api/unsubscribe?email=…</code>). With Convex configured,
          Add lead / CSV import must fail closed on Convex mutation failure (
          <code>requireConvex</code> / <code>LEAD_UPSERT_CONVEX_PRIMARY</code>) — never claim
          success after a SQLite-only write other instances cannot see. Manual stage moves on the
          dashboard likewise fail closed (<code>LEAD_STAGE_CONVEX_PRIMARY</code>) so funnel state
          cannot succeed only in instance-local SQLite while Convex-first readers miss the move
          (Mark live already fail-closes via handoff writes). A Convex unsubscribe
          write failure must return 500 (not a success page after a SQLite-only suppress).
          Re-importing the same CSV (or re-adding the same slug) should skip/reject the collision
          rather than resetting stage or outreach.
        </li>
        <li>
          After a few days (or by forcing <code>lastOutreachAt</code> older in SQLite for a
          test lead), confirm the Follow-ups due panel offers Email 2 / Email 3 and that
          suppression still blocks sends. Every Email 1/2/3 send durably marks{" "}
          <code>outreachStep</code> before calling Resend; with Convex configured that mark
          fails closed (<code>requireConvex</code>) — a mutation failure skips the send and
          shows a retry message instead of a false success.
        </li>
        <li>
          On <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>, confirm the{" "}
          <strong>Work next</strong> panel ranks real CSV/manual leads above demos, surfaces
          missing-email leads as Blocked, and the Quality column sorts the table by score.
        </li>
        <li>
          With a synthetic open <code>checkout_sessions</code> row older than 2h, confirm Work next
          shows a Cart badge and ranks that lead above a plain follow-up-due peer.
        </li>
        <li>
          Open a preview with <code>?src=outreach</code> (or after stage is{" "}
          <code>outreach_sent</code>), confirm <code>lastPreviewOpenAt</code> appears as an
          Opened badge on the leads table and that Follow-ups due ranks openers first. With
          Convex configured, a failed shared-store write must return <code>503</code> (
          <code>requireConvex</code>) — never claim <code>recorded:true</code> after a
          SQLite-only update other instances cannot see.
        </li>
        <li>
          Set <code>OPERATOR_DIGEST_EMAIL</code> and use <strong>Send daily digest</strong> on{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> to confirm Work next,
          follow-ups due, abandoned-checkout recoveries, unreplied inquiries, marketing packs
          due (Growth/Complete missing this UTC month — from an uncapped pack list, not a
          newest-N page), Starter → MRR upsell candidates, and
          Complete voice packs due all show up in one email (or the mock log) — plus a
          snoozed-lead footnote (count + soonest return) when any lead is parked off Work next.
          The operator should not need to open the dashboard to know what is urgent today.
          Until that env is a non-placeholder inbox,{" "}
          <code>assessOperatorDigestEmailEnvReadiness</code> shows an emerald
          daily-digest-blocked banner on <DocLink href="/dashboard">/dashboard</DocLink> and{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> (missing / whitespace-only
          / <code>you@example.com</code>-style placeholders) so the gap is visible before click.
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
          After a test payment, a deploy handoff appears on the leads dashboard (Convex when
          configured — see <DocLink href="/docs/production-deploy">Production deploy</DocLink>).
          Re-deliver the same signed <code>checkout.session.completed</code> and confirm the
          handoff row still exists (idempotent enqueue). Receipt/DNS emails re-send only when
          the handoff notes lack a per-session sent-marker (recovery after a partial first
          delivery); once markers are present they are not resent.
          If you save a custom domain (or dedicated Vercel project) then complete a second
          checkout for the same slug (upsell), confirm those operator fields survive the handoff
          rebuild — and if you already <strong>Mark live</strong>&apos;d, confirm status stays{" "}
          <code>live</code> (not reset to <code>awaiting_dns</code>). If a fulfillment write fails, the webhook must return <code>500</code> (not{" "}
          <code>200</code>) so Stripe retries. With Convex configured, webhook fulfillment writes
          must fail closed on Convex errors (<code>requireConvex</code>) — never ACK after a
          SQLite-only write that other instances cannot see. The same fail-closed policy applies
          when creating Checkout Sessions: with Convex configured,{" "}
          <code>recordCheckoutSessionCreated</code> must succeed (or the checkout API returns{" "}
          <code>502</code>) so abandoned-recovery queues on other instances can see the open cart.
          Sending Finish-checkout / Buy now recovery durable-marks <code>recoverySentAt</code> with{" "}
          <code>requireConvex</code> before the email leaves — a Convex failure surfaces to the
          operator and skips the send (no unmarked nudge on other instances).
        </li>
        <li>
          <DocLink href="/dashboard/leads">Pipeline health</DocLink> shows recorded revenue,
          stage funnel, open handoffs, abandoned carts / recovery due, and leads missing email
          (no row-scanning required)
        </li>
        <li>
          <DocLink href="/dashboard/leads">Work next</DocLink> quality scores prioritize
          outreach (real contacts above demos; blocked when email is missing; abandoned checkout
          carts above plain follow-ups)
        </li>
        <li>
          Operator can open <strong>Notes</strong> on a lead row, save call outcomes, and find
          them again via search — notes stay off the public preview site. With Convex
          configured, Save must fail closed on Convex errors (<code>requireConvex</code>) —
          never claim success after a SQLite-only write that other instances never see.
        </li>
        <li>
          Setting stage to <strong>Discovery Call</strong> or sending <strong>Email 3</strong>{" "}
          auto-opens Notes with a soft prompt; <strong>Skip for now</strong> dismisses without
          undoing the stage or email
        </li>
        <li>
          From <strong>Work next</strong> or a lead row, snooze 1d / 3d / 7d parks the lead off
          the queue (score preserved); <strong>Unsnooze</strong> brings it back early. Confirm
          the pipeline-health <strong>Snoozed</strong> count matches parked rows (and soonest
          return time).
        </li>
        <li>
          After Email 3 + quiet days, a lead shows as <strong>Cold</strong> — use{" "}
          <strong>Re-engage</strong> (reset to Discovered for a fresh Email 1–3 cycle) or{" "}
          <strong>Close</strong> (terminal Closed stage) from the Cold leads panel or row
          actions. Optionally check <strong>Also send Email 1 when Re-engaging</strong> to fire
          Email 1 immediately (requires an email on the lead; default remains off so sends stay
          intentional). With Convex configured, Re-engage/Close must fail closed on Convex
          errors (<code>requireConvex</code>) — never claim success after a SQLite-only write
          that leaves cold inventory looking open (or still cold) on other instances.
        </li>
        <li>
          When a lead becomes due for Email 2 or 3, confirm the pipeline-health{" "}
          <strong>Follow-ups due</strong> count increments (with the oldest-due age) and
          matches the Due badges shown in the Follow-ups due panel / Work next queue.
        </li>
        <li>
          After <strong>Close</strong> on a Cold lead, confirm the pipeline-health stage funnel
          footnote shows the closed count (outside the active bars) and the{" "}
          <strong>Closed</strong> filter on{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> lists the same rows —
          closed is not a second priority queue.
        </li>
        <li>
          On a paid/live Starter-only lead, <strong>Upsell</strong> sends a Growth/Complete
          upgrade email (suppression honored); after a Growth/Complete/Commerce order exists,
          Upsell disappears and <strong>Billing</strong> appears instead.
        </li>
        <li>
          For a paid/live Growth or Complete lead, click <strong>Generate pack</strong> on{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> — confirm 8 social/GBP
          posts + 2 emails appear for the current UTC month (stub copy without{" "}
          <code>ANTHROPIC_API_KEY</code>; real copy when the key is set). Until the key is a
          non-placeholder secret, the teal <code>assessAnthropicEnvReadiness</code> banner
          surfaces that sold AI quality is stub — set it before fulfilling paid Growth/Complete
          clients. Regenerating replaces
          that month. When Convex is configured, Generate pack must fail closed on Convex
          errors (<code>requireConvex</code>) — never claim success after a SQLite-only write
          that other instances (Email pack / packs-due) cannot see. With an email on the lead,
          click <strong>Email pack</strong> — confirm the
          pack arrives (or a mock send is logged when Resend is unset). Copy/paste or client
          email works until Buffer/GBP OAuth is configured. Before generating, confirm
          pipeline-health <strong>Marketing packs due</strong> counts eligible leads missing
          this month&apos;s pack (and that the daily digest lists them).
        </li>
        <li>
          For a paid/live lead with a Commerce add-on order, click <strong>Add catalog</strong>{" "}
          / <strong>Edit catalog</strong> on{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> — save ≤50 SKUs, open{" "}
          <code>/preview/[slug]</code>, confirm Menu &amp; products renders, and that{" "}
          <strong>Request order</strong> prefills the contact form (inquiry lands in the
          operator inbox). Before adding, confirm pipeline-health{" "}
          <strong>Commerce catalogs missing</strong> counts eligible leads without a catalog
          (and that the daily digest lists them).
        </li>
        <li>
          With <code>STRIPE_SECRET_KEY</code> set, click <strong>Sync to Stripe</strong> on a
          saved catalog — confirm each SKU gets a{" "}
          <strong>Synced</strong> badge and a real Stripe Product + Price appears in the Stripe
          dashboard (metadata <code>local_site_studio_key = commerce_sku_&lt;slug&gt;_&lt;skuId&gt;</code>
          ). Re-running Sync to Stripe after editing only a name should not create duplicate
          Products; changing a price should create a new Price on the same Product. After Sync,
          edit a SKU name and Save — confirm the Synced badge remains (Stripe ids are preserved
          server-side; only a price change clears the Price id; action-level Vitest in{" "}
          <code>save-commerce-catalog-action.test.ts</code>). With Convex configured, Save
          catalog / Sync to Stripe fail closed on Convex errors (<code>requireConvex</code>) —
          never claim success after a SQLite-only write that other instances would still treat
          as unsynced (Buy now blocked). Remove a previously synced SKU,
          Save, then click <strong>Archive orphans</strong> — confirm the removed SKU&apos;s
          Stripe Product becomes inactive and current SKUs stay active. Before Sync, confirm
          pipeline-health <strong>Commerce Sync to Stripe</strong> counts saved catalogs with
          unsynced SKUs (and that the daily digest lists them). Reload{" "}
          <code>/preview/[slug]</code> and confirm synced SKUs now show{" "}
          <strong>Buy now</strong> (routes through <code>/api/commerce/checkout</code>, which
          resolves the price server-side) instead of Request order. Confirm a Buy now session
          writes a <code>checkout_sessions</code> row with <code>kind=commerce_sku</code> (and
          does <em>not</em> appear in the Abandoned checkouts / Work next cart boost — only the
          Abandoned Buy now panel).
        </li>
        <li>
          After a real Buy now purchase completes, confirm the inquiry inbox shows the paid-order
          note AND pipeline-health <strong>Commerce sales (pass-through)</strong> increases by the
          order amount. With an email on the Commerce lead, confirm they receive (or a mock send
          logs) the client order notification — SKU, amount, optional customer email, link to
          preview#catalog. Re-deliver the same Stripe <code>checkout.session.completed</code>{" "}
          event: if the inquiry was never written, confirm recovery creates it once; if it
          already exists for that session id (even when the lead has 50+ newer contact /
          Request-order inquiries — dedup uses uncapped{" "}
          <code>listCommerceCheckoutInquiriesBySlug</code>), confirm a second inquiry/client
          email is <em>not</em> created. A commerce session missing <code>metadata.skuId</code> must not create an
          inquiry or client email either. Confirm the <strong>Commerce payouts (manual)</strong> panel on{" "}
          <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> lists the lead with the
          order line and owed total — including older unpaid Buy now rows past the recent-order
          window (owed reads use <code>listUnpaidCommerceOrders</code>). Confirm{" "}
          <strong>Send daily digest</strong> lists those
          clients under Commerce payouts owed when <code>OPERATOR_DIGEST_EMAIL</code> is set.
          This money is collected for the client, not platform revenue —
          pay clients manually until Stripe Connect ships (see{" "}
          <DocLink href="/docs/process">process</DocLink>). After actually paying the client,
          click <strong>Mark paid out</strong> on that order line and confirm it disappears
          from the panel&apos;s owed total, from pipeline-health{" "}
          <strong>Commerce sales (pass-through)</strong>, and from the next digest&apos;s Commerce payouts
          owed section — this is what prevents double-paying the same order. When Convex is
          configured, a Convex write failure must surface an error (not silent success) so
          unpaid owed totals cannot stay split-brain across instances. Action-level Vitest in{" "}
          <code>mark-commerce-order-paid-out-action.test.ts</code> locks that glue.
        </li>
        <li>
          For a paid/live Complete lead, click <strong>Generate voice</strong> — confirm six
          receptionist scripts (greeting, hours, services, booking, after-hours, take-a-message)
          appear (stub without <code>ANTHROPIC_API_KEY</code>). When Convex is configured,
          Generate voice must fail closed on Convex errors (<code>requireConvex</code>) — never
          claim success after a SQLite-only write that other instances (Email voice pack /
          voice-packs-due) cannot see. With an email on the lead, click{" "}
          <strong>Email voice pack</strong> — confirm the scripts arrive (or a mock send is
          logged when Resend is unset). Clients can paste into a temp number / Cal.com until
          Twilio is provisioned. Regenerating replaces the lead&apos;s pack. Before generating,
          confirm pipeline-health <strong>Voice packs due</strong> counts eligible Complete leads
          missing a pack (and that the daily digest lists them).
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
          paid-not-live and open-handoff counts drop on pipeline health. With Convex configured,
          Mark live / Assign Vercel project / Assign custom domain all fail closed on Convex
          errors (<code>requireConvex</code>) — never claim success after a SQLite-only write
          that other instances cannot see; a failure shows a retry message instead.
        </li>
        <li>
          Point client site forms at <code>/api/contact/[slug]</code>. Submissions must land in
          the operator Inquiries panel (persist required — a DB failure returns 503, not a fake
          Thanks). With Convex configured, contact inserts must fail closed on Convex errors (
          <code>requireConvex</code>) — never claim success after a SQLite-only write that other
          instances cannot see. Reply from the panel (Resend), or archive when done. With Convex
          configured, Reply / Mark read / Archive also fail closed (
          <code>INQUIRY_REPLY_CONVEX_PRIMARY</code>) and Reply marks <code>replied</code> before
          the email leaves — never claim success after a SQLite-only replied mark, and never send
          before the durable mark. Email notify to the business fires only after a successful
          insert. Confirm unreplied-inquiry count on pipeline health drops after reply (new + read
          count as unreplied; replied/archived do not).
        </li>
      </ol>

      <p>
        Track engineering backlog in the <DocLink href="/docs/process">process log</DocLink>.
        Stripe Price bootstrap remains an operator-owned todo until secrets are pasted — when{" "}
        <code>ALLOW_STRIPE_BOOTSTRAP=1</code>, the checkout-blocked banner offers{" "}
        <strong>Run bootstrap</strong> and a copyable <code>envSnippet</code>; paste those{" "}
        <code>STRIPE_PRICE_ID_*</code> values and unset the flag to clear the banner. Without the
        flag the banner only lists missing env names (API curl still works once the flag is set).
      </p>
    </DocPage>
  );
}
