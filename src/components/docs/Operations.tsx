import React from 'react';

export const Operations: React.FC = () => {
  return (
    <div className="prose max-w-none">
      <h1>Operations Playbook</h1>

      <h2>Capture Workflow (Single Session)</h2>

      <h3>Pre-session</h3>
      <ul>
        <li>[ ] Confirm artist agreement signed</li>
        <li>[ ] Inventory pieces to be captured (title, dimensions, medium, year)</li>
        <li>[ ] Confirm pieces are dry, dust-free, and positioned for photography</li>
        <li>[ ] Pack kit: camera, tripod, lights, gray card / color checker, measuring tape</li>
      </ul>

      <h3>On-site</h3>
      <ol>
        <li><strong>Environment</strong> — controlled lighting, minimal glare, neutral background or easel setup</li>
        <li><strong>Per piece:</strong>
          <ul>
            <li>Measure and record dimensions</li>
            <li>Capture RAW + bracketed exposures if needed</li>
            <li>Include color reference card in frame</li>
            <li>Optional: process photos/video (time-lapse, detail shots, palette)</li>
          </ul>
        </li>
        <li><strong>Metadata</strong> — artist name, title, medium, dimensions, date, location captured</li>
      </ol>

      <h3>Post-session</h3>
      <ol>
        <li>Upload RAW/files to shared storage (Google Drive or equivalent) using naming convention:
          <pre className="bg-gray-100 p-2 rounded-md">
{`{city}/{artist-slug}/{date}/{piece-slug}/
  raw/
  edited/
  marketing/
  metadata.json`}
          </pre>
        </li>
        <li>Color-correct and export print-ready masters (TIFF/PNG, appropriate DPI for target print sizes)</li>
        <li>Generate proof print &rarr; artist approval</li>
        <li>Create listing assets (cropped views, room mocks if available)</li>
        <li>Publish to storefront</li>
      </ol>

      <h2>Print-on-Demand Fulfillment (Phase 0–2)</h2>
      <p>Use a POD partner until volume and margins justify alternative fulfillment.</p>

      <h3>Provider evaluation criteria</h3>
      <ul>
        <li>Color accuracy and paper options (archival, cotton rag, etc.)</li>
        <li>Print size range</li>
        <li>Frame/mount options</li>
        <li>Shipping speed and international coverage</li>
        <li>API/integration for automation</li>
        <li>Base cost vs. retail price &rarr; gross margin</li>
      </ul>

      <h3>Order flow (manual &rarr; automated)</h3>
      <ol>
        <li>Customer orders on storefront</li>
        <li>Order routed to POD provider (manual at first, API later)</li>
        <li>Provider prints, packs, ships</li>
        <li>Tracking synced to customer</li>
        <li>Sale recorded for artist revenue share calculation</li>
      </ol>

      <h2>City Expansion Model</h2>

      <h3>Roles</h3>
      <table className="min-w-full text-left border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">Role</th>
            <th className="border p-2">Responsibility</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2"><strong>Acquisition lead</strong></td>
            <td className="border p-2">Artist outreach, scheduling, relationship management</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Field photographer</strong></td>
            <td className="border p-2">On-site capture per playbook</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Central ops</strong></td>
            <td className="border p-2">Editing, cataloging, listing, fulfillment coordination</td>
          </tr>
        </tbody>
      </table>

      <h3>Launching a new city</h3>
      <ol>
        <li>Identify local art clusters (studios, schools, co-ops, fairs)</li>
        <li>Recruit contract photographer — send gear checklist and training doc</li>
        <li>Provide contract templates and pitch materials</li>
        <li>Run 2-week acquisition sprint: target N artists, M pieces</li>
        <li>Upload to central pipeline; central team processes within SLA (e.g. 5 business days)</li>
      </ol>

      <h3>Field photographer kit (minimum)</h3>
      <ul>
        <li>DSLR/mirrorless with RAW capability</li>
        <li>50mm or appropriate lens (minimal distortion)</li>
        <li>Two adjustable lights + diffusers</li>
        <li>Tripod</li>
        <li>Color checker</li>
        <li>Tablet/phone for metadata entry</li>
        <li>Laminated quick-reference capture guide</li>
      </ul>

      <h3>Compensation (TBD)</h3>
      <ul>
        <li>Per-session fee, per-piece fee, or revenue share on that city's catalog</li>
        <li>Travel reimbursement policy</li>
      </ul>

      <h2>Marketing Asset Pipeline</h2>
      <p>Process content captured during sessions feeds demand-side marketing:</p>
      <ul>
        <li>Instagram/TikTok: painting timelapses, studio visits</li>
        <li>Email: "Meet the artist" features</li>
        <li>Product pages: process gallery alongside print options</li>
        <li>Ads: story-led creative outperforms bare product shots</li>
      </ul>
      <p>Store alongside print masters in <code>{`{piece-slug}/marketing/`}</code>.</p>

      <h2>Quality Bar</h2>
      <p>A piece does <strong>not</strong> list until:</p>
      <ul>
        <li>[ ] Color-accurate master approved internally</li>
        <li>[ ] Proof print approved by artist (pilot phase) or internal QA (scale phase)</li>
        <li>[ ] Metadata complete</li>
        <li>[ ] Minimum 2 listing images (full piece + detail or room mock)</li>
      </ul>

      <h2>Tooling Roadmap</h2>
      <table className="min-w-full text-left border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">Phase</th>
            <th className="border p-2">Tools</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2">0</td>
            <td className="border p-2">Google Drive, spreadsheet tracker, manual Shopify/manual orders</td>
          </tr>
          <tr>
            <td className="border p-2">1</td>
            <td className="border p-2">Notion/Airtable catalog, standardized metadata schema</td>
          </tr>
          <tr>
            <td className="border p-2">2</td>
            <td className="border p-2">Artist upload portal, automated POD routing, payout dashboard</td>
          </tr>
          <tr>
            <td className="border p-2">3</td>
            <td className="border p-2">Multi-city dispatch, inventory analytics, ad performance integration</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
