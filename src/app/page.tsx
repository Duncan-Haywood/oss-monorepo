import Link from "next/link";
import { ArrowRight, Image as ImageIcon, Zap, TrendingUp, Search } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full py-24 lg:py-32 bg-indigo-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 bg-[url('https://images.unsplash.com/photo-1513364776144-60967b0f800f?q=80&w=2071&auto=format&fit=crop')] bg-cover bg-center" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col items-center text-center">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl">
            You keep painting.<br/>We'll handle the rest.
          </h1>
          <p className="text-xl md:text-2xl text-indigo-100 max-w-2xl mb-10">
            Print Atelier is an AI-driven distribution layer for traditional artists. We digitize, market, and sell museum-quality prints of your work while you earn 30% net profit forever.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/artist-portal" className="bg-white text-indigo-900 px-8 py-4 rounded-full font-semibold text-lg flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors">
              Enter Artist Portal <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/business-plan" className="bg-indigo-800 border border-indigo-700 text-white px-8 py-4 rounded-full font-semibold text-lg flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors">
              Read the Business Plan
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-stone-900 mb-4">Software-First & AI-Native</h2>
            <p className="text-lg text-stone-600 max-w-2xl mx-auto">
              We leverage modern technology to scale the long-tail of the fine art market.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <ImageIcon className="w-6 h-6 text-indigo-600" />,
                title: "Smart Room Mockups",
                description: "Generative AI places your artwork in photorealistic interiors to maximize buyer conversion."
              },
              {
                icon: <Search className="w-6 h-6 text-indigo-600" />,
                title: "Automated SEO",
                description: "AI automatically tags, generates metadata, and writes listing copy for organic discoverability."
              },
              {
                icon: <Zap className="w-6 h-6 text-indigo-600" />,
                title: "Zero-Touch Ops",
                description: "Our custom pipeline routes orders to print-on-demand partners instantly without manual intervention."
              },
              {
                icon: <TrendingUp className="w-6 h-6 text-indigo-600" />,
                title: "Dynamic Pricing",
                description: "Algorithmic pricing based on demand velocity ensures optimal revenue for high-performing SKUs."
              }
            ].map((feature, i) => (
              <div key={i} className="bg-stone-50 p-6 rounded-2xl border border-stone-100">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-stone-900 mb-2">{feature.title}</h3>
                <p className="text-stone-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two-Sided Market Section */}
      <section className="w-full py-24 bg-stone-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-stone-900 mb-6">A Two-Sided Digital Engine</h2>
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-bold text-indigo-600 mb-2">1. Supply: B2B Artist Acquisition</h3>
                  <p className="text-stone-600 mb-4">Automated CRM workflows target artists on Instagram and TikTok using AI-personalized messaging. Frictionless onboarding via self-serve portals makes contract signing and scheduling capture sessions a breeze.</p>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-indigo-600 mb-2">2. Demand: B2C Buyer Acquisition</h3>
                  <p className="text-stone-600">Performance marketing pairs behind-the-scenes timelapses with finished prints. Personalized email/SMS sequences driven by browsing behavior curate AI-powered recommendations.</p>
                </div>
              </div>
            </div>
            <div className="relative h-96 bg-white rounded-3xl shadow-xl overflow-hidden border border-stone-200 p-8 flex flex-col justify-center">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                 <svg width="200" height="200" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2z"/></svg>
              </div>
              <div className="relative z-10 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 text-green-600 rounded-full mb-4">
                  <TrendingUp className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-stone-900 mb-2">Profitability at Scale</h3>
                <p className="text-stone-600">Targeting 44% gross margin on POD, with clear paths to increase by 15-20% through hybrid fulfillment. CAC to LTV ratio targeted at 1:3.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
