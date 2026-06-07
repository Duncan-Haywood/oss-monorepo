export default function RevenueModel() {
  return (
    <div className="prose prose-emerald dark:prose-invert max-w-none">
      <h1>Revenue Model</h1>

      <h2>Core Split</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b pb-2 font-semibold">Party</th>
              <th className="border-b pb-2 font-semibold">Share</th>
              <th className="border-b pb-2 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b py-2"><strong>Artist</strong></td>
              <td className="border-b py-2">30% of net profit</td>
              <td className="border-b py-2">On every print sale of their work</td>
            </tr>
            <tr>
              <td className="border-b py-2"><strong>Artist (materials)</strong></td>
              <td className="border-b py-2">Up to +30%</td>
              <td className="border-b py-2">Optional reimbursement for supplies; terms per contract</td>
            </tr>
            <tr>
              <td className="border-b py-2"><strong>Print Atelier</strong></td>
              <td className="border-b py-2">Remainder</td>
              <td className="border-b py-2">Covers capture, editing, platform, marketing, fulfillment coordination</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Defining "Net Profit" (Per Sale)</h2>
      <pre><code>{`Gross sale price
  − payment processing fees
  − print + shipping cost (POD invoice)
  − packaging / insert costs (if any)
  − allocated refund/chargeback reserve (optional %)
= Net profit`}</code></pre>
      <p>Artist share = <code>Net profit × 0.30</code></p>
      <blockquote>
        <p><strong>Transparency:</strong> Artists receive periodic statements showing gross, deductions, and net per piece. Exact statement format TBD in Phase 1.</p>
      </blockquote>

      <h2>Example Unit Economics (Illustrative)</h2>
      <p>Assume a 16×20 archival print sold at <strong>$85</strong>:</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b pb-2 font-semibold">Line item</th>
              <th className="border-b pb-2 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b py-2">Sale price</td>
              <td className="border-b py-2">$85.00</td>
            </tr>
            <tr>
              <td className="border-b py-2">Payment processing (~3%)</td>
              <td className="border-b py-2">−$2.55</td>
            </tr>
            <tr>
              <td className="border-b py-2">POD print + ship</td>
              <td className="border-b py-2">−$28.00</td>
            </tr>
            <tr>
              <td className="border-b py-2"><strong>Net profit</strong></td>
              <td className="border-b py-2"><strong>$54.45</strong></td>
            </tr>
            <tr>
              <td className="border-b py-2">Artist share (30%)</td>
              <td className="border-b py-2">$16.34</td>
            </tr>
            <tr>
              <td className="border-b py-2">Print Atelier (70%)</td>
              <td className="border-b py-2">$38.11</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p><em>Numbers are placeholders until a POD provider is selected and retail pricing is tested.</em></p>

      <h2>Fulfillment Tiers</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b pb-2 font-semibold">Tier</th>
              <th className="border-b pb-2 font-semibold">When</th>
              <th className="border-b pb-2 font-semibold">Impact</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b py-2"><strong>POD partner</strong></td>
              <td className="border-b py-2">Phase 0–2, low volume</td>
              <td className="border-b py-2">Low capex, lower margin, fast to start</td>
            </tr>
            <tr>
              <td className="border-b py-2"><strong>Hybrid</strong></td>
              <td className="border-b py-2">Growing volume</td>
              <td className="border-b py-2">Best sellers in-house or via preferred printer</td>
            </tr>
            <tr>
              <td className="border-b py-2"><strong>In-house</strong></td>
              <td className="border-b py-2">High volume, proven SKUs</td>
              <td className="border-b py-2">Highest margin, requires warehousing + ops investment</td>
            </tr>
          </tbody>
        </table>
      </div>
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
      <pre><code>LTV (buyer) &gt; CAC × target ratio (e.g. 3×)</code></pre>
      <p>Catalog needs enough SKUs and conversion data before scaling ads.</p>

      <h2>Payout Cadence</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b pb-2 font-semibold">Phase</th>
              <th className="border-b pb-2 font-semibold">Cadence</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b py-2">Pilot</td>
              <td className="border-b py-2">Monthly manual payout</td>
            </tr>
            <tr>
              <td className="border-b py-2">Scale</td>
              <td className="border-b py-2">Monthly automated via Stripe Connect or similar</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Minimum payout threshold (e.g. $25) to reduce transaction overhead.</p>

      <h2>Scenarios to Model</h2>
      <ul>
        <li><input type="checkbox" disabled /> Average prints sold per piece per year (long tail)</li>
        <li><input type="checkbox" disabled /> Break-even catalog size for part-time operator</li>
        <li><input type="checkbox" disabled /> Break-even for first field photographer in a new city</li>
        <li><input type="checkbox" disabled /> Sensitivity: POD cost +10%, price −10%, conversion −20%</li>
      </ul>
      <p>Build spreadsheet in Phase 1 once provider pricing is confirmed.</p>
    </div>
  );
}
