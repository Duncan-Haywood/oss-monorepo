import Link from "next/link";
import { ArrowRight, Palette, Cpu, TrendingUp } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
          Print Atelier
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl leading-relaxed">
          A software-first, AI-driven two-sided art commerce platform. 
          We digitize original paintings and sell high-quality prints through automated channels, 
          scaling independent artists without them trading time for a single sale.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-gray-50 rounded-xl border border-gray-100">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
            <Cpu className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold mb-2">Software First</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Automated payouts, centralized asset management, and seamless POD routing.
          </p>
        </div>
        <div className="p-6 bg-gray-50 rounded-xl border border-gray-100">
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-4">
            <Palette className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold mb-2">AI First</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            AI-driven asset enhancement, dynamic room mockups, and predictive merchandising.
          </p>
        </div>
        <div className="p-6 bg-gray-50 rounded-xl border border-gray-100">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-4">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold mb-2">Digital First</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Automated artist acquisition, programmatic ad buying, and story-driven commerce.
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <Link 
          href="/business-plan"
          className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-gray-900 hover:bg-gray-800 transition-colors"
        >
          Read the Business Plan
        </Link>
        <Link 
          href="/demo"
          className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        >
          View Store Demo
          <ArrowRight className="ml-2 w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
