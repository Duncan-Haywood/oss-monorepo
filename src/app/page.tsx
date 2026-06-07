export default function Home() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
          Print Atelier
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto">
          A software-first, AI-driven two-sided art commerce platform. We digitize original paintings and sell high-quality prints through automated channels.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">For Artists (Supply)</h2>
          <ul className="space-y-3 text-gray-600">
            <li>✨ 30% of net profits on every print</li>
            <li>🎨 +30% materials reimbursement</li>
            <li>📸 Professional digitization of your work</li>
            <li>📦 Zero fulfillment or shipping headaches</li>
          </ul>
          <a href="/demo/artist" className="mt-6 inline-block bg-gray-900 text-white px-4 py-2 rounded-md font-medium hover:bg-gray-800">
            Artist Portal Demo
          </a>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">For Buyers (Demand)</h2>
          <ul className="space-y-3 text-gray-600">
            <li>🖼️ Museum-quality fine art prints</li>
            <li>🔍 Curated collections from independent artists</li>
            <li>🤖 AI-driven recommendations for your space</li>
            <li>🚚 Fast, reliable print-on-demand delivery</li>
          </ul>
          <a href="/demo/buyer" className="mt-6 inline-block bg-gray-900 text-white px-4 py-2 rounded-md font-medium hover:bg-gray-800">
            Buyer Store Demo
          </a>
        </div>
      </div>
    </div>
  );
}
