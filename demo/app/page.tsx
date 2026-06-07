import { ArrowRight, Sparkles, Image as ImageIcon, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
          Print Atelier
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto">
          A software-first, AI-driven two-sided art commerce platform. We digitize original paintings and sell high-quality prints through automated channels.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
            <ImageIcon className="w-6 h-6 text-indigo-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">AI-Driven Acquisition</h3>
          <p className="text-gray-600">
            Artists upload smartphone photos. Our AI upscales, color corrects, and normalizes lighting to create print-ready digital masters.
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-indigo-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Automated Merchandising</h3>
          <p className="text-gray-600">
            Generative AI creates photorealistic room mockups, detail shots, and SEO-optimized listing copy instantly.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
            <TrendingUp className="w-6 h-6 text-indigo-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Zero-Touch Fulfillment</h3>
          <p className="text-gray-600">
            API integration with global print-on-demand nodes ensures the highest margin fulfillment without human intervention.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Explore the Business Plan</h2>
        <p className="text-gray-600 mb-6 max-w-xl mx-auto">
          We've converted our comprehensive business strategy, market research, and operational models into interactive documents.
        </p>
        <Link 
          href="/business-plan" 
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          Read the Business Plan
          <ArrowRight className="ml-2 -mr-1 w-5 h-5" />
        </Link>
      </div>
    </div>
  );
}
