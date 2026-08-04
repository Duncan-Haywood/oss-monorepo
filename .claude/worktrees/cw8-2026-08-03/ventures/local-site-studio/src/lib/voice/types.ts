/**
 * Client voice (Complete tier) FAQ/script pack types.
 * See /docs/voice-agent-flow + /docs/product-bundles.
 */

export type ClientVoiceScriptType =
  | "inbound_greeting"
  | "hours_faq"
  | "services_faq"
  | "booking_cta"
  | "after_hours"
  | "take_a_message";

export interface ClientVoiceBusinessContext {
  businessName: string;
  category: string;
  city: string;
  state?: string;
  phone?: string;
  hours?: string;
  services: string[];
  tagline?: string;
  tone?: "friendly" | "professional" | "casual";
}

export interface GenerateClientVoiceRequest {
  leadId: string;
  scriptTypes: ClientVoiceScriptType[];
  business: ClientVoiceBusinessContext;
}

export interface ClientVoiceScriptVariant {
  scriptType: ClientVoiceScriptType;
  title: string;
  body: string;
  /** Optional spoken CTA / next-step line. */
  cta?: string;
}

export interface GenerateClientVoiceResponse {
  leadId: string;
  variants: ClientVoiceScriptVariant[];
  generatedAt: string;
}

export interface ClientVoiceGenerator {
  generate(request: GenerateClientVoiceRequest): Promise<GenerateClientVoiceResponse>;
}
