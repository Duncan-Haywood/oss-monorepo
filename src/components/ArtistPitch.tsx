export default function ArtistPitch() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">The Artist Pitch (Software First)</h1>

      <section>
        <h2 className="text-2xl font-semibold">The One-Liner</h2>
        <p className="text-xl italic text-gray-600 dark:text-gray-300">
          "Upload a photo from your phone. Our AI creates museum-quality prints, markets them, and sends you 30% of the profits. You just keep painting."
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Your Reality vs. Our Software</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
            <h3 className="text-lg font-bold text-red-700 dark:text-red-400 mb-2">The Old Way</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Sell an original once, never make money from it again.</li>
              <li>Spend $500+ on professional studio photography to digitize.</li>
              <li>Spend hours formatting files, writing listings, and building a Shopify site.</li>
              <li>Pack boxes, buy tape, and stand in line at the post office.</li>
            </ul>
          </div>
          <div className="border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-2">The Print Atelier Platform</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Turn one painting into a recurring digital income stream.</li>
              <li>Use our app to snap a photo—our AI makes it print-perfect instantly.</li>
              <li>Our software generates your listings, mockups, and SEO automatically.</li>
              <li>Orders print globally via our API partners and ship directly to the buyer.</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">What We Handle (Everything but the Art)</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>AI Enhancement:</strong> Color correction, deskewing, and upscaling.</li>
          <li><strong>Digital Marketing:</strong> Programmatic ad buying and social media automation.</li>
          <li><strong>Global Logistics:</strong> Print production, packaging, and international shipping.</li>
          <li><strong>Customer Support:</strong> Handling returns, damages, and buyer inquiries.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Transparent Dashboard</h2>
        <p>No more guessing or waiting for quarterly checks. You get a real-time software dashboard showing:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Live view of prints sold and geographic data.</li>
          <li>Exact breakdown of gross sale, printing costs, and your 30% net profit share.</li>
          <li>One-click payouts to your bank account via our Stripe integration.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">The Guarantee</h2>
        <p>You always keep your original artwork. You retain all copyright. We only make money when you make money.</p>
      </section>
    </div>
  );
}
