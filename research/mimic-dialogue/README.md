# Does a second turn make a plainly prompted LLM easier to spot? Detecting imitated user turns in OpenAssistant dialogues

Milestone 6 (`mimic-dialogue`) of track 11, adversarial human imitation. **Result, stylised:** a prompt-free word and character n-gram detector separates a plainly prompted Qwen2.5-0.5B-Instruct from real users with AUROC 0.93 on a single turn and 0.98 on the two imitated turns of a thread together (paired accuracy 0.98). Seeing the whole thread helps. A quarter of the imitations read like assistant replies, and removing them leaves 0.95 for the thread, so the detector is not just catching that. This is the baseline; **no prompt is optimised and no game is played here.**

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/mimic-dialogue/

Numbers come from `results.txt` (`results.json` has the same). The text was produced with AI assistance, as was this write-up.

- **Data.** 400 English five-message threads (user, assistant, user, assistant, user) from OpenAssistant oasst1, one per conversation tree, each message cut to 500 characters (`data/threads.jsonl.gz`; no writer identifiers). The imitator writes the user's second and third message from the real earlier messages (teacher forcing: it never sees its own text). Both human and generated turns are in `data/`; the generated ones are in `data/imitations.jsonl`, every row labelled `generated`.
- **Detectors** (5-fold cross-validation grouped by thread, so no thread is on both sides): character 1-4 plus word 1-2 gram logistic regression; a "context" model on eight hand-made features (length, word overlap with the previous assistant and user messages, newlines, question marks, assistant-style markers); and length alone.
- **Single turn vs thread.** n-gram AUROC 0.927 (95% bootstrap interval 0.909 to 0.942) on turn 2 and 0.941 (0.923 to 0.958) on turn 3. For the thread, the sum of the two turn scores gets 0.980 (0.970 to 0.988). Context features: 0.733, 0.745, 0.838. Length alone: 0.655, 0.652, 0.712.
- **What the imitator gets wrong.** Generated turns have median 130 characters against 82 for people, 25% look like assistant replies (bold, numbered lists, "Sure, here is") against 0.4% of human turns, and fewer carry a question mark (58% against 73%). Word overlap with the previous assistant message is lower (0.23 against 0.28).
- **Ablation.** Dropping the 177 threads where either imitated turn looks like an assistant reply leaves 223 threads; the n-gram detector then gets 0.875, 0.890 and 0.948 for turn 2, turn 3 and the thread. Fewer threads, so the intervals are wider, but the gap to chance is large.

```bash
cd research/mimic-dialogue
pip install numpy scipy scikit-learn            # tests and evaluate.py
python3 -m unittest discover -s tests -v        # 7 tests
python3 evaluate.py                             # seconds
# rebuild (network, then about 30 min on 4 CPUs): python3 build_threads.py oasst1.trees.jsonl.gz 400 ; pip install torch transformers ; python3 generate.py
```

## Motivation

The track asks whether prompts alone can make an LLM indistinguishable from people. Chat is where that matters most, and a detector that sees several turns has more to go on than one that sees one. Before any game on dialogue, we need the plain-prompt baseline and a measure of how fast evidence adds up over turns. The imitator is a simulated user, a digital twin of how people write to an assistant; the detector's accuracy is a fidelity score for it, as in `mimic-contexts`.

## Builds on

Koepf et al. (2023), "OpenAssistant Conversations", the oasst1 corpus (Apache-2.0). Qwen2.5-0.5B-Instruct (Apache-2.0) as the imitator, as in `mimic-loop`. Lopez-Paz and Oquab (2017) for reading a classifier as a two-sample test; `mimic-contexts` for the n-gram detector design. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

`build_threads.py` keeps English, non-deleted, non-synthetic, review-passed messages of 20 to 2,000 characters, picks one five-message path per tree and truncates each message to 500 characters. `generate.py` prompts the model with the system line "You are a person chatting with an AI assistant. Write the person's next message to the assistant. Reply with the message only." and the transcript up to that point, at temperature 0.8, top-p 0.95, at most 140 new tokens, then truncates to 500 characters. `evaluate.py` scores a thread as the sum of its two turn scores, and computes paired accuracy as the share of threads where the imitated thread scores above the human one. Intervals are percentile bootstraps over threads (300 resamples).

## Limitations

The human side is oasst1's volunteer "prompter" turns, written to be answered by an assistant, so they are not everyday chat; the corpus is not a sample of any population, and false-positive rates by native language or other group cannot be reported because the corpus does not record them (the track's fairness guardrail stays open here). The imitator is a 0.5B model with one plain prompt and one seed, so this is the easy end of the game. Teacher forcing means imitated turns are never conditioned on earlier imitated ones, and the real assistant turns that follow turn 2 answered the human message, not the imitation. The thread score sums two independent turn scores, so it measures how fast evidence adds up, not a model of conversation. Length differs between sides (so length alone gets 0.65), and truncation at 500 characters changes both. No licence check was made on the text people typed beyond the dataset's Apache-2.0 label. Generated text stays in this repository, labelled generated, and is never posted.

## Next steps

Run the prompt game on dialogue (`mimic-loop` with these threads as the context family), judge a thread of three or more imitated turns generated free-running, and fit a detector on a different corpus to see whether the 0.98 carries over. A live Turing test needs people and is an owner step.

## Owner steps

None for this baseline. A test with human judges needs consent and review (track 11 guardrails).

## Outside dependencies

oasst1 (human text), Qwen2.5-0.5B-Instruct (imitator), NumPy, SciPy, scikit-learn, PyTorch and transformers (generation only).
