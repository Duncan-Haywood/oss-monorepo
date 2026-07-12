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
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Channel</th>
            <th>Frequency</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GBP posts</td>
            <td>Google Business Profile</td>
            <td>2/mo</td>
          </tr>
          <tr>
            <td>Social captions</td>
            <td>Facebook / Instagram via Buffer</td>
            <td>4/mo</td>
          </tr>
          <tr>
            <td>Review request emails</td>
            <td>Resend</td>
            <td>1/mo</td>
          </tr>
          <tr>
            <td>Seasonal promos</td>
            <td>Social + email</td>
            <td>Calendar triggers</td>
          </tr>
        </tbody>
      </table>

      <h2>Automation levels</h2>
      <ul>
        <li>
          <strong>Generate-only</strong> — copy pack ($49 one-time)
        </li>
        <li>
          <strong>Generate + schedule</strong> — Growth tier ($99/mo)
        </li>
        <li>
          <strong>Generate + schedule + optimize</strong> — Complete full marketing ($199/mo)
        </li>
      </ul>

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
        otherwise). <strong>Email pack</strong> sends that month&apos;s pack to{" "}
        <code>lead.email</code> via Resend so clients can post themselves without waiting on
        Buffer / GBP OAuth. Eligible leads missing this month&apos;s pack surface on pipeline
        health (<strong>Marketing packs due</strong>) and in the operator daily digest so
        fulfillment debt is visible without scanning every row. Buffer / GBP / Meta
        auto-posting stays operator-gated on OAuth secrets (see{" "}
        <DocLink href="/docs/process">/docs/process</DocLink>{" "}
        <code>marketing-content-scheduling</code>).
      </p>

      <p>
        Technical module: <DocLink href="/docs/architecture">Architecture</DocLink> § Marketing Engine
      </p>
    </DocPage>
  );
}
