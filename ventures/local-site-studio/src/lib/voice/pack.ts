/**
 * Persisted client voice FAQ/script pack for a paid Complete lead.
 * One row per lead — regenerating replaces the pack (not month-keyed).
 */

import type { ClientVoiceScriptVariant } from "./types";

export type ClientVoicePackGeneratorKind = "stub" | "anthropic";

export interface ClientVoicePack {
  id: string;
  leadSlug: string;
  variants: ClientVoiceScriptVariant[];
  generatedAt: string;
  generator: ClientVoicePackGeneratorKind;
  /**
   * Set once sendClientVoicePackToClientEmail resolved { success: true } for
   * this pack — regenerating the pack (upsertClientVoicePack) always clears
   * it, since new script content has not yet been sent. Mirrors
   * MarketingPack.sentToClientAt (see
   * marketing-voice-pack-client-send-visibility).
   */
  sentToClientAt?: string;
}

export interface UpsertClientVoicePackInput {
  leadSlug: string;
  variants: ClientVoiceScriptVariant[];
  generatedAt: string;
  generator: ClientVoicePackGeneratorKind;
}
