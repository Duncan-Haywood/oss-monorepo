"use client";

import Link from "next/link";
import { useState } from "react";
import { Camera, CheckCircle2, Sparkles, Image as ImageIcon, ArrowRight, Upload } from "lucide-react";

const STEPS = [
  { id: "upload", label: "Upload Photo", icon: Upload },
  { id: "deskew", label: "AI Deskew", icon: Sparkles },
  { id: "color", label: "Color Correct", icon: CheckCircle2 },
  { id: "upscale", label: "Upscale", icon: ImageIcon },
  { id: "mockup", label: "Generate Mockups", icon: Camera },
];

export default function CaptureDemo() {
  const [step, setStep] = useState(0);
  const [processing, setProcessing] = useState(false);

  const runPipeline = () => {
    if (processing) return;
    setProcessing(true);
    setStep(0);
    const interval = setInterval(() => {
      setStep((s) => {
        if (s >= STEPS.length - 1) {
          clearInterval(interval);
          setProcessing(false);
          return s;
        }
        return s + 1;
      });
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">AI Capture Pipeline (simulation)</h1>
          <p className="text-sm text-gray-400">Animated walkthrough of the planned pipeline — no image is uploaded or processed</p>
        </div>
        <Link href="/" className="text-sm px-4 py-2 border border-gray-700 rounded-lg hover:bg-gray-800 transition">Return to Docs</Link>
      </header>

      <main className="max-w-5xl mx-auto p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="font-semibold mb-4">Pipeline Progress (simulated)</h2>
              <div className="space-y-3">
                {STEPS.map((s, i) => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      i <= step ? "bg-indigo-900/40 border border-indigo-700/50" : "bg-gray-800/50 border border-gray-800"
                    }`}
                  >
                    <s.icon className={`w-5 h-5 ${i <= step ? "text-indigo-400" : "text-gray-600"}`} />
                    <span className={i <= step ? "text-white" : "text-gray-500"}>{s.label}</span>
                    {i < step && <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />}
                    {i === step && processing && (
                      <span className="ml-auto w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={runPipeline}
                disabled={processing}
                className="mt-6 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition"
              >
                {processing ? "Processing..." : "Run AI Pipeline Demo"}
                {!processing && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-sm text-gray-400">
              <p><strong className="text-white">How it is planned to work:</strong> the artist photographs the painting with a color-checker card, then a CV pipeline deskews it, applies LUT calibration, upscales it via ESRGAN and renders 4 lifestyle mockups.</p>
              <p className="mt-2 text-amber-300/80">None of that is built yet: this page animates the sequence on a timer, and no image-processing library is installed.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="aspect-[4/3] bg-gray-900 rounded-xl border border-gray-800 overflow-hidden relative">
              {step < 1 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-amber-900/30 to-gray-900">
                  <div className="w-3/4 h-2/3 bg-amber-800/50 border-2 border-dashed border-amber-600/50 rounded-lg flex items-center justify-center transform rotate-2">
                    <span className="text-amber-200/60 text-sm">Raw phone photo (skewed)</span>
                  </div>
                  <div className="absolute bottom-4 right-4 w-8 h-8 bg-white rounded border border-gray-400"></div>
                </div>
              )}
              {step >= 1 && step < 3 && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="w-3/4 h-2/3 bg-blue-900 rounded shadow-2xl border-4 border-white"></div>
                </div>
              )}
              {step >= 3 && step < 4 && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="w-4/5 h-4/5 bg-blue-900 rounded shadow-2xl border-4 border-white ring-2 ring-indigo-500"></div>
                  <span className="absolute bottom-4 left-4 text-xs bg-indigo-600 px-2 py-1 rounded">4K Master • 300 DPI</span>
                </div>
              )}
              {step >= 4 && (
                <div className="absolute inset-0 bg-stone-200 p-4">
                  <div className="w-1/2 h-1/3 bg-blue-900 shadow-xl border-4 border-white absolute top-1/3 left-1/4"></div>
                  <span className="absolute bottom-4 left-4 text-xs bg-white text-gray-800 px-2 py-1 rounded shadow">Living Room Mockup</span>
                </div>
              )}
            </div>

            {step >= 4 && (
              <div className="grid grid-cols-4 gap-2">
                {["Living Room", "Gallery", "Cafe", "Office"].map((room) => (
                  <div key={room} className="aspect-square bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center text-xs text-gray-400">
                    {room}
                  </div>
                ))}
              </div>
            )}

            {step >= 4 && (
              <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <div>
                  <p className="font-medium text-green-200">Simulation complete</p>
                  <p className="text-sm text-green-300/70">In the planned pipeline, SEO copy, tags and social assets would be generated here and sent for artist proof approval.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
