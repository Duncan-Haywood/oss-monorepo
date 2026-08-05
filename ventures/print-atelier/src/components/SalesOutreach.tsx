export default function SalesOutreach() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Digital-First Sales & Outreach</h1>

      <section>
        <h2 className="text-2xl font-semibold">Core Philosophy: Digital First, AI First</h2>
        <p>
          Print Atelier replaces traditional gallery curation and manual sales with high-velocity, software-driven outreach. Artist acquisition and buyer generation are engineering problems — not just marketing tasks. Both sides of the marketplace are automated from day one.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Supply Side: Automated Artist Outreach</h2>
        <p>To build catalog rapidly, we deploy intelligent systems to identify and onboard artists at near-zero marginal cost.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Social Graph Scraping (planned, not yet built):</strong> Discovery across Instagram, TikTok, and Pinterest for independent artists meeting engagement and quality thresholds (2k–20k followers, consistent style signals).</li>
          <li><strong>AI-Personalized DMs (planned):</strong> LLMs reference specific artworks in outreach messages. Target: a materially higher reply rate than generic outreach — no outreach has been sent, so there is no measured rate to quote.</li>
          <li><strong>Self-Serve Onboarding:</strong> Outreach links to a portal where the artist uploads work and completes onboarding. Target: a first-session room-mockup hook once mockup rendering ships.</li>
          <li><strong>Zero Human SDRs (Phase 1):</strong> Fully software-orchestrated acquisition until response quality degrades at scale.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Demand Side: Algorithmic Marketing</h2>
        <p>Buyer acquisition is driven by programmatic campaigns leveraging the visual nature of our product.</p>
        <div className="bg-blue-50 dark:bg-blue-900/30 p-5 rounded-xl mt-4 border border-blue-100 dark:border-blue-800 not-prose">
          <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-2">The &quot;Living Room&quot; Strategy</h3>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Consumers struggle to visualize raw art in their homes. Planned, not yet built: mockup rendering across interior styles at volume, feeding Meta/Google ad networks where multi-armed bandit algorithms find the exact art + room + frame combination that converts best. No renderer ships today.
          </p>
        </div>
        <ul className="list-disc pl-5 space-y-2 mt-4">
          <li><strong>Programmatic SEO:</strong> Auto-generated landing pages for style/color/medium combinations.</li>
          <li><strong>Dynamic Ads:</strong> Catalog fed into ad APIs; algorithms test thousands of creative permutations daily.</li>
          <li><strong>Retargeting:</strong> AI email flows recommend complementary pieces based on purchase color palette and style signals.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">The Network Effect (B2B2C)</h2>
        <p>Artists are our most potent marketing channel. By providing a platform that works, they bring their audiences.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Automated Promo Kits:</strong> On publish, artists receive pre-sized Instagram Stories, Reels, and captions announcing the drop.</li>
          <li><strong>Referral Economics:</strong> Artists incentivized to bring other artists to the platform.</li>
          <li><strong>Audience Capture:</strong> Every fan visiting an artist page enters our broader ecosystem for cross-sell retargeting.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Channel Mix & Targets</h2>
        <div className="overflow-x-auto not-prose">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="text-left py-2 pr-4">Channel</th>
                <th className="text-left py-2 pr-4">Phase</th>
                <th className="text-left py-2 pr-4">% of Acquisition</th>
                <th className="text-left py-2">Target CAC</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4">Artist-driven (organic)</td>
                <td className="py-2 pr-4">Phase 1–2</td>
                <td className="py-2 pr-4">60%</td>
                <td className="py-2">$0</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4">AI social outreach (supply)</td>
                <td className="py-2 pr-4">Phase 1</td>
                <td className="py-2 pr-4">100% of artists</td>
                <td className="py-2">&lt;$2/artist</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4">Programmatic SEO</td>
                <td className="py-2 pr-4">Phase 3</td>
                <td className="py-2 pr-4">25%</td>
                <td className="py-2">&lt;$5/buyer</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4">Paid social (Meta/Google)</td>
                <td className="py-2 pr-4">Phase 3</td>
                <td className="py-2 pr-4">15%</td>
                <td className="py-2">&lt;$12/buyer</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Email retention</td>
                <td className="py-2 pr-4">Phase 2+</td>
                <td className="py-2 pr-4">Repeat purchases</td>
                <td className="py-2">&lt;$3/reorder</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Profitability of Digital Outreach</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Near-Zero Supply CAC:</strong> Automated scripts and AI DMs require only compute cost to acquire artists.</li>
          <li><strong>High LTV:</strong> Capturing buyer emails and AI recommendations increases repeat purchase rates without incremental ad spend.</li>
          <li><strong>No Inventory Risk:</strong> Print-on-demand ensures zero physical stock; overhead is software and personnel only.</li>
          <li><strong>LTV:CAC Target:</strong> 12:1+ at steady state ($150 LTV / $12 CAC).</li>
        </ul>
      </section>
    </div>
  );
}
