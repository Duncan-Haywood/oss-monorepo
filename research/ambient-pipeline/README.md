# ambient-pipeline: what does a CPU voice pipeline cost per stage, and what reply latency does it add up to?

Track 2 (ambient AI assistant), milestone 1. A streaming voice activity detector (VAD),
speech recogniser (ASR), small language model (LLM) and speech synthesiser (TTS) run on four
CPU cores in a container, on **synthetic** recordings. I measure latency, real-time factor (RTF)
and memory per stage, then add the stages up into a reply latency and ask what budget it leaves.
Produced with AI assistance. Simulated (synthetic-audio, server-CPU) results only: nothing here
is a claim about a phone or an earbud.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-pipeline/

## Motivation

An always-on assistant that speaks into your ear has to answer fast enough that the reply feels
like part of the conversation, and cheaply enough to run on a device. Before asking *when* to
speak (milestone 2, `ambient-interject`) I want to know *how fast and how cheaply* the pipeline
can run with open models. Human turn-taking is a useful yardstick: Stivers et al. (2009)
found typical gaps between speakers of the order of 200 ms across ten languages. That is far
below what a cascaded pipeline reaches, which is why the budget below also asks what speed-up
would be needed for looser targets.

## Builds on (and does not claim affiliation with)

- Silero VAD, Silero Team (2021), <https://github.com/snakers4/silero-vad>, MIT; used through the
  `silero-vad-lite` wheel (MIT) that bundles the model.
- Whisper, Radford et al. (2023), "Robust speech recognition via large-scale weak supervision",
  ICML (PMLR 202). Run as `tiny.en` through faster-whisper (SYSTRAN, MIT) on CTranslate2, int8.
- Qwen2.5-0.5B-Instruct, Qwen Team (2024), "Qwen2.5 Technical Report", arXiv:2412.15115
  (Apache-2.0), 4-bit GGUF, run with llama.cpp through `llama-cpp-python` (MIT).
- Piper, <https://github.com/rhasspy/piper>, voice `en_US-lessac-low`, run through the `piper-tts`
  1.8.0 wheel.
- Stivers et al. (2009), "Universals and cultural variation in turn-taking in conversation",
  PNAS 106(26):10587-10592, for the turn-gap yardstick only.
- Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI, for the motivation to
  study *when* to interrupt, which this project does not address.

It builds on none of the research groups listed in `prompt.md`; there is no lab tag.

## Method

`experiments/run.py` (Python 3.13, 4 cores, x86-64, one container):

1. **Recordings.** Six sentences (1.8 to 5.2 s of speech) are synthesised with Piper
   (noise_scale and noise_w_scale set to 0 so the audio is identical on every run), resampled to
   16 kHz and placed in a 30.6 s stream with 1.5 s gaps. A second copy has white noise added at
   20 dB SNR. "True end of speech" is the last 10 ms window above 2% of the clip's peak RMS.
2. **VAD.** Silero processes the stream in 512-sample (32 ms) frames; each call is timed. A
   segment opens at p >= 0.5 and closes after a hangover of consecutive sub-threshold frames
   (200, 300, 500, 800 ms; `budget.endpoint`). I report how many utterances are found, split
   in two, or spurious, and how long after the true end the endpoint fires.
3. **ASR.** Each closed segment (plus 200 ms padding) is transcribed greedily; median of 3 runs
   after a warm-up, with 1 and 4 threads. WER is against the text that was synthesised.
4. **LLM.** The ASR transcript goes to the model with a one-line system prompt, temperature 0,
   at most 60 tokens, streamed. I time the first token and the first complete sentence
   (median of 3), with 1 and 4 threads.
5. **TTS.** The LLM's first sentence is synthesised; I time the first audio chunk and the RTF.
6. **Reply latency** = measured endpoint delay + VAD frame + ASR + LLM first sentence + TTS
   first chunk, per utterance (4 threads). `required_speedup` gives the factor by which the
   non-hangover compute must shrink to meet a target; it is infinite if the hangover alone
   exceeds the target.
7. **Memory.** RSS growth when each model is loaded, and the process peak with all stages loaded.

## Results (one run; full tables in `experiments/results.txt`, raw in `results.json`)

| Stage | Time | RTF | Memory added |
|---|---|---|---|
| VAD (Silero) | 0.15 ms per 32 ms frame (p99 0.46) | 0.007 | 30 MB |
| ASR (Whisper tiny.en int8) | 306 ms median per segment, 4 threads (460 ms, 1 thread) | 0.11 (0.16) | 53 MB |
| LLM (Qwen2.5-0.5B Q4_K_M) | first sentence 267 ms (4 threads), 906 ms (1 thread); 47.6 vs 14.8 tok/s | n/a | 570 MB (mostly the memory-mapped weights) |
| TTS (Piper lessac-low) | first chunk 88 ms | 0.029 | 89 MB |

Process peak RSS with everything loaded: 1105 MB (this includes the second model instances built
for the 1-thread comparison, so it is an upper bound for the 4-thread configuration).

