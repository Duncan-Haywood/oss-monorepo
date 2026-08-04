export default function MarketingSales() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Marketing & Sales (Dual-Sided, Digital-First)</h1>

      <section>
        <h2 className="text-2xl font-semibold">Core Principle</h2>
        <p>
          We do not run a traditional sales team. Both sides of the marketplace — artists (supply) and buyers (demand) — are acquired, nurtured, and converted through <strong>software-driven, AI-assisted digital channels</strong>. Human touch is reserved for high-value B2B accounts and artist success escalations.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Supply Side: Artist Acquisition & Sales</h2>
        <div className="not-prose space-y-4 mt-4">
          <div className="p-4 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-r-lg">
            <h3 className="font-bold text-gray-900 dark:text-white">1. AI-Powered Prospecting</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Scrapers monitor Instagram, TikTok, Pinterest, and art fair listings. ML classifiers score accounts on follower count (2k–50k sweet spot), engagement rate, visual quality, and e-commerce gap (no existing print shop).
            </p>
          </div>
          <div className="p-4 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-r-lg">
            <h3 className="font-bold text-gray-900 dark:text-white">2. Personalized Digital Outreach</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              LLMs draft DMs and emails referencing specific pieces from the artist&apos;s portfolio. A/B tested subject lines and CTAs. Automated follow-up sequences at 3, 7, and 14 days. Target: 8% response rate, 25% conversion to onboarding.
            </p>
          </div>
          <div className="p-4 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-r-lg">
            <h3 className="font-bold text-gray-900 dark:text-white">3. Self-Serve Conversion Funnel</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Landing page → capture app demo (instant mockup hook) → e-signature agreement → Stripe Connect onboarding → first piece live within 48 hours. No sales calls required for 90% of artists.
            </p>
          </div>
          <div className="p-4 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-r-lg">
            <h3 className="font-bold text-gray-900 dark:text-white">4. Artist Success & Retention</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Automated launch kits (Stories, Reels, captions) when prints go live. Monthly performance emails. Referral program: artists earn bonus royalty for bringing peers. Churn target: &lt;5% quarterly.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Demand Side: Buyer Acquisition & Sales</h2>
        <div className="not-prose space-y-4 mt-4">
          <div className="p-4 border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20 rounded-r-lg">
            <h3 className="font-bold text-gray-900 dark:text-white">1. Organic: Artist Audiences (Phase 1–2)</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Each onboarded artist brings 2k–20k followers. Launch kits drive $0-CAC initial sales. Cross-artist email capture builds a centralized buyer CRM from day one.
            </p>
          </div>
          <div className="p-4 border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20 rounded-r-lg">
            <h3 className="font-bold text-gray-900 dark:text-white">2. Programmatic SEO (Phase 3)</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Auto-generated landing pages for style × color × size × room combinations. Target: 10,000+ indexed pages by month 12. Long-tail keywords like &quot;large blue abstract canvas print for living room.&quot;
            </p>
          </div>
          <div className="p-4 border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20 rounded-r-lg">
            <h3 className="font-bold text-gray-900 dark:text-white">3. Dynamic Paid Ads (Phase 3)</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Catalog fed into Meta/Google Ads APIs. Algorithms test thousands of creative permutations (artwork × mockup × copy variant). Winning combos scaled automatically. Target ROAS: 3.5x+, CAC: &lt;$12.
            </p>
          </div>
          <div className="p-4 border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20 rounded-r-lg">
            <h3 className="font-bold text-gray-900 dark:text-white">4. Retention & LTV Expansion</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Post-purchase email flows recommend complementary pieces by color palette and style. Seasonal campaigns (holiday gifting, new home). Target: 2+ purchases/year, LTV $150+.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">B2B Sales (Phase 4)</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Interior Designers:</strong> Trade portal with bulk pricing, project boards, and Net-30 invoicing. Outbound to design firms via LinkedIn + portfolio showcases.</li>
          <li><strong>Hospitality & Corporate:</strong> Direct sales for hotel lobbies, restaurant chains, and office art programs. Higher AOV, lower volume, dedicated account management.</li>
          <li><strong>Gallery Licensing:</strong> White-label capture software sold as SaaS to traditional galleries digitizing back catalogs. $500–2,000/mo per institution.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Channel Mix Targets (Year 1)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="py-2 pr-4">Channel</th>
                <th className="py-2 pr-4">% of Revenue</th>
                <th className="py-2 pr-4">CAC</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Artist Audience (Organic)</td>
                <td className="py-2 pr-4">35%</td>
                <td className="py-2 pr-4">$0</td>
                <td className="py-2">Artist-driven social sharing</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Programmatic SEO</td>
                <td className="py-2 pr-4">25%</td>
                <td className="py-2 pr-4">$3</td>
                <td className="py-2">Content generation cost amortized</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Paid Social/Search</td>
                <td className="py-2 pr-4">30%</td>
                <td className="py-2 pr-4">$12</td>
                <td className="py-2">Dynamic ad engine, ROAS-gated scaling</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">Email Retention</td>
                <td className="py-2 pr-4">8%</td>
                <td className="py-2 pr-4">$2</td>
                <td className="py-2">Repeat purchases from existing CRM</td>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">B2B / Designer</td>
                <td className="py-2 pr-4">2%</td>
                <td className="py-2 pr-4">$45</td>
                <td className="py-2">Higher AOV offsets higher CAC</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
