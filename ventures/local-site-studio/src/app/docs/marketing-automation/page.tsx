import type { Metadata } from "next";
import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";
import { docPageMetadata } from "@/lib/seo";
import {
  monthlyMarketingContentTypeCount,
  monthlyMarketingEmailCount,
  monthlyMarketingSocialPostCount,
} from "@/lib/marketing/monthly-pack";
import { getBundle } from "@/lib/pricing/bundles";

export const metadata: Metadata = docPageMetadata("/docs/marketing-automation");

export default function MarketingAutomationDocPage() {
  return (
    <DocPage
      title="Marketing automation"
      subtitle="AI-only marketing — no human copywriter, zero operator touch at scale."
      related={[
        { href: "/docs/product-bundles", label: "Product bundles" },
        { href: "/docs/architecture", label: "Architecture" },
        { href: "/docs/compliance", label: "Compliance" },
      ]}
    >
      <h2>Content types</h2>
      <p>
        Every monthly pack (<code>MONTHLY_MARKETING_PACK_TYPES</code> in{" "}
        <code>src/lib/marketing/monthly-pack.ts</code>) is the same fixed{" "}
        {monthlyMarketingSocialPostCount() + monthlyMarketingEmailCount()}-item set for both
        Growth and Complete — {monthlyMarketingSocialPostCount()} social/GBP posts +{" "}
        {monthlyMarketingEmailCount()} emails, matching the sold promise below:
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Channel</th>
            <th scope="col">Included per monthly pack</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GBP post</td>
            <td>Google Business Profile</td>
            <td>{monthlyMarketingContentTypeCount("gbp_post")}</td>
          </tr>
          <tr>
            <td>Facebook caption</td>
            <td>Facebook (manual post, or auto-posted via the dormant Buffer scaffold)</td>
            <td>{monthlyMarketingContentTypeCount("facebook_caption")}</td>
          </tr>
          <tr>
            <td>Instagram caption</td>
            <td>Instagram (manual post, or auto-posted via the dormant Buffer scaffold)</td>
            <td>{monthlyMarketingContentTypeCount("instagram_caption")}</td>
          </tr>
          <tr>
            <td>Email campaign</td>
            <td>Resend (Email pack)</td>
            <td>{monthlyMarketingContentTypeCount("email_campaign")}</td>
          </tr>
          <tr>
            <td>Review-request email</td>
            <td>Resend (Email pack)</td>
            <td>{monthlyMarketingContentTypeCount("review_request_email")}</td>
          </tr>
        </tbody>
      </table>
      <p>
        Three additional content types (<code>local_seo_meta</code>, <code>seasonal_promo</code>,{" "}
        <code>ad_copy</code>) exist for ad-hoc, non-persisted generation via{" "}
        <code>POST /api/marketing/generate</code> — they are not part of the fixed monthly pack
        above. <code>seasonal_promo</code>/<code>ad_copy</code> now also have a dedicated dashboard
        action (<strong>Seasonal promo</strong>, Complete-tier leads only —{" "}
        <code>generateSeasonalPromoAction</code>): two seasonal-promo A/B variants plus one
        ad-copy piece, optionally named around an operator-supplied occasion (defaults to the
        current UTC month when left blank — never a hemisphere-dependent &quot;season&quot;
        guess). Like the ad-hoc route, results are not persisted — the operator copies them to
        post/paste before navigating away. <code>local_seo_meta</code> still has no dedicated
        dashboard action.
      </p>

      <h2>Automation levels</h2>
      <p>
        Growth (${getBundle("growth")!.monthlyPriceUsd}/mo) and Complete ($
        {getBundle("complete")!.monthlyPriceUsd}/mo) generate the identical monthly pack above — Complete&apos;s{" "}
        <code>full_marketing</code> package tier label (vs Growth&apos;s <code>social_email</code>,
        see <code>packageTierForOrderTier</code>) reflects Complete&apos;s broader bundle (marketing
        + AI phone receptionist), not a deeper monthly-pack generation depth. The one genuine
        depth difference is the ad-hoc <strong>Seasonal promo</strong> dashboard action above —
        the &quot;Full marketing — seasonal promos, A/B variants&quot; bullet on{" "}
        <DocLink href="/docs/product-bundles">Product bundles</DocLink> is Complete-only,
        gated by <code>leadEligibleForSeasonalPromo</code> the same way the monthly pack gates on
        Growth-or-Complete. Buffer auto-posting
        (facebook_caption/instagram_caption only) is a dormant scaffold behind{" "}
        <code>ALLOW_MARKETING_SCHEDULING</code> + <code>BUFFER_ACCESS_TOKEN</code> (default off) —
        see <DocLink href="/docs/process">/docs/process</DocLink>{" "}
        <code>marketing-content-scheduling</code>. Google Business Profile / Meta auto-posting stay
        fully gated behind per-business OAuth an agent cannot obtain. For both tiers alike — until
        Buffer is configured, operators use <strong>Generate pack</strong> +{" "}
        <strong>Email pack</strong> so clients post themselves. There is no separate one-time
        &quot;copy pack&quot; product; see <DocLink href="/docs/product-bundles">Product bundles</DocLink>{" "}
        for the sold tiers and pricing.
      </p>

      <h2>Quality principles</h2>
      <p>Every piece must include business name, city, concrete services, accurate hours, and a relevant CTA.</p>
      <p>Forbidden: generic AI slop, invented awards, wrong city, hashtag spam.</p>

      <h2>Compliance</h2>
      <ul>
        <li>Email From uses public brand; footer identifies {brand.legalEntity}</li>
        <li>Physical address + unsubscribe on every marketing email</li>
        <li>Follow GBP and Meta platform policies</li>
        <li>SMS marketing requires separate TCPA opt-in (future)</li>
      </ul>

      <h2>Current status</h2>
      <p>
        Operator-triggered monthly pack generation for paid/live Growth/Complete leads is
        shipped: <strong>Generate pack</strong> on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> persists{" "}
        {monthlyMarketingSocialPostCount()} social/GBP posts + {monthlyMarketingEmailCount()}{" "}
        emails per UTC month (Anthropic when <code>ANTHROPIC_API_KEY</code> is set; stub
        otherwise — both paths covered by <code>src/lib/marketing/generators.test.ts</code>;
        request shape from lead data covered by{" "}
        <code>src/lib/marketing/build-request.test.ts</code>). Until the key is a
        non-placeholder secret, <code>assessAnthropicEnvReadiness</code> shows a teal
        AI-packs-on-stub banner on the operator dashboard so Stub* template quality is not
        mistaken for sold AI copy. Ad-hoc{" "}
        <code>POST /api/marketing/generate</code> keeps route-level Vitest coverage for operator
        auth, client-IP rate-limit (429), contentTypes size cap (monthly pack ceiling), business
        soft-caps, and request validation (<code>route.test.ts</code>) —
        prefer the dashboard pack action for persisted fulfillment. Action-level Vitest in{" "}
        <code>generate-marketing-pack-action.test.ts</code> locks auth, eligibility,{" "}
        <code>MARKETING_PACK_CONVEX_PRIMARY</code> persist, and Convex fail-closed on that
        dashboard path.{" "}
        <strong>Email pack</strong> sends that month&apos;s pack to{" "}
        <code>lead.email</code> via Resend so clients can post themselves without waiting on
        Buffer — action-level Vitest in{" "}
        <code>send-marketing-pack-to-client-action.test.ts</code> locks auth, eligibility,
        current-month pack gate, and suppression / send failure on that dashboard path.
        Eligible leads missing this month&apos;s pack surface on pipeline health (
        <strong>Marketing packs due</strong>) and in the operator daily digest so fulfillment
        debt is visible without scanning every row. Generating a pack is not the same as
        delivering it: a pack that was generated but never successfully emailed sets no marker
        of its own, so a separate <strong>Marketing packs not emailed</strong> pipeline-health
        card and digest section (<code>sentToClientAt</code>, cleared on every regenerate) tracks
        that gap independently — the same pattern Complete&apos;s client voice FAQ pack follows
        for <strong>Email voice pack</strong> (<strong>Complete voice packs not emailed</strong>).
      </p>
      <p>
        <strong>Buffer auto-posting (dormant scaffold).</strong> Behind{" "}
        <code>ALLOW_MARKETING_SCHEDULING=1</code> + <code>BUFFER_ACCESS_TOKEN</code> (the
        operator&apos;s own long-lived Buffer access token — one grant for the whole account, not
        per-lead OAuth), the Marketing pack panel on <DocLink href="/dashboard/leads">
          /dashboard/leads
        </DocLink>{" "}
        gains <strong>Load Buffer profiles</strong> (lists every social profile connected to that
        Buffer account), a per-lead profile picker (<strong>Save profiles for this lead</strong>,
        persisted as <code>lead.bufferProfileIds</code> — deduped before storage, so a repeated
        profile id in the same selection can never make the schedule loop below post the same
        variant to that profile twice in one run), and <strong>Send pack to Buffer</strong>{" "}
        (queues every matching <code>facebook_caption</code>/
        <code>instagram_caption</code> variant that month&apos;s pack contains — all 3 of each,
        matching <code>MONTHLY_MARKETING_PACK_TYPES</code> — into each selected profile&apos;s
        existing posting schedule — never posts immediately, and never guesses at a channel: a
        profile whose{" "}
        <code>service</code> has no matching pack content type, or that vanished from Buffer, is
        reported skipped rather than silently dropped). A repeated click within the same pack
        skips any variant/profile pair already queued — an idempotency marker (
        <code>lead.bufferPostedVariantKeys</code>, keyed to the pack&apos;s own{" "}
        <code>generatedAt</code> so a mid-month regenerate is postable again) prevents re-posting
        the same content. Both <code>lead.bufferProfileIds</code> and{" "}
        <code>lead.bufferPostedVariantKeys</code> are operator-internal Buffer identifiers — the
        latter embeds the former inside each marker string — so{" "}
        <code>softCapLeadForPublicSurface</code> (
        <DocLink href="/docs/architecture">Architecture</DocLink> § SEO/meta) strips both before a
        lead ever reaches the public <code>/preview/[slug]</code> surface. The schedule loop&apos;s
        Buffer network calls are a real, sequential, per-profile await window — a concurrent second
        invocation (a double-click, or two operator tabs) could otherwise overwrite the first
        invocation&apos;s freshly-written marker with a stale pre-loop snapshot, the same lost-update
        class as Commerce catalog Sync to Stripe / Archive orphans (
        <DocLink href="/docs/architecture">Architecture</DocLink> § Commerce catalog): the action
        re-reads the lead immediately before its final <code>bufferPostedVariantKeys</code> persist
        and merges only
        this invocation&apos;s own newly-posted keys onto that fresh set, rather than writing the
        in-memory snapshot taken before the loop&apos;s awaits. Same recurring-entitlement
        gate as Email pack: <strong>Send pack to Buffer</strong> re-checks{" "}
        <code>orders.recurringCanceledAt</code> before posting, so a paused/canceled subscriber&apos;s
        live social profiles never receive new auto-posted content after cancellation. Google
        Business Profile / Meta stay fully gated — those need a distinct OAuth grant per local
        business, not one operator-level token. See <code>src/lib/marketing/buffer.ts</code>,{" "}
        <code>src/lib/marketing/buffer-gate.ts</code>, and{" "}
        <code>src/app/dashboard/leads/buffer-actions.test.ts</code> for the full contract and test
        coverage; see{" "}
        <DocLink href="/docs/process">/docs/process</DocLink>{" "}
        <code>marketing-content-scheduling</code> for the still-gated GBP/Meta half.
      </p>
      <p>
        <strong>Missing-mapping visibility.</strong> A Growth/Complete lead with no saved{" "}
        <code>bufferProfileIds</code> makes <strong>Send pack to Buffer</strong> hard-fail with
        &quot;Select Buffer profiles for this lead first&quot; — but until now nothing surfaced{" "}
        <em>which</em> or <em>how many</em> leads were stuck in that state short of opening each
        lead&apos;s own panel. The <code>Buffer profile mapping missing</code> pipeline-health card
        (<DocLink href="/dashboard/leads">/dashboard/leads</DocLink>) and matching daily-digest
        section now track this — always zero while{" "}
        <code>ALLOW_MARKETING_SCHEDULING</code> is off, since every eligible lead would otherwise
        report &quot;missing&quot; forever with no possible resolution. See{" "}
        <code>listLeadsMissingBufferProfileMapping</code> /{" "}
        <code>oldestBufferProfileMappingMissingAgeHours</code> (
        <code>src/lib/marketing/buffer.ts</code>).
      </p>
      <p>
        <strong>Postable-profile guard.</strong> <code>bufferServiceContentType</code> only maps{" "}
        <code>facebook</code>/<code>instagram</code> Buffer profile services onto a postable
        content type — every other connected service (LinkedIn, Twitter, Pinterest, …) is skipped
        at post time. <strong>Save profiles for this lead</strong> re-fetches the operator&apos;s
        connected profiles and rejects a save whose selection contains zero Facebook/Instagram
        profiles, so a lead can never be persisted into a state where it reads as
        &quot;mapped&quot; (clearing the missing-mapping card above) while every{" "}
        <strong>Send pack to Buffer</strong> click skips every variant forever with no durable
        marker ever written — which had made the <code>Buffer packs not posted</code> card below
        permanently, unresolvably stuck for that lead. A mixed selection (one postable profile
        plus others) still saves normally; only an all-unpostable selection is rejected. Clearing
        a lead&apos;s mapping entirely (an empty selection) is unaffected. See{" "}
        <code>saveLeadBufferProfilesAction</code> (
        <code>src/app/dashboard/leads/actions.ts</code>).
      </p>
      <p>
        <strong>Not-posted visibility.</strong> Mapping Buffer profiles opts a lead into
        auto-posting, but it does not guarantee the current month&apos;s pack actually reached
        Buffer — the operator could forget to click <strong>Send pack to Buffer</strong>, or
        every <code>createBufferUpdate</code> call could fail (a revoked token, a disconnected
        profile) with nothing persisted anywhere except the ephemeral scheduled/skipped/failed
        result of that one click. The same &quot;generated ≠ delivered&quot; gap{" "}
        <strong>Marketing packs not emailed</strong> already closes for the email-pack flow now
        has a Buffer-posting twin: the <code>Buffer packs not posted</code> pipeline-health card
        and matching daily-digest section flag a Buffer-mapped lead&apos;s current-month pack
        whenever it has no matching entry in <code>lead.bufferPostedVariantKeys</code> (pruned
        against the pack&apos;s own <code>generatedAt</code>, so a mid-month regenerate is
        correctly flagged again even though the lead still carries stale keys from the prior
        generation) — also always zero while <code>ALLOW_MARKETING_SCHEDULING</code> is off. See{" "}
        <code>listMarketingPacksMissingBufferPost</code> /{" "}
        <code>oldestMarketingPackMissingBufferPostAgeHours</code> (
        <code>src/lib/marketing/buffer.ts</code>).
      </p>

      <p>
        Technical module: <DocLink href="/docs/architecture">Architecture</DocLink> § Marketing Engine
      </p>
    </DocPage>
  );
}
