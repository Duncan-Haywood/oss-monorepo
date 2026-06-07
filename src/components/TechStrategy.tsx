export default function TechStrategy() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Technology Strategy & Architecture</h1>

      <section>
        <h2 className="text-2xl font-semibold">Software-First Foundation</h2>
        <p>
          Print Atelier is a <strong>software company that happens to sell art prints</strong>. Our core IP is the technology that bridges physical art creation with digital distribution and physical fulfillment. Every operational bottleneck is solved with code and AI before headcount.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">The AI-First Engine</h2>
        <p>AI is integrated at every layer to eliminate manual bottlenecks:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Image Enhancement:</strong> Automated upscaling (ESRGAN) and color-correction so smartphone photos meet print-quality standards (300 DPI at large sizes).</li>
          <li><strong>Contextual Mockups:</strong> AI-generated lifestyle imagery (art in living rooms, lofts, galleries) without manual Photoshop work.</li>
          <li><strong>Metadata Generation:</strong> Auto-tagging and SEO descriptions from visual analysis of uploaded artwork.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">System Architecture</h2>
        <div className="not-prose grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {[
            {
              title: "Capture Pipeline",
              stack: "Next.js PWA, OpenCV, ColorChecker LUT, Real-ESRGAN upscaling",
              desc: "Mobile-first web app guides artists through self-capture. Images pass through deskew, color correction, and upscaling before human proof approval.",
            },
            {
              title: "Catalog & Content Engine",
              stack: "PostgreSQL, S3/R2, Claude/GPT APIs, Stable Diffusion mockups",
              desc: "Master files trigger automated mockup generation, SEO copywriting, tagging, and multi-channel listing creation.",
            },
            {
              title: "Commerce Layer",
              stack: "Next.js storefront, Stripe Checkout, Stripe Connect",
              desc: "Headless commerce with real-time inventory sync, split payments, and automated artist payouts on a Net-15 schedule.",
            },
            {
              title: "Fulfillment Router",
              stack: "Printful/Gelato APIs, webhook orchestration, geo-routing",
              desc: "Orders route to the nearest POD facility. Tracking, returns, and reprints handled programmatically.",
            },
            {
              title: "Growth & Outreach Stack",
              stack: "Apify scrapers, LLM personalization, HubSpot/Resend CRM",
              desc: "AI identifies target artists, drafts personalized outreach, tracks funnel metrics, and triggers onboarding sequences.",
            },
            {
              title: "Analytics & Optimization",
              stack: "PostHog, Meta/Google Ads APIs, programmatic SEO engine",
              desc: "Dynamic ad creative testing, landing page generation, and cohort-based retention flows drive demand-side growth.",
            },
          ].map((block) => (
            <div key={block.title} className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{block.title}</h3>
              <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 mt-1 mb-2">{block.stack}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{block.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Platform Interfaces</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="font-bold mb-2">Artist Portal</h3>
            <p className="text-sm">Portfolio management, proof approval, analytics, and Stripe Connect payouts.</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="font-bold mb-2">Buyer Storefront</h3>
            <p className="text-sm">High-performance e-commerce with AI room visualization and visual discovery.</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="font-bold mb-2">Admin Console</h3>
            <p className="text-sm">Centralized control plane for AI pipeline monitoring, orders, and infrastructure.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Build Phases</h2>
        <ol className="list-decimal pl-5 space-y-3">
          <li><strong>MVP (Months 0–3):</strong> Capture app + artist portal + Stripe Connect. Manual proof review. Printful API. Target: 50 artists, 500 SKUs.</li>
          <li><strong>Automation (Months 3–6):</strong> AI cataloging pipeline, outreach CRM, programmatic SEO pages. Target: 200 artists, 3,000 SKUs.</li>
          <li><strong>Scale (Months 6–12):</strong> Dynamic ad engine, designer B2B portal, hybrid in-house printing. Target: 1,000 artists, $1M ARR run-rate.</li>
          <li><strong>Platform (Year 2+):</strong> White-label capture software for galleries. API licensing. International POD expansion.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Key Technical Decisions</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="py-2 pr-4">Decision</th>
                <th className="py-2 pr-4">Choice</th>
                <th className="py-2">Rationale</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Frontend</td>
                <td className="py-2 pr-4">Next.js 14 App Router</td>
                <td className="py-2">SSR for SEO landing pages, shared codebase for storefront + portals</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Backend</td>
                <td className="py-2 pr-4">Serverless + managed DB</td>
                <td className="py-2">Vercel Functions + Neon Postgres — zero DevOps overhead at early stage</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Image Processing</td>
                <td className="py-2 pr-4">Hybrid CV + AI</td>
                <td className="py-2">OpenCV for deterministic deskew/color; AI upscaling only where needed</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Payments</td>
                <td className="py-2 pr-4">Stripe Connect Express</td>
                <td className="py-2">Marketplace split payments, tax forms, international payouts</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Fulfillment</td>
                <td className="py-2 pr-4">API-first POD partners</td>
                <td className="py-2">Zero inventory risk; in-house only when volume justifies it</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Data Strategy & Scalability</h2>
        <p>
          Every interaction — from artist color palettes to buyer cart abandonment on specific mockups — feeds a centralized data warehouse. This trains proprietary matching models between art styles and buyer profiles. Serverless computing and edge delivery ensure elastic scaling during viral artist drops.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Demo Environments</h2>
        <p>
          Interactive mockups of each system surface are available from the sidebar: Storefront, Buyer Portal, Artist Portal, Designer Portal (B2B), Capture App, Ops Console, and Admin Console.
        </p>
      </section>
    </div>
  );
}
