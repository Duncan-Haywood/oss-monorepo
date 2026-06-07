export default function RevenueModel() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Revenue Model & Profitability Analysis</h1>

      <section>
        <h2 className="text-2xl font-semibold">Core Split</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="py-2 pr-4">Party</th>
                <th className="py-2 pr-4">Share</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Artist</td>
                <td className="py-2 pr-4">30% of Net Profit</td>
                <td className="py-2">On every print sale of their work</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Print Atelier (Platform)</td>
                <td className="py-2 pr-4">70% of Net Profit</td>
                <td className="py-2">Covers AI compute, platform hosting, marketing, and ops</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Profitability Analysis (Unit Economics)</h2>
        <p>Because we use an AI-first, software-driven approach, our fixed costs per piece are near zero. The primary costs are variable (compute, marketing, POD). This yields SaaS-like scalability on the platform side.</p>
        
        <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 my-4">
          <h3 className="text-xl font-medium mb-4">Example: 16×20 Archival Print ($85 Retail)</h3>
          <ul className="space-y-2 font-mono text-sm">
            <li className="flex justify-between border-b pb-1"><span>Sale Price</span> <span>$85.00</span></li>
            <li className="flex justify-between border-b pb-1 text-red-600 dark:text-red-400"><span>Payment Processing (~3%)</span> <span>-$2.55</span></li>
            <li className="flex justify-between border-b pb-1 text-red-600 dark:text-red-400"><span>POD Print + Drop-shipping</span> <span>-$28.00</span></li>
            <li className="flex justify-between font-bold pt-1"><span>Net Profit</span> <span>$54.45 (64% Margin)</span></li>
            <li className="flex justify-between text-blue-600 dark:text-blue-400 mt-2"><span>Artist Share (30%)</span> <span>$16.34</span></li>
            <li className="flex justify-between text-green-600 dark:text-green-400 font-bold"><span>Print Atelier Gross (70%)</span> <span>$38.11</span></li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">SaaS & Platform Scalability</h2>
        <p>Traditional art businesses have a linear relationship between headcount and inventory size. By leveraging software:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>CAC (Customer Acquisition Cost):</strong> Optimized via AI ad bidding and automated A/B testing of creatives. Target CAC: &lt;$12 per new buyer.</li>
          <li><strong>LTV (Life Time Value):</strong> Increased via automated email retention sequences and algorithmic recommendations to past buyers. Target LTV: $150+ (approx 2 purchases/year).</li>
          <li><strong>Artist Acquisition Cost:</strong> Near zero due to digital-first outreach bots and self-serve onboarding.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Path to High-Margin Profitability</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li><strong>Phase 1 (Agile POD):</strong> Use external APIs (e.g., Printful, Gelato) for 100% of fulfillment. Margins are lower, but Capex is zero. Validates the software platform.</li>
          <li><strong>Phase 2 (Hybrid Volume):</strong> Once predictive AI identifies top-selling SKUs, print those in-house or via bulk-discounted local partners, increasing platform margin by 15-20%.</li>
          <li><strong>Phase 3 (Software Licensing - Optional):</strong> License the AI capture and deskewing software directly to galleries or institutions as a pure SaaS play.</li>
        </ol>
      </section>
    </div>
  );
}
