import React from 'react';

export const MarketResearch: React.FC = () => {
  return (
    <div className="prose max-w-none">
      <h1>Market Research</h1>

      <h2>Total Addressable Market (TAM)</h2>
      <p>
        The global wall art and art print market is massive and growing, driven by millennial and Gen Z consumers shifting away from mass-produced posters toward more unique, "authentic" decor.
      </p>
      <ul>
        <li><strong>Global Art Market:</strong> ~$65 Billion</li>
        <li><strong>Online Art Sales:</strong> ~$10-12 Billion (Growing at ~10% CAGR)</li>
        <li><strong>Art Print Market (SAM):</strong> Estimated at $3-5 Billion globally, specifically targeting high-quality reproductions and open/limited editions.</li>
      </ul>

      <h2>Target Audience</h2>

      <h3>Supply: The Artists</h3>
      <ul>
        <li><strong>Who:</strong> Emerging to mid-career painters, illustrators, and mixed-media artists.</li>
        <li><strong>Pain Points:</strong>
          <ul>
            <li>They love creating but hate marketing, shipping, and customer service.</li>
            <li>Selling originals is inconsistent and hard to scale.</li>
            <li>Existing print platforms (Society6, Redbubble) feel cheap, dilute their brand, and offer terrible margins (often &lt;10%).</li>
          </ul>
        </li>
        <li><strong>Why us:</strong> We offer a "white-glove" service. They don't have to scan their own work or manage a storefront. They get a premium brand association and a fair 30% of <em>net profit</em>.</li>
      </ul>

      <h3>Demand: The Buyers</h3>
      <ul>
        <li><strong>Who:</strong>
          <ul>
            <li><strong>The Decorator (B2C):</strong> Millennials and Gen Z (ages 25-45), buying their first home or upgrading an apartment. They want art that tells a story and supports a real artist, but cannot afford $2,000+ originals. Target price point: $50 - $300.</li>
            <li><strong>The Professional (B2B):</strong> Interior designers, boutique hoteliers, and set decorators needing high-quality, curated art at scale without the friction of sourcing from 50 different galleries.</li>
          </ul>
        </li>
        <li><strong>What they want:</strong> Museum-quality paper/canvas, beautiful framing options, and a connection to the artist's story.</li>
      </ul>

      <h2>Competitor Analysis</h2>
      <table className="min-w-full text-left border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">Competitor</th>
            <th className="border p-2">Model</th>
            <th className="border p-2">Strengths</th>
            <th className="border p-2">Weaknesses</th>
            <th className="border p-2">Our Advantage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2"><strong>Society6 / Redbubble</strong></td>
            <td className="border p-2">Upload anything, print on everything</td>
            <td className="border p-2">Huge audience, zero barrier to entry</td>
            <td className="border p-2">Low quality, brand dilution, pennies for artists</td>
            <td className="border p-2">Curated, high-quality, we handle the digitization, better payouts.</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Fine Art America</strong></td>
            <td className="border p-2">POD for artists</td>
            <td className="border p-2">Good product range</td>
            <td className="border p-2">Horrible UI/UX, artist does all the work</td>
            <td className="border p-2">We do the work for the artist; modern, curated brand experience.</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Saatchi Art</strong></td>
            <td className="border p-2">Online gallery</td>
            <td className="border p-2">High prestige, sells originals &amp; prints</td>
            <td className="border p-2">Intimidating for casual buyers, artist handles shipping</td>
            <td className="border p-2">Focus exclusively on prints, no shipping burden for artists.</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Minted</strong></td>
            <td className="border p-2">Curated design marketplace</td>
            <td className="border p-2">High quality, good brand</td>
            <td className="border p-2">Very competitive to get accepted, focused heavily on graphic design/illustration</td>
            <td className="border p-2">Focus on <em>painters/fine art</em>, providing the physical capture service.</td>
          </tr>
          <tr>
            <td className="border p-2"><strong>Local Galleries</strong></td>
            <td className="border p-2">Traditional</td>
            <td className="border p-2">High prestige, local connection</td>
            <td className="border p-2">Takes 50%, no digital scale, focuses only on originals</td>
            <td className="border p-2">Global scale, long-tail revenue for the artist.</td>
          </tr>
        </tbody>
      </table>

      <h2>The "White Space" (Our Wedge)</h2>
      <p>
        The biggest bottleneck for traditional painters entering the print market is the <strong>digitization step</strong>. A large canvas is incredibly difficult to photograph correctly without professional lighting, a color checker, and post-processing skills.
      </p>
      <p>
        By solving the <em>physical-to-digital bridge</em> as a service, we unlock supply that is not available on any other print platform. We are not just a marketplace; we are the digitization layer.
      </p>
    </div>
  );
};
