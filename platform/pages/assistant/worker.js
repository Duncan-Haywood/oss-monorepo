// The site assistant's background worker (served as /pf-ai-worker.js).
//
// Holds the two heavy things the assistant can opt into, so neither ever runs
// on the page's main thread: a language model (WebLLM, WebGPU) and speech
// recognition (Whisper tiny.en through Transformers.js). Neither library is
// fetched until the visitor has asked for it in the panel, and both are pinned
// to an exact version. The model files come from huggingface.co and are kept
// in this browser's Cache Storage by the libraries, so the second load reads
// from disk rather than the network.
//
// Messages in:  { id, type: 'llm-load', model } | { id, type: 'llm-chat', messages, json, maxTokens }
//               { id, type: 'stt-load' } | { id, type: 'stt', audio: Float32Array (16 kHz mono) }
// Messages out: { type: 'progress', kind: 'llm'|'stt', progress: 0..1, text }
//               { id, type: 'token', text } | { id, type: 'done', ... } | { id, type: 'error', message }

const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm';
const WHISPER_MODEL = 'onnx-community/whisper-tiny.en';

let engine = null;
let engineModel = '';
let asr = null;
const post = (message) => self.postMessage(message);

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'llm-load') {
      // The q4f16 builds need 16-bit float shaders. A GPU without them (many
      // integrated and software adapters) gets the q4f32 build of the same
      // model instead: same download size, a little more GPU memory.
      let model = data.model;
      const adapter = await self.navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error('no WebGPU adapter is available in this browser');
      if (!adapter.features.has('shader-f16')) model = model.replace('q4f16_1', 'q4f32_1');
      if (!engine || engineModel !== model) {
        const webllm = await import(WEBLLM);
        if (engine) await engine.unload();
        engine = await webllm.CreateMLCEngine(model, {
          initProgressCallback: (r) => post({ type: 'progress', kind: 'llm', progress: r.progress, text: r.text }),
        });
        engineModel = model;
      }
      post({ id, type: 'done', model });
    } else if (type === 'llm-chat') {
      if (!engine) throw new Error('the on-device model is not loaded');
      const request = {
        messages: data.messages,
        temperature: data.json ? 0 : 0.3,
        max_tokens: data.maxTokens || 500,
        stream: !data.json,
      };
      // A JSON schema makes the model's output grammar-constrained: a small
      // model can then only produce an object of the form's own fields.
      if (data.json) request.response_format = { type: 'json_object', schema: data.json };
      if (data.json) {
        const reply = await engine.chat.completions.create(request);
        post({ id, type: 'done', text: reply.choices[0]?.message?.content || '' });
      } else {
        let text = '';
        for await (const chunk of await engine.chat.completions.create(request)) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) { text += delta; post({ id, type: 'token', text: delta }); }
        }
        post({ id, type: 'done', text });
      }
    } else if (type === 'stt-load') {
      if (!asr) {
        const { pipeline } = await import(TRANSFORMERS);
        const files = new Map();
        asr = await pipeline('automatic-speech-recognition', WHISPER_MODEL, {
          // 4-bit weights: 96 MB, and the transcript matched fp32's (151 MB) word
          // for word on the test clip. The 8-bit files (41 MB) fail to load in
          // this onnxruntime-web ("Missing required scale"), measured 2026-10-20.
          dtype: 'q4',
          device: 'wasm',
          progress_callback: (p) => {
            if (p.status !== 'progress' || !p.total) return;
            files.set(p.file, [p.loaded, p.total]);
            let loaded = 0;
            let total = 0;
            for (const [l, t] of files.values()) { loaded += l; total += t; }
            post({ type: 'progress', kind: 'stt', progress: loaded / total, text: `${Math.round(loaded / 1e6)} of ${Math.round(total / 1e6)} MB` });
          },
        });
      }
      post({ id, type: 'done' });
    } else if (type === 'stt') {
      if (!asr) throw new Error('speech recognition is not loaded');
      const out = await asr(data.audio);
      post({ id, type: 'done', text: String(out.text || '').trim() });
    }
  } catch (e) {
    post({ id, type: 'error', message: String((e && e.message) || e) });
  }
};
