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
            <th>Type</th>
            <th>Channel</th>
            <th>Included per monthly pack</th>
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
        above and have no dedicated dashboard fulfillment action yet.
      </p>

      <h2>Automation levels</h2>
      <p>
        Growth (${getBundle("growth")!.monthlyPriceUsd}/mo) and Complete ($
        {getBundle("complete")!.monthlyPriceUsd}/mo) generate the identical monthly pack above — Complete&apos;s{" "}
        <code>full_marketing</code> package tier label (vs Growth&apos;s <code>social_email</code>,
        see <code>packageTierForOrderTier</code>) reflects Complete&apos;s broader bundle (marketing
        + AI phone receptionist), not a deeper marketing generation depth. Buffer auto-posting
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
        debt is visible without scanning every row.
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
        persisted as <code>lead.bufferProfileIds</code>), and <strong>Send pack to Buffer</strong>{" "}
        (queues that month&apos;s matching <code>facebook_caption</code>/
        <code>instagram_caption</code> variant into each selected profile&apos;s existing posting
        schedule — never posts immediately, and never guesses at a channel: a profile whose{" "}
        <code>service</code> has no matching pack content type, or that vanished from Buffer, is
        reported skipped rather than silently dropped). Google Business Profile / Meta stay fully
        gated — those need a distinct OAuth grant per local business, not one operator-level
        token. See <code>src/lib/marketing/buffer.ts</code>,{" "}
        <code>src/lib/marketing/buffer-gate.ts</code>, and{" "}
        <code>src/app/dashboard/leads/buffer-actions.test.ts</code> for the full contract and test
        coverage; see{" "}
        <DocLink href="/docs/process">/docs/process</DocLink>{" "}
        <code>marketing-content-scheduling</code> for the still-gated GBP/Meta half.
      </p>

      <p>
        Technical module: <DocLink href="/docs/architecture">Architecture</DocLink> § Marketing Engine
      </p>
    </DocPage>
  );
}
