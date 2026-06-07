import Link from "next/link";
import { ArrowRight, Palette, Cpu, Globe } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col justify-center items-center text-center p-10 bg-gradient-to-b from-white to-gray-50">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium mb-6">
          <span className="flex h-2 w-2 rounded-full bg-indigo-500"></span>
          Software-first art monetization
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 tracking-tight max-w-4xl mb-6">
          Paint once. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
            Earn infinitely.
          </span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mb-10">
          Print Atelier uses AI and automated fulfillment to turn your original artwork into high-margin, museum-quality prints. Zero logistics. Zero upfront cost. 30% net profit straight to your bank.
        </p>
        <div className="flex gap-4">
          <Link href="/demo/dashboard" className="px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 flex items-center gap-2 transition-colors">
            Artist Portal <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/demo/store" className="px-6 py-3 bg-white text-gray-900 border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            View Store
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white p-10 md:p-20 border-t border-gray-200">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-10">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">AI-Powered Digitization</h3>
            <p className="text-gray-600">
              Upload from your phone. Our AI corrects perspective, optimizes color for ICC print profiles, and generates high-res masters instantly.
            </p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">
              <Globe className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Global API Fulfillment</h3>
            <p className="text-gray-600">
              When a print sells, software routes it to the nearest archival printing lab. They print, pack, and ship directly to the buyer.
            </p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center">
              <Palette className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">B2B Sales Engine</h3>
            <p className="text-gray-600">
              Our automated outreach pitches your art to interior designers and corporate buyers, unlocking recurring wholesale revenue.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
