export default function Operations() {
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <h1 className="text-4xl font-bold text-gray-900 mb-8">Operations Playbook</h1>
      
      <div className="prose prose-indigo max-w-none">
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Capture Workflow (Single Session)</h2>
          
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Pre-session</h3>
              <ul className="space-y-2 text-gray-600 list-none pl-0">
                <li className="flex items-center"><input type="checkbox" checked readOnly className="mr-3 text-indigo-600 rounded" /> Confirm artist agreement signed</li>
                <li className="flex items-center"><input type="checkbox" checked readOnly className="mr-3 text-indigo-600 rounded" /> Inventory pieces to be captured (title, dimensions, medium, year)</li>
                <li className="flex items-center"><input type="checkbox" checked readOnly className="mr-3 text-indigo-600 rounded" /> Confirm pieces are dry, dust-free, and positioned for photography</li>
                <li className="flex items-center"><input type="checkbox" checked readOnly className="mr-3 text-indigo-600 rounded" /> Pack kit: camera, tripod, lights, gray card / color checker, measuring tape</li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3">On-site</h3>
              <ol className="space-y-3 text-gray-600 list-decimal pl-5">
                <li><strong>Environment</strong> — controlled lighting, minimal glare, neutral background or easel setup</li>
                <li>
                  <strong>Per piece:</strong>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li>Measure and record dimensions</li>
                    <li>Capture RAW + bracketed exposures if needed</li>
                    <li>Include color reference card in frame</li>
                    <li>Optional: process photos/video (time-lapse, detail shots, palette)</li>
                  </ul>
                </li>
                <li><strong>Metadata</strong> — artist name, title, medium, dimensions, date, location captured</li>
              </ol>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Post-session</h3>
              <ol className="space-y-3 text-gray-600 list-decimal pl-5">
                <li>
                  Upload RAW/files to shared storage using naming convention:
                  <pre className="bg-gray-100 p-3 rounded-md mt-2 text-sm text-gray-800">
{`{city}/{artist-slug}/{date}/{piece-slug}/
  raw/
  edited/
  marketing/
  metadata.json`}
                  </pre>
                </li>
                <li>Color-correct and export print-ready masters (TIFF/PNG, appropriate DPI for target print sizes)</li>
                <li>Generate proof print → artist approval</li>
                <li>Create listing assets (cropped views, room mocks if available)</li>
                <li>Publish to storefront</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Print-on-Demand Fulfillment (Phase 0–2)</h2>
          <p className="text-gray-600 mb-4">Use a POD partner until volume and margins justify alternative fulfillment.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Provider evaluation criteria</h3>
              <ul className="space-y-2 text-gray-600 list-disc pl-5 text-sm">
                <li>Color accuracy and paper options (archival, cotton rag, etc.)</li>
                <li>Print size range</li>
                <li>Frame/mount options</li>
                <li>Shipping speed and international coverage</li>
                <li>API/integration for automation</li>
                <li>Base cost vs. retail price → gross margin</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Order flow</h3>
              <ol className="space-y-2 text-gray-600 list-decimal pl-5 text-sm">
                <li>Customer orders on storefront</li>
                <li>Order routed to POD provider (manual at first, API later)</li>
                <li>Provider prints, packs, ships</li>
                <li>Tracking synced to customer</li>
                <li>Sale recorded for artist revenue share calculation</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">City Expansion Model</h2>
          
          <h3 className="text-lg font-bold text-gray-900 mb-3 mt-6">Roles</h3>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsibility</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Acquisition lead</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Artist outreach, scheduling, relationship management</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Field photographer</td>
                  <td className="px-6 py-4 text-sm text-gray-500">On-site capture per playbook</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Central ops</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Editing, cataloging, listing, fulfillment coordination</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Launching a new city</h3>
              <ol className="space-y-2 text-gray-600 list-decimal pl-5 text-sm">
                <li>Identify local art clusters (studios, schools, co-ops, fairs)</li>
                <li>Recruit contract photographer — send gear checklist and training doc</li>
                <li>Provide contract templates and pitch materials</li>
                <li>Run 2-week acquisition sprint: target N artists, M pieces</li>
                <li>Upload to central pipeline; central team processes within SLA</li>
              </ol>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Field photographer kit</h3>
              <ul className="space-y-2 text-gray-600 list-disc pl-5 text-sm">
                <li>DSLR/mirrorless with RAW capability</li>
                <li>50mm or appropriate lens (minimal distortion)</li>
                <li>Two adjustable lights + diffusers</li>
                <li>Tripod & Color checker</li>
                <li>Tablet/phone for metadata entry</li>
                <li>Laminated quick-reference capture guide</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Quality Bar</h2>
          <p className="text-gray-600 mb-4">A piece does <strong>not</strong> list until:</p>
          <ul className="space-y-2 text-gray-600 list-none pl-0">
            <li className="flex items-center"><input type="checkbox" checked readOnly className="mr-3 text-indigo-600 rounded" /> Color-accurate master approved internally</li>
            <li className="flex items-center"><input type="checkbox" checked readOnly className="mr-3 text-indigo-600 rounded" /> Proof print approved by artist (pilot phase) or internal QA (scale phase)</li>
            <li className="flex items-center"><input type="checkbox" checked readOnly className="mr-3 text-indigo-600 rounded" /> Metadata complete</li>
            <li className="flex items-center"><input type="checkbox" checked readOnly className="mr-3 text-indigo-600 rounded" /> Minimum 2 listing images (full piece + detail or room mock)</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Tooling Roadmap</h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phase</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tools</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">0</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Google Drive, spreadsheet tracker, manual Shopify/manual orders</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">1</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Notion/Airtable catalog, standardized metadata schema</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">2</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Artist upload portal, automated POD routing, payout dashboard</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">3</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Multi-city dispatch, inventory analytics, ad performance integration</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
