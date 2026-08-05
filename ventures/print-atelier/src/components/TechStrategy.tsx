export default function TechStrategy() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Technology Strategy & Architecture</h1>

      <section>
        <h2 className="text-2xl font-semibold">Software-First Foundation</h2>
        <p>
          Print Atelier is a technology company operating in the art space. Core IP is the software that bridges physical art creation with digital distribution and automated fulfillment — not gallery curation or manual sales.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Core Technology Pillars</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 not-prose">
          <div className="bg-indigo-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">AI Capture Engine</h3>
            <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200 mb-2">Planned — not yet built. The capture screen today records file metadata only.</p>
            <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300 list-disc pl-4">
              <li>CV models: segmentation, deskew, color-checker LUT calibration</li>
              <li>AI upscaling (ESRGAN / diffusion) to 4K+ print masters</li>
              <li>Mobile-first capture with real-time lighting guidance</li>
              <li>Zero-touch master generation from phone photos</li>
            </ul>
          </div>
          <div className="bg-emerald-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">Digital Distribution Layer</h3>
            <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300 list-disc pl-4">
              <li>Multi-channel listing API (Shopify, Etsy, custom storefronts)</li>
              <li>Dynamic SEO page generation per artwork + artist story</li>
              <li>AI creative variant generator for ads (thousands of permutations)</li>
              <li>Programmatic ad bidding and multi-armed bandit testing</li>
            </ul>
          </div>
          <div className="bg-amber-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">Operations & Revenue Platform</h3>
            <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300 list-disc pl-4">
              <li>Real-time artist dashboards with live sales sync</li>
              <li>Stripe Connect payouts, reconciled per fulfilled order</li>
              <li>Predictive inventory and pricing AI</li>
              <li>Fulfillment orchestration across POD partners</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">System Architecture</h2>
        <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 not-prose text-sm font-mono">
          <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed">{`┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Artist App  │   │  Storefront │   │ Admin/Ops   │   │ Sales/Mktg  │
│  (Capture)  │   │   (Buyer)   │   │  Console    │   │   Hub       │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │                 │
       └─────────────────┴────────┬────────┴─────────────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │   API Gateway (GraphQL)  │
                    └────────────┬────────────┘
           ┌─────────────────────┼─────────────────────┐
           ▼                     ▼                     ▼
   ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
   │ AI Pipeline   │    │ Commerce Core │    │ Outreach CRM  │
   │ (CV, LLM,     │    │ (Orders,      │    │ (Sequences,   │
   │  Mockups)     │    │  Payouts)     │    │  Attribution) │
   └───────┬───────┘    └───────┬───────┘    └───────────────┘
           │                    │
           ▼                    ▼
   ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
   │ Object Store  │    │   Postgres    │    │  POD APIs     │
   │ (S3/R2)       │    │  + pgvector   │    │ Printful/Gelato│
   └───────────────┘    └───────────────┘    └───────────────┘`}</pre>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Initial Tech Stack & Roadmap</h2>
        <div className="overflow-x-auto not-prose">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="text-left py-2 pr-4">Layer</th>
                <th className="text-left py-2 pr-4">MVP (0–6 mo)</th>
                <th className="text-left py-2">Scale (6–18 mo)</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Frontend</td>
                <td className="py-2 pr-4">Next.js 14 + Tailwind</td>
                <td className="py-2">Edge personalization, native capture app</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Backend</td>
                <td className="py-2 pr-4">Next.js API routes + Supabase</td>
                <td className="py-2">Dedicated services, job queues (BullMQ)</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">AI/ML</td>
                <td className="py-2 pr-4">Replicate + OpenAI APIs, custom LoRA</td>
                <td className="py-2">Self-hosted GPU inference, edge models</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Data</td>
                <td className="py-2 pr-4">Postgres + pgvector for style matching</td>
                <td className="py-2">Analytics warehouse, feature store</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">Infra</td>
                <td className="py-2 pr-4">Vercel + Cloudflare R2</td>
                <td className="py-2">Multi-region, Kubernetes for GPU workloads</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Build vs Buy Decisions</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Build:</strong> AI capture pipeline, mockup generation, outreach personalization, catalog intelligence — these are the moat.</li>
          <li><strong>Buy/Integrate:</strong> Payments (Stripe), fulfillment (Printful/Gelato), email (Resend), auth (Clerk), hosting (Vercel).</li>
          <li><strong>Defer:</strong> Custom mobile app (PWA first), in-house printing, white-label licensing (Phase 3).</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Security, Copyright & Compliance</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Artists retain copyright; platform holds limited reproduction license per agreement.</li>
          <li>DMCA takedown workflow and provenance tracking on every master file.</li>
          <li>GDPR/CCPA-compliant data handling for buyer CRM and artist PII.</li>
          <li>Stripe Connect handles KYC/tax for artist payouts.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Infrastructure Cost Model</h2>
        <p>At MVP scale (100 artists, 1,000 SKUs, ~500 orders/mo):</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>AI compute:</strong> ~$0.15–0.40 per artwork processed (upscale + mockups)</li>
          <li><strong>Hosting & storage:</strong> ~$200–400/mo (Vercel Pro + R2)</li>
          <li><strong>Third-party APIs:</strong> ~$150/mo (email, scraping, LLM tokens)</li>
          <li><strong>Total fixed infra:</strong> &lt;$1,000/mo before marketing spend</li>
        </ul>
      </section>
    </div>
  );
}
