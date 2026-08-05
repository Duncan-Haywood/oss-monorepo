export default function Strategy() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Strategy & Vision (AI-First)</h1>

      <section>
        <h2 className="text-2xl font-semibold">The Problem</h2>
        <p>
          Working artists face a structural income ceiling: every painting is a one-time transaction tied directly to hours in the studio. Traditional digitization is manual, expensive, and scales poorly. Marketing, fulfillment, and repeat revenue require skills and infrastructure most painters do not want to build.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">The AI-First Solution</h2>
        <p>
          Print Atelier sits between artists and buyers as an <strong>AI-powered software and distribution layer</strong>:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Software-Driven Capture:</strong> We replace expensive studio setups with an AI-enhanced mobile/app-based capture process that automatically color-corrects, deskews, and upscales artwork to print-ready masters.</li>
          <li><strong>AI Content Generation:</strong> Automated generation of marketing copy, social media posts, and variant images (e.g., room mockups) from the single digital master.</li>
          <li><strong>Digital-First Distribution:</strong> Algorithmic listing across multiple commerce channels (Shopify, Etsy, customized storefronts).</li>
          <li><strong>Automated Fulfillment:</strong> Seamless API integration with global print-on-demand (POD) partners.</li>
          <li><strong>Transparent Artist Portal:</strong> Real-time software dashboards for artists to track revenue, with Stripe Connect payouts reconciled against every fulfilled order.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Positioning</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Not</strong> a gallery taking 50% on a single original sale.</li>
          <li><strong>Not</strong> a manual photography agency.</li>
          <li><strong>Is</strong> a scalable tech platform that turns physical art into long-tail digital inventory with zero friction for the creator.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Growth Tracks (Dual-Sided Marketplace)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div className="bg-blue-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="text-xl font-medium mb-2">Track 1: Supply (Artists)</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Digital-first automated outreach using AI to identify rising artists on Instagram/TikTok.</li>
              <li>Self-serve onboarding app: artists can digitize their own work using our proprietary AI enhancement software.</li>
              <li>Pitch: "Digitize once from your phone, earn on every print, zero logistics."</li>
            </ul>
          </div>
          <div className="bg-green-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="text-xl font-medium mb-2">Track 2: Demand (Buyers)</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Programmatic SEO and dynamically generated artist story pages.</li>
              <li>AI-optimized paid advertising pipelines testing thousands of creative variants automatically.</li>
              <li>Algorithmic curation of the catalog matching buyers to art styles.</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Competitive Moat</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li><strong>Proprietary AI Capture Tech:</strong> Lowering the barrier to digitizing physical art without losing fidelity.</li>
          <li><strong>Zero-Marginal-Cost Cataloging:</strong> AI-generated metadata, tagging, and mockups allow us to scale SKU count exponentially.</li>
          <li><strong>Exclusive Artist Relationships:</strong> Secured through an unmatched, frictionless user experience.</li>
        </ol>
      </section>
    </div>
  );
}
