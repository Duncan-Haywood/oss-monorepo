export default function StrategyPage() {
  return (
    <div className="max-w-4xl mx-auto p-10 space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">Strategy & Go-to-Market</h1>
        <p className="text-xl text-gray-500">Software-First, AI-First Approach for Art Monetization</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">The Problem</h2>
        <p className="text-gray-700">
          Working artists face a structural income ceiling: every painting is a one-time transaction tied directly to hours in the studio. Marketing, fulfillment, and repeat revenue require skills and infrastructure most painters do not want to build. Furthermore, manual sales outreach and traditional gallery models are inefficient and gatekept.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">Our Solution: The Software & AI First Layer</h2>
        <p className="text-gray-700">
          Print Atelier sits between artists and buyers as an <strong>intelligent digitization + distribution layer</strong>. Rather than a manual service agency, we operate as a technology platform from day one:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li><strong>AI-Powered Digitization:</strong> Machine learning algorithms assist in color correction and upscaling from high-fidelity digital masters to ensure perfect print-ready files automatically.</li>
          <li><strong>Automated Distribution:</strong> Software hooks directly into Print-on-Demand (POD) APIs for zero-touch fulfillment.</li>
          <li><strong>AI Marketing Engine:</strong> Automatically generate marketing copy, social media posts, and buyer segmentation models using process photos and art metadata.</li>
          <li><strong>Smart Sales Outreach (Digital First):</strong> Programmatic outreach to interior designers, staging companies, and corporate buyers using AI-personalized email/LinkedIn campaigns.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">Market Research & Opportunity</h2>
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-100">
          <ul className="space-y-4 text-gray-700">
            <li>
              <strong>Total Addressable Market (TAM):</strong> The global wall art market is projected to reach $80B+ by 2030, driven by millennial and Gen Z buyers moving away from mass-produced stock art towards authentic, artist-driven prints.
            </li>
            <li>
              <strong>The Missing Middle:</strong> There is a gap between $20 IKEA posters and $5,000 gallery originals. Our sweet spot is $75-$300 high-quality archival prints.
            </li>
            <li>
              <strong>B2B Opportunity:</strong> Corporate offices, boutique hotels, and real estate staging represent a lucrative, recurring B2B segment that currently relies on generic catalog art due to sourcing friction. Our digital-first B2B outreach will target this directly.
            </li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">Go-to-Market (GTM) Strategy</h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Track 1: Supply (Artist Acquisition)</h3>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-700">
              <li><strong>Digital First Outreach:</strong> Scraping Instagram and local gallery lists to feed an AI-driven outreach pipeline, personalizing pitches based on the artist&apos;s style and engagement rate.</li>
              <li><strong>Pitch:</strong> &quot;Digitize once, earn on every print, software handles 100% of logistics.&quot;</li>
              <li><strong>Self-Serve Portal:</strong> Artists can eventually upload high-res files themselves, authenticated and vetted by AI, scaling beyond our manual field photography constraint.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900">Track 2: Demand (B2C & B2B Sales)</h3>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-700">
              <li><strong>B2C Automation:</strong> AI-generated ad variants across Meta/TikTok using behind-the-scenes artist process videos.</li>
              <li><strong>B2B Outbound:</strong> Automated email sequences to interior designers offering trade discounts and curated &quot;room packages.&quot;</li>
              <li><strong>Dynamic Pricing:</strong> Software dynamically tests pricing elasticity on open edition prints based on traffic and conversion metrics.</li>
            </ul>
          </div>
        </div>
      </section>
      
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold border-b pb-2">Competitive Moat</h2>
        <ol className="list-decimal pl-5 space-y-2 text-gray-700">
          <li><strong>Software Infrastructure</strong> — End-to-end automation from upload to payout, making us the easiest partner for an artist.</li>
          <li><strong>Curated Authentic Catalog</strong> — Real artists, not AI-generated slop, but using AI behind the scenes to optimize distribution.</li>
          <li><strong>B2B Sales Engine</strong> — While competitors fight for B2C ads, our digital-outbound engine secures recurring B2B revenue.</li>
        </ol>
      </section>
    </div>
  );
}
