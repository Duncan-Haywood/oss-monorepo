import React from 'react';

export const ProfitabilityAnalysis: React.FC = () => {
  return (
    <div className="prose max-w-none">
      <h1>Profitability Analysis</h1>
      <p>
        This document expands on the unit economics to project broader business profitability, break-even milestones, and the transition from Print-On-Demand (POD) to in-house fulfillment.
      </p>

      <h2>Unit Economics (Deep Dive)</h2>
      <p>
        Let's model three different print sizes using an average high-quality POD provider (e.g., Prodigi, PrintSpace3D, or White Wall).
      </p>
      <table className="min-w-full text-left border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">Metric</th>
            <th className="border p-2">Small (8x10)</th>
            <th className="border p-2">Medium (16x20)</th>
            <th className="border p-2">Large (24x36)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2"><strong>Retail Price</strong></td>
            <td className="border p-2">$45.00</td>
            <td className="border p-2">$85.00</td>
            <td className="border p-2">$150.00</td>
          </tr>
          <tr>
            <td className="border p-2">Payment Fee (3%)</td>
            <td className="border p-2">$1.35</td>
            <td className="border p-2">$2.55</td>
            <td className="border p-2">$4.50</td>
          </tr>
          <tr>
            <td className="border p-2">POD Cost (Print)</td>
            <td className="border p-2">$8.00</td>
            <td className="border p-2">$18.00</td>
            <td className="border p-2">$35.00</td>
          </tr>
          <tr>
            <td className="border p-2">POD Cost (Shipping)</td>
            <td className="border p-2">$5.00</td>
            <td className="border p-2">$10.00</td>
            <td className="border p-2">$15.00</td>
          </tr>
          <tr className="bg-gray-50">
            <td className="border p-2"><strong>Net Profit</strong></td>
            <td className="border p-2"><strong>$30.65</strong></td>
            <td className="border p-2"><strong>$54.45</strong></td>
            <td className="border p-2"><strong>$95.50</strong></td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Artist Share (30%)</strong></td>
            <td className="border p-2">$9.20</td>
            <td className="border p-2">$16.34</td>
            <td className="border p-2">$28.65</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Atelier Share (70%)</strong></td>
            <td className="border p-2"><strong>$21.45</strong></td>
            <td className="border p-2"><strong>$38.11</strong></td>
            <td className="border p-2"><strong>$66.85</strong></td>
          </tr>
          <tr>
            <td className="border p-2"><em>Blended Margin</em></td>
            <td className="border p-2"><em>47.6%</em></td>
            <td className="border p-2"><em>44.8%</em></td>
            <td className="border p-2"><em>44.5%</em></td>
          </tr>
        </tbody>
      </table>
      <p><em>Note: Atelier Share must cover customer acquisition (CAC), software, and operations.</em></p>

      <h2>Customer Acquisition Cost (CAC) vs. LTV</h2>
      <p>To achieve profitability, our advertising economics must strictly adhere to a sustainable ratio.</p>
      <ul>
        <li><strong>Target CAC:</strong> $15.00 - $20.00 per acquired customer.</li>
        <li><strong>AOV (Average Order Value):</strong> $85.00 (Assuming Medium is the standard seller).</li>
        <li><strong>Atelier Gross Profit per Order:</strong> ~$38.00.</li>
        <li><strong>Contribution Margin 1 (Post-Ad):</strong> $38.00 - $20.00 = <strong>$18.00</strong>.</li>
      </ul>
      <p>
        If LTV increases (repeat buyers), this model becomes highly lucrative. Art buyers often buy in sets (e.g., gallery walls), so incentivizing multi-piece purchases (bundling) is critical to boosting AOV.
      </p>

      <h2>Break-Even Analysis</h2>

      <h3>Phase 1: The Bootstrapped Pilot</h3>
      <ul>
        <li><strong>Fixed Costs:</strong> Software (Shopify, AI tools, domains) = ~$150/mo.</li>
        <li><strong>Variable Costs:</strong> Photographer capture sessions.
          <ul>
            <li>Assume we pay a photographer $50 per session (capturing ~5 pieces). Cost per piece digitized = $10.</li>
          </ul>
        </li>
        <li><strong>Goal:</strong> Digitize 100 pieces ($1,000 capex).</li>
        <li><strong>Break-Even:</strong> To recoup the $1,150 (capex + 1 mo fixed), we need to sell approximately <strong>30 Medium prints</strong> (30 * $38 = $1,140).</li>
      </ul>

      <h3>Phase 2: Scale &amp; Operations Team</h3>
      <ul>
        <li><strong>Fixed Costs:</strong> Operations Manager ($4k/mo), Software &amp; Servers ($500/mo) = $4,500/mo.</li>
        <li><strong>Variable Costs:</strong> CAC ($20/order).</li>
        <li><strong>Break-Even Volume:</strong> We need to generate $4,500 in Contribution Margin 1.
          <ul>
            <li>$4,500 / $18.00 CM1 = <strong>250 print sales per month</strong>.</li>
            <li>At a 2% conversion rate, this requires ~12,500 highly targeted website visitors per month.</li>
          </ul>
        </li>
      </ul>

      <h2>Margin Expansion Strategy (In-House vs. POD)</h2>
      <p>
        Currently, POD providers take a significant cut of the margin to cover their own overhead and profit. As volume scales, bringing printing in-house dramatically shifts the economics.
      </p>

      <h3>The In-House Tipping Point</h3>
      <p>A commercial fine art printer (e.g., Epson SureColor or Canon imagePROGRAF) costs ~$3,000 - $5,000.</p>
      <ul>
        <li><strong>POD 16x20 Print Cost:</strong> $18.00</li>
        <li><strong>In-House 16x20 Print Cost (Ink + Fine Art Paper):</strong> ~$3.50</li>
        <li><strong>Margin Gained:</strong> +$14.50 per print.</li>
      </ul>

      <p><strong>When to switch?</strong></p>
      <p>
        If we are selling 250 medium prints a month, bringing printing in-house saves $3,625 per month in print costs (excluding labor/shipping materials). This easily pays off the printer in under two months.
      </p>
      <p>
        <em>Strategic note:</em> We only bring <em>best-selling sizes and papers</em> in-house initially, routing edge cases (canvas, massive sizes, international orders) to the POD network.
      </p>
    </div>
  );
};
