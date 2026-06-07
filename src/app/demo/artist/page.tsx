export default function ArtistDemo() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Artist Dashboard</h1>
        <button className="bg-gray-900 text-white px-4 py-2 rounded-md font-medium hover:bg-gray-800">
          Upload New Artwork
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500">Total Earnings</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">$4,250.00</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500">Prints Sold</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">142</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500">Active Artworks</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">12</p>
        </div>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-4">Your Portfolio</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="h-48 bg-gray-200 animate-pulse"></div>
            <div className="p-4">
              <h3 className="font-bold text-gray-900">Artwork Title {i}</h3>
              <p className="text-sm text-gray-500 mt-1">32 prints sold</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
