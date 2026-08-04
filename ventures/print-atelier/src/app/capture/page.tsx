"use client";

import DemoNav from "@/components/shared/DemoNav";
import {
  advanceCaptureStage,
  createCaptureSessionFromFile,
  formatFileSize,
  loadCaptureSessionsFromStorage,
  type CaptureProcessingStage,
  type CaptureUploadMetadata,
  upsertCaptureSession,
} from "@/lib/capture";
import { Camera, CheckCircle2, FileImage, Loader2, Sparkles, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Step = "guide" | "capture" | "processing" | "proof";

const processingStages: CaptureProcessingStage[] = [
  "edge-detect",
  "color-correct",
  "upscale",
  "mockups",
  "seo-copy",
  "complete",
];

const stageLabels: Record<CaptureProcessingStage, string> = {
  uploaded: "File received",
  "edge-detect": "Edge detection & deskew",
  "color-correct": "Color-checker LUT correction",
  upscale: "AI upscaling to print resolution",
  mockups: "Generating room mockups",
  "seo-copy": "Writing SEO product copy",
  complete: "Ready for artist review",
};

export default function CapturePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("guide");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [session, setSession] = useState<CaptureUploadMetadata | null>(null);
  const [recentSessions, setRecentSessions] = useState<CaptureUploadMetadata[]>([]);

  useEffect(() => {
    // Mount-only hydration from localStorage, which does not exist during SSR.
    // Reading it in a lazy initializer instead would make the server and client
    // first renders disagree. See EXC-015 in platform/exception-register.yaml.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentSessions(loadCaptureSessionsFromStorage());
  }, []);

  const runProcessingPipeline = (uploadSession: CaptureUploadMetadata) => {
    setStep("processing");
    setProcessingProgress(0);
    let progress = 0;
    let stageIndex = 0;

    const interval = setInterval(() => {
      progress += 20;
      setProcessingProgress(progress);
      if (stageIndex < processingStages.length) {
        const nextStage = processingStages[stageIndex];
        if (nextStage) {
          const updated = advanceCaptureStage(uploadSession, nextStage);
          setSession(updated);
          upsertCaptureSession(updated);
          stageIndex += 1;
        }
      }
      if (progress >= 100) {
        clearInterval(interval);
        const complete = advanceCaptureStage(uploadSession, "complete");
        setSession(complete);
        upsertCaptureSession(complete);
        setRecentSessions(loadCaptureSessionsFromStorage());
        setTimeout(() => setStep("proof"), 500);
      }
    }, 600);
  };

  const handleFileSelected = (file: File) => {
    const uploadSession = createCaptureSessionFromFile(file);
    setSession(uploadSession);
    upsertCaptureSession(uploadSession);
    setRecentSessions(loadCaptureSessionsFromStorage());
    setStep("capture");
    setTimeout(() => runProcessingPipeline(uploadSession), 800);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <DemoNav current="/capture" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
      />

      <div className="max-w-md mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <p className="text-indigo-400 text-sm font-medium mb-2">AI Capture App</p>
          <h1 className="text-2xl font-bold">Digitize Your Artwork</h1>
          <p className="text-gray-400 text-sm mt-2">
            Phase 2 prep — real file metadata persists locally until backend upload ships
          </p>
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
              onClick={openFilePicker}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 py-4 rounded-xl font-medium transition"
            >
              <Camera className="w-5 h-5" /> Upload or Capture Photo
            </button>
            {recentSessions.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <p className="text-xs text-gray-500 uppercase mb-2">Recent uploads (local)</p>
                <ul className="space-y-2 text-sm">
                  {recentSessions.slice(0, 3).map((item) => (
                    <li key={item.sessionId} className="flex items-center gap-2 text-gray-300">
                      <FileImage className="w-4 h-4 text-indigo-400" />
                      <span className="truncate">{item.fileName}</span>
                      <span className="text-xs text-gray-500 ml-auto">{item.stage}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === "capture" && session && (
          <div className="relative aspect-[3/4] bg-gray-900 rounded-2xl border-2 border-indigo-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-900/40 to-orange-800/40 flex flex-col items-center justify-center p-6 text-center">
              <FileImage className="w-12 h-12 text-indigo-300 mb-3" />
              <p className="font-medium">{session.fileName}</p>
              <p className="text-sm text-gray-400 mt-1">
                {formatFileSize(session.fileSizeBytes)} · {session.mimeType}
              </p>
              <p className="text-xs text-gray-500 mt-3">Session {session.sessionId}</p>
            </div>
          </div>
        )}

        {step === "processing" && session && (
          <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 text-center">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto mb-6" />
            <h2 className="font-bold text-lg mb-2">AI Processing Pipeline</h2>
            <p className="text-xs text-gray-500 mb-4">{session.fileName}</p>
            <div className="space-y-2 text-sm text-gray-400 mb-6 text-left max-w-xs mx-auto">
              {processingStages.map((stage) => {
                const stageOrder = processingStages.indexOf(stage);
                const currentOrder = processingStages.indexOf(
                  session.stage === "uploaded" ? "edge-detect" : session.stage,
                );
                const done = currentOrder >= stageOrder || session.stage === "complete";
                return (
                  <div key={stage} className={`flex items-center gap-2 ${done ? "text-green-400" : ""}`}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                    {stageLabels[stage]}
                  </div>
                );
              })}
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
          </div>
        )}

        {step === "proof" && session && (
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
                <h3 className="font-bold">{session.titleSuggestion ?? "Untitled artwork"}</h3>
                <p className="text-sm text-gray-400">16×20 Archival Print • From $85</p>
                <p className="text-xs text-gray-500 mt-2">
                  Metadata persisted: {session.sessionId} · {formatFileSize(session.fileSizeBytes)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  SEO title auto-generated: &quot;Warm Autumn Forest Canvas Print — Museum Quality&quot;
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep("guide");
                  setSession(null);
                }}
                className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-300 hover:bg-gray-800 transition"
              >
                Retake
              </button>
              <button className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 font-medium flex items-center justify-center gap-2 transition">
                <Upload className="w-4 h-4" /> Approve & Publish
              </button>
            </div>
            <p className="text-center text-xs text-gray-500">
              Upload metadata stored in localStorage — next step: Convex/Supabase job queue + R2 storage
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
