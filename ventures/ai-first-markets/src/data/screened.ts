import type { ScreenedIdea } from "@/lib/types";

/**
 * Ideas researched during evaluation cycles and deliberately not carried
 * forward. This exists so the next cycle does not re-derive the same
 * conclusions, and so each rejection stays falsifiable — every entry names the
 * condition under which it should be re-opened.
 */
export const screenedIdeas: ScreenedIdea[] = [
  {
    name: "AI search visibility monitoring (AEO/GEO)",
    category: "data-product",
    thesis:
      "Track how often a brand is cited inside ChatGPT, Perplexity, Gemini, and AI Overviews, and sell the dashboard to marketing teams.",
    reason:
      "The category consolidated before a solo operator could enter it. Profound and Peec AI have raised roughly $58M and $30M respectively, both anchor at about $95–$400/month for the tier a small buyer wants, and at least ten funded tools now compete on the same prompt-sampling method. There is no data asset here that a well-capitalised competitor cannot rebuild in a quarter, and the sampling approach itself is the product.",
    revisitIf:
      "A model provider ships a first-party citation-analytics API, which would move the moat from sampling volume to interpretation — a place where a small operator can compete.",
    screen: "crowded",
  },
  {
    name: "Building permit lead intelligence",
    category: "data-product",
    thesis:
      "Resell enriched building-permit data as contractor and supplier leads for a specific trade and metro.",
    reason:
      "The national dataset is already assembled and licensed: Shovels and BuildZoom sit at $300–$2,000+/month with 164M+ geocoded permits and 2,000+ jurisdictions covered. Building the ingest independently is a multi-year data-operations project, and licensing it puts a $599/month floor under the cost of goods before the first customer, which breaks the margin profile this portfolio is selecting for.",
    revisitIf:
      "A specific vertical wedge appears where permit data is an input rather than the product, and the licensed cost can be spread across enough customers to stop dominating COGS.",
    screen: "economics",
  },
  {
    name: "EU AI Act high-risk compliance suite",
    category: "vertical-saas",
    thesis:
      "Conformity assessment tooling, technical documentation, and a model registry for providers of Annex III high-risk AI systems.",
    reason:
      "The forcing function moved. The Digital Omnibus on AI entered into force on 27 July 2026 and deferred high-risk obligations for standalone Annex III systems from August 2026 to December 2027, and to August 2028 for AI embedded in regulated products. Harmonised standards are not ready either, so the requirements a product would encode are still unsettled. Building against a moving specification for a deadline eighteen months out is the wrong use of an explore budget.",
    revisitIf:
      "Harmonised standards publish and the December 2027 date holds through one more legislative cycle — at that point the specification is stable and the deadline is close enough to create urgency.",
    screen: "platform-risk",
  },
  {
    name: "LLM observability and evaluation platform",
    category: "devtools",
    thesis:
      "Tracing, evals, and quality alerting for teams running LLM applications in production.",
    reason:
      "Genuinely large and growing, and entirely unsuitable for a solo operator. The credible open-source options — Langfuse (acquired by ClickHouse in January 2026), Phoenix, Opik, OpenLLMetry — are free, self-hostable, and well-funded, which caps pricing at the low end while the enterprise end demands a security and support posture no zero-employee business can staff.",
    revisitIf:
      "A narrow vertical evaluation niche emerges where domain-specific scoring rubrics, not infrastructure, are the product.",
    screen: "crowded",
  },
  {
    name: "Accessibility overlay widget",
    category: "vertical-saas",
    thesis:
      "A single JavaScript include that adapts any site at runtime and is sold as an accessibility fix.",
    reason:
      "Rejected on ethics before economics. Overlays repeatedly lose in court, draw regulator attention, and are opposed by the disabled users they claim to serve — they frequently make screen-reader navigation worse. The revenue is real and the business is indefensible on the merits. This is why the Accessibility Regression Gate is scoped to source-code fixes and explicitly refuses to certify compliance.",
    revisitIf: "Never.",
    screen: "liability",
  },
  {
    name: "AI bookkeeping and financial close",
    category: "vertical-saas",
    thesis:
      "Automated categorisation, reconciliation, and month-end close for small businesses.",
    reason:
      "The liability shape is wrong for a business with no humans in it. Errors land in tax filings and lender-facing statements, the work sits adjacent to licensed accounting practice, and the product requires custody of bank credentials and financial records. Correct operation would require exactly the human review layer the portfolio is trying to avoid.",
    revisitIf:
      "A narrow, read-only analytics wedge appears that never touches the ledger and never produces a filed figure.",
    screen: "liability",
  },
  {
    name: "Failed-payment recovery / dunning",
    category: "vertical-saas",
    thesis:
      "Retry logic, recovery emails, and card-updater flows sold as a share of recovered revenue.",
    reason:
      "Excellent margins and a real problem, but the platform owns it. Stripe's native smart retries and card-account-updater capture most of the recoverable revenue by default, which leaves an independent tool competing for the residual while taking on payment-adjacent data handling and PCI scope questions. Attractive economics on paper, thin and shrinking in practice.",
    revisitIf:
      "A billing platform with meaningful volume and no native recovery becomes the wedge — usage-based and metered billing stacks are the place to look.",
    screen: "platform-risk",
  },
  {
    name: "Scraped-data resale",
    category: "data-product",
    thesis:
      "Aggregate data from sites that prohibit automated collection and sell it as a research or lead product.",
    reason:
      "Excluded categorically rather than case by case. Collection against terms of service, contract claims, and database rights create exposure that no amount of margin justifies, and it is exactly the kind of business that cannot be defended in public. The portfolio's data products are restricted to public records, official open-data endpoints, and feeds whose terms permit automated access.",
    revisitIf: "Never as stated. Licensed or open data only.",
    screen: "liability",
  },
  {
    name: "Automated outbound SDR agent",
    category: "ai-agent",
    thesis:
      "AI agents that research prospects and run cold email and LinkedIn sequences at volume.",
    reason:
      "Declined on ethics and durability together. The product works by externalising its cost onto recipients, it depends on tactics that platform enforcement and anti-spam law are actively tightening against, and customer accounts get burned when enforcement lands. A business whose unit economics require other people's attention to be free is not one this portfolio wants to own.",
    revisitIf:
      "Reframed as inbound or opt-in only, where the recipient asked to be contacted — a different business with different economics.",
    screen: "liability",
  },
  {
    name: "Consumer legal, medical, or immigration advice bots",
    category: "ai-agent",
    thesis:
      "Direct-to-consumer AI answering questions in a licensed professional domain.",
    reason:
      "Unauthorized practice, reliance harm to people in vulnerable situations, and no realistic way for a zero-employee business to maintain a qualified review layer. The same underlying capability is sold safely one layer back, to professionals who supply their own licensed judgement — which is how the Contract Review API in the active portfolio is scoped.",
    revisitIf:
      "Never direct-to-consumer. Professional-facing tooling only.",
    screen: "liability",
  },
];
