export default function OperationsPage() {
  return (
    <div className="max-w-4xl mx-auto p-10 space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">Operations Playbook</h1>
        <p className="text-xl text-gray-500">Digital-First, Automated Supply Chain</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">1. Digital-First Supply Acquisition</h2>
        <p className="text-gray-700">
          Instead of manually scouting artists, we utilize software scraping and AI analysis to identify high-potential artists based on engagement metrics, aesthetic alignment, and follower count.
        </p>
        <div className="bg-gray-50 p-4 rounded-md border text-sm">
          <strong>Workflow:</strong> AI identifies artist &rarr; Automated personalized email/DM sent &rarr; Artist signs digital contract via Stripe/HelloSign &rarr; Onboarding portal unlocks.
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">2. AI-Assisted Capture & Upload</h2>
        <p className="text-gray-700">
          Traditional scanning is expensive. We empower artists to capture their own work using a software-guided mobile app, or we dispatch freelance photographers via our app.
        </p>
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li><strong>Self-Serve Upload:</strong> Artists upload high-res photos. Our AI backend automatically corrects perspective, removes glare, and calibrates colors to match standard ICC profiles.</li>
          <li><strong>Metadata Extraction:</strong> AI extracts tags, styles, and color palettes automatically from the image to populate SEO-optimized product listings.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">3. Zero-Touch Print-on-Demand Fulfillment</h2>
        <p className="text-gray-700">
          All orders are programmatically routed to our global API-first printing partners (e.g., Prodigi, Printful, Gelato) based on the buyer&apos;s geographic location to minimize shipping costs and carbon footprint.
        </p>
        <div className="relative pl-8 border-l-2 border-indigo-200 space-y-6 my-6">
          <div className="relative">
            <span className="absolute -left-10 bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">1</span>
            <h4 className="font-semibold text-gray-900">Order Placed</h4>
            <p className="text-sm text-gray-600">Customer buys via Next.js frontend / Stripe checkout.</p>
          </div>
          <div className="relative">
            <span className="absolute -left-10 bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">2</span>
            <h4 className="font-semibold text-gray-900">Algorithmic Routing</h4>
            <p className="text-sm text-gray-600">System selects nearest printing facility and sends high-res master via API.</p>
          </div>
          <div className="relative">
            <span className="absolute -left-10 bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">3</span>
            <h4 className="font-semibold text-gray-900">Print & Ship</h4>
            <p className="text-sm text-gray-600">Partner produces archival print, packages it, and ships. Webhook updates database with tracking.</p>
          </div>
          <div className="relative">
            <span className="absolute -left-10 bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">4</span>
            <h4 className="font-semibold text-gray-900">Automated Payouts</h4>
            <p className="text-sm text-gray-600">Stripe Connect automatically splits funds, dropping the 30% Net Profit directly into the artist&apos;s bank account.</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">4. AI Marketing & Sales Both Sides</h2>
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li><strong>Supply Side Marketing:</strong> Automated case studies generated from our top-earning artists, used as social proof in our digital outreach to recruit new talent.</li>
          <li><strong>Demand Side Marketing:</strong> Code automatically pairs new inventory with dynamic ad templates. When a print starts trending, the system automatically scales ad spend rules.</li>
        </ul>
      </section>
    </div>
  );
}
