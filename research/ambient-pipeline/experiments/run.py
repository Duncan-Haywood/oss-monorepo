"""Measure a CPU streaming pipeline: VAD -> ASR -> LLM -> TTS.

Usage: AMBIENT_MODELS=/path/to/models python experiments/run.py
Needs the optional `models` dependencies and these files in AMBIENT_MODELS:
  voice.onnx(+.json)   Piper en_US-lessac-low
  qwen.gguf            Qwen2.5-0.5B-Instruct Q4_K_M
faster-whisper downloads Systran/faster-whisper-tiny.en on first use.
All "recordings" are synthetic (Piper), see README for what that leaves out.
"""
import gc
import json
import os
import platform
import resource
import statistics as st
import sys
import time

import numpy as np
import psutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from ambient_pipeline.budget import (FRAME_MS, Stages, endpoint, first_sentence,  # noqa: E402
                                     required_speedup, wer)

M = os.environ.get("AMBIENT_MODELS", "/tmp/amb/models")
SR = 16000
FRAME = 512
UTTS = [
    "What time is the meeting with Priya tomorrow?",
    "Remind me to call the dentist after lunch on Thursday.",
    "I was thinking we could move the launch to the following week, since the testing is not finished and the team is tired.",
    "Add milk and eggs to the shopping list.",
    "How long does it take to boil an egg?",
    "Can you summarise what we decided about the budget in the last few minutes of the call?",
]
SYSTEM = "You are a concise voice assistant. Answer in one or two short sentences."
HANGOVERS = [200, 300, 500, 800]
TARGETS = [500, 1000, 2000]
REPEATS = 3
proc = psutil.Process()


def rss_mb():
    gc.collect()
    return proc.memory_info().rss / 2**20


def med(x):
    return st.median(x)


def load(name, fn):
    before = rss_mb()
    t = time.perf_counter()
    obj = fn()
    return obj, {"stage": name, "load_s": round(time.perf_counter() - t, 2),
                 "rss_delta_mb": round(rss_mb() - before, 0)}


