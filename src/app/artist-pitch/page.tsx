export default function ArtistPitch() {
  return (
    <div className="prose prose-rose dark:prose-invert max-w-none">
      <h1>Artist Pitch</h1>

      <h2>One-Liner</h2>
      <p><em>We photograph your finished work, sell museum-quality prints online, and send you 30% of the profits — you keep painting.</em></p>

      <h2>The Conversation</h2>

      <h3>Their reality</h3>
      <p>You finish a piece. It sells once — maybe. Or it sits in the studio. Either way, the hours you put in don't keep paying you.</p>

      <h3>Our offer</h3>
      <ol>
        <li><strong>We come to you</strong> (or you come to a local capture session) with professional photo gear and lighting</li>
        <li><strong>We digitize</strong> the painting — color-accurate, print-ready master file</li>
        <li><strong>We list and sell</strong> prints through our store and channels</li>
        <li><strong>We fulfill</strong> — print, pack, ship via our fulfillment partner. You touch nothing.</li>
        <li><strong>You earn</strong> 30% of net profit on every print sold</li>
      </ol>

      <h3>Materials support (optional)</h3>
      <p>If covering canvas, paint, or supplies is a barrier, we add <strong>up to 30% materials reimbursement</strong> on top of the profit share. Terms defined per agreement.</p>

      <h2>What We Need From the Artist</h2>
      <ul>
        <li>Finished, dry, framable-or-flat work ready for photography</li>
        <li>Permission to sell prints of the digitized image (scope defined in contract)</li>
        <li>Optional: permission to use process photos/video for marketing</li>
        <li>Bank details or preferred payout method for revenue share</li>
      </ul>

      <h2>What the Artist Keeps</h2>
      <ul>
        <li>The original painting — always</li>
        <li>Credit and attribution on all listings</li>
        <li>Right to sell the original independently</li>
        <li>Transparency on sales (periodic statements or portal, TBD)</li>
      </ul>

      <h2>What We Handle</h2>
      <ul>
        <li>Photography and color correction</li>
        <li>Listing copy, SEO, and storefront presentation</li>
        <li>Print production and shipping</li>
        <li>Customer service on fulfillment issues</li>
        <li>Marketing and advertising investment (at scale)</li>
      </ul>

      <h2>Objection Handling</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b pb-2 font-semibold">Objection</th>
              <th className="border-b pb-2 font-semibold">Response</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b py-2">"I already sell prints myself"</td>
              <td className="border-b py-2">Great — we expand your reach without replacing your direct sales. Non-exclusive options available.</td>
            </tr>
            <tr>
              <td className="border-b py-2">"Will the prints look good?"</td>
              <td className="border-b py-2">We use calibrated capture and premium POD partners; you approve a proof before listing.</td>
            </tr>
            <tr>
              <td className="border-b py-2">"30% sounds low"</td>
              <td className="border-b py-2">Compare to a gallery taking 50% on one original sale. This is 30% on <em>every</em> print, forever, with zero labor from you.</td>
            </tr>
            <tr>
              <td className="border-b py-2">"I don't want my work everywhere"</td>
              <td className="border-b py-2">Contract defines channels and edition limits. Limited editions available.</td>
            </tr>
            <tr>
              <td className="border-b py-2">"What if it doesn't sell?"</td>
              <td className="border-b py-2">Zero cost to you. Worst case: you have a professional archival scan of your work.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Pilot Ask (Phase 0)</h2>
      <p>We're starting with a small group of local artists to prove quality and economics. Pilot artists get:</p>
      <ul>
        <li>Priority placement in the founding catalog</li>
        <li>Input on proofing and paper options</li>
        <li>Founding-artist badge/story on the storefront</li>
      </ul>
      <p><strong>Ask:</strong> 3–5 finished pieces for capture session. 30 minutes for paperwork. Optional process shoot.</p>

      <h2>Contract Outline (Draft — Not Legal Advice)</h2>
      <ol>
        <li><strong>Grant of license</strong> — non-exclusive (or exclusive, TBD) print reproduction rights for specified works</li>
        <li><strong>Revenue share</strong> — 30% of net profit per sale; definition of "net" documented</li>
        <li><strong>Materials clause</strong> — optional 30% reimbursement with cap and approval process</li>
        <li><strong>Attribution</strong> — artist name prominently on all listings</li>
        <li><strong>Term & termination</strong> — duration, notice period, what happens to listed inventory</li>
        <li><strong>Quality approval</strong> — artist sign-off on proof print before public listing</li>
        <li><strong>Original ownership</strong> — explicitly retained by artist</li>
      </ol>
      <blockquote>
        <p><strong>Note:</strong> Final agreements require review by a qualified attorney before use.</p>
      </blockquote>
    </div>
  );
}
