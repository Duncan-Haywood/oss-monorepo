export default function RevenuePage() {
  return (
    <div className="max-w-4xl mx-auto p-10 space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">Revenue & Profitability Analysis</h1>
        <p className="text-xl text-gray-500">Unit Economics and Financial Projections</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">Core Split</h2>
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Party</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Share</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td className="px-6 py-4 font-medium text-gray-900">Artist</td>
                <td className="px-6 py-4">30% of net profit</td>
                <td className="px-6 py-4 text-gray-500">On every print sale of their work</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-900">Artist (materials)</td>
                <td className="px-6 py-4">Up to +30%</td>
                <td className="px-6 py-4 text-gray-500">Optional reimbursement for supplies; terms per contract</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-900">Print Atelier</td>
                <td className="px-6 py-4">Remainder</td>
                <td className="px-6 py-4 text-gray-500">Covers software platform, AI processing, marketing, fulfillment coordination</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">Profitability Analysis (Unit Economics)</h2>
        <p className="text-gray-700">
          Our software-first model minimizes human-in-the-loop variable costs, focusing strictly on CAC, COGS (POD), and Platform Hosting.
        </p>

        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 shadow-sm">
          <h3 className="font-semibold text-lg">Example: 16×20 Archival Print</h3>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex justify-between pb-2 border-b">
              <span>Sale price</span>
              <span>$85.00</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Payment processing (~3%)</span>
              <span>-$2.55</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>POD print + ship (API integrated)</span>
              <span>-$28.00</span>
            </div>
            <div className="flex justify-between font-bold pt-2 border-t text-base">
              <span>Net Profit</span>
              <span>$54.45 (64% margin)</span>
            </div>
            <div className="flex justify-between text-blue-600 pt-2">
              <span>Artist Share (30%)</span>
              <span>$16.34</span>
            </div>
            <div className="flex justify-between text-green-600 font-bold">
              <span>Print Atelier Gross (70%)</span>
              <span>$38.11</span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">Marketing Economics (B2C & B2B)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
            <h3 className="font-semibold text-blue-900 mb-2">B2C Performance Marketing</h3>
            <p className="text-sm text-blue-800 mb-3">
              Advertising spend comes from Print Atelier&apos;s share. AI optimizes ad variants to drive down CAC.
            </p>
            <code className="block bg-white p-2 rounded text-xs">
              Target CAC: &lt; $15<br/>
              Target LTV: $120 (1.4 prints/buyer)<br/>
              LTV/CAC Ratio: &gt; 8x
            </code>
          </div>
          
          <div className="bg-purple-50 p-5 rounded-lg border border-purple-100">
            <h3 className="font-semibold text-purple-900 mb-2">B2B Digital Outreach</h3>
            <p className="text-sm text-purple-800 mb-3">
              Zero-CAC outbound sales driven by software. Target: interior designers.
            </p>
            <code className="block bg-white p-2 rounded text-xs">
              Software Cost: $100/mo (email tools)<br/>
              AOV (B2B): $850 (10 prints)<br/>
              Net Profit/Order: $544
            </code>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">Scale & Break-Even Modeling</h2>
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li><strong>Software Dev & Hosting:</strong> Fixed at ~$500/mo utilizing Vercel, Supabase, and Stripe.</li>
          <li><strong>Break-even (Platform):</strong> Achieved at ~15 Print Atelier Gross prints/mo ($571).</li>
          <li><strong>Phase 2 (In-house Fulfillment):</strong> Once we cross 1,000 prints/month, capital expenditure for in-house printing reduces COGS by 40%, raising Net Profit margins to 75%+.</li>
        </ul>
      </section>
    </div>
  );
}
