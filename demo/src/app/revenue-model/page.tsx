export default function RevenueModel() {
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <h1 className="text-4xl font-bold text-gray-900 mb-8">Revenue Model</h1>
      
      <div className="prose prose-indigo max-w-none">
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Core Split</h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Party</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Share</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">Artist</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 font-semibold">30% of net profit</td>
                  <td className="px-6 py-4 text-sm text-gray-500">On every print sale of their work</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">Artist (materials)</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-600 font-semibold">Up to +30%</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Optional reimbursement for supplies; terms per contract</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">Print Atelier</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">Remainder</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Covers capture, editing, platform, marketing, fulfillment coordination</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Defining "Net Profit" (Per Sale)</h2>
          <div className="bg-gray-900 text-gray-100 p-6 rounded-lg font-mono text-sm mb-4">
            <div className="text-green-400">Gross sale price</div>
            <div className="text-red-400 ml-4">− payment processing fees</div>
            <div className="text-red-400 ml-4">− print + shipping cost (POD invoice)</div>
            <div className="text-red-400 ml-4">− packaging / insert costs (if any)</div>
            <div className="text-red-400 ml-4">− allocated refund/chargeback reserve (optional %)</div>
            <div className="border-t border-gray-700 mt-2 pt-2 text-white font-bold">= Net profit</div>
          </div>
          <p className="text-lg font-semibold text-indigo-700 bg-indigo-50 p-4 rounded-lg border border-indigo-100 inline-block">
            Artist share = Net profit × 0.30
          </p>
          <div className="mt-4 bg-blue-50 border-l-4 border-blue-500 p-4">
            <p className="text-blue-800 text-sm"><strong>Transparency:</strong> Artists receive periodic statements showing gross, deductions, and net per piece. Exact statement format TBD in Phase 1.</p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Example Unit Economics (Illustrative)</h2>
          <p className="text-gray-600 mb-4">Assume a 16×20 archival print sold at <strong>$85</strong>:</p>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden w-full md:w-2/3">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Line item</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Sale price</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">$85.00</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Payment processing (~3%)</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">−$2.55</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">POD print + ship</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">−$28.00</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">Net profit</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-green-600">$54.45</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Artist share (30%)</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">$16.34</td>
                </tr>
                <tr className="bg-indigo-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-900">Print Atelier (70%)</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-900">$38.11</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-500 italic">*Numbers are placeholders until a POD provider is selected and retail pricing is tested.</p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Fulfillment Tiers</h2>
            <ul className="space-y-4 text-gray-600 list-none pl-0">
              <li className="bg-white p-4 rounded-lg border border-gray-200">
                <strong className="text-gray-900 block mb-1">POD partner (Phase 0–2, low volume)</strong>
                <span className="text-sm">Low capex, lower margin, fast to start</span>
              </li>
              <li className="bg-white p-4 rounded-lg border border-gray-200">
                <strong className="text-gray-900 block mb-1">Hybrid (Growing volume)</strong>
                <span className="text-sm">Best sellers in-house or via preferred printer</span>
              </li>
              <li className="bg-white p-4 rounded-lg border border-gray-200">
                <strong className="text-gray-900 block mb-1">In-house (High volume, proven SKUs)</strong>
                <span className="text-sm">Highest margin, requires warehousing + ops investment</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Advertising Economics</h2>
            <p className="text-sm text-gray-600 mb-4">Advertising spend comes from Print Atelier's share until/unless a co-marketing fund is established with artists.</p>
            <div className="bg-indigo-900 text-white p-4 rounded-lg font-mono text-sm mb-4 text-center">
              LTV (buyer) &gt; CAC × target ratio (e.g. 3×)
            </div>
            <p className="text-sm text-gray-600">Catalog needs enough SKUs and conversion data before scaling ads.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
