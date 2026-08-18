import type { ReportMeta } from "@/lib/types";

export const reports: ReportMeta[] = [
  {
    slug: "executive-summary",
    title: "Executive Summary",
    description:
      "Portfolio overview of software-first, AI-first business ideas evaluated for solo-founder viability.",
    type: "overview",
  },
  {
    slug: "path-to-100k",
    title: "Path to $100k ARR",
    description:
      "Ranked ideas with fastest, most realistic routes to $100k annual recurring revenue with zero employees.",
    type: "comparison",
    arrFocus: "100k",
  },
  {
    slug: "path-to-1m",
    title: "Path to $1M ARR",
    description:
      "Ideas with credible scaling paths to $1M ARR through automation, AI leverage, and software distribution.",
    type: "comparison",
    arrFocus: "1m",
  },
  {
    slug: "ai-automation-playbook",
    title: "AI + Zero-Employee Playbook",
    description:
      "Operational blueprint for running a software business with AI agents instead of employees.",
    type: "playbook",
  },
  {
    slug: "scoring-methodology",
    title: "Scoring Methodology",
    description:
      "How ideas are evaluated across AI leverage, automation, time-to-revenue, margin, defensibility, and distribution.",
    type: "deep-dive",
  },
  {
    slug: "liability-screen",
    title: "Liability & Ethics Screen",
    description:
      "Residual legal exposure per idea, the controls that contain it, and the ideas that were researched and deliberately declined.",
    type: "deep-dive",
  },
  {
    slug: "category-analysis",
    title: "Category Analysis",
    description:
      "Comparative analysis across AI agents, devtools, vertical SaaS, API infrastructure, and content automation.",
    type: "deep-dive",
  },
];

export function getReportBySlug(slug: string): ReportMeta | undefined {
  return reports.find((report) => report.slug === slug);
}
