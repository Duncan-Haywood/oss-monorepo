export default function Strategy() {
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <h1 className="text-4xl font-bold text-gray-900 mb-8">Strategy</h1>
      
      <div className="prose prose-indigo max-w-none">
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Problem</h2>
          <p className="text-gray-600">
            Working artists face a structural income ceiling: every painting is a one-time transaction tied directly to hours in the studio. Marketing, fulfillment, and repeat revenue require skills and infrastructure most painters do not want to build.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Solution</h2>
          <p className="text-gray-600 mb-4">
            Print Atelier sits between artists and buyers as a <strong>digitization + distribution layer</strong>:
          </p>
          <ol className="space-y-2 text-gray-600 list-decimal pl-5">
            <li>Capture high-fidelity digital masters of original paintings (professional camera, controlled lighting, color-accurate workflow)</li>
            <li>Optionally document the painting process as marketing content</li>
            <li>List prints across commerce channels</li>
            <li>Fulfill via print-on-demand partners until margins support in-house operations</li>
            <li>Pay artists a transparent revenue share on every sale</li>
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Positioning</h2>
          <ul className="space-y-2 text-gray-600 list-disc pl-5">
            <li><strong>Not</strong> a gallery taking 50% on a single original sale</li>
            <li><strong>Not</strong> a stock-photo marketplace treating art as commodity clip art</li>
            <li><strong>Is</strong> a partner that turns finished work into long-tail inventory while the artist keeps painting</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Growth Tracks</h2>
          
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-indigo-600 mb-2">Track 1: Supply (Artist Acquisition)</h3>
              <ul className="space-y-2 text-gray-600 list-disc pl-5 text-sm">
                <li>Direct outreach to painters, art schools, studio complexes, and local art scenes</li>
                <li>Pitch: digitize once, earn on every print, zero logistics burden</li>
                <li>Deliverable to artist: signed agreement, professional scan session, optional process footage/photos for marketing</li>
              </ul>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-indigo-600 mb-2">Track 2: Demand (Consumer Commerce)</h3>
              <ul className="space-y-2 text-gray-600 list-disc pl-5 text-sm">
                <li>Direct-to-consumer print store (Shopify, custom storefront, or marketplace channels)</li>
                <li>Paid advertising once catalog and conversion data justify spend</li>
                <li>SEO and social around artist stories and process content</li>
              </ul>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-indigo-600 mb-2">Track 3: Geographic Expansion</h3>
              <ul className="space-y-2 text-gray-600 list-disc pl-5 text-sm">
                <li>Hire or contract field photographers per city</li>
                <li>Ship standardized capture kit (camera guidance, lighting checklist, color card, contract templates)</li>
                <li>Upload pipeline: raw captures → shared drive → central processing → catalog</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Key Metrics</h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Why it matters</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Artists signed</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Supply pipeline depth</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Pieces digitized</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Catalog size (inventory)</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Print conversion rate</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Demand-side efficiency</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Revenue per artist per month</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Supply-side retention signal</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Blended gross margin</td>
                  <td className="px-6 py-4 text-sm text-gray-500">When to move off POD providers</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">CAC / LTV (buyers)</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Ad spend viability</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Competitive Moat (Over Time)</h2>
          <ol className="space-y-2 text-gray-600 list-decimal pl-5">
            <li><strong>Curated catalog</strong> — quality bar and artist relationships, not infinite scroll</li>
            <li><strong>Process content</strong> — behind-the-scenes material competitors cannot easily replicate</li>
            <li><strong>Local acquisition network</strong> — city-by-city photographer playbook</li>
            <li><strong>Artist trust</strong> — transparent splits, reliable payouts, professional treatment of their work</li>
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Phase Plan</h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phase</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Focus</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">0 — Foundation</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Document model, validate with 1–3 pilot artists (sister + local painters), test POD quality</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">1 — Pilot commerce</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Small catalog live, manual ops, prove unit economics on 10–20 pieces</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">2 — Platform</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Upload/catalog tooling, artist portal, automated payout tracking</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">3 — Scale</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Multi-city acquisition, advertising engine, evaluate in-house fulfillment</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
