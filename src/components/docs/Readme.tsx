import React from 'react';

export const Readme: React.FC = () => {
  return (
    <div className="prose max-w-none">
      <h1>Print Atelier</h1>
      <p>
        A two-sided art commerce business that digitizes original paintings and sells high-quality prints — without artists trading time for a single sale.
      </p>

      <h2>The Idea</h2>
      <p>
        Traditional painting is one-to-one: an artist spends days or weeks on a canvas, sells it once, and starts over. Print Atelier flips that model. We professionally photograph original work, produce museum-quality digital masters, and monetize each piece repeatedly through print sales and related channels.
      </p>
      <p>
        Artists keep creating. We handle capture, cataloging, fulfillment, and distribution.
      </p>

      <h2>Two Sides of the Business</h2>
      <table className="min-w-full text-left border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">Side</th>
            <th className="border p-2">What we do</th>
            <th className="border p-2">Who we serve</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2"><strong>Supply</strong></td>
            <td className="border p-2">Acquire artwork scans, process documentation, and artist partnerships</td>
            <td className="border p-2">Painters and visual artists</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Demand</strong></td>
            <td className="border p-2">Run a consumer-facing art print commerce business</td>
            <td className="border p-2">Buyers of fine art prints</td>
          </tr>
        </tbody>
      </table>

      <h2>Artist Value Proposition</h2>
      <ul>
        <li><strong>30% of net profits</strong> on every print sold from your work</li>
        <li><strong>+30% materials reimbursement</strong> when the artist needs support covering canvas, paint, or supplies</li>
        <li>No warehousing, no shipping headaches — print-on-demand partners handle fulfillment until volume justifies bringing it in-house</li>
        <li>Your original stays yours; we monetize the digital master</li>
      </ul>

      <h2>Why This Scales</h2>
      <p>
        Revenue is decoupled from any single artist's hours. Each digitized piece becomes inventory that can sell indefinitely. Growth means:
      </p>
      <ol>
        <li>Signing more artists (supply sales)</li>
        <li>Driving more print buyers (demand / advertising)</li>
        <li>Expanding to new cities with field photographers and a repeatable capture playbook</li>
      </ol>

      <h2>Repository Structure</h2>
      <pre className="bg-gray-100 p-2 rounded-md">
{`src/components/docs/
  BusinessPlan.tsx  — The comprehensive business plan, software-first strategy
  Strategy.tsx      — Business model, positioning, growth thesis
  ArtistPitch.tsx   — Pitch and contract framework for painters
  Operations.tsx    — Field capture, upload workflow, city expansion
  RevenueModel.tsx  — Splits, unit economics, fulfillment tiers`}
      </pre>

      <h2>Status</h2>
      <p>
        <strong>Phase 0 — Analysis &amp; foundation.</strong> Documenting the model, validating unit economics, and preparing the artist pitch before building the commerce platform.
      </p>

      <h2>Origin</h2>
      <p>
        Born from conversations with a working painter — background in marketing and art education — about making studio time more profitable without sacrificing the craft.
      </p>
    </div>
  );
};
