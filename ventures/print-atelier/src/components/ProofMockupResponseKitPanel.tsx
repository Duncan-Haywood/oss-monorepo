"use client";

import { useMemo, useState } from "react";
import { Copy, Image as ImageIcon, Mail, MessageSquare, Send } from "lucide-react";
import { buildProofMockupKitsForQueue, type ProofMockupResponseKit } from "@/lib/outreach";

function KitCard({ kit }: { kit: ProofMockupResponseKit }) {
  const [copied, setCopied] = useState<"dm" | "email" | null>(null);

  const copyText = async (text: string, channel: "dm" | "email") => {
    await navigator.clipboard.writeText(text);
    setCopied(channel);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <article className="rounded-xl border border-violet-200 bg-white p-6 dark:border-violet-900/40 dark:bg-gray-800">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{kit.artistName}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{kit.prospectHandle}</p>
          {kit.artworkTitle && (
            <p className="mt-1 text-sm font-medium text-violet-700 dark:text-violet-300">
              Catalog: {kit.artworkTitle}
            </p>
          )}
        </div>
        <span
          className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${
            kit.readyToSend
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          }`}
        >
          {kit.readyToSend ? "Ready to send" : "Blocked — fix catalog gaps"}
        </span>
      </div>

      {kit.blockers.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-amber-700 dark:text-amber-300">
          {kit.blockers.map((blocker) => (
            <li key={blocker}>• {blocker}</li>
          ))}
        </ul>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {kit.roomScenes.map((scene) => (
          <div
            key={scene.id}
            className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-gray-500">
              <ImageIcon className="h-3.5 w-3.5" />
              {scene.roomLabel}
            </div>
            <p className="mt-2 text-sm text-gray-800 dark:text-gray-200">{scene.previewLabel}</p>
            <p className="mt-1 text-xs text-gray-500">
              {scene.hasApprovedAsset ? "Approved asset" : "Pending generation"}
            </p>
          </div>
        ))}
      </div>

      {kit.payoutProof && (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="font-medium">Payout proof</p>
          <p className="mt-1">{kit.payoutProof.payoutLine}</p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
              <MessageSquare className="h-3.5 w-3.5" />
              DM copy
            </span>
            <button
              type="button"
              onClick={() => copyText(kit.dmCopy, "dm")}
              className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 dark:text-violet-300"
            >
              <Copy className="h-3 w-3" />
              {copied === "dm" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{kit.dmCopy}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
              <Mail className="h-3.5 w-3.5" />
              Email copy
            </span>
            <button
              type="button"
              onClick={() => copyText(kit.emailCopy, "email")}
              className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 dark:text-violet-300"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied === "email" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300">{kit.emailCopy}</pre>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {kit.attachmentLabels.map((label) => (
          <span
            key={label}
            className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
          >
            {label}
          </span>
        ))}
      </div>
    </article>
  );
}

export default function ProofMockupResponseKitPanel() {
  const kits = useMemo(() => buildProofMockupKitsForQueue(), []);
  const readyCount = kits.filter((kit) => kit.readyToSend).length;

  return (
    <section className="mb-8 rounded-xl border border-violet-200 bg-violet-50 p-6 dark:border-violet-900/40 dark:bg-violet-950/20">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-violet-900 dark:text-violet-100">
            <Send className="h-5 w-5" />
            Proof-mockup response kits
          </h2>
          <p className="mt-1 text-sm text-violet-800/80 dark:text-violet-200/80">
            Turn &quot;send examples&quot; replies into room scenes, payout proof, and copy-paste DM/email drafts.
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-violet-900 dark:text-violet-100">{readyCount}/{kits.length}</p>
          <p className="text-xs text-violet-700 dark:text-violet-300">Kits ready to send</p>
        </div>
      </div>

      <div className="space-y-6">
        {kits.map((kit) => (
          <KitCard key={kit.prospectHandle} kit={kit} />
        ))}
      </div>
    </section>
  );
}
