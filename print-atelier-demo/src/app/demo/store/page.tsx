import { ShoppingCart, Filter } from "lucide-react";

export default function StorePage() {
  return (
    <div className="min-h-full bg-white">
      {/* Store Header */}
      <header className="border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 bg-white z-10">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Print Atelier Store</h1>
        <div className="flex items-center gap-4">
          <button className="text-gray-500 hover:text-gray-900">Log in</button>
          <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute top-0 right-0 w-4 h-4 bg-indigo-600 text-white text-[10px] flex items-center justify-center rounded-full font-bold">
              2
            </span>
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Filters */}
        <aside className="w-64 p-8 border-r border-gray-200 min-h-screen hidden md:block">
          <div className="flex items-center gap-2 font-bold mb-6 text-gray-900">
            <Filter className="w-4 h-4" /> Filters
          </div>
          
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-sm mb-3">Style</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <label className="flex items-center gap-2"><input type="checkbox" className="rounded" /> Abstract</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="rounded" /> Landscape</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="rounded" /> Portrait</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="rounded" /> Minimalist</label>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold text-sm mb-3">Price</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <label className="flex items-center gap-2"><input type="radio" name="price" /> Under $100</label>
                <label className="flex items-center gap-2"><input type="radio" name="price" /> $100 - $250</label>
                <label className="flex items-center gap-2"><input type="radio" name="price" /> Over $250</label>
              </div>
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <main className="flex-1 p-8">
          <div className="mb-6 flex justify-between items-center text-sm text-gray-500">
            <span>Showing 24 artworks</span>
            <select className="border border-gray-300 rounded px-2 py-1 bg-white">
              <option>Trending</option>
              <option>Newest</option>
              <option>Price: Low to High</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {/* Product Card 1 */}
            <div className="group cursor-pointer">
              <div className="aspect-[4/5] bg-gradient-to-tr from-blue-300 to-purple-400 rounded-lg mb-3 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow"></div>
              <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">Midnight Horizon</h3>
              <p className="text-sm text-gray-500 mb-2">Sarah Jenkins</p>
              <div className="font-medium text-gray-900">$85.00+</div>
            </div>

            {/* Product Card 2 */}
            <div className="group cursor-pointer">
              <div className="aspect-[4/5] bg-gradient-to-bl from-orange-300 to-red-400 rounded-lg mb-3 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow"></div>
              <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">Desert Bloom</h3>
              <p className="text-sm text-gray-500 mb-2">Sarah Jenkins</p>
              <div className="font-medium text-gray-900">$85.00+</div>
            </div>

            {/* Product Card 3 */}
            <div className="group cursor-pointer">
              <div className="aspect-[4/5] bg-gradient-to-br from-green-200 to-teal-500 rounded-lg mb-3 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow"></div>
              <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">Coastal Fog</h3>
              <p className="text-sm text-gray-500 mb-2">Marcus Chen</p>
              <div className="font-medium text-gray-900">$120.00+</div>
            </div>
            
            {/* Product Card 4 */}
            <div className="group cursor-pointer">
              <div className="aspect-[4/5] bg-gradient-to-t from-gray-800 to-gray-900 rounded-lg mb-3 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow"></div>
              <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">Study in Black</h3>
              <p className="text-sm text-gray-500 mb-2">Elena Rostova</p>
              <div className="font-medium text-gray-900">$150.00+</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
