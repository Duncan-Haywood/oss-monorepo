"use client";

import { Activity, Users, Image as ImageIcon, Box, AlertCircle, Database, Server, Zap } from "lucide-react";

export default function AdminPortal() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-300 font-sans">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3 text-white">
          <Zap className="w-6 h-6 text-blue-500" />
          <h1 className="text-xl font-bold tracking-tight">Print Atelier <span className="text-slate-500 font-normal">| Operations Command</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-xs font-medium bg-green-500/10 text-green-400 px-3 py-1 rounded-full border border-green-500/20">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            All Systems Operational
          </span>
          <a href="/" className="ml-4 text-sm font-medium px-4 py-2 border border-slate-700 rounded-lg hover:bg-slate-800 text-white transition">Exit to Docs</a>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        
        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Active Artists", value: "2,405", trend: "+12", icon: <Users className="w-5 h-5 text-blue-400" /> },
            { label: "AI Processed Images", value: "148.2k", trend: "+1,240", icon: <ImageIcon className="w-5 h-5 text-purple-400" /> },
            { label: "Pending Fulfillment", value: "412", trend: "-5%", icon: <Box className="w-5 h-5 text-amber-400" /> },
            { label: "API Requests / min", value: "1,204", trend: "Normal", icon: <Activity className="w-5 h-5 text-emerald-400" /> }
          ].map((kpi, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 backdrop-blur flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium mb-1">{kpi.label}</p>
                <p className="text-3xl font-bold text-white mb-2">{kpi.value}</p>
                <span className="text-xs text-slate-500">{kpi.trend} today</span>
              </div>
              <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">{kpi.icon}</div>
            </div>
          ))}
        </div>

        {/* Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Console */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Real-time AI Pipeline */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-800">
                <h2 className="font-semibold text-white flex items-center gap-2"><Database className="w-4 h-4" /> AI Enhancement Pipeline</h2>
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">Live Feed</span>
              </div>
              <div className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                    <tr>
                      <th className="px-5 py-3">Task ID</th>
                      <th className="px-5 py-3">Artist</th>
                      <th className="px-5 py-3">Stage</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {[
                      { id: "img_9x8f2a", artist: "s.chen", stage: "ESRGAN Upscaling", status: "Processing", time: "4s", color: "text-blue-400" },
                      { id: "img_2b4c19", artist: "ajenkins", stage: "Color Calibration", status: "Processing", time: "12s", color: "text-blue-400" },
                      { id: "img_7f3e22", artist: "m.doe", stage: "Mockup Gen (x4)", status: "Completed", time: "34s", color: "text-emerald-400" },
                      { id: "img_1a9d45", artist: "r.smith", stage: "Metadata Tagging", status: "Completed", time: "41s", color: "text-emerald-400" },
                      { id: "img_5c8b33", artist: "l.wu", stage: "Initial Upload", status: "Resolution too low", time: "1m", color: "text-rose-400" },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-slate-700/30 transition">
                        <td className="px-5 py-3 font-mono text-xs text-slate-300">{row.id}</td>
                        <td className="px-5 py-3 text-slate-300">{row.artist}</td>
                        <td className="px-5 py-3">{row.stage}</td>
                        <td className={`px-5 py-3 ${row.color} flex items-center gap-1.5`}>
                          {row.status === "Processing" && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>}
                          {row.status}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-right">{row.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>

          {/* Sidebar Modules */}
          <div className="space-y-6">
            
            {/* System Health */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-800">
                <h2 className="font-semibold text-white flex items-center gap-2"><Server className="w-4 h-4" /> Infrastructure Status</h2>
              </div>
              <div className="p-5 space-y-4">
                {[
                  { label: "Frontend Nodes", usage: 34 },
                  { label: "GPU Inference Clusters", usage: 82 },
                  { label: "Printful API Gateway", usage: 12 },
                  { label: "Postgres Main", usage: 45 }
                ].map((sys, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300">{sys.label}</span>
                      <span className="text-slate-400 font-mono">{sys.usage}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${sys.usage > 80 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${sys.usage}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alerts */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Recent Alerts</h2>
              <div className="space-y-3">
                <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-rose-200 font-medium">Gelato API Rate Limit</p>
                    <p className="text-xs text-rose-300/70 mt-0.5">EU fulfillment endpoints returning 429. Auto-routing to backup providers.</p>
                  </div>
                </div>
                <div className="bg-slate-700/30 border border-slate-600/50 p-3 rounded-lg flex items-start gap-3">
                  <Database className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-slate-300 font-medium">DB Snapshot Complete</p>
                    <p className="text-xs text-slate-500 mt-0.5">Routine snapshot saved to S3 bucket /backups/daily.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
