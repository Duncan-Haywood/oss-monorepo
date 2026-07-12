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
}

export interface UpsertClientVoicePackInput {
  leadSlug: string;
  variants: ClientVoiceScriptVariant[];
  generatedAt: string;
  generator: ClientVoicePackGeneratorKind;
}
