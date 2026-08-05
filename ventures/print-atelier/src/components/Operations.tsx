export default function Operations() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">AI Operations & Workflow</h1>

      <section>
        <h2 className="text-2xl font-semibold">Digital-First Artist Acquisition</h2>
        <p>Instead of manual field outreach, our operations rely on software-driven funnels to acquire supply:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li><strong>Algorithmic Sourcing:</strong> Custom scrapers identify visual artists on Instagram, TikTok, and Pinterest who meet quality thresholds but lack e-commerce links.</li>
          <li><strong>Automated Outreach:</strong> Personalized, AI-drafted DMs and emails pitching the platform. Tracking open rates and responses via CRM integration.</li>
          <li><strong>Self-Serve Onboarding:</strong> Artists click a link, sign a digital agreement (e-signature API), and are granted access to the web app.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">AI-Assisted Capture Workflow (Planned)</h2>
        <p>The traditional "hire a photographer" model is to be replaced by a software-guided self-capture process. The pipeline below is not yet built: the capture screen stores file metadata locally and runs no image processing.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>The App:</strong> Artists use our mobile web-app to photograph their paintings. The app guides lighting, framing, and requires a standard color-checker card in the shot.</li>
          <li><strong>Computer Vision Pipeline (planned, not yet built):</strong>
            <ul className="list-circle pl-5 mt-1">
              <li>Canvas-edge detection and deskew of the captured image.</li>
              <li>A LUT (Look Up Table) derived from the color-checker card, to correct the file toward print-perfect standards.</li>
              <li>Model-based upscaling (e.g., Stable Diffusion upscalers) so mobile photos can be printed at large formats (e.g., 24x36) without artifacting.</li>
            </ul>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Automated Cataloging & Marketing (Planned)</h2>
        <p>Once a master file is approved, the software is planned to take over. None of the three steps below is built yet:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Asset Generation:</strong> Placement of the artwork into high-quality interior lifestyle mockups (living rooms, galleries, cafes).</li>
          <li><strong>Copywriting:</strong> LLMs generate SEO-optimized product titles, descriptions, and artist bio summaries based on minimal bullet points provided by the artist.</li>
          <li><strong>Social Content:</strong> The system extracts color palettes and generates short-form video assets (e.g., pan/zoom reels) for TikTok/Reels marketing.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">API-Driven Fulfillment</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Customer purchases via the digital storefront.</li>
          <li>Webhook routes the order instantly to the optimal POD partner facility nearest to the customer (reducing shipping time and carbon footprint).</li>
          <li>Tracking info is synced programmatically back to the customer.</li>
          <li>Revenue split is calculated instantly and appears on the artist's dashboard.</li>
        </ol>
      </section>
    </div>
  );
}
