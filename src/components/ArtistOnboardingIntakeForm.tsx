"use client";

import {
  calculateArtistOnboardingReadiness,
  createEmptyArtistOnboardingIntake,
  linkCaptureSessionToIntake,
  loadArtistOnboardingIntakesFromStorage,
  submitArtistOnboardingIntake,
  type ArtistOnboardingIntake,
  type ArtistOnboardingSource,
  upsertArtistOnboardingIntake,
} from "@/lib/artist-onboarding";
import { loadCaptureSessionsFromStorage } from "@/lib/capture";
import { CheckCircle2, Link2, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const MEDIUM_OPTIONS = [
  "Oil painting",
  "Acrylic",
  "Watercolor",
  "Digital illustration",
  "Photography",
  "Mixed media",
];

const CONSENT_LABELS = {
  podLicense: "POD print license — I retain copyright; Print Atelier may fulfill prints",
  adRights: "Paid ad rights — artwork may appear in Meta/Google/Pinterest campaigns",
  aiRoomScenes: "AI room scenes — mockups may show my art in styled interiors",
  payoutAcknowledgement: "Payout terms — I understand the 30% net-profit share after costs",
} as const;

type ArtistOnboardingIntakeFormProps = {
  initialOutreachHandle?: string;
  initialSource?: ArtistOnboardingSource;
};

export default function ArtistOnboardingIntakeForm({
  initialOutreachHandle,
  initialSource = "direct",
}: ArtistOnboardingIntakeFormProps) {
  const [intake, setIntake] = useState<ArtistOnboardingIntake>(() =>
    createEmptyArtistOnboardingIntake({
      sourceChannel: initialSource,
      outreachHandle: initialOutreachHandle ?? null,
    }),
  );
  const [savedIntakes, setSavedIntakes] = useState<ArtistOnboardingIntake[]>([]);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const captureSessions = useMemo(() => loadCaptureSessionsFromStorage(), [savedIntakes]);

  const readiness = useMemo(() => calculateArtistOnboardingReadiness(intake), [intake]);

  useEffect(() => {
    setSavedIntakes(loadArtistOnboardingIntakesFromStorage());
  }, []);

  const updateField = <K extends keyof ArtistOnboardingIntake>(key: K, value: ArtistOnboardingIntake[K]) => {
    setIntake((prev) => ({ ...prev, [key]: value, updatedAt: new Date().toISOString() }));
    setSubmitMessage(null);
  };

  const toggleConsent = (key: keyof typeof CONSENT_LABELS) => {
    setIntake((prev) => ({
      ...prev,
      consent: { ...prev.consent, [key]: !prev.consent[key] },
      updatedAt: new Date().toISOString(),
    }));
    setSubmitMessage(null);
  };

  const handleSaveDraft = () => {
    const next = upsertArtistOnboardingIntake({ ...intake, status: "draft" });
    setSavedIntakes(next);
    setSubmitMessage("Draft saved locally — ready for Convex migration when backend ships.");
  };

  const handleSubmit = () => {
    const { intake: submitted, validation } = submitArtistOnboardingIntake(intake);
    if (!validation.valid) {
      setSubmitMessage(validation.errors[0] ?? "Complete required fields");
      return;
    }
    const next = upsertArtistOnboardingIntake(submitted);
    setIntake(submitted);
    setSavedIntakes(next);
    setSubmitMessage("Intake submitted — ops will verify payout guardrails before listing goes live.");
  };

  const handleLinkCapture = (sessionId: string) => {
    const linked = linkCaptureSessionToIntake(intake, sessionId);
    setIntake(linked);
    setSubmitMessage(`Linked capture session ${sessionId}`);
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-stone-200 dark:border-gray-700 pb-6">
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
          Artist onboarding
        </p>
        <h1 className="text-3xl font-bold mt-1 text-stone-900 dark:text-white">Join Print Atelier</h1>
        <p className="text-stone-600 dark:text-gray-300 mt-2 max-w-2xl">
          Self-serve intake before backend persistence — profile, rights consent, and capture upload link
          in one flow. Data saves to localStorage until the Convex vertical slice ships.
        </p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-lg">Profile</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-gray-300">Full name</span>
                <input
                  className="mt-1 w-full rounded-lg border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2"
                  value={intake.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="Alex Jenkins"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-gray-300">Email</span>
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2"
                  value={intake.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="alex@studio.com"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-gray-300">Handle</span>
                <input
                  className="mt-1 w-full rounded-lg border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2"
                  value={intake.handle}
                  onChange={(e) => updateField("handle", e.target.value)}
                  placeholder="@alexjenkinsart"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-gray-300">Portfolio URL</span>
                <input
                  className="mt-1 w-full rounded-lg border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2"
                  value={intake.portfolioUrl}
                  onChange={(e) => updateField("portfolioUrl", e.target.value)}
                  placeholder="https://instagram.com/..."
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-600 dark:text-gray-300">Primary medium</span>
                <select
                  className="mt-1 w-full rounded-lg border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2"
                  value={intake.medium}
                  onChange={(e) => updateField("medium", e.target.value)}
                >
                  <option value="">Select medium</option>
                  {MEDIUM_OPTIONS.map((medium) => (
                    <option key={medium} value={medium}>
                      {medium}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {initialOutreachHandle && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Referred from outreach: {initialOutreachHandle}
              </p>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-xl p-6 space-y-3">
            <h2 className="font-semibold text-lg">Rights & payout consent</h2>
            {(Object.keys(CONSENT_LABELS) as Array<keyof typeof CONSENT_LABELS>).map((key) => (
              <label
                key={key}
                className="flex items-start gap-3 p-3 rounded-lg border border-stone-100 dark:border-gray-700 cursor-pointer hover:bg-stone-50 dark:hover:bg-gray-700/50"
              >
                <input
                  type="checkbox"
                  checked={intake.consent[key]}
                  onChange={() => toggleConsent(key)}
                  className="mt-1"
                />
                <span className="text-sm text-stone-700 dark:text-gray-200">{CONSENT_LABELS[key]}</span>
              </label>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-semibold text-lg">Capture upload</h2>
              <Link
                href="/capture"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Upload className="w-4 h-4" />
                Open capture app
              </Link>
            </div>
            {captureSessions.length === 0 ? (
              <p className="text-sm text-stone-500">
                No capture sessions yet. Upload artwork in the capture app, then link the session here.
              </p>
            ) : (
              <div className="space-y-2">
                {captureSessions.slice(0, 5).map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    onClick={() => handleLinkCapture(session.sessionId)}
                    className={`w-full flex items-center justify-between gap-3 text-left px-4 py-3 rounded-lg border text-sm transition ${
                      intake.captureSessionId === session.sessionId
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                        : "border-stone-200 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    <span>
                      {session.fileName} · {session.stage}
                    </span>
                    <Link2 className="w-4 h-4 shrink-0 text-stone-400" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="px-4 py-2 border border-stone-300 dark:border-gray-600 rounded-lg text-sm font-medium hover:bg-stone-50 dark:hover:bg-gray-700"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Submit intake
            </button>
          </div>
          {submitMessage && (
            <p className="text-sm text-stone-600 dark:text-gray-300 bg-stone-50 dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-lg px-4 py-3">
              {submitMessage}
            </p>
          )}
        </div>

        <aside className="space-y-4">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider opacity-80">Onboarding readiness</p>
            <p className="text-4xl font-bold mt-2 tabular-nums">{readiness.score}%</p>
            <p className="text-sm mt-2 opacity-90 capitalize">{readiness.status.replace("_", " ")}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-stone-500">Completed</h3>
            <ul className="space-y-2 text-sm">
              {readiness.completedSteps.map((step) => (
                <li key={step} className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {step}
                </li>
              ))}
              {readiness.completedSteps.length === 0 && (
                <li className="text-stone-500">No steps completed yet</li>
              )}
            </ul>
          </div>
          {readiness.blockers.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
              <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-200 mb-2">Blockers</h3>
              <ul className="text-sm text-amber-900/80 dark:text-amber-100/80 space-y-1 list-disc pl-4">
                {readiness.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-stone-600 dark:text-gray-300">
            <strong>Next:</strong> {readiness.nextAction}
          </p>
          {savedIntakes.length > 0 && (
            <div className="text-xs text-stone-500">
              {savedIntakes.length} intake(s) saved locally · status: {intake.status}
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
