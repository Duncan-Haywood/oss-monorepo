import {
  MAX_PACK_VARIANT_CTA_LENGTH,
  MAX_PACK_VARIANT_TITLE_LENGTH,
  softCapOptionalPackField,
  softCapPackBody,
  softCapPackHashtags,
} from "@/lib/packs/variant-fields";
import type {
  GenerateMarketingRequest,
  GenerateMarketingResponse,
  MarketingContentType,
  MarketingContentVariant,
  MarketingGenerator,
} from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

/**
 * Placeholder marketing generator — returns structured stubs until LLM keys are set.
 * Replace via setMarketingGenerator or AnthropicMarketingGenerator when ANTHROPIC_API_KEY is present.
 */
export class StubMarketingGenerator implements MarketingGenerator {
  async generate(request: GenerateMarketingRequest): Promise<GenerateMarketingResponse> {
    const { business, contentTypes, leadId } = request;
    const location = business.state
      ? `${business.city}, ${business.state}`
      : business.city;

    const variants = contentTypes.map((contentType, index) =>
      stubVariant(contentType, index, business.businessName, location, business),
    );

    return {
      leadId,
      variants,
      generatedAt: new Date().toISOString(),
    };
  }
}

function stubVariant(
  contentType: MarketingContentType,
  index: number,
  businessName: string,
  location: string,
  business: GenerateMarketingRequest["business"],
): MarketingContentVariant {
  const service = business.services[index % Math.max(business.services.length, 1)] ?? "our services";
  const hoursBit = business.hours ? `Hours: ${business.hours}.` : "Call for hours.";
  const phoneBit = business.phone ? `Reach us at ${business.phone}.` : "";
  const angle =
    index % 3 === 0 ? "this week" : index % 3 === 1 ? "for locals" : "with a special offer";

  const body =
    `[Stub ${index + 1}] ${businessName} in ${location} — ${service} ${angle}. ${hoursBit} ${phoneBit}`.trim();

  return {
    contentType,
    title:
      contentType === "local_seo_meta" || contentType === "email_campaign"
        ? `${businessName} | ${service} in ${business.city}`
        : contentType === "gbp_post"
          ? `${service} ${angle} — ${business.city}`
          : undefined,
    body,
    cta: business.phone ? `Call ${business.phone}` : "Visit us today",
    hashtags:
      contentType === "instagram_caption" || contentType === "facebook_caption"
        ? [`#${business.city.replace(/\s+/g, "")}`, `#${business.category}`, "#LocalBusiness"]
        : undefined,
  };
}

/**
 * Anthropic Messages API generator. Falls back to StubMarketingGenerator on any failure
 * so operators still get a usable monthly pack when the key is missing or the API errors.
 */
export class AnthropicMarketingGenerator implements MarketingGenerator {
  constructor(
    private readonly apiKey: string,
    private readonly fallback: MarketingGenerator = new StubMarketingGenerator(),
  ) {}

  async generate(request: GenerateMarketingRequest): Promise<GenerateMarketingResponse> {
    if (!this.apiKey.trim()) {
      return this.fallback.generate(request);
    }

    try {
      const variants = await this.generateViaAnthropic(request);
      if (variants.length !== request.contentTypes.length) {
        return this.fallback.generate(request);
      }
      return {
        leadId: request.leadId,
        variants,
        generatedAt: new Date().toISOString(),
        packageTier: request.automationLevel === "generate_schedule_optimize"
          ? "full_marketing"
          : "social_email",
      };
    } catch (error) {
      console.error("Anthropic marketing generation failed; using stub fallback", error);
      return this.fallback.generate(request);
    }
  }

  private async generateViaAnthropic(
    request: GenerateMarketingRequest,
  ): Promise<MarketingContentVariant[]> {
    const { business, contentTypes } = request;
    const location = business.state
      ? `${business.city}, ${business.state}`
      : business.city;

    const system = [
      "You write local small-business marketing copy.",
      "Every piece must include the business name, city, concrete services, accurate hours when provided, and a relevant CTA.",
      "Forbidden: generic AI slop, invented awards, wrong city, hashtag spam, fake statistics.",
      "Return ONLY valid JSON: an array of objects with keys contentType, title (optional string), body (string), cta (optional string), hashtags (optional string array).",
      "Array length and contentType values must match the requested contentTypes exactly, in order.",
    ].join(" ");

    const user = JSON.stringify({
      business: {
        businessName: business.businessName,
        category: business.category,
        location,
        phone: business.phone,
        hours: business.hours,
        services: business.services,
        tagline: business.tagline,
        tone: business.tone ?? "friendly",
      },
      contentTypes,
    });

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic HTTP ${response.status}: ${errText.slice(0, 500)}`);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = payload.content?.find((c) => c.type === "text")?.text;
    if (!text) {
      throw new Error("Anthropic response missing text content");
    }

    return parseVariantsJson(text, contentTypes);
  }
}

function parseVariantsJson(
  text: string,
  expectedTypes: MarketingContentType[],
): MarketingContentVariant[] {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("No JSON array in model response");
  }
  const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
  if (!Array.isArray(parsed) || parsed.length !== expectedTypes.length) {
    throw new Error("Model returned wrong variant count");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Variant ${index} is not an object`);
    }
    const row = item as Record<string, unknown>;
    const bodyRaw = typeof row.body === "string" ? row.body.trim() : "";
    if (!bodyRaw) {
      throw new Error(`Variant ${index} missing body`);
    }
    const expected = expectedTypes[index]!;
    return {
      contentType: expected,
      title: softCapOptionalPackField(row.title, MAX_PACK_VARIANT_TITLE_LENGTH),
      body: softCapPackBody(bodyRaw),
      cta: softCapOptionalPackField(row.cta, MAX_PACK_VARIANT_CTA_LENGTH),
      hashtags: softCapPackHashtags(row.hashtags),
    };
  });
}

let defaultGenerator: MarketingGenerator | null = null;

/** Prefer Anthropic when ANTHROPIC_API_KEY is set; otherwise stub. */
export function createDefaultMarketingGenerator(): MarketingGenerator {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (key) {
    return new AnthropicMarketingGenerator(key);
  }
  return new StubMarketingGenerator();
}

export function setMarketingGenerator(generator: MarketingGenerator): void {
  defaultGenerator = generator;
}

export function getMarketingGenerator(): MarketingGenerator {
  if (!defaultGenerator) {
    defaultGenerator = createDefaultMarketingGenerator();
  }
  return defaultGenerator;
}

/** Test helper — reset memoized default between Vitest cases. */
export function resetMarketingGeneratorForTests(): void {
  defaultGenerator = null;
}
