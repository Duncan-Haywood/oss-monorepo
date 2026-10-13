"""Turn results.json into the plain-text tables quoted in the README."""
import json
import os

d = json.load(open(os.path.join(os.path.dirname(__file__), "results.json")))
L = []
L.append(f"host: {d['host']}   stream {d['stream_s']} s, utterance audio {d['utterance_audio_s']} s")
L.append("\nmemory (RSS delta after loading, MB)")
for m in d["mem"]:
    L.append(f"  {m['stage']:42s} {m.get('rss_delta_mb', m.get('rss_mb'))}")
L.append(f"  peak process RSS with every stage loaded (MB): {d['peak_rss_mb']}")
L.append("\nVAD (Silero, 32 ms frames)")
for c, v in d["vad"].items():
    L.append(f"  {c}: {v['frame_ms_median']} ms/frame median, p99 {v['frame_ms_p99']}, RTF {v['rtf']}")
    for h, e in v["endpointing"].items():
        L.append(f"    hangover {h:>3} ms: found {e['utterances_found']}/{e['true']}, splits {e['splits']}, "
                 f"spurious {e['spurious']}, endpoint fires {e['median_detect_after_true_end_ms']} ms "
                 f"(max {e['max_detect_after_true_end_ms']}) after end of speech")
L.append("\nASR (faster-whisper tiny.en int8, greedy, per closed segment)")
for k, v in d["asr"].items():
    L.append(f"  {k:22s} median {v['ms_median']:.0f} ms  RTF {v['rtf_median']}  mean WER {v['mean_wer']}")
L.append("\nLLM (Qwen2.5-0.5B-Instruct Q4_K_M, n_ctx 512, max 60 tokens)")
for k, v in d["llm"].items():
    L.append(f"  {k}: first token {v['ttft_ms_median']} ms, first sentence {v['first_sentence_ms_median']} ms, "
             f"{v['tokens_per_s_median']} tok/s; per-utterance first sentence {v['per_utt_first_sentence_ms']}")
t = d["tts"]
L.append(f"\nTTS (Piper en_US-lessac-low): first chunk {t['first_chunk_ms_median']} ms median, RTF {t['rtf_median']}, "
         f"per utterance {t['per_utt_first_chunk_ms']}")
L.append("\nreply latency, end of speech -> first audio out (4 threads, clean)")
for h, b in d["budget"].items():
    L.append(f"  hangover {h:>3} ms (measured {b['hangover_measured_ms']:.0f}, utterances split {b['utterances_split_by_endpointing']}): "
             f"median {b['reply_latency_ms_median']} ms, range {b['reply_latency_ms_min']}-{b['reply_latency_ms_max']}; "
             f"compute speed-up needed for 0.5/1/2 s: {b['required_compute_speedup']}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
