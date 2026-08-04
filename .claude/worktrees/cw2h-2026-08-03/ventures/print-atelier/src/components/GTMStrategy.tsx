export default function GTMStrategy() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Go-To-Market (GTM) Strategy</h1>

      <section>
        <h2 className="text-2xl font-semibold">Digital-First Dual Flywheel</h2>
        <p>
          GTM activates a dual-sided marketplace. Supply (artists) drives organic demand (their followers), while centralized demand generation (our marketing) attracts higher-tier supply. Both sides are software-automated from launch.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Phase 1: Seed the Supply (Months 0–3)</h2>
        <p>Acquire the first 100 artists through automated, targeted software outreach. Zero paid marketing spend.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>AI Scraping & Filtering:</strong> Instagram accounts with #oilpainting, #acrylicart; 2k–20k followers.</li>
          <li><strong>Personalized DMs:</strong> AI-generated messages referencing specific portfolio pieces.</li>
          <li><strong>Frictionless Onboarding:</strong> Snap a photo → instant living-room mockup as conversion hook.</li>
        </ul>
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border not-prose mt-4">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Phase 1 KPIs</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-700 dark:text-gray-300">
            <div><span className="font-mono font-bold">100</span> artists onboarded</div>
            <div><span className="font-mono font-bold">500+</span> SKUs live</div>
            <div><span className="font-mono font-bold">40%</span> DM response rate</div>
            <div><span className="font-mono font-bold">$0</span> paid ad spend</div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Budget: $2k/mo (tools, compute, 1 founder). Team: 1–2 people.</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Phase 2: Leverage Artist Audiences (Months 3–6)</h2>
        <p>Turn acquired artists into the primary marketing channel.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Automated Drop Campaigns:</strong> Launch Kit with AI-generated Stories, Reels, and captions.</li>
          <li><strong>Incentivized Sharing:</strong> Artist audiences provide initial customers at $0 CAC.</li>
          <li><strong>Email Capture:</strong> Every buyer enters centralized CRM for cross-sell.</li>
        </ul>
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border not-prose mt-4">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Phase 2 KPIs</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-700 dark:text-gray-300">
            <div><span className="font-mono font-bold">500</span> artists</div>
            <div><span className="font-mono font-bold">200/mo</span> orders</div>
            <div><span className="font-mono font-bold">$0</span> artist-driven CAC</div>
            <div><span className="font-mono font-bold">5k</span> buyer emails</div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Budget: $4k/mo. Team: 2–3 (add part-time designer for mockup QA).</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Phase 3: Programmatic Demand (Months 6–12)</h2>
        <p>At 1,000+ SKUs, activate centralized data-driven marketing.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Dynamic Ads:</strong> Catalog fed into Meta/Google; thousands of creative permutations tested daily.</li>
          <li><strong>Programmatic SEO:</strong> Auto-generated landing pages by style, color, medium.</li>
          <li><strong>Retargeting:</strong> AI email flows based on purchase color palette and style.</li>
        </ul>
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border not-prose mt-4">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Phase 3 KPIs</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-700 dark:text-gray-300">
            <div><span className="font-mono font-bold">2,000</span> artists</div>
            <div><span className="font-mono font-bold">1,500/mo</span> orders</div>
            <div><span className="font-mono font-bold">&lt;$12</span> paid CAC</div>
            <div><span className="font-mono font-bold">3.5x</span> ROAS target</div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Budget: $15k/mo ($8k marketing, $5k infra, $2k team). Team: 4–5.</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Phase 4: B2B Expansion (Year 2+)</h2>
        <p>Move beyond D2C into high-volume channels.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Interior Designer Portal:</strong> Trade pricing, bulk orders, project boards for hospitality/corporate.</li>
          <li><strong>White-Label Licensing:</strong> AI capture + fulfillment software for traditional galleries.</li>
          <li><strong>Partnership Targets:</strong> Printful/Gelato volume discounts, Stripe Atlas, design influencer affiliates.</li>
        </ul>
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border not-prose mt-4">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Phase 4 KPIs</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-700 dark:text-gray-300">
            <div><span className="font-mono font-bold">5,000+</span> artists</div>
            <div><span className="font-mono font-bold">$5M+</span> annual GMV</div>
            <div><span className="font-mono font-bold">50</span> B2B accounts</div>
            <div><span className="font-mono font-bold">25%</span> gross margin</div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Launch Calendar (First 90 Days)</h2>
        <div className="overflow-x-auto not-prose">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="text-left py-2 pr-4">Week</th>
                <th className="text-left py-2 pr-4">Milestone</th>
                <th className="text-left py-2">Owner</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              <tr className="border-b border-gray-200 dark:border-gray-700"><td className="py-2 pr-4">1–2</td><td className="py-2 pr-4">MVP capture app + AI pipeline live</td><td className="py-2">Engineering</td></tr>
              <tr className="border-b border-gray-200 dark:border-gray-700"><td className="py-2 pr-4">3–4</td><td className="py-2 pr-4">Outreach bot deployed; first 10 artists onboarded</td><td className="py-2">Growth</td></tr>
              <tr className="border-b border-gray-200 dark:border-gray-700"><td className="py-2 pr-4">5–6</td><td className="py-2 pr-4">Storefront launch; first 50 SKUs; Stripe Connect payouts</td><td className="py-2">Product</td></tr>
              <tr className="border-b border-gray-200 dark:border-gray-700"><td className="py-2 pr-4">7–8</td><td className="py-2 pr-4">Launch Kit automation; first artist-driven sales</td><td className="py-2">Marketing</td></tr>
              <tr className="border-b border-gray-200 dark:border-gray-700"><td className="py-2 pr-4">9–10</td><td className="py-2 pr-4">100 artists; CRM + email nurture live</td><td className="py-2">Growth</td></tr>
              <tr><td className="py-2 pr-4">11–12</td><td className="py-2 pr-4">Programmatic SEO pilot; evaluate paid ad readiness</td><td className="py-2">Marketing</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
