"use client";

import DemoNav from "@/components/shared/DemoNav";
import { Camera, CheckCircle2, Loader2, Sparkles, Upload } from "lucide-react";
import { useState } from "react";

type Step = "guide" | "capture" | "processing" | "proof";

export default function CapturePage() {
  const [step, setStep] = useState<Step>("guide");
  const [processingProgress, setProcessingProgress] = useState(0);

  const startCapture = () => {
    setStep("capture");
    setTimeout(() => {
      setStep("processing");
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        setProcessingProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(() => setStep("proof"), 500);
        }
      }, 600);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <DemoNav current="/capture" />

      <div className="max-w-md mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <p className="text-indigo-400 text-sm font-medium mb-2">AI Capture App</p>
          <h1 className="text-2xl font-bold">Digitize Your Artwork</h1>
          <p className="text-gray-400 text-sm mt-2">Self-serve onboarding hook — instant mockup preview</p>
        </div>

        {step === "guide" && (
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
              <h2 className="font-bold mb-4">Before You Shoot</h2>
              <ul className="space-y-3 text-sm text-gray-300">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  Place artwork flat against a neutral wall
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  Include the color-checker card in frame (we&apos;ll mail you one)
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  Use natural, even lighting — avoid shadows
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  Hold phone parallel to the canvas surface
                </li>
              </ul>
            </div>
            <button
              onClick={startCapture}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 py-4 rounded-xl font-medium transition"
            >
              <Camera className="w-5 h-5" /> Open Camera
            </button>
          </div>
        )}

        {step === "capture" && (
          <div className="relative aspect-[3/4] bg-gray-900 rounded-2xl border-2 border-dashed border-indigo-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-900/40 to-orange-800/40 flex items-center justify-center">
              <div className="w-4/5 aspect-[4/5] border-2 border-white/50 rounded-lg relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-white/20 px-3 py-1 rounded-full">
                  Align canvas within frame
                </div>
                <div className="absolute bottom-4 right-4 w-12 h-8 bg-white/30 rounded border border-white/50" />
              </div>
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center animate-pulse">
                <Camera className="w-8 h-8 text-gray-900" />
              </div>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 text-center">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto mb-6" />
            <h2 className="font-bold text-lg mb-2">AI Processing Pipeline</h2>
            <div className="space-y-2 text-sm text-gray-400 mb-6 text-left max-w-xs mx-auto">
              {[
                { label: "Edge detection & deskew", done: processingProgress >= 20 },
                { label: "Color-checker LUT correction", done: processingProgress >= 40 },
                { label: "AI upscaling to print resolution", done: processingProgress >= 60 },
                { label: "Generating room mockups", done: processingProgress >= 80 },
                { label: "Writing SEO product copy", done: processingProgress >= 100 },
              ].map((item) => (
                <div key={item.label} className={`flex items-center gap-2 ${item.done ? "text-green-400" : ""}`}>
                  {item.done ? <CheckCircle2 className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                  {item.label}
                </div>
              ))}
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div className="bg-indigo-500 h-2 rounded-full transition-all duration-300" style={{ width: `${processingProgress}%` }} />
            </div>
          </div>
        )}

        {step === "proof" && (
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
              <div className="aspect-[4/3] bg-gradient-to-br from-amber-800 to-orange-900 relative">
                <div className="absolute inset-0 flex items-end justify-center pb-0">
                  <div className="w-full h-1/3 bg-gradient-to-t from-gray-900/80 to-transparent" />
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="text-xs text-gray-300 mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> AI Room Mockup Preview
                  </p>
                  <div className="w-1/3 aspect-[3/4] bg-gradient-to-br from-amber-700 to-orange-800 rounded shadow-2xl mx-auto border border-white/10" />
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-bold">Autumn Canopy</h3>
                <p className="text-sm text-gray-400">16×20 Archival Print • From $85</p>
                <p className="text-xs text-gray-500 mt-2">SEO title auto-generated: &quot;Warm Autumn Forest Canvas Print — Museum Quality&quot;</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-300 hover:bg-gray-800 transition">
                Retake
              </button>
              <button className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 font-medium flex items-center justify-center gap-2 transition">
                <Upload className="w-4 h-4" /> Approve & Publish
              </button>
            </div>
            <p className="text-center text-xs text-gray-500">
              This instant mockup is the onboarding hook referenced in GTM Phase 1 outreach
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
