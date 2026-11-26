// Tour scripts. Targets are `data-tour` attribute values placed on existing elements of each page;
// a step whose target isn't rendered (e.g. no flags yet) is skipped. Copy follows content/help.ts.
import { HELP } from "@client/content/help";
import type { TourDef } from "./tour";

export const FACT_BASE_TOUR: TourDef = {
  id: "fact-base",
  title: "What we know tour",
  steps: [
    {
      target: "facts-status-tabs",
      title: "Proposed vs confirmed",
      body: `${HELP.proposed_fact.short} ${HELP.confirmed_fact.short}`,
    },
    {
      target: "fact-card",
      title: "Every fact shows where it came from",
      body: "Each fact keeps the exact quote and the document or interview it came from. Open the source if you're unsure, then confirm, edit or reject it.",
    },
    {
      target: "facts-add",
      title: "Add what's missing",
      body: "Type a fact in yourself when you know it's true. Facts you enter are confirmed straight away.",
    },
    {
      target: "facts-coverage",
      title: "See the gaps",
      body: HELP.coverage.short,
    },
  ],
};

export const APPLICATION_REVIEW_TOUR: TourDef = {
  id: "application-review",
  title: "Reviewing a draft",
  steps: [
    {
      target: "app-summary",
      title: "Start with the summary",
      body: "This is what the draft says, in short, and how well it is backed by your facts.",
    },
    {
      target: "app-flags",
      title: "Flags need a person",
      body: `${HELP.flag.short} Blockers must be resolved before you can approve.`,
    },
    {
      target: "app-citations",
      title: "Check a few citations",
      body: `${HELP.citation.short} ${HELP.grounding.short}`,
    },
    {
      target: "app-approve",
      title: "Approve or ask for changes",
      body: `When you're happy, approve. ${HELP.review_tier.short}`,
    },
  ],
};

export const AUTOMATION_TOUR: TourDef = {
  id: "automation",
  title: "Automation settings tour",
  steps: [
    {
      target: "automation-levels",
      title: "Choose how much we do on our own",
      body: `${HELP.automation_level.short} You can lower it at any time.`,
    },
    {
      target: "automation-checkpoints",
      title: "Your checkpoints",
      body: "Each level comes with places where a person signs off. You can add more checkpoints, but some are locked on at higher levels.",
    },
    {
      target: "automation-safety-rails",
      title: "Safety rails always apply",
      body: HELP.safety_rails.short,
    },
    {
      target: "automation-save",
      title: "Save when you're ready",
      body: "Nothing changes until you save. Raising the level asks an admin for explicit consent first.",
    },
  ],
};

export const TOURS = [FACT_BASE_TOUR, APPLICATION_REVIEW_TOUR, AUTOMATION_TOUR] as const;
