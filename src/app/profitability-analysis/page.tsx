export default function ProfitabilityAnalysis() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 prose prose-stone lg:prose-lg prose-indigo">
      <h1>Profitability Analysis</h1>
      <p className="lead">
        This document expands on the unit economics to project broader business profitability, break-even milestones, and the transition from Print-On-Demand (POD) to in-house fulfillment.
      </p>

      <h2>Unit Economics (Deep Dive)</h2>
      <p>Modeling three different print sizes using an average high-quality POD provider.</p>

      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Small (8x10)</th>
            <th>Medium (16x20)</th>
            <th>Large (24x36)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Retail Price</td>
            <td>$45.00</td>
            <td>$85.00</td>
            <td>$150.00</td>
          </tr>
          <tr>
            <td>Payment Fee (3%)</td>
            <td>$1.35</td>
            <td>$2.55</td>
            <td>$4.50</td>
          </tr>
          <tr>
            <td>POD Cost (Print)</td>
            <td>$8.00</td>
            <td>$18.00</td>
            <td>$35.00</td>
          </tr>
          <tr>
            <td>POD Cost (Shipping)</td>
            <td>$5.00</td>
            <td>$10.00</td>
            <td>$15.00</td>
          </tr>
          <tr className="bg-green-50 font-bold">
            <td>Net Profit</td>
            <td>$30.65</td>
            <td>$54.45</td>
            <td>$95.50</td>
          </tr>
          <tr className="text-indigo-700">
            <td>Artist Share (30%)</td>
            <td>$9.20</td>
            <td>$16.34</td>
            <td>$28.65</td>
          </tr>
          <tr className="font-bold text-indigo-900">
            <td>Atelier Share (70%)</td>
            <td>$21.45</td>
            <td>$38.11</td>
            <td>$66.85</td>
          </tr>
        </tbody>
      </table>

      <h2>Customer Acquisition Cost (CAC) vs. LTV</h2>
      <p>To achieve profitability, our advertising economics must strictly adhere to a sustainable ratio.</p>
      <ul>
        <li><strong>Target CAC:</strong> $15.00 - $20.00 per acquired customer.</li>
        <li><strong>AOV (Average Order Value):</strong> $85.00</li>
        <li><strong>Atelier Gross Profit per Order:</strong> ~$38.00.</li>
        <li><strong>Contribution Margin 1 (Post-Ad):</strong> $38.00 - $20.00 = <strong>$18.00</strong>.</li>
      </ul>

      <h2>Break-Even Analysis</h2>

      <h3>Phase 1: The Bootstrapped Pilot</h3>
      <ul>
        <li><strong>Fixed Costs:</strong> Software (Shopify, AI tools, domains) = ~$150/mo.</li>
        <li><strong>Variable Costs:</strong> Cost per piece digitized = $10.</li>
        <li><strong>Break-Even:</strong> To recoup the $1,150 ($1,000 capex + 1 mo fixed), we need to sell approximately <strong>30 Medium prints</strong>.</li>
      </ul>

      <h3>Phase 2: Scale & Operations Team</h3>
      <ul>
        <li><strong>Fixed Costs:</strong> Operations Manager ($4k/mo), Software & Servers ($500/mo) = $4,500/mo.</li>
        <li><strong>Break-Even Volume:</strong> $4,500 / $18.00 CM1 = <strong>250 print sales per month</strong>.</li>
      </ul>

      <h2>Margin Expansion Strategy (In-House vs. POD)</h2>
      <p>As volume scales, bringing printing in-house dramatically shifts the economics.</p>
      <ul>
        <li><strong>POD 16x20 Print Cost:</strong> $18.00</li>
        <li><strong>In-House 16x20 Print Cost (Ink + Fine Art Paper):</strong> ~$3.50</li>
        <li><strong>Margin Gained:</strong> +$14.50 per print.</li>
      </ul>
      <p>
        <strong>When to switch?</strong> If we are selling 250 medium prints a month, bringing printing in-house saves $3,625 per month in print costs. This easily pays off a commercial fine art printer in under two months.
      </p>
    </div>
  );
}
