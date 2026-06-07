export default function TechStrategy() {
  return (
    <div className="space-y-6 prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold border-b pb-4">Technology Strategy & Architecture</h1>

      <section>
        <h2 className="text-2xl font-semibold">1. Software-First Foundation</h2>
        <p>
          Print Atelier is fundamentally a technology company operating in the art space. Our core intellectual property is the software that seamlessly bridges the physical creation of art with digital distribution and physical fulfillment.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">2. The "AI-First" Engine</h2>
        <p>
          We are integrating AI at every layer of the tech stack to eliminate manual bottlenecks:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Image Enhancement:</strong> Automated upscaling (via models like ESRGAN) and color-correction to ensure smartphone photos of physical art meet print-quality standards (300 DPI at large sizes).</li>
          <li><strong>Contextual Mockups:</strong> AI generation of lifestyle imagery (e.g., painting placed in a modern living room or industrial loft) without requiring manual Photoshop work.</li>
          <li><strong>Metadata Generation:</strong> Auto-tagging and description generation for SEO and discoverability based on visual analysis of the uploaded artwork.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">3. Platform Architecture</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="font-bold text-lg mb-2">Frontend Interfaces</h3>
            <ul className="list-disc pl-4 text-sm space-y-1">
              <li><strong>Artist Portal:</strong> Next.js web application for portfolio management, analytics, and payouts.</li>
              <li><strong>Buyer Portal:</strong> High-performance e-commerce storefront optimized for visual discovery.</li>
              <li><strong>Admin Dashboard:</strong> Centralized control plane for order management and AI pipeline monitoring.</li>
            </ul>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="font-bold text-lg mb-2">Backend & Infrastructure</h3>
            <ul className="list-disc pl-4 text-sm space-y-1">
              <li><strong>API Gateway:</strong> Node.js/GraphQL layer connecting frontends to microservices.</li>
              <li><strong>Print-on-Demand Integration:</strong> Direct API connections to global fulfillment partners (e.g., Printful, Gelato) for automated routing.</li>
              <li><strong>Asset Storage:</strong> Cloud bucket architecture for raw, processed, and mockup image variants.</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">4. Data Strategy</h2>
        <p>
          Every interaction—from an artist uploading a specific color palette to a buyer abandoning a cart on a particular mockup—feeds into a centralized data warehouse. This data trains our proprietary models for better matching between art styles and buyer profiles, optimizing conversion rates over time.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">5. Continuous Deployment & Scalability</h2>
        <p>
          Utilizing serverless computing and edge delivery networks ensures the platform scales elastically with viral artist drops. Our CI/CD pipeline allows for rapid iteration of the AI models without downtime.
        </p>
      </section>
    </div>
  );
}
