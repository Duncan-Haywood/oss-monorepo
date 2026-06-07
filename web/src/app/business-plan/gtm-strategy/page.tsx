import { Target } from "lucide-react";

export default function GTMStrategyPage() {
  return (
    <div className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:tracking-tight">
      <div className="flex items-center gap-3 mb-8 not-prose pb-6 border-b border-gray-100">
        <div className="p-2 bg-purple-50 rounded-lg">
          <Target className="w-6 h-6 text-purple-600" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 m-0">Go-To-Market (GTM) Strategy</h1>
      </div>

      <p className="lead text-xl text-gray-600">
        Our GTM strategy is engineered around a <strong>software-first, AI-driven</strong> approach. Instead of manual sales and traditional advertising, we leverage automation to build both the supply (artists) and demand (buyers) sides of the marketplace simultaneously.
      </p>

      <h2>Phase 1: Algorithmic Supply Acquisition (Artists)</h2>
      <p>Before we can sell, we need a premium catalog. Traditional galleries rely on manual scouting. We use software.</p>

      <h3>AI-Driven Sales Outreach</h3>
      <ol>
        <li><strong>Scraping & Lead Generation:</strong> We deploy scrapers to monitor Instagram, TikTok, and artist portfolios for visual artists meeting specific criteria (follower count, engagement rate, medium).</li>
        <li><strong>AI Analysis:</strong> Computer vision models analyze their portfolios to ensure the art style fits our curation parameters. Natural language processing evaluates their bio/captions to gauge if they currently sell prints.</li>
        <li><strong>Automated Personalized Outreach:</strong> AI drafts highly personalized DMs and emails referencing specific pieces of their work. Example: <em>&ldquo;I love the texture in [Piece Name]. We help artists like you turn originals into passive income via museum-quality prints...&rdquo;</em></li>
        <li><strong>Self-Serve Onboarding:</strong> Interested artists are routed to a digital onboarding portal. They sign contracts via e-signature, upload existing high-res scans, or schedule a capture session entirely via software.</li>
      </ol>

      <h2>Phase 2: Demand Generation (Buyers)</h2>
      <p>Once the catalog is seeded, we use a digital-first marketing engine to acquire customers.</p>

      <h3>Programmatic Advertising & Content</h3>
      <ol>
        <li><strong>Dynamic Ad Generation:</strong> AI systems automatically take the master artwork files and generate thousands of ad creatives:
          <ul>
            <li>Placing the art in diverse virtual room mockups (mid-century modern, minimalist, industrial).</li>
            <li>Creating short-form video slideshows combining the art with the artist&apos;s process footage.</li>
            <li>Writing ad copy tailored to different buyer personas.</li>
          </ul>
        </li>
        <li><strong>Algorithmic Bidding:</strong> Programmatic ad buying across Meta, Pinterest, and Google. The system automatically shifts budget to the artist/artwork combinations that yield the lowest CAC (Customer Acquisition Cost).</li>
        <li><strong>SEO Automation:</strong> AI generates rich, SEO-optimized product descriptions, artist biographies, and blog content around art trends, capturing organic search intent.</li>
      </ol>

      <h2>Phase 3: The B2B / Trade Expansion</h2>
      <p>A significant revenue driver will be B2B sales to interior designers, hotels, and corporate offices.</p>

      <h3>Digital B2B Sales Outreach</h3>
      <ol>
        <li><strong>LinkedIn & Email Automation:</strong> AI agents build lists of interior designers and procurement managers, initiating automated email sequences offering trade discounts and bulk ordering capabilities.</li>
        <li><strong>Trade Portal:</strong> A dedicated B2B software portal where designers can visualize art in their specific projects, manage client approvals, and order in bulk with automated invoicing.</li>
      </ol>

      <h2>Flywheel Effect</h2>
      <p>Our software-first approach creates a compounding advantage:</p>
      <div className="not-prose bg-gray-50 p-6 rounded-xl border border-gray-200 text-center font-medium text-gray-800 my-8">
        More Artists &rarr; More Art Data &rarr; Better AI Ad Generation &rarr; More Sales &rarr; Higher Artist Payouts &rarr; Easier to Recruit Top Artists
      </div>
    </div>
  );
}