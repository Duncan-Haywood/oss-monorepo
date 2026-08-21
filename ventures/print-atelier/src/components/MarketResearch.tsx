export default function MarketResearch() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Market Research</h1>

      <section>
        <h2 className="text-2xl font-semibold">Market Overview</h2>
        <p>
          The global online art market is undergoing rapid digital transformation, accelerated by e-commerce adoption and social-media-driven discovery. Physical painters remain disconnected from digital scale due to technical friction in digitization, listing, and fulfillment.
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-400">
          Key trends: print-on-demand maturation, AI-assisted content creation, creator-economy monetization, and demand for authentic, story-driven home décor over mass-market reproductions.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Market Size (TAM, SAM, SOM)</h2>
        <ul className="space-y-3">
          <li>
            <strong>Total Addressable Market (TAM):</strong> $13.3B global online art market (2024).
            <p className="text-sm text-gray-700 dark:text-gray-400">All art sold digitally worldwide — prints, originals, and digital-native art. CAGR ~6.5% through 2028.</p>
          </li>
          <li>
            <strong>Serviceable Addressable Market (SAM):</strong> $3.5B+ wall décor & fine art prints online.
            <p className="text-sm text-gray-700 dark:text-gray-400">Physical prints purchased via e-commerce for home/office decoration. Excludes originals-only galleries.</p>
          </li>
          <li>
            <strong>Serviceable Obtainable Market (SOM):</strong> $50M–$100M within 3–5 years.
            <p className="text-sm text-gray-700 dark:text-gray-400">Mid-tier fine art print segment unlocked by digitizing previously inaccessible independent artist supply.</p>
          </li>
        </ul>
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border not-prose text-sm mt-4">
          <p className="font-medium text-gray-900 dark:text-white mb-2">Artist Supply TAM</p>
          <p className="text-gray-700 dark:text-gray-300">~2.1M working visual artists in the US; ~180k active on Instagram with 2k+ followers and no existing print commerce. Our initial scrape target: 50k accounts, 5% conversion = 2,500 artists Year 1.</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Target Audiences</h2>
        <div className="space-y-4 mt-4 not-prose">
          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">1. Supply Side (Artists)</h3>
            <p className="text-sm mt-1 mb-2 text-gray-600 dark:text-gray-400">Working painters, illustrators, mixed-media artists (Age 22–55).</p>
            <p className="text-gray-700 dark:text-gray-300"><strong>Pain Points:</strong> No e-commerce skills, $500+ studio photography costs, logistics aversion, inconsistent cash flow.</p>
            <p className="text-gray-700 dark:text-gray-300"><strong>Desires:</strong> Passive income, expanded audience, focus on creating.</p>
            <p className="text-gray-700 dark:text-gray-300"><strong>Willingness to adopt:</strong> High if onboarding takes &lt;5 minutes and first mockup is instant.</p>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">2. Demand Side (Consumers)</h3>
            <p className="text-sm mt-1 mb-2 text-gray-600 dark:text-gray-400">Millennials & Gen Z homeowners/renters, interior designers (Age 25–45).</p>
            <p className="text-gray-700 dark:text-gray-300"><strong>Pain Points:</strong> Big-box art feels generic; gallery originals too expensive ($2k+).</p>
            <p className="text-gray-700 dark:text-gray-300"><strong>Desires:</strong> Affordable authentic art with a story; Amazon-like checkout convenience.</p>
            <p className="text-gray-700 dark:text-gray-300"><strong>Average spend:</strong> $65–$150 per print; 1.8 purchases/year for engaged buyers.</p>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">3. B2B (Interior Designers)</h3>
            <p className="text-sm mt-1 mb-2 text-gray-600 dark:text-gray-400">Independent designers and boutique hospitality firms.</p>
            <p className="text-gray-700 dark:text-gray-300"><strong>Pain Points:</strong> Sourcing unique art at scale for client projects; inconsistent quality from POD vendors.</p>
            <p className="text-gray-700 dark:text-gray-300"><strong>Desires:</strong> Curated catalog, trade pricing, bulk ordering, reliable fulfillment timelines.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Competitive Landscape</h2>
        <div className="overflow-x-auto mt-2 not-prose">
          <table className="min-w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="py-2 pr-4">Competitor Type</th>
                <th className="py-2 pr-4">Examples</th>
                <th className="py-2">Weakness / Our Edge</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Mass Market POD</td>
                <td className="py-2 pr-4">Society6, Redbubble</td>
                <td className="py-2">Commoditized, zero curation. Artist does 100% of upload/marketing. We automate everything.</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Curated Print Galleries</td>
                <td className="py-2 pr-4">Minted, Juniper</td>
                <td className="py-2">High artist barrier, slow manual ingestion. Our AI scales cataloging instantly.</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">DIY Store Builders</td>
                <td className="py-2 pr-4">Shopify, Etsy</td>
                <td className="py-2">Artists become logistics managers. We provide done-for-you software layer.</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">AI Art Generators</td>
                <td className="py-2 pr-4">Midjourney prints</td>
                <td className="py-2">No authentic artist story, no physical original. We sell real painter work with provenance.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">SWOT Analysis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h3 className="font-bold text-green-800 dark:text-green-300 mb-2">Strengths</h3>
            <ul className="text-sm space-y-1 text-green-900 dark:text-green-200 list-disc pl-4">
              <li>AI-first ops = near-zero marginal cost per SKU</li>
              <li>Dual-sided flywheel (artists bring demand)</li>
              <li>No inventory risk (POD model)</li>
            </ul>
          </div>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <h3 className="font-bold text-red-800 dark:text-red-300 mb-2">Weaknesses</h3>
            <ul className="text-sm space-y-1 text-red-900 dark:text-red-200 list-disc pl-4">
              <li>Cold-start: need supply before demand converts</li>
              <li>AI capture quality varies by lighting/phone</li>
              <li>Brand unknown at launch</li>
            </ul>
          </div>
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-2">Opportunities</h3>
            <ul className="text-sm space-y-1 text-blue-900 dark:text-blue-200 list-disc pl-4">
              <li>180k+ underserved Instagram artists</li>
              <li>B2B interior designer channel (Phase 4)</li>
              <li>SaaS licensing to traditional galleries</li>
            </ul>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-2">Threats</h3>
            <ul className="text-sm space-y-1 text-amber-900 dark:text-amber-200 list-disc pl-4">
              <li>Platform policy changes (Instagram DM limits)</li>
              <li>POD partner pricing increases</li>
              <li>AI-generated art flooding low-end market</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
