export default function BuyerDemo() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Discover Independent Art</h1>
        <p className="text-xl text-gray-500">Museum-quality prints from emerging artists, delivered to your door.</p>
      </div>

      <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
        {["All", "Abstract", "Landscape", "Portrait", "Photography", "Digital"].map((cat) => (
          <button key={cat} className="px-4 py-2 rounded-full border border-gray-200 hover:border-gray-900 hover:bg-gray-50 whitespace-nowrap">
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="group cursor-pointer">
            <div className="relative aspect-[4/5] bg-gray-100 rounded-xl overflow-hidden mb-4">
              <div className="absolute inset-0 bg-gray-200 animate-pulse"></div>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Untitled Masterpiece {i}</h3>
            <p className="text-gray-500">by Artist Name</p>
            <p className="font-medium text-gray-900 mt-2">From $85</p>
          </div>
        ))}
      </div>
    </div>
  );
}
