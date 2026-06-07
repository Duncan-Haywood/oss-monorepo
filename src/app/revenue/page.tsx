export default function Revenue() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 prose prose-stone lg:prose-lg prose-indigo">
      <h1>Revenue Model</h1>

      <h2>Core Split</h2>
      <table>
        <thead>
          <tr>
            <th>Party</th>
            <th>Share</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Artist</strong></td>
            <td>30% of net profit</td>
            <td>On every print sale of their work</td>
          </tr>
          <tr>
            <td><strong>Artist (materials)</strong></td>
            <td>Up to +30%</td>
            <td>Optional reimbursement for supplies; terms per contract</td>
          </tr>
          <tr>
            <td><strong>Print Atelier</strong></td>
            <td>Remainder</td>
            <td>Covers capture, editing, platform, marketing, fulfillment coordination</td>
          </tr>
        </tbody>
      </table>

      <h2>Defining "Net Profit" (Per Sale)</h2>
      <pre><code>{`Gross sale price
  − payment processing fees
  − print + shipping cost (POD invoice)
  − packaging / insert costs (if any)
  − allocated refund/chargeback reserve (optional %)
= Net profit`}</code></pre>

      <p>Artist share = <code>Net profit × 0.30</code></p>
      
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl my-6">
        <p className="m-0 text-blue-900">
          <strong>Transparency:</strong> Artists receive periodic statements showing gross, deductions, and net per piece via the automated Artist Portal.
        </p>
      </div>

      <h2>Example Unit Economics (Illustrative)</h2>
      <p>Assume a 16×20 archival print sold at <strong>$85</strong>:</p>

      <table>
        <thead>
          <tr>
            <th>Line item</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Sale price</td>
            <td>$85.00</td>
          </tr>
          <tr>
            <td>Payment processing (~3%)</td>
            <td>−$2.55</td>
          </tr>
          <tr>
            <td>POD print + ship</td>
            <td>−$28.00</td>
          </tr>
          <tr>
            <td><strong>Net profit</strong></td>
            <td><strong>$54.45</strong></td>
          </tr>
          <tr>
            <td>Artist share (30%)</td>
            <td>$16.34</td>
          </tr>
          <tr>
            <td>Print Atelier (70%)</td>
            <td>$38.11</td>
          </tr>
        </tbody>
      </table>

      <h2>Fulfillment Tiers</h2>
      <table>
        <thead>
          <tr>
            <th>Tier</th>
            <th>When</th>
            <th>Impact</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>POD partner</strong></td>
            <td>Phase 0–2, low volume</td>
            <td>Low capex, lower margin, fast to start</td>
          </tr>
          <tr>
            <td><strong>Hybrid</strong></td>
            <td>Growing volume</td>
            <td>Best sellers in-house or via preferred printer</td>
          </tr>
          <tr>
            <td><strong>In-house</strong></td>
            <td>High volume, proven SKUs</td>
            <td>Highest margin, requires warehousing + ops investment</td>
          </tr>
        </tbody>
      </table>

      <h2>Advertising Economics</h2>
      <p>Advertising spend comes from Print Atelier's share until/unless a co-marketing fund is established with artists.</p>
      <p>Decision gate for paid acquisition:</p>
      <pre><code>LTV (buyer) &gt; CAC × target ratio (e.g. 3×)</code></pre>

      <h2>Payout Cadence</h2>
      <table>
        <thead>
          <tr>
            <th>Phase</th>
            <th>Cadence</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Pilot</td>
            <td>Monthly manual payout</td>
          </tr>
          <tr>
            <td>Scale</td>
            <td>Monthly automated via Stripe Connect or similar</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