**Endpointing.** All 6 utterances were found at every hangover in both conditions, and none was
spurious. A 200 ms hangover split one utterance in two in both conditions, and 300 ms split
one in the noisy condition only. The endpoint fires 50 to 63 ms later than the nominal hangover
(frame quantisation plus the tail of the energy-based "true end").

**Recognition.** Mean WER is 0.010 on both clean and 20 dB audio: the one difference is
"summarise" transcribed as "summarize", a spelling variant, not a recognition error.

**Reply latency** (end of speech to first audio, 4 threads, median over the 6 utterances):

| Hangover | Median | Range | Speed-up of compute needed for 1 s | for 0.5 s |
|---|---|---|---|---|
| 200 ms (1 split) | 938 ms | 786-1059 | already met (0.89) | 2.7x |
| 300 ms | 1034 ms | 882-1155 | 1.02x | 4.4x |
| 500 ms | 1258 ms | 1106-1379 | 1.56x | impossible: hangover alone exceeds it |
| 800 ms | 1546 ms | 1394-1667 | 4.8x | impossible |

Reading it: with these models about 0.7 s of the 0.9 to 1.5 s is ASR + LLM + TTS, and the rest
is the wait to be sure the speaker has finished. Only the hangover is a policy knob; shortening
it trades latency against cutting people off (the 200 ms hangover already split one utterance).
A 1 s reply target is met only at the 200 ms hangover (which split an utterance) and is missed by 34 ms at 300 ms on this CPU; a ~200 ms
conversational gap is not reachable by a cascade that waits for end of speech and then runs
three models in sequence. **Which target "feels natural" is my assumption, not a measurement
here**: I did not run a listening study.

## Limitations (what the twin leaves out)

- **Synthetic speech, one voice, six sentences.** Clean TTS audio is much easier for VAD and ASR
  than real recordings: no accents, overlap, reverberation, far-field microphones, or
  babble noise (the noise here is white, 20 dB). The WER of 0.010 should not be read as an
  accuracy estimate; with n = 6 the timing medians are also coarse.
- **Server CPU, not a phone.** Four x86-64 cores with plenty of RAM; no thermal throttling, no
  big.LITTLE, no battery measurement. Phone or microcontroller numbers are owner steps below.
- **Batch ASR after end of speech.** Streaming or speculative ASR that runs while the user talks
  would remove most of the 306 ms; I did not build it.
- **LLM quality is not evaluated.** The 0.5B model refused or deflected two of six requests
  (e.g. "I can't assist with that" to the budget-summary question, which needs context it was
  not given). Latency of the first sentence depends on how long and what the reply is, so
  the per-utterance range (129 to 375 ms) is large.
- **First sentence, not full reply.** Latency is to the first audio chunk of the first sentence.
- One run on one host; I did not repeat the whole experiment, only each timed call 3 times.
  Timings vary by tens of ms between runs (an earlier run gave 301-308 ms ASR and 270 ms LLM).

## Reproduce

```
pip install numpy pytest
PYTHONPATH=src pytest -q tests                # 7 tests, no models needed
pip install faster-whisper silero-vad-lite llama-cpp-python piper-tts psutil
# download into $AMBIENT_MODELS: voice.onnx + voice.onnx.json (Piper en_US-lessac-low),
# qwen.gguf (Qwen2.5-0.5B-Instruct q4_k_m GGUF); faster-whisper fetches tiny.en itself
AMBIENT_MODELS=/path/to/models python experiments/run.py
python experiments/summarise.py
```

## Licences and consent

- Models and runtimes above are downloaded, not redistributed here. **`piper-tts` 1.8.0 is
  GPL-3.0-or-later** (the original MIT Piper repository is archived); it is used here only to make
  test audio and to time the TTS stage, and nothing from it is bundled. Check the Piper voice's model card before
  using the voice commercially.
- The unit tests and `budget.py` have no GPL dependency.
- Consent: this experiment records no people. A real deployment must follow recording-consent
  law. US federal law needs one party's consent, but some states, California among them,
  need everyone's. Process audio on the device and keep no raw audio unless the user opts in.

## Owner steps

- Re-run the timings on the target phone (and later the wearable); I have not done this.
- Collect consented real recordings with overlap and noise to replace the synthetic ones.
- No purchases are needed for this milestone.

## Next steps

- `ambient-interject`: when to speak, simulated, with the policies compared at equal annoyance cost.
- Streaming ASR and a sentence-chunked LLM-to-TTS handoff, then re-measure the budget.
- Quantise or distil to fit a phone's memory and measure energy per reply.

## Outside dependencies

The pretrained models (Silero VAD, Whisper tiny.en, Qwen2.5-0.5B, Piper voice) were trained
elsewhere and are downloaded from Hugging Face, PyPI and GitHub releases; this project could not
train or recreate them. Everything else is in this directory.

**Figure.** `python experiments/figure.py` (needs matplotlib) redraws `experiments/memory.png`, memory added by each stage, from the committed `experiments/results.json` only; it runs nothing new.
