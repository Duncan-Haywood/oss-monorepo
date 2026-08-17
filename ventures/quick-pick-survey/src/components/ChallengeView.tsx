"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { recordUsage } from "@/lib/usageClient";

interface ChallengeData {
  inviteCode: string;
  deckId: string;
  createdAt: string;
  isRedeemed: boolean;
  challengerNames: string;
  challengedNames: string | null;
}

interface UserSession {
  id: string;
  firstName: string;
  email: string;
}

interface CoupleStatus {
  couple: {
    id: string;
    inviteCode: string;
    creatorId: string;
    joinerId: string | null;
  } | null;
  partner: { id: string; firstName: string } | null;
}

export function ChallengeView({ code }: { code: string }) {
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [coupleInfo, setCoupleInfo] = useState<CoupleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch challenge info (public)
      const res = await fetch(`/api/couple/challenge/${code}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("This challenge link does not exist or has expired.");
        } else {
          setError("Failed to load challenge details. Please check your connection.");
        }
        setLoading(false);
        return;
      }
      const data: ChallengeData = await res.json();
      setChallenge(data);

      // 2. Fetch session probe
      const authRes = await fetch("/api/auth/me").catch(() => null);
      if (authRes && authRes.ok) {
        const authData = await authRes.json();
        if (authData.user) {
          setUser(authData.user);
          // 3. Fetch couple status
          const coupleRes = await fetch("/api/couple/compare").catch(() => null);
          if (coupleRes && coupleRes.ok) {
            const cData = await coupleRes.json();
            setCoupleInfo(cData);
          }
        }
      }
    } catch (err) {
      console.error("Challenge load failed", err);
      setError("Unable to connect to Pairwise. Please check your network and try again.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
    recordUsage("route_view", { domain: "couple-challenge", path: `/couple/challenge/${code}` });
  }, [loadData, code]);

  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError(null);

    try {
      const res = await fetch(`/api/couple/challenge/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setAcceptError(errData.error || "Failed to accept challenge.");
        setAccepting(false);
        return;
      }

      setAccepted(true);
      recordUsage("couple_joined", { domain: "couple-challenge", success: true });
    } catch (err) {
      console.error("Accept failed", err);
      setAcceptError("Network error while accepting challenge. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Loading challenge details…
        </p>
      </div>
    );
  }

  if (error || !challenge) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div
          role="alert"
          aria-live="polite"
          className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/30"
        >
          <span className="text-3xl">⚠️</span>
          <h2 className="mt-2 text-lg font-bold text-red-900 dark:text-red-200">
            Challenge Not Found
          </h2>
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">
            {error || "We couldn't find this challenge."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={loadData}
              className="rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-600 transition"
            >
              Retry
            </button>
            <Link
              href="/"
              className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPaired = coupleInfo && coupleInfo.couple && coupleInfo.partner;
  const isRedeemed = challenge.isRedeemed || accepted;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      {/* Header Badge */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3.5 py-1 text-xs font-bold text-purple-900 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
          ✨ Couple Alignment Showdown
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-neutral-900 dark:text-white sm:text-4xl">
          {challenge.challengerNames} challenged you!
        </h1>
        <p className="mt-3 text-base text-neutral-600 dark:text-neutral-300 max-w-lg mx-auto">
          Compare your relationship values and priorities side-by-side with {challenge.challengerNames}.
        </p>
      </div>

      {/* Main Challenge Card */}
      <div className="mt-8 overflow-hidden rounded-3xl border border-purple-200 bg-white/80 p-6 shadow-xl backdrop-blur-sm dark:border-purple-900/60 dark:bg-neutral-900/90 sm:p-8">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-5 dark:border-neutral-800">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">
              Challenge Deck
            </span>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white capitalize">
              {challenge.deckId.replace(/-/g, " ")}
            </h2>
          </div>
          <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            {isRedeemed ? "Accepted" : "Open Challenge"}
          </span>
        </div>

        {/* Action states */}
        <div className="mt-6 space-y-4">
          {accepted ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-5 dark:border-green-900/50 dark:bg-green-950/40 text-center">
              <span className="text-2xl">🎉</span>
              <h3 className="mt-2 text-lg font-bold text-green-900 dark:text-green-200">
                Challenge Accepted!
              </h3>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                You and your partner are now linked in this showdown. Head to your couples dashboard to explore your alignment comparisons.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <Link
                  href="/couple"
                  className="rounded-xl bg-green-700 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-green-600 transition"
                >
                  View Couple Dashboard
                </Link>
                <Link
                  href={`/app?survey=${challenge.deckId}`}
                  className="rounded-xl border border-green-300 bg-white px-5 py-2.5 text-sm font-bold text-green-800 hover:bg-green-50 dark:border-green-800 dark:bg-neutral-900 dark:text-green-200 dark:hover:bg-neutral-800"
                >
                  Take {challenge.deckId.replace(/-/g, " ")} Survey
                </Link>
              </div>
            </div>
          ) : user && isPaired ? (
            <div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-4">
                You are signed in as <strong>{user.firstName}</strong> (paired with{" "}
                <strong>{coupleInfo?.partner?.firstName}</strong>).
              </p>
              {acceptError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                >
                  {acceptError}
                </div>
              )}
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full rounded-2xl bg-purple-700 bg-gradient-to-r from-purple-700 to-pink-700 py-3.5 text-center text-sm font-bold text-white shadow-lg transition hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
              >
                {accepting ? "Accepting Challenge…" : `Accept Showdown with ${challenge.challengerNames}`}
              </button>
            </div>
          ) : user && !isPaired ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/40 text-center">
              <span className="text-2xl">🔗</span>
              <h3 className="mt-2 text-base font-bold text-amber-900 dark:text-amber-200">
                Link Your Partner First
              </h3>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                Couple showdowns compare two paired couples. Invite your partner to Pairwise to unlock mutual comparisons!
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <Link
                  href="/couple"
                  className="rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-amber-600 transition"
                >
                  Pair with Partner
                </Link>
                <Link
                  href={`/app?survey=${challenge.deckId}`}
                  className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-neutral-900 dark:text-amber-200"
                >
                  Try Survey Solo
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Take the fast, 2-minute pairwise survey to discover your top values and compare with friends.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Link
                  href={`/app?survey=${challenge.deckId}`}
                  className="flex-1 rounded-2xl bg-purple-700 bg-gradient-to-r from-purple-700 to-pink-700 py-3.5 text-center text-sm font-bold text-white shadow-lg transition hover:from-purple-600 hover:to-pink-600"
                >
                  Start 2-Minute Survey (Free)
                </Link>
                <Link
                  href="/login"
                  className="flex-1 rounded-2xl border border-neutral-300 bg-white py-3.5 text-center text-sm font-bold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
                >
                  Sign In / Create Account
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* How it Works / Privacy Section */}
      <div className="mt-12 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
          How Couple Showdowns Work
        </h3>
        <ul className="mt-4 space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          <li className="flex items-start gap-2">
            <span className="text-purple-700 dark:text-purple-400 font-bold">1.</span>
            <span>Each partner makes quick, intuitive choices between pairs of values.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-700 dark:text-purple-400 font-bold">2.</span>
            <span>Our Bradley-Terry statistical engine measures preference strength and shared ground.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-700 dark:text-purple-400 font-bold">3.</span>
            <span>
              <strong>100% Privacy Preserving:</strong> Only aggregate theme alignments and conversation starters are shared — individual answers are never revealed.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
