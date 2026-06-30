import type {
  GenerateMarketingRequest,
  GenerateMarketingResponse,
  MarketingGenerator,
} from "./types";

/**
 * Placeholder marketing generator — returns structured stubs until LLM integration (Phase 7).
 * Replace with OpenAI/Anthropic implementation using brand voice from business context.
 */
export class StubMarketingGenerator implements MarketingGenerator {
  async generate(request: GenerateMarketingRequest): Promise<GenerateMarketingResponse> {
    const { business, contentTypes, leadId } = request;
    const location = business.state
      ? `${business.city}, ${business.state}`
      : business.city;

    const variants = contentTypes.map((contentType) => {
      const service = business.services[0] ?? "our services";
      return {
        contentType,
        title:
          contentType === "local_seo_meta"
            ? `${business.businessName} | ${service} in ${business.city}`
            : undefined,
        body: `[Stub] ${business.businessName} in ${location} — ${service}. ${
          business.hours ? `Hours: ${business.hours}.` : "Call for hours."
        } ${business.phone ? `Reach us at ${business.phone}.` : ""}`.trim(),
        cta: business.phone ? `Call ${business.phone}` : "Visit us today",
      };
    });

    return {
      leadId,
      variants,
      generatedAt: new Date().toISOString(),
    };
  }
}

let defaultGenerator: MarketingGenerator = new StubMarketingGenerator();

export function setMarketingGenerator(generator: MarketingGenerator): void {
  defaultGenerator = generator;
}

export function getMarketingGenerator(): MarketingGenerator {
  return defaultGenerator;
}
