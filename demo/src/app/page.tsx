export default function BusinessPlan() {
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <h1 className="text-4xl font-bold text-gray-900 mb-8">Business Plan: Print Atelier</h1>
      
      <div className="prose prose-indigo max-w-none">
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Executive Summary</h2>
          <p className="text-gray-600 mb-4">
            Print Atelier is an <strong>AI-first, software-driven platform</strong> that bridges the gap between traditional fine art and scalable e-commerce. We photograph original paintings, sell museum-quality prints online, and pay artists 30% of the net profits. By leveraging software automation, AI, and digital funnels, we remove the fulfillment and marketing burden from artists while scaling a curated, long-tail art catalog.
          </p>
          <p className="text-gray-600">
            Our digital-first approach allows us to scale both supply (artist acquisition) and demand (print sales) rapidly, transforming a historically unscalable, one-to-one business model into a highly profitable, infinitely scalable digital asset machine.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Market Research & Opportunity</h2>
          <ul className="space-y-4 text-gray-600 list-disc pl-5">
            <li><strong>Market Size:</strong> The global online fine art market is projected to grow from ~$14.1B in 2026 to ~$19B by 2031. The broader wall art and canvas print segment is estimated at ~$69B in 2026, tracking toward $102B by 2035.</li>
            <li><strong>The Problem:</strong> Working artists face a structural income ceiling. Every painting is a one-time transaction tied directly to studio hours. Traditional galleries take 50%, and mass-market print-on-demand (POD) platforms treat art as commodity clip-art without curation, prestige, or active marketing support.</li>
            <li><strong>The Opportunity:</strong> A premium, curated digital distribution layer that respects the artist's brand while monetizing their work infinitely. By utilizing AI for discovery and marketing, we can achieve unparalleled reach.</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Software-First & AI-First Approach</h2>
          <p className="text-gray-600 mb-4">We are building a scalable technology company, not just a digital gallery.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h3 className="font-semibold text-indigo-600 mb-2">AI-Driven Curation & SEO</h3>
              <p className="text-sm text-gray-600">Automated tagging, metadata generation, and listing copy creation for every digitized piece to maximize organic search visibility and discoverability.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h3 className="font-semibold text-indigo-600 mb-2">Smart Room Mockups</h3>
              <p className="text-sm text-gray-600">Generative AI tools that automatically place artwork in diverse, high-fidelity interior settings to increase buyer conversion rates.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h3 className="font-semibold text-indigo-600 mb-2">Algorithmic Pricing & Recommendations</h3>
              <p className="text-sm text-gray-600">Dynamic pricing models based on demand velocity, and AI-powered recommendation engines that match buyers with art based on visual similarity.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h3 className="font-semibold text-indigo-600 mb-2">Automated Operations</h3>
              <p className="text-sm text-gray-600">A custom-built software pipeline connecting field photographers, cloud storage, POD fulfillment APIs, and artist payout dashboards with zero manual intervention at scale.</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Marketing & Sales (Two-Sided Engine)</h2>
          <p className="text-gray-600 mb-6">Print Atelier operates a two-sided marketplace requiring digital-first outreach on both supply (artists) and demand (buyers).</p>
          
          <div className="space-y-6">
            <div className="bg-indigo-50 p-6 rounded-lg border border-indigo-100">
              <h3 className="text-lg font-semibold text-indigo-900 mb-3">1. Supply Side (B2B / Artist Acquisition)</h3>
              <ul className="space-y-2 text-indigo-800 text-sm list-disc pl-5">
                <li><strong>Digital-First Outreach:</strong> Automated CRM workflows targeting artists on Instagram, TikTok, and curated registries using AI-personalized messaging at scale.</li>
                <li><strong>The Pitch:</strong> "We digitize your work, sell prints, and send you 30% — you keep painting."</li>
                <li><strong>Frictionless Onboarding:</strong> Self-serve artist portals for contract signing, scheduling local capture sessions, and approving digital proofs.</li>
              </ul>
            </div>

            <div className="bg-emerald-50 p-6 rounded-lg border border-emerald-100">
              <h3 className="text-lg font-semibold text-emerald-900 mb-3">2. Demand Side (B2C / Buyer Acquisition)</h3>
              <ul className="space-y-2 text-emerald-800 text-sm list-disc pl-5">
                <li><strong>Performance Marketing:</strong> Paid social campaigns (Meta, TikTok) utilizing behind-the-scenes process videos paired with the finished print.</li>
                <li><strong>Personalized Nurture:</strong> Email and SMS sequences driven by user browsing behavior, leveraging AI to curate follow-up recommendations.</li>
                <li><strong>SEO & Storytelling:</strong> Auto-generated artist stories and process content that rank highly and build emotional connection with buyers.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Profitability Analysis & Unit Economics</h2>
          <p className="text-gray-600 mb-4">Our model relies on decoupled revenue—every captured piece can sell infinitely with zero marginal labor from the artist or photographer.</p>
          
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Retail Price (16x20 Archival Print)</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">$85.00</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Payment Processing (3%)</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">-$2.55</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">POD Print + Fulfillment</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">-$28.00</td>
                </tr>
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Net Profit</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">$54.45</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Artist Share (30% of Net)</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">$16.34</td>
                </tr>
                <tr className="bg-indigo-50 font-bold">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-900">Print Atelier Share (70% of Net)</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-indigo-900">$38.11</td>
                </tr>
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 text-gray-600 list-disc pl-5">
            <li><strong>Gross Margin:</strong> ~44% to Print Atelier on outsourced POD fulfillment.</li>
            <li><strong>CAC Target:</strong> We target a Customer Acquisition Cost (CAC) to Lifetime Value (LTV) ratio of at least 1:3. Ad spend is unlocked dynamically when organic conversion rates on specific SKUs validate demand.</li>
            <li><strong>Scaling Profitability:</strong> As volume scales (Phase 3), migrating top-selling SKUs to hybrid or in-house fulfillment can increase gross margins by an estimated 15–20%.</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Go-To-Market (GTM) Strategy</h2>
          <div className="space-y-6">
            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute w-4 h-4 bg-indigo-600 rounded-full -left-[9px] top-1"></div>
              <h3 className="text-lg font-bold text-gray-900">Phase 0: Foundation (Current)</h3>
              <p className="text-gray-600 mt-1">Sign 3–5 pilot artists; digitize 10–20 pieces locally. Test POD quality, paper stocks, and finalize unit economics.</p>
            </div>
            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute w-4 h-4 bg-indigo-400 rounded-full -left-[9px] top-1"></div>
              <h3 className="text-lg font-bold text-gray-900">Phase 1: Local Pilot & Digital Scaffolding</h3>
              <p className="text-gray-600 mt-1">Launch V1 software platform (headless commerce + artist portal). Deploy digital artist acquisition campaigns in the first target metro area. Run initial demand-side ads to establish baseline conversion rates and ROAS.</p>
            </div>
            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute w-4 h-4 bg-indigo-300 rounded-full -left-[9px] top-1"></div>
              <h3 className="text-lg font-bold text-gray-900">Phase 2: Platform Automation & Expansion</h3>
              <p className="text-gray-600 mt-1">Introduce AI features (automated mockups, SEO tagging, intelligent routing). Fully automate the end-to-end flow from order placement to POD API and automated artist payout generation. Expand to 5 new target cities.</p>
            </div>
            <div className="relative pl-8 border-l-2 border-transparent">
              <div className="absolute w-4 h-4 bg-indigo-200 rounded-full -left-[9px] top-1"></div>
              <h3 className="text-lg font-bold text-gray-900">Phase 3: Scale & B2B Channels</h3>
              <p className="text-gray-600 mt-1">National digital artist acquisition. Move high-velocity prints to in-house or bulk-discounted fulfillment. Launch B2B sales targeting interior designers, boutique hotels, and corporate staging.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
