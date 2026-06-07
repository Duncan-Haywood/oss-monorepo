export default function Strategy() {
  return (
    <div className="prose prose-indigo dark:prose-invert max-w-none">
      <h1>Strategy</h1>

      <h2>Problem</h2>
      <p>
        Working artists face a structural income ceiling: every painting is a one-time transaction tied directly to hours in the studio. Marketing, fulfillment, and repeat revenue require skills and infrastructure most painters do not want to build.
      </p>

      <h2>Solution</h2>
      <p>
        Print Atelier sits between artists and buyers as a <strong>digitization + distribution layer</strong>:
      </p>
      <ol>
        <li>Capture high-fidelity digital masters of original paintings (professional camera, controlled lighting, color-accurate workflow)</li>
        <li>Optionally document the painting process as marketing content</li>
        <li>List prints across commerce channels</li>
        <li>Fulfill via print-on-demand partners until margins support in-house operations</li>
        <li>Pay artists a transparent revenue share on every sale</li>
      </ol>

      <h2>Positioning</h2>
      <ul>
        <li><strong>Not</strong> a gallery taking 50% on a single original sale</li>
        <li><strong>Not</strong> a stock-photo marketplace treating art as commodity clip art</li>
        <li><strong>Is</strong> a partner that turns finished work into long-tail inventory while the artist keeps painting</li>
      </ul>

      <h2>Growth Tracks</h2>

      <h3>Track 1: Supply (Artist Acquisition)</h3>
      <ul>
        <li>Direct outreach to painters, art schools, studio complexes, and local art scenes</li>
        <li>Pitch: digitize once, earn on every print, zero logistics burden</li>
        <li>Deliverable to artist: signed agreement, professional scan session, optional process footage/photos for marketing</li>
      </ul>

      <h3>Track 2: Demand (Consumer Commerce)</h3>
      <ul>
        <li>Direct-to-consumer print store (Shopify, custom storefront, or marketplace channels)</li>
        <li>Paid advertising once catalog and conversion data justify spend</li>
        <li>SEO and social around artist stories and process content</li>
      </ul>

      <h3>Track 3: Geographic Expansion</h3>
      <ul>
        <li>Hire or contract field photographers per city</li>
        <li>Ship standardized capture kit (camera guidance, lighting checklist, color card, contract templates)</li>
        <li>Upload pipeline: raw captures → shared drive → central processing → catalog</li>
      </ul>

      <h2>Key Metrics</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b pb-2 font-semibold">Metric</th>
              <th className="border-b pb-2 font-semibold">Why it matters</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b py-2">Artists signed</td>
              <td className="border-b py-2">Supply pipeline depth</td>
            </tr>
            <tr>
              <td className="border-b py-2">Pieces digitized</td>
              <td className="border-b py-2">Catalog size (inventory)</td>
            </tr>
            <tr>
              <td className="border-b py-2">Print conversion rate</td>
              <td className="border-b py-2">Demand-side efficiency</td>
            </tr>
            <tr>
              <td className="border-b py-2">Revenue per artist per month</td>
              <td className="border-b py-2">Supply-side retention signal</td>
            </tr>
            <tr>
              <td className="border-b py-2">Blended gross margin</td>
              <td className="border-b py-2">When to move off POD providers</td>
            </tr>
            <tr>
              <td className="border-b py-2">CAC / LTV (buyers)</td>
              <td className="border-b py-2">Ad spend viability</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Competitive Moat (Over Time)</h2>
      <ol>
        <li><strong>Curated catalog</strong> — quality bar and artist relationships, not infinite scroll</li>
        <li><strong>Process content</strong> — behind-the-scenes material competitors cannot easily replicate</li>
        <li><strong>Local acquisition network</strong> — city-by-city photographer playbook</li>
        <li><strong>Artist trust</strong> — transparent splits, reliable payouts, professional treatment of their work</li>
      </ol>

      <h2>Phase Plan</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b pb-2 font-semibold">Phase</th>
              <th className="border-b pb-2 font-semibold">Focus</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b py-2"><strong>0 — Foundation</strong></td>
              <td className="border-b py-2">Document model, validate with 1–3 pilot artists (sister + local painters), test POD quality</td>
            </tr>
            <tr>
              <td className="border-b py-2"><strong>1 — Pilot commerce</strong></td>
              <td className="border-b py-2">Small catalog live, manual ops, prove unit economics on 10–20 pieces</td>
            </tr>
            <tr>
              <td className="border-b py-2"><strong>2 — Platform</strong></td>
              <td className="border-b py-2">Upload/catalog tooling, artist portal, automated payout tracking</td>
            </tr>
            <tr>
              <td className="border-b py-2"><strong>3 — Scale</strong></td>
              <td className="border-b py-2">Multi-city acquisition, advertising engine, evaluate in-house fulfillment</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Open Questions</h2>
      <ul>
        <li><input type="checkbox" disabled /> Which POD provider(s) meet color fidelity and paper quality bar?</li>
        <li><input type="checkbox" disabled /> Minimum catalog size before paid acquisition makes sense?</li>
        <li><input type="checkbox" disabled /> Exclusive vs. non-exclusive rights per piece?</li>
        <li><input type="checkbox" disabled /> Pricing tiers (open edition vs. limited edition prints)?</li>
        <li><input type="checkbox" disabled /> Legal template for artist agreements (jurisdiction, rights scope)</li>
      </ul>
    </div>
  );
}
