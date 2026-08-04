/**
 * virtual-staging-tech.ts — answers STRATEGY.md's open "on-device vs cloud
 * for virtual staging" question with desk research, the same treatment
 * mls-compliance.ts gave the MLS-compliance open question.
 *
 * Scope: this is about the future "Polish" step (STRATEGY.md's 5-step
 * workflow: Guide -> Enhance -> Polish -> Deliver -> Brand) — specifically
 * AI virtual staging (furnishing empty/vacant rooms), not the Enhance step
 * pipeline/ already does today (exposure/white-balance/sharpen, which stays
 * local regardless — see decisions-log.ts's "Enhancement pipeline is a
 * local deterministic CLI" entry). Desk research (public pricing pages,
 * Apple ML research posts, iOS on-device diffusion tooling as of mid-2026),
 * not a benchmark run against real listing photos. Re-verify the specific
 * vendor/model choice once Polish is actually being built and there's real
 * volume data from concierge deliveries to size against.
 */

export type TechOption = {
  id: string;
  name: string;
  approach: "on_device" | "cloud_api";
  costModel: string;
  latency: string;
  tradeoffs: string;
  sources: string[];
};

export const virtualStagingTechOptions: TechOption[] = [
  {
    id: "cloud-per-image-api",
    name: "Pay-per-image cloud virtual-staging API (e.g. Virtual Staging AI, Apply Design, REimagineHome)",
    approach: "cloud_api",
    costModel:
      "Roughly $1-2/image at low volume via a dedicated API (Virtual Staging AI quotes ~$1/image); consumer subscription tools run $0.25-2/image at low monthly caps. No fixed monthly cost below a chosen plan; scales linearly with real usage.",
    latency: "Single-digit seconds to ~30 seconds per image, no local compute or model download required.",
    tradeoffs:
      "Zero fixed cost until a listing actually needs staging — matches the 'no spend of real money' guardrail (agents don't pre-pay anything; a per-listing API call would only ever be triggered by, and priced into, a real paid delivery). No iOS app or on-device ML infra needed, so it doesn't pull forward the phase-3 app-scope decision. Downside: ongoing per-image marginal cost (unlike the free local Enhance step), and a live network dependency during delivery.",
    sources: [
      "https://www.virtualstagingai.app/our-api",
      "https://www.virtualstagingai.app/prices",
      "https://thetooljury.com/best-ai-virtual-staging-tools-for-real-estate-in-2026/",
    ],
  },
  {
    id: "on-device-coreml-diffusion",
    name: "On-device Stable-Diffusion-class inpainting via Core ML (Apple Neural Engine)",
    approach: "on_device",
    costModel:
      "No per-image API cost once shipped, but real fixed engineering cost: converting/hosting model weights (multi-GB), an iOS app to run them in, and ongoing model maintenance.",
    latency:
      "~8-15 seconds/image on iPhone 15 Pro-class hardware for Stable-Diffusion-class models; slower or infeasible on older/non-Pro devices. Inpainting (needed to furnish a specific empty room without altering the rest of the photo) is supported by advanced on-device tooling (e.g. Draw Things) but is a meaningfully harder integration than basic image generation.",
    tradeoffs:
      "Only pays off at real scale and only inside an actual iOS app — both explicitly out of scope for phase 1-2 per STRATEGY.md's scope guard ('do not build the iOS app in phase 1') and every prior session's decision not to start p3-app-scope early. Also gates quality/availability by device tier (Pro-class iPhones only), which a $19 concierge offer aimed at 'good enough, fast, cheap' shouldn't take on this early.",
    sources: [
      "https://machinelearning.apple.com/research/stable-diffusion-coreml-apple-silicon",
      "https://github.com/apple/ml-stable-diffusion",
      "https://phonediffusion.com/blog/stable-diffusion-on-iphone",
    ],
  },
];

export type TechDecision = {
  choice: "cloud_api" | "on_device" | "hybrid";
  summary: string;
  revisitWhen: string;
};

export const virtualStagingTechDecision: TechDecision = {
  choice: "cloud_api",
  summary:
    "When the Polish step's virtual staging feature is actually built, call a pay-per-image cloud API rather than running on-device Core ML inference. Reasoning mirrors industry practice at Listing Lens's current volume: desk research on both real-estate-specific tools and general mobile-ML architecture agrees that under roughly 1,000 images/month, a pay-per-image API or low-tier subscription beats standing up dedicated (on-device or custom) infrastructure, and on-device only starts to pay for itself at high volume inside an app that already exists. Listing Lens has zero real deliveries yet (p2-first-deliveries is still human-blocked) and no iOS app (phase 3 not started), so cloud-per-call is the only option that adds zero fixed cost and doesn't require building app/ML infrastructure ahead of proven demand.",
  revisitWhen:
    "Revisit once (a) an iOS app exists (phase 3+) and (b) real monthly virtual-staging volume is high enough (desk research puts the crossover around 1,000-15,000 images/month) that a per-image API cost materially cuts into margin. Until then, keep Polish/virtual-staging entirely out of the automated pipeline/ CLI, consistent with the existing MLS-compliance guardrail that any virtual-staging feature defaults to the strictest disclosure behavior (visible caption + retain original) regardless of vendor.",
};
