import React from 'react';

export const GtmStrategy: React.FC = () => {
  return (
    <div className="prose max-w-none">
      <h1>Go-To-Market (GTM) Strategy</h1>
      <p>
        Because Print Atelier is a two-sided marketplace, our GTM strategy must address both Supply (Artists) and Demand (Buyers) simultaneously. However, <strong>Supply must lead Demand</strong>. We cannot run ads without a robust, high-quality catalog.
      </p>

      <h2>Phase 1: The Local Pilot (Months 1-3)</h2>
      <p><strong>Goal:</strong> Prove the operational pipeline, establish the quality bar, and validate unit economics.</p>

      <h3>Supply (0 to 50 pieces)</h3>
      <ul>
        <li><strong>Direct Network:</strong> Onboard 2-3 local artists (including founding connections) who have a backlog of finished, unmonetized work.</li>
        <li><strong>The "White Glove" Treatment:</strong> Founder acts as the field photographer. We handle 100% of the capture, color correction, and uploading.</li>
        <li><strong>Output:</strong> A founding catalog of 30-50 high-quality pieces, spanning a few distinct styles.</li>
      </ul>

      <h3>Demand (First 100 Sales)</h3>
      <ul>
        <li><strong>Leveraging Artist Audiences:</strong> We provide our pilot artists with beautiful AI-generated room mockups and process videos of their work. They share these with their existing Instagram/newsletter audiences, driving warm traffic to our storefront.</li>
        <li><strong>Outcome:</strong> We validate that the POD provider's quality is acceptable, the Shopify routing works, and the net-profit split math is accurate.</li>
      </ul>

      <h2>Phase 2: Digital Scale (Months 3-9)</h2>
      <p><strong>Goal:</strong> Build a scalable, software-driven acquisition engine for both sides.</p>

      <h3>Supply (50 to 500 pieces)</h3>
      <ul>
        <li><strong>AI-Driven Outbound:</strong>
          <ol>
            <li>Scrape Instagram hashtags (<code>#oilpainting</code>, <code>#contemporaryart</code>, <code>#studioflow</code>) and local gallery websites to build a database of target artists.</li>
            <li>Use LLMs to draft highly personalized DMs/emails referencing specific pieces in their portfolio.</li>
            <li><strong>The Pitch:</strong> "We love <em>[Specific Painting]</em>. We want to send a photographer to your studio, digitize it for free, and pay you 30% of every print we sell of it."</li>
          </ol>
        </li>
        <li><strong>The "City Blitz":</strong> Instead of random geographic growth, we target one city at a time (e.g., Austin, TX). We hire a freelance photographer in that city, line up 10 artists via our outbound engine, and have the photographer capture all 10 in a single week.</li>
      </ul>

      <h3>Demand (Scaling beyond the artist's network)</h3>
      <ul>
        <li><strong>Paid Acquisition (Meta & Pinterest):</strong>
          <ul>
            <li>Use our AI pipeline to generate hundreds of dynamic room mockups.</li>
            <li>Run conversion-optimized campaigns targeting interior design interests, new homeowners, and fans of similar artists.</li>
            <li>Track CAC strictly. If CAC &gt; $20, pause and refine targeting/creative.</li>
          </ul>
        </li>
        <li><strong>Content Engine:</strong> Post the "behind the scenes" process videos (captured during the photographer sessions) on TikTok and Instagram Reels. Process videos inherently go viral more often than static images of finished art.</li>
      </ul>

      <h2>Phase 3: B2B & Channel Expansion (Months 9-18)</h2>
      <p><strong>Goal:</strong> Increase Average Order Value (AOV) and secure recurring revenue streams.</p>

      <h3>Demand (B2B Sales)</h3>
      <ul>
        <li><strong>Interior Designers & Stagers:</strong> Create a trade program offering a 15% discount for bulk orders. Reach out to boutique interior design firms. They need high-quality art to stage homes or design commercial spaces (hotels, cafes) and hate dealing with 50 different artists. We become their single point of contact.</li>
        <li><strong>Corporate Gifting / Office Decor:</strong> Pitch tech startups and modern offices to decorate their spaces with local, curated art.</li>
      </ul>

      <h3>Supply (Institutional)</h3>
      <ul>
        <li><strong>Art Schools & MFA Programs:</strong> Partner with graduating MFA students. They are producing high-quality work but typically have zero distribution. We become their default monetization engine the day they graduate.</li>
      </ul>
    </div>
  );
};
