export default function MarketResearch() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Market Research</h1>

      <section>
        <h2 className="text-2xl font-semibold">Market Overview</h2>
        <p>
          The global online art market is experiencing rapid digital transformation. However, physical painters remain disconnected from the digital scale due to the technical friction of digitization and fulfillment.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Market Size (TAM, SAM, SOM)</h2>
        <ul className="space-y-3">
          <li>
            <strong>Total Addressable Market (TAM):</strong> $13B+ Global Online Art Market.
            <p className="text-sm text-gray-600 dark:text-gray-400">Represents all art sold digitally worldwide, including prints, originals, and digital-native art.</p>
          </li>
          <li>
            <strong>Serviceable Addressable Market (SAM):</strong> $3.5B+ Wall Décor & Fine Art Prints.
            <p className="text-sm text-gray-600 dark:text-gray-400">The segment specifically buying physical prints of art for home and office decoration via online channels.</p>
          </li>
          <li>
            <strong>Serviceable Obtainable Market (SOM):</strong> $50M - $100M within 3-5 years.
            <p className="text-sm text-gray-600 dark:text-gray-400">Capturing a fraction of the mid-tier fine art print market by unlocking previously inaccessible supply from independent artists.</p>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Target Audiences</h2>
        <div className="space-y-4 mt-4">
          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
            <h3 className="text-lg font-bold">1. The Supply Side (Artists)</h3>
            <p className="text-sm mt-1 mb-2">Demographic: Working painters, illustrators, mixed-media artists (Age 20-55).</p>
            <p><strong>Pain Points:</strong> Lack of technical skills for e-commerce, high cost of high-res scanning, hatred of logistics, inconsistent cash flow.</p>
            <p><strong>Desires:</strong> Passive income, expanded audience, focus on creating rather than administration.</p>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
            <h3 className="text-lg font-bold">2. The Demand Side (Consumers)</h3>
            <p className="text-sm mt-1 mb-2">Demographic: Millennials & Gen Z homeowners/renters, interior designers (Age 25-45).</p>
            <p><strong>Pain Points:</strong> Big-box store art feels generic; original gallery art is too expensive.</p>
            <p><strong>Desires:</strong> Affordable, high-quality, authentic art with a story. They want to support independent artists but need the convenience of Amazon-like checkout and delivery.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Competitive Landscape</h2>
        <div className="overflow-x-auto mt-2">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="py-2 pr-4">Competitor Type</th>
                <th className="py-2 pr-4">Examples</th>
                <th className="py-2">Their Weakness / Our Edge</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Mass Market Marketplaces</td>
                <td className="py-2 pr-4">Society6, Redbubble</td>
                <td className="py-2">Commoditized, zero curation. Artist must do 100% of the upload, formatting, and marketing work. We automate this.</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Curated Print Galleries</td>
                <td className="py-2 pr-4">Minted, Juniper</td>
                <td className="py-2">High barrier to entry for artists. Slow, manual ingestion process. Our AI software scales cataloging instantly.</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">DIY Store Builders</td>
                <td className="py-2 pr-4">Shopify, Etsy</td>
                <td className="py-2">Forces artists to become logistics managers and marketers. We provide a "done-for-you" software layer.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
