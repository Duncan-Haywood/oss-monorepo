import { BarChart3 } from "lucide-react";

export default function MarketResearchPage() {
  return (
    <div className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:tracking-tight">
      <div className="flex items-center gap-3 mb-8 not-prose pb-6 border-b border-gray-100">
        <div className="p-2 bg-blue-50 rounded-lg">
          <BarChart3 className="w-6 h-6 text-blue-600" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 m-0">Market Research</h1>
      </div>

      <p className="lead text-xl text-gray-600">
        The global online art market is expanding rapidly, with consumers increasingly comfortable purchasing fine art prints and digital reproductions online. Simultaneously, traditional artists face the challenge of monetizing their time beyond one-off sales.
      </p>

      <h2>The Two-Sided Market</h2>

      <h3>Supply: Independent Visual Artists</h3>
      <ul>
        <li><strong>Pain Points:</strong>
          <ul>
            <li>Time spent painting limits earning potential (1:1 exchange of time for money).</li>
            <li>Lack of marketing expertise, technical skills to build storefronts, or desire to manage logistics.</li>
            <li>Fear of art theft or low-quality reproductions damaging their brand.</li>
          </ul>
        </li>
        <li><strong>Why Print Atelier Wins:</strong> We act as an invisible, tech-enabled partner. By using AI-driven outreach and automated onboarding, we can scale our artist acquisition faster and cheaper than traditional galleries.</li>
      </ul>

      <h3>Demand: Online Art Buyers</h3>
      <ul>
        <li><strong>Pain Points:</strong>
          <ul>
            <li>Overwhelmed by generic, low-quality stock art on platforms like Etsy or Society6.</li>
            <li>Cannot afford original gallery pieces (often $1k-$10k+).</li>
            <li>Lack connection to the artist's story in typical print-on-demand transactions.</li>
          </ul>
        </li>
        <li><strong>Why Print Atelier Wins:</strong> Museum-quality prints with automated, AI-generated storytelling. We leverage AI to dynamically generate listing copy, ads, and process narratives that connect buyers to the artist's journey.</li>
      </ul>

      <h2>Competitive Landscape</h2>
      <div className="not-prose overflow-x-auto my-8">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Competitor Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weaknesses</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Our Advantage (Software/AI-First)</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 text-sm">
            <tr>
              <td className="px-6 py-4 font-medium text-gray-900">Traditional Galleries</td>
              <td className="px-6 py-4 text-gray-500">High commission (50%), low scale, zero digital presence.</td>
              <td className="px-6 py-4 text-gray-900">Infinite digital scale, AI-driven global reach, lower overhead.</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-medium text-gray-900">Mass Marketplaces</td>
              <td className="px-6 py-4 text-gray-500">Race to the bottom on price, generic quality, artist does all the marketing.</td>
              <td className="px-6 py-4 text-gray-900">Premium positioning, we handle all marketing/ops via software automation.</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-medium text-gray-900">Boutique Curators</td>
              <td className="px-6 py-4 text-gray-500">Manual curation, slow onboarding, traditional marketing.</td>
              <td className="px-6 py-4 text-gray-900">AI-driven outreach, automated cataloging, AI-optimized ad targeting.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>The AI / Digital-First Moat</h2>
      <p>
        Traditional art commerce relies on manual curation, human-driven sales outreach, and manual ad management. Our moat is built on:
      </p>
      <ol>
        <li><strong>AI-Driven Sales Outreach (Supply Side):</strong> Using AI agents to scrape Instagram/TikTok for emerging artists, analyze their engagement, and automatically draft personalized outreach sequences.</li>
        <li><strong>Dynamic Marketing (Demand Side):</strong> Generative AI creates thousands of ad variations (copy, room mockups, video edits of the painting process) and algorithmically doubles down on winning creative.</li>
        <li><strong>Automated Cataloging:</strong> Image recognition AI automatically tags artwork, generates SEO-optimized descriptions, and categorizes pieces, removing the manual labor of inventory management.</li>
        <li><strong>Predictive Analytics:</strong> Software identifies trending color palettes, subjects, and styles to inform which artists to recruit next.</li>
      </ol>
    </div>
  );
}