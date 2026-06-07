import { TrendingUp } from "lucide-react";

export default function ProfitabilityPage() {
  return (
    <div className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:tracking-tight">
      <div className="flex items-center gap-3 mb-8 not-prose pb-6 border-b border-gray-100">
        <div className="p-2 bg-green-50 rounded-lg">
          <TrendingUp className="w-6 h-6 text-green-600" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 m-0">Profitability Analysis</h1>
      </div>

      <p className="lead text-xl text-gray-600">
        This analysis evaluates the financial viability of Print Atelier, focusing on how a <strong>software-first, AI-driven</strong> operational model fundamentally changes the cost structure compared to a traditional art gallery or standard print-on-demand (POD) business.
      </p>

      <h2>Unit Economics (Per Print)</h2>
      <p>The core unit economics remain grounded in premium pricing and POD fulfillment, but profitability is driven by reducing manual overhead to zero.</p>
      
      <p className="text-sm italic">Example: 16×20 Archival Fine Art Print</p>

      <div className="not-prose overflow-x-auto my-8">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Line Item</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Traditional Model</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Our AI/Software Model</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 text-sm">
            <tr>
              <td className="px-6 py-4 font-medium text-gray-900">Retail Price</td>
              <td className="px-6 py-4 text-right text-gray-500">$85.00</td>
              <td className="px-6 py-4 text-right font-medium text-gray-900">$85.00</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-medium text-gray-900">COGS (Print + Ship)</td>
              <td className="px-6 py-4 text-right text-gray-500">-$28.00</td>
              <td className="px-6 py-4 text-right font-medium text-gray-900">-$26.00</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-medium text-gray-900">Gross Margin</td>
              <td className="px-6 py-4 text-right font-bold text-gray-500">$54.45 (64%)</td>
              <td className="px-6 py-4 text-right font-bold text-gray-900">$56.45 (66%)</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="px-6 py-4 font-medium text-gray-900">Artist Share</td>
              <td className="px-6 py-4 text-right text-gray-500">-$16.34</td>
              <td className="px-6 py-4 text-right text-red-600">-$16.94</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-medium text-gray-900">Marketing CAC</td>
              <td className="px-6 py-4 text-right text-gray-500">-$20.00</td>
              <td className="px-6 py-4 text-right text-green-600">-$12.00</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-medium text-gray-900">Manual Overhead</td>
              <td className="px-6 py-4 text-right text-gray-500">-$10.00</td>
              <td className="px-6 py-4 text-right text-green-600">-$0.50</td>
            </tr>
            <tr className="border-t-2 border-gray-300">
              <td className="px-6 py-4 font-bold text-gray-900">Net Profit to Us</td>
              <td className="px-6 py-4 text-right font-bold text-gray-500">$8.11 (9.5%)</td>
              <td className="px-6 py-4 text-right font-bold text-green-600">$27.01 (31.7%)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>The AI Efficiency Multiplier</h2>

      <h3>1. Zero-Marginal-Cost Catalog Expansion</h3>
      <p>
        In a traditional model, listing 1,000 new artworks requires human labor to write descriptions, create mockups, and build web pages.<br/>
        <strong>Our software advantage:</strong> AI ingests the master file, generates 5 distinct room mockups, writes SEO-optimized titles and descriptions, and automatically tags colors, moods, and styles for search filtering.<br/>
        <strong>Result:</strong> Adding 10,000 SKUs costs server compute time, not human salaries.
      </p>

      <h3>2. Marketing ROI (Return on Ad Spend - ROAS)</h3>
      <p>
        Ad fatigue kills profitability in ecommerce. Producing new ad creatives manually is expensive.<br/>
        <strong>Our software advantage:</strong> Generative AI mixes master files with artist process videos to create infinite ad variants. The software automatically pauses losing ads and scales winning ads.<br/>
        <strong>Result:</strong> Higher ROAS, lower CAC, and sustained profitability in paid acquisition channels.
      </p>

      <h3>3. Automated Artist Acquisition</h3>
      <p>
        Recruiting artists traditionally requires account executives, gallery directors, or manual DM outreach.<br/>
        <strong>Our software advantage:</strong> AI agents scrape social media, evaluate art, and send personalized cold outreach.<br/>
        <strong>Result:</strong> The Cost of Acquiring Supply (CAS) drops close to zero. We acquire inventory passively while the software runs 24/7.
      </p>
    </div>
  );
}