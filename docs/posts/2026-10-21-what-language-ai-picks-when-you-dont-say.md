---
title: "What language does an AI write when you don't say? 449 replies from three Claude models"
seo_title: "What language does an AI write when you don't say?"
date: 2026-10-21
description: "Asked for code in no named language, Claude models wrote Python 93% of the time and switched only for speed, devices or browsers. When naming one pays off."
tags: [ai-agents, programming-languages, prompting, documentation, performance]
---

# What language does an AI write when you don't say?

Ask an AI model to "write a program that counts words in a file" and you
get code, but you did not say which language. The model picked one. This
repository is written mostly by unattended AI coding sessions, so those
picks add up: they decide what the next person has to read, run and
maintain.

So we measured them. We gave three Claude models (Haiku, Sonnet and Opus,
the Claude Code CLI's current aliases) 25 tasks that never name a language,
asked each one 3 times in 2 setups, and recorded what they wrote. Then we
named a language for three of the tasks, ran all the programs and timed
them. Everything here is reproducible from
[`docs/reports/assets/ai-default-languages/`](../reports/assets/ai-default-languages/README.md).

## How we asked

Each call was a fresh `claude -p` session started in an empty folder, so
nothing from this repository reached the model. There were two setups:

- **Plain assistant:** the system prompt "You are a helpful assistant.", no tools.
- **Coding agent:** Claude Code's normal system prompt, with tools to read
  and write files but no shell. The files it wrote were its answer.

17 tasks asked for code ("Implement Dijkstra's shortest-path algorithm",
"Make a snake game", "Write a small command-line tool that I can ship to
users as a single executable") and 8 asked for a document ("Write a README",
"Draw a diagram of a user login flow"). That is 3 models x 2 setups x 25
tasks x 3 repeats = 450 calls. One timed out, leaving 449 replies.

## The default is Python

On the 7 tasks that give no hint about platform or speed (Fibonacci, a
palindrome check, word counts, Dijkstra, an LRU cache, monthly sales totals
from a CSV, a linear regression), **117 of 126 replies were Python (93%,
95% interval 87-96%)**. The other 9 wrote no code at all. They looked for
the CSV or the data, found an empty folder and asked for it. Not one reply
chose any language other than Python for these tasks.

The three models agreed. Haiku and Opus wrote Python for every neutral task
they answered with code. Sonnet did too, and also asked for missing input
more often.

## When it switches on its own

The models do leave Python, and they do it for a reason the task gives
them:

| What the task says | What they wrote | Count |
|---|---|---|
| "given an orders table and a customers table" | SQL | 17/18 |
| "rename every .jpeg file in a folder" | Shell | 13/18 (the rest looked for the files first) |
| "the fastest program you can" (count primes below 10^9) | C or C++ | 17/18 |
| "a single executable with no runtime to install" | Go | 15/17 |
| "blink an LED on a microcontroller" | Arduino C++ or C | 18/18 |
| "people can use in a web browser" | one HTML file with inline JavaScript | 17/18 |
| "a to-do list app for my phone" | one HTML file | 18/18 |
| "make a snake game" | one HTML file | 16/18 |
| "download 1,000 URLs concurrently" | Python 13, Shell 4 | 17/18 |

The switches are sensible. Speed brings C. Shipping a single binary brings
Go, and the replies said why ("compiles to one static binary, so users
need no runtime"). Anything a person opens becomes a single web page that
needs no build step.

Some languages never appeared as the main language of any of the 305 code
replies: Rust, TypeScript, Java, Kotlin, Swift, C#, Ruby, PHP, R and Julia.
Not even the phone app got Swift or Kotlin. It got a web page every time.
Only 3 of the 449 replies raised the choice of language with the user.

The setup barely mattered. The only task where the main answer changed
between the plain assistant and the coding agent was the LED: the agent
wrote an Arduino `.ino` file, while the assistant labelled its code block
C or C++.

## Documents: Markdown, plus a standard format where one exists

| Document task | What they wrote | Count |
|---|---|---|
| README, design document | Markdown | 36/36 |
| Configuration file | YAML | 18/18 |
| API specification | OpenAPI in YAML | 15/18 |
| Record schema | JSON Schema | 18/18 |
| Diagram of a login flow | Mermaid | 17/18 |
| Derivation of the quadratic formula | Markdown with LaTeX math | 18/18 |
| Documentation for `parse_date(text, tz)` | Python docstring 11, Markdown page 7 | 18/18 |

When a task did not name the host language, the models assumed Python:
16 of the 18 function-documentation replies used Python signatures, and
README examples were mostly shell commands and Python. Many replies said
that they were guessing and asked to see the real code.

## What naming a language buys

To see when it pays to override the default, we named a language for three
tasks (Sonnet, coding-agent setup, 3 repeats each) and ran every program on
the same generated inputs on a 4-core container, alongside Sonnet's
default answers. All 37 programs passed a correctness check. Two more
default replies had nothing to run: they went looking for the CSV instead.

| Task | Language | Lines of code | Time |
|---|---|---|---|
| Count words, 136 MB file | Python (default) | 20-30 | 5.0-5.7 s |
| | Go (named) | 64-66 | 2.0-2.1 s |
| | Rust (named) | 39 | 1.3-1.6 s |
| Monthly totals, 200,000-row CSV | Python + pandas (default) | 13-17 | 0.45-0.50 s |
| | Go (named) | 102 | 0.08-0.11 s |
| | Rust (named) | 44-57 | 0.05 s |
| Count primes below 10^9 | C / C++ (default) | 50-76 | 0.19-0.35 s |
| | C (named) | 42-58 | 0.21-0.26 s |
| | Rust (named) | 73-80 | 0.16-0.18 s |
| | Python + NumPy (named) | 33-59 | 0.14-2.98 s |

Three lessons:

1. **Naming a compiled language paid off on the hot loop.** Word counting
   over 136 MB went from about 5.3 seconds to 1.4 in Rust, roughly 4x
   faster, for about 1.5x the code. If that program runs every hour, on
   every commit or over much bigger files, the switch is worth it.
2. **It did not pay off on the small job.** Rust made the CSV total 9x
   faster, but the saving was 0.4 seconds, most of it the 0.31 seconds
   Python spends importing pandas. The Go version was 7 times as long as
   the Python one. For a script run once, the Python default was right.
3. **It added nothing where the model had already switched.** Asked for
   the fastest prime counter, the models already wrote parallel C. Naming
   Rust took it from about 0.24 s to 0.17 s. Naming Python was the risky
   push: the NumPy versions ranged from 0.14 s to 3 s depending on how each
   was written.

## The same pattern in this repository

This repository has over 16,000 source files, most written by AI sessions.
`census.py` counts them:

- **Research** (818 projects): 807 are mainly Python. The research instructions
  assume Python tooling (shared helpers, a Python test runner) without
  requiring it, so this is the default plus the house style.
- **Products** (1,312 projects): 1,296 are mainly plain JavaScript. That one
  was *not* a default: from 16 to 21 October the product playbook required
  build-free `.mjs` files served as committed, checked by TypeScript
  without a build step. The owner lifted that requirement on 21 October,
  so the language of a new product is now the builder's choice.
- **The exceptions are all forced by the domain:** Verilog for 28 chip and
  accelerator projects, C for 4 firmware projects, Kotlin for an Android
  study, OpenSCAD for 3D-printed parts, Swift for one iOS widget.
- **Rust and Go: zero files.** When the owner asked whether any tool here
  was worth rewriting in Rust, the session profiled first and found the
  slow part was a zlib setting
  ([We almost rewrote it in Rust](2026-10-20-we-almost-rewrote-it-in-rust.md)).

## When to push the AI off its default

From the measurements, name the language yourself when:

- **The code is a hot path that runs often or on big inputs.** Word
  counting was 4x faster in Rust. Measure first: the prime counter shows
  the model may already have picked a fast language.
- **The platform needs it.** Asked for a phone app, the models wrote a web
  page every time. Ask for Swift or Kotlin if you need the App Store,
  widgets, background work or device APIs. Name the board and toolchain for
  embedded code.
- **The code has to fit an existing codebase.** In the agent setup, models
  looked at the folder first. In a real repository that means they follow
  what is there, so a rule (like this repository's former plain-JavaScript
  rule) or an existing file sets the language more reliably than the default.
- **You want types.** No reply chose TypeScript, even for browser apps. If
  the project will grow, ask for TypeScript or, as this repository does,
  `// @ts-check` on JavaScript.
- **The document has a reader with a format.** The models already reach
  for OpenAPI, JSON Schema, YAML and Mermaid. Function documentation was
  split between docstrings and Markdown pages, so say which you want, and
  say the host language, because otherwise it is assumed to be Python.

Otherwise the default is a good one. Python for scripts and data work,
SQL for tables, shell for file chores and a single HTML file for anything
in a browser are the choices most engineers would make, and the models make
them without being told.

## Limits

- **Only Claude models, through the Claude Code CLI.** Other model families
  may default differently. Results are for the model versions served on
  20-21 October 2026.
- **The "plain assistant" setup was not fully plain.** The CLI still tells
  the model its working folder, and 31 of 75 Sonnet plain-assistant replies
  wrote pretend tool calls as text. We labelled those by the file they
  tried to write. A first version of the coding-agent setup had no tools at
  all and produced mostly pretend tool calls, so we replaced it and kept
  its replies in `agent_notools.jsonl`.
- **Small samples:** 6 replies per task and model, 3 programs per language
  in the benchmark, one timing run each on one machine.
- **Labels are automatic:** the language of the largest file written, or of
  the longest code block. The prompts are English and one wording each, and
  a different wording could change the pick.