def main():
    out = {"host": {"python": platform.python_version(), "cpus": os.cpu_count(),
                    "machine": platform.machine()}, "mem": [], "notes": []}
    base = rss_mb()
    out["mem"].append({"stage": "python+numpy baseline", "rss_mb": round(base)})

    # ---- TTS: build the synthetic recordings (also measured as the TTS stage later)
    from piper import PiperVoice, SynthesisConfig
    voice, mem = load("tts piper lessac-low", lambda: PiperVoice.load(f"{M}/voice.onnx"))
    out["mem"].append(mem)

    def synth(text):
        chunks = [c.audio_int16_array for c in voice.synthesize(text, SynthesisConfig(noise_scale=0.0, noise_w_scale=0.0))]
        a = np.concatenate(chunks).astype(np.float32) / 32768
        sr = voice.config.sample_rate
        n = int(len(a) * SR / sr)
        return np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)

    utt_audio = [synth(t) for t in UTTS]
    rng = np.random.default_rng(0)
    gap = np.zeros(int(1.5 * SR), np.float32)

    def true_end(a):  # last 10 ms window above 2% of the clip's peak RMS
        w = SR // 100
        rms = np.array([np.sqrt(np.mean(a[i:i + w] ** 2)) for i in range(0, len(a) - w, w)])
        idx = np.nonzero(rms > 0.02 * rms.max())[0]
        return (idx[-1] + 1) * w

    stream, truth, pos = [gap], [], len(gap)
    for a in utt_audio:
        s, e = pos, pos + true_end(a)
        truth.append((s, e))
        stream += [a, gap]
        pos += len(a) + len(gap)
    clean = np.concatenate(stream)
    sig_pow = np.mean(clean[np.abs(clean) > 1e-4] ** 2)
    noisy = clean + rng.normal(0, np.sqrt(sig_pow / 10 ** (20 / 10)), len(clean)).astype(np.float32)
    out["stream_s"] = round(len(clean) / SR, 1)
    out["utterance_audio_s"] = [round((e - s) / SR, 2) for s, e in truth]

    # ---- VAD
    from silero_vad_lite import SileroVAD
    vad, mem = load("vad silero", lambda: SileroVAD(SR))
    out["mem"].append(mem)
    assert vad.window_size_samples == FRAME
    out["vad"] = {}
    probs_by_cond = {}
    for cond, sig in (("clean", clean), ("noise_20dB", noisy)):
        vad.reset()
        times, probs = [], []
        for i in range(0, len(sig) - FRAME + 1, FRAME):
            f = np.ascontiguousarray(sig[i:i + FRAME])
            t = time.perf_counter()
            p = vad.process(memoryview(f))
            times.append(time.perf_counter() - t)
            probs.append(p)
        probs_by_cond[cond] = probs
        ms = np.array(times) * 1e3
        eps = {}
        for h in HANGOVERS:
            segs = endpoint(probs, h)
            delays, extra = [], 0
            for (s, e) in truth:
                hit = [g for g in segs if g["start_ms"] < e / SR * 1e3 and g["last_speech_ms"] > s / SR * 1e3]
                if hit:
                    delays.append(hit[-1]["detect_ms"] - e / SR * 1e3)
                    extra += len(hit) - 1
            spurious = sum(1 for g in segs if not any(g["start_ms"] < e / SR * 1e3 and g["last_speech_ms"] > s / SR * 1e3 for (s, e) in truth))
            eps[h] = {"segments": len(segs), "true": len(truth), "utterances_found": len(delays),
                      "splits": extra, "spurious": spurious,
                      "median_detect_after_true_end_ms": round(med(delays), 0) if delays else None,
                      "max_detect_after_true_end_ms": round(max(delays), 0) if delays else None}
        out["vad"][cond] = {"frame_ms_median": round(float(np.median(ms)), 3),
                            "frame_ms_p99": round(float(np.percentile(ms, 99)), 3),
                            "rtf": round(float(ms.sum() / 1e3 / (len(sig) / SR)), 4),
                            "endpointing": eps}
    # sanity: median delay should sit near the hangover (+ up to a frame)

    # ---- ASR (batch on the closed segment, 200 ms padding each side)
    from faster_whisper import WhisperModel
    asr = {}
    for threads in (1, 4):
        gc.collect()
        before = rss_mb()
        model = WhisperModel("tiny.en", device="cpu", compute_type="int8", cpu_threads=threads)
        if threads == 4:
            out["mem"].append({"stage": "asr faster-whisper tiny.en int8",
                               "rss_delta_mb": round(rss_mb() - before, 0)})
        pad = int(0.2 * SR)

        def run(a):
            t = time.perf_counter()
            segs, _ = model.transcribe(a, language="en", beam_size=1, temperature=0.0,
                                       condition_on_previous_text=False, vad_filter=False)
            txt = " ".join(s.text.strip() for s in segs)
            return txt, time.perf_counter() - t
        run(utt_audio[0])  # warm-up
        for cond, sig in (("clean", clean), ("noise_20dB", noisy)):
            rows = []
            for ref, (s, e) in zip(UTTS, truth):
                a = sig[max(0, s - pad):e + pad]
                ts = []
                for _ in range(REPEATS):
                    txt, dt = run(a)
                    ts.append(dt)
                rows.append({"ref": ref, "hyp": txt, "wer": wer(ref, txt),
                             "ms": med(ts) * 1e3, "audio_s": len(a) / SR})
            asr[(threads, cond)] = rows
        del model
    out["asr"] = {f"threads{t}_{c}": {
        "ms_median": round(med([r["ms"] for r in rows]), 0),
        "rtf_median": round(med([r["ms"] / 1e3 / r["audio_s"] for r in rows]), 3),
        "mean_wer": round(float(np.mean([r["wer"] for r in rows])), 3),
        "per_utt_ms": [round(r["ms"]) for r in rows],
        "hyps": [r["hyp"] for r in rows] if t == 4 else None}
        for (t, c), rows in asr.items()}
    hyps = [r["hyp"] for r in asr[(4, "clean")]]

    # ---- LLM
    from llama_cpp import Llama
    llm_out = {}
    sents = {}
    for threads in (1, 4):
        gc.collect()
        before = rss_mb()
        llm = Llama(model_path=f"{M}/qwen.gguf", n_ctx=512, n_threads=threads, verbose=False)
        if threads == 4:
            out["mem"].append({"stage": "llm qwen2.5-0.5b q4_k_m (ctx 512)",
                               "rss_delta_mb": round(rss_mb() - before, 0)})

        def reply(q):
            msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": q}]
            t0 = time.perf_counter()
            text, first_tok, first_sent, ntok = "", None, None, 0
            for ch in llm.create_chat_completion(messages=msgs, max_tokens=60, temperature=0.0,
                                                 stream=True):
                d = ch["choices"][0]["delta"].get("content")
                if not d:
                    continue
                now = time.perf_counter() - t0
                first_tok = first_tok if first_tok is not None else now
                ntok += 1
                text += d
                if first_sent is None and first_sentence(text) is not None:
                    first_sent = now
            total = time.perf_counter() - t0
            return {"text": text, "ttft": first_tok, "t_sent": first_sent if first_sent is not None else total,
                    "total": total, "ntok": ntok, "sent_seen": first_sent is not None}
        reply("Hello.")  # warm-up
        rows = []
        for q in hyps:
            rs = [reply(q) for _ in range(REPEATS)]
            r = rs[0]
            rows.append({"q": q, "text": r["text"], "ttft": med([x["ttft"] for x in rs]),
                         "t_sent": med([x["t_sent"] for x in rs]),
                         "tps": med([x["ntok"] / x["total"] for x in rs]),
                         "sent_seen": r["sent_seen"], "ntok": r["ntok"]})
        llm_out[threads] = rows
        if threads == 4:
            sents = [first_sentence(r["text"]) or r["text"] for r in rows]
        del llm
    out["llm"] = {f"threads{t}": {
        "ttft_ms_median": round(med([r["ttft"] for r in rows]) * 1e3),
        "first_sentence_ms_median": round(med([r["t_sent"] for r in rows]) * 1e3),
        "tokens_per_s_median": round(med([r["tps"] for r in rows]), 1),
        "per_utt_first_sentence_ms": [round(r["t_sent"] * 1e3) for r in rows],
        "replies": [r["text"] for r in rows] if t == 4 else None}
        for t, rows in llm_out.items()}

    # ---- TTS stage (first chunk latency and RTF) on the LLM's first sentences
    tts_rows = []
    voice.synthesize("Warm up.")
    for s in sents:
        ts_first, ts_tot, dur = [], [], 0
        for _ in range(REPEATS):
            t0 = time.perf_counter()
            first, n = None, 0
            for c in voice.synthesize(s):
                if first is None:
                    first = time.perf_counter() - t0
                n += len(c.audio_int16_array)
            ts_first.append(first)
            ts_tot.append(time.perf_counter() - t0)
            dur = n / voice.config.sample_rate
        tts_rows.append({"first_ms": med(ts_first) * 1e3, "rtf": med(ts_tot) / dur, "audio_s": dur})
    out["tts"] = {"first_chunk_ms_median": round(med([r["first_ms"] for r in tts_rows])),
                  "rtf_median": round(med([r["rtf"] for r in tts_rows]), 3),
                  "per_utt_first_chunk_ms": [round(r["first_ms"]) for r in tts_rows]}

    # ---- budget: per-utterance reply latency from end of speech to first audio out
    out["budget"] = {}
    # hangover as measured: median endpoint-fire time after the energy-based end of speech
    hang_ms = {h: out["vad"]["clean"]["endpointing"][h]["median_detect_after_true_end_ms"] for h in HANGOVERS}
    for h in HANGOVERS:
        lat = []
        for i in range(len(UTTS)):
            s = Stages(hang_ms[h], out["vad"]["clean"]["frame_ms_median"] * 1,
                       asr[(4, "clean")][i]["ms"],
                       llm_out[4][i]["t_sent"] * 1e3, tts_rows[i]["first_ms"])
            lat.append(s)
        med_stage = Stages(hang_ms[h], out["vad"]["clean"]["frame_ms_median"],
                           med([x.asr_ms for x in lat]), med([x.llm_first_sentence_ms for x in lat]),
                           med([x.tts_first_chunk_ms for x in lat]))
        out["budget"][h] = {
            "hangover_measured_ms": hang_ms[h],
            "utterances_split_by_endpointing": out["vad"]["clean"]["endpointing"][h]["splits"],
            "reply_latency_ms_median": round(med([x.reply_latency_ms() for x in lat])),
            "reply_latency_ms_min": round(min(x.reply_latency_ms() for x in lat)),
            "reply_latency_ms_max": round(max(x.reply_latency_ms() for x in lat)),
            "required_compute_speedup": {str(t): round(required_speedup(med_stage, t), 2)
                                         if required_speedup(med_stage, t) != float("inf") else "inf"
                                         for t in TARGETS}}
    out["peak_rss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)
    json.dump(out, open(os.path.join(os.path.dirname(__file__), "results.json"), "w"), indent=1)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
