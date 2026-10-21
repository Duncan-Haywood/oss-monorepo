// The site assistant's background worker (served as /pf-ai-worker.js).
//
// Holds the two heavy things the assistant can opt into, so neither ever runs
// on the page's main thread: a language model (WebLLM on WebGPU, or the same
// model as a GGUF through wllama, llama.cpp compiled to WebAssembly, on a
// browser with no hardware WebGPU) and speech recognition (Whisper tiny.en
// through Transformers.js). Neither library is
// fetched until the visitor has asked for it in the panel, and both are pinned
// to an exact version. The model files come from huggingface.co and are kept
// in this browser's Cache Storage by the libraries, so the second load reads
// from disk rather than the network.
//
// Messages in:  { id, type: 'llm-load', model, gguf, ggufBytes } | { id, type: 'llm-chat', messages, json, maxTokens }
//               { id, type: 'stt-load' } | { id, type: 'stt', audio: Float32Array (16 kHz mono) }
// Messages out: { type: 'progress', kind: 'llm'|'stt', progress: 0..1, text }
//               { id, type: 'token', text } | { id, type: 'done', ... } | { id, type: 'error', message }

const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm';
const WHISPER_MODEL = 'onnx-community/whisper-tiny.en';
// The CPU path. One WASM build serves one or many threads; GitHub Pages cannot
// send the cross-origin isolation headers threads need, so on the live site it
// runs on one thread (measured: docs/reports/2026-10-21-wasm-on-the-site.md).
const WLLAMA = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js';
const WLLAMA_WASM = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/wasm/wllama.wasm';

let engine = null;
let engineModel = '';
let cpu = null;
let cpuModel = '';
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
      const adapter = await self.navigator.gpu?.requestAdapter().catch(() => null);
      // No adapter, or a software one (SwiftShader: a cloud session's never
      // finished a reply in 15 minutes), means the CPU build of the same model.
      if (!adapter || adapter.isFallbackAdapter || adapter.info?.isFallbackAdapter) {
        if (!data.gguf) throw new Error('no WebGPU adapter is available in this browser');
        if (!cpu || cpuModel !== data.gguf) {
          // wllama stores the file before loading it, and a load bigger than the
          // storage left never finishes (seen with the 1.1 GB model in a 930 MB
          // profile), so say so up front.
          const est = await self.navigator.storage?.estimate?.().catch(() => null);
          if (est && data.ggufBytes && est.quota - est.usage < data.ggufBytes) {
            throw new Error(`this browser lets the site store ${Math.floor((est.quota - est.usage) / 1e6)} MB, and the model needs ${Math.ceil(data.ggufBytes / 1e6)} MB; pick the smaller model or free some disk space`);
          }
          const { Wllama } = await import(WLLAMA);
          if (engine) { await engine.unload(); engine = null; engineModel = ''; }
          if (cpu) await cpu.exit();
          cpu = new Wllama({ default: WLLAMA_WASM }, { suppressNativeLog: true });
          await cpu.loadModelFromUrl(data.gguf, {
            n_ctx: 4096,
            n_gpu_layers: 0,
            progressCallback: ({ loaded, total }) => post({ type: 'progress', kind: 'llm', progress: total ? loaded / total : 0, text: `${Math.round(loaded / 1e6)} of ${Math.round(total / 1e6)} MB` }),
          });
          cpuModel = data.gguf;
        }
        post({ id, type: 'done', model, backend: 'wasm', threads: cpu.getNumThreads() });
        return;
      }
      if (!adapter.features.has('shader-f16')) model = model.replace('q4f16_1', 'q4f32_1');
      if (!engine || engineModel !== model) {
        const webllm = await import(WEBLLM);
        if (engine) await engine.unload();
        if (cpu) { await cpu.exit(); cpu = null; cpuModel = ''; }
        engine = await webllm.CreateMLCEngine(model, {
          initProgressCallback: (r) => post({ type: 'progress', kind: 'llm', progress: r.progress, text: r.text }),
        });
        engineModel = model;
      }
      post({ id, type: 'done', model, backend: 'webgpu' });
    } else if (type === 'llm-chat' && cpu) {
      // wllama takes the same OpenAI-shaped request; the schema goes in as
      // json_schema, which llama.cpp turns into a grammar.
      const request = {
        messages: data.messages,
        temperature: data.json ? 0 : 0.3,
        max_tokens: data.maxTokens || 500,
      };
      if (data.json) {
        request.response_format = { type: 'json_schema', json_schema: { name: 'fill', schema: JSON.parse(data.json) } };
        const reply = await cpu.createChatCompletion(request);
        post({ id, type: 'done', text: reply.choices[0]?.message?.content || '' });
      } else {
        let text = '';
        await cpu.createChatCompletion({
          ...request,
          stream: true,
          onData: (chunk) => {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) { text += delta; post({ id, type: 'token', text: delta }); }
          },
        });
        post({ id, type: 'done', text });
      }
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
