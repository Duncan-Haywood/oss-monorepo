export default function GTMStrategy() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Go-To-Market (GTM) Strategy</h1>

      <section>
        <h2 className="text-2xl font-semibold">Digital-First Dual Flywheel</h2>
        <p>
          Our GTM relies on activating a dual-sided marketplace. Supply (artists) drives organic demand (their followers), while centralized Demand generation (our marketing) attracts higher-tier Supply.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Phase 1: Seed the Supply (0-3 Months)</h2>
        <p>Focus entirely on acquiring the first 100 artists through automated, targeted software outreach.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>AI Scraping & Filtering:</strong> Build scripts to identify Instagram accounts with specific hashtags (#oilpainting, #acrylicart), filtering for accounts with 2k-20k followers (the "middle class" of artists).</li>
          <li><strong>Personalized DMs:</strong> Use AI to generate context-aware outreach messages mentioning specific pieces from their portfolio.</li>
          <li><strong>Frictionless Onboarding:</strong> Direct them to the web-app where they can snap a photo of a painting and see a generated living-room mockup instantly as a "hook."</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Phase 2: Leverage Artist Audiences (3-6 Months)</h2>
        <p>Turn acquired artists into our primary marketing channel.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Automated Drop Campaigns:</strong> When an artist's prints go live, our software emails them a "Launch Kit" containing AI-generated Instagram Stories, Reels, and captions.</li>
          <li><strong>Incentivized Sharing:</strong> The artist's existing audience provides our initial customer base at a $0 Customer Acquisition Cost (CAC).</li>
          <li><strong>Email Capture:</strong> Every buyer on the platform is entered into our centralized CRM, allowing us to cross-sell other artists' work.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Phase 3: Programmatic Demand Generation (6-12 Months)</h2>
        <p>Once the catalog reaches 1,000+ SKUs, we activate centralized, data-driven marketing.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Dynamic Ads (Meta/Google):</strong> Feed the catalog into advertising APIs. Algorithms automatically test thousands of permutations (Art Piece A in Mockup B vs Art Piece C in Mockup D) to find winning combinations.</li>
          <li><strong>Programmatic SEO:</strong> Automatically generate thousands of landing pages based on combinations of style, color, and medium (e.g., "Large Blue Abstract Canvas Prints").</li>
          <li><strong>Retargeting:</strong> AI-driven email flows that recommend complementary pieces based on a user's previous purchase color palette or style.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Phase 4: B2B Expansion (Year 2+)</h2>
        <p>Move beyond direct-to-consumer into high-volume channels.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Interior Designer API/Portal:</strong> Create a specific interface for interior designers to order bulk prints for hospitality and corporate projects with trade pricing.</li>
          <li><strong>White-Label Licensing:</strong> License our capture and fulfillment software to established traditional galleries to help them digitize their back catalogs.</li>
        </ul>
      </section>
    </div>
  );
}
