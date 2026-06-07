export default function SalesOutreach() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Digital-First Sales & Marketing</h1>

      <section>
        <h2 className="text-2xl font-semibold">The Core Philosophy: Digital First</h2>
        <p>
          Print Atelier replaces traditional gallery curation and manual sales efforts with high-velocity, software-driven outreach. We treat artist acquisition and buyer generation as engineering problems, not just marketing tasks.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">1. Supply Side: Automated Artist Outreach</h2>
        <p>
          To build our catalog rapidly, we deploy intelligent, automated systems to identify and onboard artists.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Social Graph Scraping:</strong> Proprietary tools scan Instagram, TikTok, and Pinterest for independent artists meeting specific engagement and quality criteria.</li>
          <li><strong>AI-Personalized DMs:</strong> Instead of generic blasts, our system uses LLMs to reference specific artworks on the artist's profile in the outreach message, drastically increasing response rates.</li>
          <li><strong>Self-Serve Onboarding:</strong> The outreach links to a frictionless digital portal where artists can create a profile, upload a photo from their phone, and have a print-ready product live in under 3 minutes.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">2. Demand Side: Algorithmic Marketing</h2>
        <p>
          Buyer acquisition is driven by programmatic campaigns that leverage the unique visual nature of our product.
        </p>
        <div className="bg-blue-50 dark:bg-blue-900/30 p-5 rounded-xl mt-4 border border-blue-100 dark:border-blue-800">
          <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-2">The "Living Room" Strategy</h3>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Consumers struggle to visualize raw art in their homes. Our software automatically generates thousands of hyper-realistic mockups of the art in various interior design styles. We feed these dynamically generated assets into Meta/Google ad networks, allowing algorithmic testing to find the exact combination of art, frame, and room setting that converts best.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">3. The Network Effect (B2B2C)</h2>
        <p>
          Artists are our most potent marketing channel. By providing them with a platform that actually works, they bring their audiences.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Automated Promo Kits:</strong> Upon publishing a piece, the system automatically emails the artist pre-sized, optimized social media assets (Reels, Stories, Posts) to announce the drop.</li>
          <li><strong>Referral Economics:</strong> Artists are incentivized not just to sell their own work, but to bring other artists to the platform.</li>
          <li><strong>Audience Capture:</strong> Every fan an artist brings to their specific Print Atelier page enters our broader ecosystem, allowing us to retarget them with complementary art from other creators.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">4. Profitability & Unit Economics Analysis</h2>
        <p>
          Because our outreach and marketing are software-driven, our Customer Acquisition Cost (CAC) scales sub-linearly.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Near-Zero Supply CAC:</strong> Automated scripts and AI DMs require only compute cost to acquire artists.</li>
          <li><strong>High LTV (Lifetime Value):</strong> By capturing buyer emails and using AI to recommend similar pieces over time, we increase repeat purchase rates without ad spend.</li>
          <li><strong>No Inventory Risk:</strong> The print-on-demand model ensures we never hold physical stock, keeping overhead strictly limited to software and personnel.</li>
        </ul>
      </section>
    </div>
  );
}
