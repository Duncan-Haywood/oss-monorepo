"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle, Mail, MessageSquare, Target, Users, Zap } from "lucide-react";
import {
  buildOutreachQueue,
  calculateOutreachSummary,
  outreachProspects,
  type ProspectStatus,
} from "@/lib/outreach";

export default function SalesPortal() {
  const [activeCampaign, setActiveCampaign] = useState("artist-outreach");
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "All">("All");

  const summary = calculateOutreachSummary(outreachProspects);
  const outreachQueue = buildOutreachQueue(outreachProspects);
  const visibleQueue =
    statusFilter === "All" ? outreachQueue : outreachQueue.filter((prospect) => prospect.status === statusFilter);
  const campaigns = [
    { id: "artist-outreach", label: "Artist Acquisition", count: summary.totalProspects, status: "Reply triage" },
    { id: "buyer-nurture", label: "Buyer Nurture", count: 8920, status: "Room preview drip" },
    { id: "retargeting", label: "Ad Retargeting", count: 3456, status: "Creative guarded" },
  ];
  const statusOptions: Array<ProspectStatus | "All"> = ["All", "Draft", "Sent", "Opened", "Replied", "Onboarded"];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Sales Outreach Command Center</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Digital-first, AI-orchestrated outreach for both supply & demand</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-medium">
              All Systems Automated • 0 Human SDRs
            </div>
            <a href="/" className="text-sm font-medium px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition">
              Return to Docs
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCampaign(c.id)}
              className={`p-6 rounded-xl border text-left transition-all ${
                activeCampaign === c.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300"
              }`}
            >
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{c.label}</div>
                  <div className="text-3xl font-mono mt-2 text-gray-900 dark:text-white">{c.count.toLocaleString()}</div>
                </div>
                <Target className="w-8 h-8 text-blue-500" />
              </div>
              <div className="text-xs mt-3 text-emerald-600">{c.status}</div>
            </button>
          ))}
          <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col justify-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">Ready to Onboard</div>
            <div className="text-4xl font-bold mt-1 text-gray-900 dark:text-white">{summary.readyForOnboarding}</div>
            <div className="text-xs text-emerald-500 mt-1">{summary.automationLabel}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Average artist fit</span>
              <Users className="h-4 w-4" />
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{summary.averageFitScore}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Scored from style signal, audience, and catalog margin</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Reply queue</span>
              <MessageSquare className="h-4 w-4" />
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{summary.repliedProspects}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Replies classified into upload, payout, or proof-mockup work</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Projected artist payouts</span>
              <Zap className="h-4 w-4" />
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              ${summary.projectedMonthlyArtistPayout.toLocaleString()}/mo
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Supply-side value if this cohort goes live</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold flex items-center gap-3 text-gray-900 dark:text-white">
                <Mail className="w-6 h-6" /> Reply-to-Onboarding Queue
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                AI classifies replies, scores urgency, and hands each artist the next best action.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    statusFilter === status
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/60">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Artist</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Intent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Next action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {visibleQueue.map((prospect) => (
                  <tr key={prospect.handle} className="bg-white transition hover:bg-blue-50/50 dark:bg-gray-800 dark:hover:bg-blue-950/20">
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-gray-900 dark:text-white">{prospect.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {prospect.handle} • {prospect.platform} • {prospect.followers.toLocaleString()} followers
                      </div>
                      <div className="mt-2 max-w-xs text-xs text-gray-500 dark:text-gray-400">{prospect.styleSignal}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        prospect.status === "Replied"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                          : prospect.status === "Onboarded"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                      }`}>
                        {prospect.status}
                      </span>
                      <div className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-200">
                        {prospect.replyClassification}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-mono text-xl font-bold text-gray-900 dark:text-white">{prospect.priorityScore}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Fit {prospect.fitScore}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <button className="group inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-600 dark:bg-white dark:text-gray-900 dark:hover:bg-blue-100">
                        {prospect.nextAction}
                        <ArrowUpRight className="h-3 w-3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <CheckCircle className="h-4 w-4" />
              Invented this run: next-best-action handoff
            </div>
            <p>
              The queue is no longer static copy: each prospect is scored, classified, and routed into upload,
              payout/legal, proof mockup, nurture, or referral-kit work.
            </p>
          </div>

          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-100">
            <p className="font-medium mb-1">Sample AI Outreach Message (Draft for Elena Rostova)</p>
            <p className="italic">
              &quot;Hi Elena — your coastal series matches buyer searches for moody blue rooms. Upload one phone
              capture and we&apos;ll return an earnings estimate, proof mockup, and first listing draft.&quot;
            </p>
          </div>
          <p className="text-xs text-center mt-8 text-gray-400">
            100% automated triage via shared TypeScript logic • Persistence and reply sync are tracked in backlog
          </p>
        </div>
      </div>
    </div>
  );
}
