export default function Operations() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 prose prose-stone lg:prose-lg prose-indigo">
      <h1>Operations Playbook</h1>

      <h2>Capture Workflow (Single Session)</h2>

      <h3>Pre-session</h3>
      <ul>
        <li>Confirm artist agreement signed</li>
        <li>Inventory pieces to be captured (title, dimensions, medium, year)</li>
        <li>Confirm pieces are dry, dust-free, and positioned for photography</li>
        <li>Pack kit: camera, tripod, lights, gray card / color checker, measuring tape</li>
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
          <pre><code>{`{city}/{artist-slug}/{date}/{piece-slug}/
  raw/
  edited/
  marketing/
  metadata.json`}</code></pre>
        </li>
        <li>Color-correct and export print-ready masters (TIFF/PNG, appropriate DPI for target print sizes)</li>
        <li>Generate proof print → artist approval</li>
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
        <li>Base cost vs. retail price → gross margin</li>
      </ul>

      <h3>Order flow (manual → automated)</h3>
      <ol>
        <li>Customer orders on storefront</li>
        <li>Order routed to POD provider (manual at first, API later)</li>
        <li>Provider prints, packs, ships</li>
        <li>Tracking synced to customer</li>
        <li>Sale recorded for artist revenue share calculation</li>
      </ol>

      <h2>City Expansion Model</h2>
      <h3>Roles</h3>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Responsibility</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Acquisition lead</strong></td>
            <td>Artist outreach, scheduling, relationship management</td>
          </tr>
          <tr>
            <td><strong>Field photographer</strong></td>
            <td>On-site capture per playbook</td>
          </tr>
          <tr>
            <td><strong>Central ops</strong></td>
            <td>Editing, cataloging, listing, fulfillment coordination</td>
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
    </div>
  );
}
