import { 
  LineChart, 
  Upload, 
  DollarSign, 
  Image as ImageIcon,
  Activity,
  ArrowUpRight
} from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 bg-gray-50 min-h-full">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Artist Dashboard</h1>
          <p className="text-gray-500 mt-1">Welcome back, Sarah. Here&apos;s how your portfolio is performing.</p>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-md font-medium hover:bg-indigo-700 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload New Piece
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="text-gray-500 text-sm font-medium">Total Earnings</div>
            <DollarSign className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">$4,250.00</div>
          <div className="text-sm text-green-600 mt-2 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> +12% from last month
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="text-gray-500 text-sm font-medium">Prints Sold</div>
            <LineChart className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">124</div>
          <div className="text-sm text-gray-500 mt-2">Across 8 pieces</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="text-gray-500 text-sm font-medium">Active Listings</div>
            <ImageIcon className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">12</div>
          <div className="text-sm text-gray-500 mt-2">3 pending AI review</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="text-gray-500 text-sm font-medium">B2B Reach</div>
            <Activity className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">3.2k</div>
          <div className="text-sm text-gray-500 mt-2">Designers pitched via AI</div>
        </div>
      </div>

      {/* Portfolio Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Top Performing Pieces</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-medium">
            <tr>
              <th className="px-6 py-3 text-left">Artwork</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Prints Sold</th>
              <th className="px-6 py-3 text-left">Your Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white text-sm">
            <tr>
              <td className="px-6 py-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded bg-gradient-to-tr from-blue-300 to-purple-400"></div>
                <span className="font-medium text-gray-900">Midnight Horizon</span>
              </td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Live</span>
              </td>
              <td className="px-6 py-4 text-gray-600">42</td>
              <td className="px-6 py-4 font-medium text-gray-900">$840.00</td>
            </tr>
            <tr>
              <td className="px-6 py-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded bg-gradient-to-bl from-orange-300 to-red-400"></div>
                <span className="font-medium text-gray-900">Desert Bloom</span>
              </td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Live</span>
              </td>
              <td className="px-6 py-4 text-gray-600">28</td>
              <td className="px-6 py-4 font-medium text-gray-900">$560.00</td>
            </tr>
            <tr>
              <td className="px-6 py-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded bg-gradient-to-t from-gray-300 to-gray-100 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-gray-400" />
                </div>
                <span className="font-medium text-gray-900">Urban Texture #4</span>
              </td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">AI Processing</span>
              </td>
              <td className="px-6 py-4 text-gray-600">—</td>
              <td className="px-6 py-4 font-medium text-gray-900">$0.00</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
