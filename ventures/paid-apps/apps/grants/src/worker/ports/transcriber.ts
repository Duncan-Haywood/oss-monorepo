// Speech-to-text for dictation and voice interviews.
export interface Transcriber {
  transcribe(audio: ArrayBuffer, mimeType: string): Promise<{ text: string }>;
}
