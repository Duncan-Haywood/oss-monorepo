export default function AiDigitalStrategy() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 prose prose-stone lg:prose-lg prose-indigo">
      <h1>AI & Digital-First Strategy</h1>
      <p className="lead">
        Print Atelier is built from day one as a <strong>software-driven, AI-enabled</strong> platform. By automating the most labor-intensive parts of the traditional gallery and art reproduction models, we can operate at a higher margin and scale faster than conventional competitors.
      </p>

      <h2>AI-Enabled Operations</h2>

      <h3>1. Image Processing & Quality Assurance</h3>
      <ul>
        <li><strong>AI Upscaling:</strong> Use models like Topaz Gigapixel or specialized latent diffusion models to upscale high-quality captures to massive resolutions, enabling larger print sizes without quality loss.</li>
        <li><strong>Automated Color Grading:</strong> AI-assisted color matching tools to automatically baseline raw captures against the color reference card before human review.</li>
        <li><strong>Defect Removal:</strong> Automated removal of dust, glare, or minor capture artifacts using AI in-painting.</li>
      </ul>

      <h3>2. Marketing & Asset Generation</h3>
      <ul>
        <li><strong>Dynamic Room Mockups:</strong> Instead of manual Photoshop work, we use AI to generate photorealistic room mockups (living rooms, galleries, offices) placing the artwork in various interior design styles to increase buyer conversion.</li>
        <li><strong>Content Generation:</strong> AI to assist in writing SEO-optimized product descriptions, artist biographies, and social media captions based on the artist's provided background and piece metadata.</li>
        <li><strong>Video Editing:</strong> Automated generation of short-form video content (TikTok/Reels) from raw process footage, extracting the most engaging segments and syncing to trending audio.</li>
      </ul>

      <h2>Digital-First Sales & Outreach</h2>

      <h3>Supply Side (Artist Acquisition)</h3>
      <ul>
        <li><strong>Data Scraping & Enrichment:</strong> Scraping Instagram, local gallery rosters, and art school alumni pages to build a database of target painters.</li>
        <li><strong>AI-Personalized Outreach:</strong> Using LLMs to analyze an artist's portfolio and generate highly personalized cold outreach emails/DMs at scale, highlighting specific pieces of their work.</li>
        <li><strong>Automated Onboarding:</strong> Self-serve artist portal for contract signing, scheduling capture sessions, and uploading metadata.</li>
      </ul>

      <h3>Demand Side (Consumer Sales)</h3>
      <ul>
        <li><strong>Programmatic Advertising:</strong> Integrating deeply with Meta and Google Ads APIs to programmatically launch and test hundreds of ad variations per artwork.</li>
        <li><strong>Predictive Merchandising:</strong> Analyzing search trends and color palettes across interior design platforms (Pinterest, Houzz) to highlight pieces in our catalog that match current trends.</li>
        <li><strong>Personalized Recommendations:</strong> Recommendation engines on the storefront suggesting complementary pieces based on visual similarity (style, color palette, medium).</li>
      </ul>

      <h2>Platform Architecture</h2>
      <p>The core of Print Atelier is not just a Shopify store, but a custom operations backend:</p>
      <ul>
        <li><strong>Central Asset Hub:</strong> A highly structured database linking the artist, the physical piece metadata, the raw files, the print-ready master, and the marketing derivatives.</li>
        <li><strong>Automated Royalties Engine:</strong> Software that ingests POD provider invoices and Shopify sales data, calculates the exact 30% net profit split dynamically, and queues payouts via Stripe Connect.</li>
        <li><strong>Photographer Dispatch:</strong> An Uber-like dispatch system for field photographers: artists request a capture session, and local vetted photographers can claim the job via a mobile-friendly portal.</li>
      </ul>
    </div>
  );
}
