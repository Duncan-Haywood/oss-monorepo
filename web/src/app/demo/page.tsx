import { Sparkles, ShoppingBag, Eye } from "lucide-react";

export default function DemoPage() {
  const mockArtworks = [
    {
      id: 1,
      title: "Abstract Morning",
      artist: "Elena Rivers",
      price: "$85",
      tags: ["Modern", "Minimalist", "Warm Tones"],
      color: "bg-orange-100",
      imageMock: "abstract-morning.jpg",
    },
    {
      id: 2,
      title: "Urban Decay",
      artist: "Marcus Chen",
      price: "$120",
      tags: ["Industrial", "Monochrome", "Edgy"],
      color: "bg-gray-800",
      imageMock: "urban-decay.jpg",
    },
    {
      id: 3,
      title: "Coastal Breeze",
      artist: "Sarah Jenkins",
      price: "$95",
      tags: ["Coastal", "Serene", "Cool Tones"],
      color: "bg-blue-200",
      imageMock: "coastal-breeze.jpg",
    },
    {
      id: 4,
      title: "Midnight Bloom",
      artist: "David Osei",
      price: "$150",
      tags: ["Floral", "Dark Academia", "Rich"],
      color: "bg-purple-900",
      imageMock: "midnight-bloom.jpg",
    }
  ];

  return (
    <div className="space-y-12">
      <header className="space-y-4 border-b border-gray-100 pb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">
            Store Demo
          </h1>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            AI-Personalized Feed
          </div>
        </div>
        <p className="text-xl text-gray-600 max-w-2xl">
          This is a conceptual demo of the consumer-facing storefront. In production, 
          this feed is algorithmically curated based on buyer browsing history and visual similarity.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {mockArtworks.map((art) => (
          <div key={art.id} className="group cursor-pointer">
            <div className={`aspect-[4/3] w-full ${art.color} rounded-2xl mb-4 relative overflow-hidden flex items-center justify-center transition-transform group-hover:scale-[1.02]`}>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
              {/* Placeholder for actual art */}
              <span className="text-white/50 font-medium tracking-widest uppercase text-sm">
                AI GENERATED MOCKUP
              </span>
              
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 bg-white/90 backdrop-blur-sm rounded-full text-gray-900 hover:bg-white shadow-sm">
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{art.title}</h3>
                <p className="text-gray-500">{art.artist}</p>
              </div>
              <p className="text-lg font-medium text-gray-900">{art.price}</p>
            </div>
            
            <div className="mt-3 flex flex-wrap gap-2">
              {art.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                  {tag}
                </span>
              ))}
            </div>
            
            <button className="mt-6 w-full py-3 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
              <ShoppingBag className="w-4 h-4" />
              Add to Cart
            </button>
          </div>
        ))}
      </div>
      
      <div className="p-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl border border-blue-100">
        <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          How the software powers this
        </h3>
        <ul className="space-y-2 text-gray-700 text-sm">
          <li>&bull; <strong>Auto-Tagging:</strong> Tags like "Dark Academia" are generated automatically via image recognition when the artist uploads the master file.</li>
          <li>&bull; <strong>Dynamic Room Mockups:</strong> The display images would be placed in high-fidelity 3D rooms tailored to the buyer's past clicks.</li>
          <li>&bull; <strong>Pricing:</strong> $85 is a dynamic baseline that can automatically test elasticity via A/B pricing models.</li>
        </ul>
      </div>
    </div>
  );
}