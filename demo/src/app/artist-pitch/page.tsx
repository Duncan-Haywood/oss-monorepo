export default function ArtistPitch() {
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <h1 className="text-4xl font-bold text-gray-900 mb-8">Artist Pitch</h1>
      
      <div className="bg-indigo-600 text-white p-8 rounded-xl shadow-md mb-12">
        <h2 className="text-2xl font-semibold mb-2">The One-Liner</h2>
        <p className="text-xl italic">"We photograph your finished work, sell museum-quality prints online, and send you 30% of the profits — you keep painting."</p>
      </div>
      
      <div className="prose prose-indigo max-w-none">
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">The Conversation</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Their Reality</h3>
              <p className="text-gray-600">
                You finish a piece. It sells once — maybe. Or it sits in the studio. Either way, the hours you put in don't keep paying you.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Our Offer</h3>
              <ol className="space-y-2 text-gray-600 list-decimal pl-5 text-sm">
                <li><strong>We come to you</strong> (or you come to a local capture session) with professional photo gear and lighting</li>
                <li><strong>We digitize</strong> the painting — color-accurate, print-ready master file</li>
                <li><strong>We list and sell</strong> prints through our store and channels</li>
                <li><strong>We fulfill</strong> — print, pack, ship via our fulfillment partner. You touch nothing.</li>
                <li><strong>You earn</strong> 30% of net profit on every print sold</li>
              </ol>
            </div>
          </div>
          
          <div className="mt-8 bg-gray-50 p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Materials Support (Optional)</h3>
            <p className="text-gray-600 text-sm">
              If covering canvas, paint, or supplies is a barrier, we add <strong>up to 30% materials reimbursement</strong> on top of the profit share. Terms defined per agreement.
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">What We Need From the Artist</h2>
            <ul className="space-y-2 text-gray-600 list-disc pl-5">
              <li>Finished, dry, framable-or-flat work ready for photography</li>
              <li>Permission to sell prints of the digitized image (scope defined in contract)</li>
              <li>Optional: permission to use process photos/video for marketing</li>
              <li>Bank details or preferred payout method for revenue share</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">What the Artist Keeps</h2>
            <ul className="space-y-2 text-gray-600 list-disc pl-5">
              <li>The original painting — always</li>
              <li>Credit and attribution on all listings</li>
              <li>Right to sell the original independently</li>
              <li>Transparency on sales (periodic statements or portal, TBD)</li>
            </ul>
          </section>
        </div>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">What We Handle</h2>
          <div className="flex flex-wrap gap-3">
            {['Photography and color correction', 'Listing copy, SEO, and storefront presentation', 'Print production and shipping', 'Customer service on fulfillment issues', 'Marketing and advertising investment (at scale)'].map((item, i) => (
              <span key={i} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full text-sm font-medium border border-indigo-100">
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Objection Handling</h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">Objection</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Response</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 italic">"I already sell prints myself"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">Great — we expand your reach without replacing your direct sales. Non-exclusive options available.</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 italic">"Will the prints look good?"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">We use calibrated capture and premium POD partners; you approve a proof before listing.</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 italic">"30% sounds low"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">Compare to a gallery taking 50% on one original sale. This is 30% on <em>every</em> print, forever, with zero labor from you.</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 italic">"I don't want my work everywhere"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">Contract defines channels and edition limits. Limited editions available.</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 italic">"What if it doesn't sell?"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">Zero cost to you. Worst case: you have a professional archival scan of your work.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Pilot Ask (Phase 0)</h2>
          <p className="text-gray-600 mb-4">
            We're starting with a small group of local artists to prove quality and economics. Pilot artists get:
          </p>
          <ul className="space-y-2 text-gray-600 list-disc pl-5 mb-6">
            <li>Priority placement in the founding catalog</li>
            <li>Input on proofing and paper options</li>
            <li>Founding-artist badge/story on the storefront</li>
          </ul>
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4">
            <p className="text-amber-800 font-medium"><strong>Ask:</strong> 3–5 finished pieces for capture session. 30 minutes for paperwork. Optional process shoot.</p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Contract Outline (Draft)</h2>
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
            <ol className="space-y-3 text-gray-600 list-decimal pl-5 text-sm">
              <li><strong>Grant of license</strong> — non-exclusive (or exclusive, TBD) print reproduction rights for specified works</li>
              <li><strong>Revenue share</strong> — 30% of net profit per sale; definition of "net" documented</li>
              <li><strong>Materials clause</strong> — optional 30% reimbursement with cap and approval process</li>
              <li><strong>Attribution</strong> — artist name prominently on all listings</li>
              <li><strong>Term & termination</strong> — duration, notice period, what happens to listed inventory</li>
              <li><strong>Quality approval</strong> — artist sign-off on proof print before public listing</li>
              <li><strong>Original ownership</strong> — explicitly retained by artist</li>
            </ol>
            <p className="mt-4 text-xs text-gray-500 italic">Note: Final agreements require review by a qualified attorney before use.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
