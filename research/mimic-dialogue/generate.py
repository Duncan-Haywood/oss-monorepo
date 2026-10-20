"""A plainly prompted Qwen2.5-0.5B-Instruct (Apache-2.0) writes the user's turn 2 and turn 3 of each thread.

Teacher forcing: the imitator sees the real earlier turns, never its own. Output: data/imitations.jsonl
(every row labelled generated). No prompt is optimised here; this is the plain-prompt baseline of the game.
"""
import gzip, json, sys, time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-0.5B-Instruct"
SYSTEM = "You are a person chatting with an AI assistant. Write the person's next message to the assistant. Reply with the message only."
MAXC = 500


def transcript(turns):
    names = ["Person", "Assistant"]
    return "\n\n".join(f"{names[i % 2]}: {t}" for i, t in enumerate(turns))


def user_prompt(history):
    return transcript(history) + "\n\nWrite the Person's next message."


def clean(s):
    s = s.strip()
    for p in ("Person:", "User:"):
        if s.startswith(p):
            s = s[len(p):].strip()
    return s[:MAXC]


def main(n=None, batch=16, max_new=140, seed=0):
    torch.set_num_threads(4)
    tok = AutoTokenizer.from_pretrained(MODEL, padding_side="left")
    m = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=torch.float32).eval()
    threads = [json.loads(l) for l in gzip.open("data/threads.jsonl.gz", "rt")][:n]
    out = open("data/imitations.jsonl", "w")
    t0 = time.time()
    for turn in (2, 4):          # indices of the prompter turns the imitator replaces
        for i in range(0, len(threads), batch):
            chunk = threads[i:i + batch]
            texts = [tok.apply_chat_template([{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": user_prompt(t["turns"][:turn])}],
                     add_generation_prompt=True, tokenize=False) for t in chunk]
            enc = tok(texts, return_tensors="pt", padding=True)
            torch.manual_seed(seed + turn * 1000 + i)
            with torch.no_grad():
                g = m.generate(**enc, max_new_tokens=max_new, do_sample=True, temperature=0.8, top_p=0.95,
                               pad_token_id=tok.eos_token_id)
            for t, r in zip(chunk, g):
                gen = clean(tok.decode(r[enc["input_ids"].shape[1]:], skip_special_tokens=True))
                out.write(json.dumps({"tree": t["tree"], "turn": turn // 2 + 1, "label": "generated",
                                      "text": gen}) + "\n")
            out.flush()
            print(turn, i, f"{time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
