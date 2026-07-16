import {
  MAX_PACK_VARIANT_CTA_LENGTH,
  MAX_PACK_VARIANT_TITLE_LENGTH,
  softCapOptionalPackField,
  softCapPackBody,
  softCapPackField,
} from "@/lib/packs/variant-fields";
import type {
  ClientVoiceBusinessContext,
  ClientVoiceGenerator,
  ClientVoiceScriptType,
  ClientVoiceScriptVariant,
  GenerateClientVoiceRequest,
  GenerateClientVoiceResponse,
} from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

/**
 * Placeholder client-voice generator — structured stubs until LLM keys are set.
 */
export class StubClientVoiceGenerator implements ClientVoiceGenerator {
  async generate(request: GenerateClientVoiceRequest): Promise<GenerateClientVoiceResponse> {
    const { business, scriptTypes, leadId } = request;
    const location = business.state
      ? `${business.city}, ${business.state}`
      : business.city;

    const variants = scriptTypes.map((scriptType) =>
      stubVariant(scriptType, business.businessName, location, business),
    );

    return {
      leadId,
      variants,
      generatedAt: new Date().toISOString(),
    };
  }
}

function stubVariant(
  scriptType: ClientVoiceScriptType,
  businessName: string,
  location: string,
  business: ClientVoiceBusinessContext,
): ClientVoiceScriptVariant {
  const servicesList =
    business.services.length > 0
      ? business.services.join(", ")
      : "our services";
  const hoursBit = business.hours ?? "by appointment — please leave a message";
  const phoneBit = business.phone ? ` You can also reach us at ${business.phone}.` : "";

  switch (scriptType) {
    case "inbound_greeting":
      return {
        scriptType,
        title: "Inbound greeting",
        body: `Thanks for calling ${businessName}. I'm an automated assistant — how can I help you today?`,
        cta: "Ask how you can help (hours, services, or booking).",
      };
    case "hours_faq":
      return {
        scriptType,
        title: "Hours",
        body: `[Stub] ${businessName} in ${location} is open: ${hoursBit}.${phoneBit}`,
        cta: "Offer to take a message if outside those hours.",
      };
    case "services_faq":
      return {
        scriptType,
        title: "Services",
        body: `[Stub] At ${businessName} we offer: ${servicesList}. What are you looking for today?`,
        cta: "Match the caller to a service, then booking CTA.",
      };
    case "booking_cta":
      return {
        scriptType,
        title: "Booking",
        body: `[Stub] I can help you book with ${businessName}. Tell me a preferred day and time, or leave your name and number and someone will confirm shortly.${phoneBit}`,
        cta: "Collect name + callback number if no slot is confirmed live.",
      };
    case "after_hours":
      return {
        scriptType,
        title: "After hours",
        body: `[Stub] Thanks for calling ${businessName}. We're currently closed (${hoursBit}). Please leave your name, number, and a short message — we'll get back to you soon.`,
      };
    case "take_a_message":
      return {
        scriptType,
        title: "Take a message",
        body: `[Stub] Happy to take a message for ${businessName}. Can I get your name, best callback number, and a brief note about what you need?`,
        cta: "Repeat the details back, thank them, end call.",
      };
    default: {
      const _exhaustive: never = scriptType;
      return {
        scriptType: _exhaustive,
        title: "Script",
        body: `[Stub] ${businessName}`,
      };
    }
  }
}

/**
 * Anthropic Messages API generator. Falls back to StubClientVoiceGenerator on failure
 * so operators still get a usable FAQ pack when the key is missing or the API errors.
 */
export class AnthropicClientVoiceGenerator implements ClientVoiceGenerator {
  constructor(
    private readonly apiKey: string,
    private readonly fallback: ClientVoiceGenerator = new StubClientVoiceGenerator(),
  ) {}

  async generate(request: GenerateClientVoiceRequest): Promise<GenerateClientVoiceResponse> {
    if (!this.apiKey.trim()) {
      return this.fallback.generate(request);
    }

    try {
      const variants = await this.generateViaAnthropic(request);
      if (variants.length !== request.scriptTypes.length) {
        return this.fallback.generate(request);
      }
      return {
        leadId: request.leadId,
        variants,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Anthropic client-voice generation failed; using stub fallback", error);
      return this.fallback.generate(request);
    }
  }

  private async generateViaAnthropic(
    request: GenerateClientVoiceRequest,
  ): Promise<ClientVoiceScriptVariant[]> {
    const { business, scriptTypes } = request;
    const location = business.state
      ? `${business.city}, ${business.state}`
      : business.city;

    const system = [
      "You write short spoken phone scripts for a local small-business AI receptionist.",
      "Use the client's business name (never Local Site Studio or Maris Stella Labs).",
      "Disclose that the speaker is an automated assistant in the inbound greeting.",
      "Keep each body under 80 words, natural to speak aloud, accurate to provided hours/services/phone.",
      "Forbidden: inventing awards, wrong city, fake phone numbers, sales pitches for website packages.",
      "Return ONLY valid JSON: an array of objects with keys scriptType, title (string), body (string), cta (optional string).",
      "Array length and scriptType values must match the requested scriptTypes exactly, in order.",
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
      scriptTypes,
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
        max_tokens: 2048,
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

    return parseVariantsJson(text, scriptTypes);
  }
}

function parseVariantsJson(
  text: string,
  expectedTypes: ClientVoiceScriptType[],
): ClientVoiceScriptVariant[] {
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
    const title =
      softCapOptionalPackField(row.title, MAX_PACK_VARIANT_TITLE_LENGTH) ??
      softCapPackField(expected, MAX_PACK_VARIANT_TITLE_LENGTH);
    return {
      scriptType: expected,
      title,
      body: softCapPackBody(bodyRaw),
      cta: softCapOptionalPackField(row.cta, MAX_PACK_VARIANT_CTA_LENGTH),
    };
  });
}

let defaultGenerator: ClientVoiceGenerator | null = null;

/** Prefer Anthropic when ANTHROPIC_API_KEY is set; otherwise stub. */
export function createDefaultClientVoiceGenerator(): ClientVoiceGenerator {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (key) {
    return new AnthropicClientVoiceGenerator(key);
  }
  return new StubClientVoiceGenerator();
}

export function setClientVoiceGenerator(generator: ClientVoiceGenerator): void {
  defaultGenerator = generator;
}

export function getClientVoiceGenerator(): ClientVoiceGenerator {
  if (!defaultGenerator) {
    defaultGenerator = createDefaultClientVoiceGenerator();
  }
  return defaultGenerator;
}

/** Test helper — reset memoized default between Vitest cases. */
export function resetClientVoiceGeneratorForTests(): void {
  defaultGenerator = null;
}
