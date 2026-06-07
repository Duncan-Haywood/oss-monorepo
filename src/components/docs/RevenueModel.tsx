import React from 'react';

export const RevenueModel: React.FC = () => {
  return (
    <div className="prose max-w-none">
      <h1>Revenue Model</h1>

      <h2>Core Split</h2>
      <table className="min-w-full text-left border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">Party</th>
            <th className="border p-2">Share</th>
            <th className="border p-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2"><strong>Artist</strong></td>
            <td className="border p-2">30% of net profit</td>
            <td className="border p-2">On every print sale of their work</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Artist (materials)</strong></td>
            <td className="border p-2">Up to +30%</td>
            <td className="border p-2">Optional reimbursement for supplies; terms per contract</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Print Atelier</strong></td>
            <td className="border p-2">Remainder</td>
            <td className="border p-2">Covers capture, editing, platform, marketing, fulfillment coordination</td>
          </tr>
        </tbody>
      </table>

      <h2>Defining "Net Profit" (Per Sale)</h2>
      <pre className="bg-gray-100 p-4 rounded-md">
        Gross sale price{'\n'}
        {'  '}− payment processing fees{'\n'}
        {'  '}− print + shipping cost (POD invoice){'\n'}
        {'  '}− packaging / insert costs (if any){'\n'}
        {'  '}− allocated refund/chargeback reserve (optional %){'\n'}
        = Net profit
      </pre>

      <p>Artist share = <code>Net profit &times; 0.30</code></p>

      <blockquote>
        <strong>Transparency:</strong> Artists receive periodic statements showing gross, deductions, and net per piece. Exact statement format TBD in Phase 1.
      </blockquote>

      <h2>Example Unit Economics (Illustrative)</h2>
      <p>Assume a 16&times;20 archival print sold at <strong>$85</strong>:</p>

      <table className="min-w-full text-left border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">Line item</th>
            <th className="border p-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2">Sale price</td>
            <td className="border p-2">$85.00</td>
          </tr>
          <tr>
            <td className="border p-2">Payment processing (~3%)</td>
            <td className="border p-2">&minus;$2.55</td>
          </tr>
          <tr>
            <td className="border p-2">POD print + ship</td>
            <td className="border p-2">&minus;$28.00</td>
          </tr>
          <tr className="bg-gray-50">
            <td className="border p-2"><strong>Net profit</strong></td>
            <td className="border p-2"><strong>$54.45</strong></td>
          </tr>
          <tr>
            <td className="border p-2">Artist share (30%)</td>
            <td className="border p-2">$16.34</td>
          </tr>
          <tr>
            <td className="border p-2">Print Atelier (70%)</td>
            <td className="border p-2">$38.11</td>
          </tr>
        </tbody>
      </table>

      <p><em>Numbers are placeholders until a POD provider is selected and retail pricing is tested.</em></p>

      <h2>Fulfillment Tiers</h2>
      <table className="min-w-full text-left border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">Tier</th>
            <th className="border p-2">When</th>
            <th className="border p-2">Impact</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2"><strong>POD partner</strong></td>
            <td className="border p-2">Phase 0–2, low volume</td>
            <td className="border p-2">Low capex, lower margin, fast to start</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Hybrid</strong></td>
            <td className="border p-2">Growing volume</td>
            <td className="border p-2">Best sellers in-house or via preferred printer</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>In-house</strong></td>
            <td className="border p-2">High volume, proven SKUs</td>
            <td className="border p-2">Highest margin, requires warehousing + ops investment</td>
          </tr>
        </tbody>
      </table>

      <p>Margin improvement from tier upgrades flows primarily to Print Atelier unless renegotiated with artists at scale.</p>

      <h2>Materials Reimbursement</h2>
      <p>Separate from profit share. Intended for early partnership or artists with high material cost.</p>
      <p>Example structure:</p>
      <ul>
        <li>Artist submits material receipt or estimated cost per piece</li>
        <li>Cap: 30% of estimated retail print revenue for that piece, or fixed dollar cap</li>
        <li>Paid on first N sales or as one-time stipend — <strong>TBD in contract</strong></li>
      </ul>

      <h2>Advertising Economics</h2>
      <p>Advertising spend comes from Print Atelier's share until/unless a co-marketing fund is established with artists.</p>
      <p>Decision gate for paid acquisition:</p>
      <pre className="bg-gray-100 p-4 rounded-md">
        LTV (buyer) &gt; CAC &times; target ratio (e.g. 3&times;)
      </pre>
      <p>Catalog needs enough SKUs and conversion data before scaling ads.</p>

      <h2>Payout Cadence</h2>
      <table className="min-w-full text-left border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">Phase</th>
            <th className="border p-2">Cadence</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2">Pilot</td>
            <td className="border p-2">Monthly manual payout</td>
          </tr>
          <tr>
            <td className="border p-2">Scale</td>
            <td className="border p-2">Monthly automated via Stripe Connect or similar</td>
          </tr>
        </tbody>
      </table>

      <p>Minimum payout threshold (e.g. $25) to reduce transaction overhead.</p>

      <h2>Scenarios to Model</h2>
      <ul>
        <li>[ ] Average prints sold per piece per year (long tail)</li>
        <li>[ ] Break-even catalog size for part-time operator</li>
        <li>[ ] Break-even for first field photographer in a new city</li>
        <li>[ ] Sensitivity: POD cost +10%, price &minus;10%, conversion &minus;20%</li>
      </ul>

      <p>Build spreadsheet in Phase 1 once provider pricing is confirmed.</p>
    </div>
  );
};
