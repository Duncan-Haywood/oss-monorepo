import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

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
        <code>src/lib/marketing/monthly-pack.ts</code>) is the same fixed 10-item set for both
        Growth and Complete — 8 social/GBP posts + 2 emails, matching the sold promise below:
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
            <td>2</td>
          </tr>
          <tr>
            <td>Facebook caption</td>
            <td>Facebook (manual post, or via Buffer once OAuth is configured)</td>
            <td>3</td>
          </tr>
          <tr>
            <td>Instagram caption</td>
            <td>Instagram (manual post, or via Buffer once OAuth is configured)</td>
            <td>3</td>
          </tr>
          <tr>
            <td>Email campaign</td>
            <td>Resend (Email pack)</td>
            <td>1</td>
          </tr>
          <tr>
            <td>Review-request email</td>
            <td>Resend (Email pack)</td>
            <td>1</td>
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
        Growth ($99/mo) and Complete ($199/mo) generate the identical monthly pack above — Complete&apos;s{" "}
        <code>full_marketing</code> package tier label (vs Growth&apos;s <code>social_email</code>,
        see <code>packageTierForOrderTier</code>) reflects Complete&apos;s broader bundle (marketing
        + AI phone receptionist), not a deeper marketing generation depth. Buffer / Google Business
        Profile / Meta auto-posting is optional and gated on operator OAuth secrets (see{" "}
        <DocLink href="/docs/process">/docs/process</DocLink> <code>marketing-content-scheduling</code>)
        for both tiers alike — until then, operators use <strong>Generate pack</strong> +{" "}
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
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> persists 8 social/GBP posts
        + 2 emails per UTC month (Anthropic when <code>ANTHROPIC_API_KEY</code> is set; stub
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
        Buffer / GBP OAuth — action-level Vitest in{" "}
        <code>send-marketing-pack-to-client-action.test.ts</code> locks auth, eligibility,
        current-month pack gate, and suppression / send failure on that dashboard path.
        Eligible leads missing this month&apos;s pack surface on pipeline health (
        <strong>Marketing packs due</strong>) and in the operator daily digest so fulfillment
        debt is visible without scanning every row. Buffer / GBP / Meta auto-posting stays
        operator-gated on OAuth secrets (see <DocLink href="/docs/process">/docs/process</DocLink>{" "}
        <code>marketing-content-scheduling</code>).
      </p>

      <p>
        Technical module: <DocLink href="/docs/architecture">Architecture</DocLink> § Marketing Engine
      </p>
    </DocPage>
  );
}
