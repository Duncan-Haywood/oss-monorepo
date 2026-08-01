"use client";

import { useEffect, useState } from "react";

type ShareInsightModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  headline: string;
  discovery: string;
  /**
   * Omitted when no alignment score has been computed for this couple. There
   * is no default: a shared card carries the recipient's first impression of
   * the product, so an invented percentage would be a fabricated result.
   */
  alignmentPct?: number;
  coupleNames?: { mine: string; theirs: string };
};

export function ShareInsightModal({
  isOpen,
  onClose,
  title,
  headline,
  discovery,
  alignmentPct,
  coupleNames = { mine: "You", theirs: "Partner" },
}: ShareInsightModalProps) {
  const [includeScore, setIncludeScore] = useState(true);
  const [includeArchetype, setIncludeArchetype] = useState(true);
  const [copied, setCopied] = useState(false);
  // The share link has to point at wherever this build is actually served
  // from. A hardcoded host sends every recipient off-product, which is the
  // one thing a share must never do.
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!isOpen) return null;

  const hasScore = typeof alignmentPct === "number";
  const showScore = hasScore && includeScore;
  const host = origin.replace(/^https?:\/\//, "");

  const shareText = `✨ ${coupleNames.mine} & ${coupleNames.theirs}'s Relationship Insight:\n` +
    (includeArchetype ? `🎯 "${headline}"\n` : "") +
    (showScore ? `📊 Alignment Score: ${alignmentPct}%\n` : "") +
    `💡 "${discovery}"\n\n` +
    (origin
      ? `Discover how well you and your partner align on Quick Pick: ${origin}`
      : `Discover how well you and your partner align on Quick Pick.`);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Relationship Insight: ${title}`,
          text: shareText,
          ...(origin ? { url: origin } : {}),
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopy();
    }
  };

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white border border-neutral-200 p-6 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center space-x-2">
            <span className="text-xl">✨</span>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Share Relationship Insight</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Visual Card Preview */}
        <div className="my-5 rounded-xl bg-purple-900 p-5 border border-purple-800 text-white shadow-inner">
          <div className="flex justify-between items-start mb-3 bg-purple-900">
            <span className="text-xs font-mono uppercase tracking-wider text-purple-100 bg-purple-900 font-semibold">
              Quick Pick • Relationship Card
            </span>
            {showScore && (
              <span className="px-2.5 py-0.5 rounded-full bg-purple-800 text-purple-100 text-xs font-bold border border-purple-600">
                {alignmentPct}% Aligned
              </span>
            )}
          </div>
          {includeArchetype && (
            <h4 className="text-xl font-bold text-white bg-purple-900">
              {headline}
            </h4>
          )}
          <p className="mt-2 text-sm text-purple-100 leading-relaxed bg-purple-900">
            {discovery}
          </p>
          <div className="mt-4 pt-3 border-t border-purple-800 flex justify-between items-center text-xs text-purple-100 font-medium bg-purple-900">
            <span>{coupleNames.mine} &amp; {coupleNames.theirs}</span>
            {host && (
              <span className="text-purple-100 font-semibold bg-purple-900">{host}</span>
            )}
          </div>
        </div>

        {/* Privacy Toggles */}
        <div className="space-y-2 mb-6">
          <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-2">Privacy &amp; Display Options</p>
          <label className="flex items-center space-x-3 text-sm text-neutral-800 dark:text-neutral-200 cursor-pointer">
            <input
              type="checkbox"
              checked={includeArchetype}
              onChange={(e) => setIncludeArchetype(e.target.checked)}
              className="rounded border-neutral-400 text-purple-600 dark:text-purple-400 focus:ring-purple-600"
            />
            <span>Include Relationship Archetype</span>
          </label>
          {hasScore && (
            <label className="flex items-center space-x-3 text-sm text-neutral-800 dark:text-neutral-200 cursor-pointer">
              <input
                type="checkbox"
                checked={includeScore}
                onChange={(e) => setIncludeScore(e.target.checked)}
                className="rounded border-neutral-400 text-purple-600 dark:text-purple-400 focus:ring-purple-600"
              />
              <span>Include Alignment Score ({alignmentPct}%)</span>
            </label>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleNativeShare}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-purple-700 text-white font-medium text-sm transition shadow"
          >
            <span>📱</span>
            <span>Share via Phone</span>
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-800 text-white font-medium text-sm transition"
          >
            <span>💬</span>
            <span>Share to WhatsApp</span>
          </a>

          <button
            onClick={handleCopy}
            className="sm:col-span-2 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-neutral-100 text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700 font-medium text-sm transition"
          >
            <span>{copied ? "✓" : "📋"}</span>
            <span>{copied ? "Copied to Clipboard!" : "Copy Text & Link"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
