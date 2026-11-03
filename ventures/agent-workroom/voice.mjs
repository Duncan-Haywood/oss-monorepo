// Push-to-talk for the headset room. Two engines, picked by what the browser has:
//
// - "native": the browser's SpeechRecognition (Chrome, Edge, Android). Audio
//   goes to the browser maker's speech service, as in the 2D room.
// - "local": Whisper tiny (English) run on this device with transformers.js.
//   For browsers without SpeechRecognition, which as far as we can tell
//   includes Meta Quest Browser. The model (~41 MB) is fetched once from
//   Hugging Face, then cached by the browser; audio never leaves the device.
//
// press() starts listening, release() stops and hands the words to onText.

import { downsample, rms, cleanTranscript } from "./xr.mjs";

export const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";
export const WHISPER_MODEL = "Xenova/whisper-tiny.en";
const MAX_SECONDS = 15;

export function nativeRecognition() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

/**
 * onText(text)    - what was said, already tidied; never called with "".
 * onStatus(s, d)  - "idle" | "listening" | "loading" | "transcribing" | "error", with a sentence for the panel.
 * prefer          - "auto" | "local": "local" skips the browser's speech service even where it exists.
 */
export function createVoice({ onText, onStatus, prefer = "auto", lang = "en-US" }) {
  const Native = prefer === "auto" ? nativeRecognition() : null;
  const mode = Native ? "native" : globalThis.navigator?.mediaDevices?.getUserMedia ? "local" : "none";
  let active = null;
  let transcriber = null;
  let loading = null;

  const status = (s, detail = "") => onStatus?.(s, detail);

  async function loadModel() {
    if (transcriber) return transcriber;
    if (!loading) {
      loading = (async () => {
        status("loading", "Fetching the on-device speech model (about 41 MB, once)…");
        const { pipeline, env } = await import(TRANSFORMERS_URL);
        env.allowLocalModels = false;
        // 8-bit weights on WebAssembly: ~41 MB and runs everywhere. WebGPU
        // would want fp32 weights, a ~150 MB download, for a model this small.
        transcriber = await pipeline("automatic-speech-recognition", WHISPER_MODEL, { dtype: "q8", device: "wasm" });
        // If this load started from a press, the person is still talking: don't flip the panel to "ready" under them.
        if (!active) status("idle", "On-device speech is ready. Hold grip (or A/X) and talk.");
        return transcriber;
      })().catch((err) => {
        loading = null;
        status("error", `Couldn't load the speech model: ${err?.message || err}.`);
        throw err;
      });
    }
    return loading;
  }

  function pressNative() {
    const rec = new Native();
    rec.lang = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    let interim = "";
    rec.onresult = (e) => {
      interim = "";
      for (const res of e.results) (res.isFinal ? (finalText = res[0].transcript) : (interim += res[0].transcript));
      status("listening", `Heard: ${finalText || interim}`);
    };
    rec.onerror = (e) => status("error", e.error === "not-allowed" ? "Microphone access was refused." : `Voice stopped: ${e.error}.`);
    rec.onend = () => {
      active = null;
      const text = cleanTranscript(finalText || interim);
      status("idle", text ? "" : "Didn't catch that.");
      if (text) onText(text);
    };
    rec.start();
    active = { stop: () => rec.stop() };
    status("listening", "Listening… let go when you're done.");
  }

  async function pressLocal() {
    active = { pending: true };
    const model = loadModel(); // in parallel with asking for the microphone
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      active = null;
      return status("error", "Microphone access was refused.");
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but needs no extra module file, and a few
    // seconds of push-to-talk is well within what it handles.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    let length = 0;
    node.onaudioprocess = (e) => {
      if (length > ctx.sampleRate * MAX_SECONDS) return;
      const data = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(data));
      length += data.length;
    };
    source.connect(node);
    node.connect(ctx.destination);
    const wasReleased = active.released;
    active = {
      stop: async () => {
        active = null;
        node.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        const rate = ctx.sampleRate;
        ctx.close();
        const all = new Float32Array(length);
        let at = 0;
        for (const c of chunks) { all.set(c, at); at += c.length; }
        const audio = downsample(all, rate, 16000);
        if (audio.length < 16000 * 0.3 || rms(audio) < 0.004) return status("idle", "Didn't hear anything. Hold the button while you talk.");
        try {
          const asr = await model;
          status("transcribing", "Working out what you said…");
          const out = await asr(audio);
          const text = cleanTranscript(out?.text);
          status("idle", text ? "" : "Didn't catch that.");
          if (text) onText(text);
        } catch {
          /* loadModel already said why */
        }
      },
    };
    status("listening", "Listening… let go when you're done.");
    if (wasReleased) active.stop();
  }

  return {
    mode,
    get listening() {
      return Boolean(active);
    },
    /** Download the local model ahead of time (a button on the page, so the first press isn't a wait). */
    prepare: () => (mode === "local" ? loadModel() : Promise.resolve()),
    press() {
      if (active) return;
      if (mode === "native") return pressNative();
      if (mode === "local") return pressLocal();
      status("error", "This browser can't record audio here. Point and press the trigger instead.");
    },
    release() {
      if (!active) return;
      if (active.pending) active.released = true; // still waiting for the microphone
      else active.stop();
    },
    toggle() {
      if (active) this.release();
      else this.press();
    },
  };
}
