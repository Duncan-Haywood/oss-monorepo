import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

export default function VoiceAgentFlowDocPage() {
  return (
    <DocPage
      title="Voice agent flow"
      subtitle="Platform voice (sales) vs client voice (Complete tier receptionist)."
      related={[
        { href: "/docs/product-bundles", label: "Product bundles" },
        { href: "/docs/legal", label: "Legal" },
        { href: "/docs/compliance", label: "Compliance" },
      ]}
    >
      <table>
        <thead>
          <tr>
            <th>Layer</th>
            <th>Audience</th>
            <th>Purpose</th>
            <th>Tier</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Platform voice</td>
            <td>Local business owner</td>
            <td>Sells bundles, customizes preview, Stripe link</td>
            <td>All</td>
          </tr>
          <tr>
            <td>Client voice</td>
            <td>Their customers</td>
            <td>Receptionist, booking, FAQ, lead capture</td>
            <td>Complete only</td>
          </tr>
        </tbody>
      </table>
      <p>
        Platform voice uses <strong>{brand.name}</strong>. Client voice uses the client&apos;s
        business name. {brand.legalEntity} appears in email footers and Stripe — not in primary
        greetings.
      </p>

      <h2>Platform voice — outbound opening</h2>
      <blockquote>
        Hi, this is Alex, an automated assistant calling from <strong>{brand.name}</strong>.
        We built a free preview website for {"{BusinessName}"}. Do you have a moment? I can
        text you the link or walk you through our plans — takes about two minutes.
      </blockquote>

      <h2>Platform voice — inbound opening</h2>
      <blockquote>
        Hi, thanks for calling <strong>{brand.name}</strong>. This is Alex, an automated
        assistant. Are you calling about a website preview we sent you?
      </blockquote>

      <h2>Bundle explanation (tool: explainBundles)</h2>
      <blockquote>
        We have three main plans. <strong>Starter</strong> — $500 one-time for your website.{" "}
        <strong>Growth</strong> — same website plus automated Google and social posts for $99
        a month. <strong>Complete</strong> — $199 a month, includes everything in Growth plus
        an AI assistant that answers <em>your</em> business phone. If you take online orders,
        we can add <strong>Commerce</strong> for $300 setup and $49 a month.
      </blockquote>

      <h2>Opt-out (TCPA)</h2>
      <blockquote>
        Understood — I&apos;ve removed you from our call list. You won&apos;t hear from us
        again. Have a great day.
      </blockquote>
      <p>Trigger <code>opt_out</code> immediately; sync to email suppression.</p>

      <h2>Client voice — inbound (Complete tier)</h2>
      <blockquote>
        Thanks for calling <strong>{"{BusinessName}"}</strong>. I&apos;m an automated
        assistant — how can I help you today?
      </blockquote>

      <h2>Client voice FAQ pack (operator fulfillment)</h2>
      <p>
        Before Twilio provisioning, operators generate a FAQ/script pack on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> for paid/live Complete leads
        (<code>generateClientVoicePackAction</code>): inbound greeting, hours, services, booking
        CTA, after-hours, and take-a-message — derived from site data. When Convex is configured,
        Generate voice fails closed (<code>requireConvex</code> /{" "}
        <code>CLIENT_VOICE_PACK_CONVEX_PRIMARY</code>) so a multi-instance deploy cannot claim
        success after a SQLite-only write. With an email on the lead,{" "}
        <strong>Email voice pack</strong> (<code>sendClientVoicePackToClientAction</code>) delivers
        the scripts via Resend so the client can paste into a temporary number or Cal.com. Scripts
        persist one row per lead (not monthly). Eligible Complete leads still missing a pack
        surface on pipeline health (<strong>Voice packs due</strong>) and in the operator daily
        digest via <code>listClientVoicePacksDue</code>. Full telephony remains Phase 7.
      </p>

      <h2>Webhook routing</h2>
      <ul>
        <li>
          <code>/api/voice/platform/webhook</code> — outreach, inbound sales, discovery
        </li>
        <li>
          <code>/api/voice/client/webhook</code> — client number, booking, lead tools
        </li>
      </ul>

      <p>
        Tier definitions: <DocLink href="/docs/product-bundles">Product bundles</DocLink>
      </p>
    </DocPage>
  );
}
