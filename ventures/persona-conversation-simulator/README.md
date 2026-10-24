# Persona Conversation Simulator

A free **personality conversation simulator for fictional characters**. Invent a cast of two to six people, give each a
Big Five personality (or describe them in a sentence: "a very blunt, organised and calm founder"), and see their conflict
style, who will clash and why. Then play out a **salary negotiation, a freelance rate negotiation, a used-car haggle, a team
meeting about a slipping deadline, an offsite plan or a housemates' chore argument** between them. Run it once to read the
transcript, or hundreds of times to see how often a deal closes or a meeting falls apart with that cast.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/persona-conversation-simulator/

Uses: rehearse a hard conversation against a character like the one you are worried about, think through a team's dynamics,
teach negotiation or conflict styles, or write characters whose arguments stay consistent.

## Fictional characters only

This is deliberately **not** a tool for profiling or cloning real people. Building a psychological profile of someone from
scraped LinkedIn, Instagram or Facebook data, without their consent, raises privacy-law problems (GDPR and CCPA treat inferred
psychological traits as sensitive), breaks those platforms' terms, and makes impersonation easier. A confident personality
read of someone who never took a test is not accurate anyway. So the tool generates invented names, and `checkFictional()`
refuses profile links, social-site names, @handles, emails and phone numbers in any character field (page and CLI).

## How it works

- `persona.mjs`: seeded characters with five trait scores (0-100); a profile read from each trait band; a Thomas-Kilmann
  conflict style from assertiveness (0.6 E + 0.4 (100 - A)) and cooperativeness (0.75 A + 0.25 O); "how to talk to them" tips;
  a word list that turns a description into trait scores, with negation ("not shy") and intensity ("very blunt").
- `dynamics.mjs`: pairwise friction and rapport from trait gaps and shared extremes, each note naming the traits behind it;
  expected share of airtime; group notes (who dominates, who goes quiet, escalation risk).
- `sim.mjs`: the rules engine. Each turn picks who speaks (weighted towards extraversion and whoever was just asked) and what
  they do (open, concede, hold, ask, accept, walk away; or propose, support, object, counter, ask, summarise, vent, digress)
  with odds from their traits and the tension so far. Same seed and cast, same transcript. `runMany` replays it with
  different seeds and reports the spread of outcomes, the deal-price range and each character's share of turns and
  satisfaction.

The weights are hand-set to follow broad tendencies (agreeable people concede more, anxious people escalate under pressure,
extraverts hold the floor). They are not fitted to data, so the output is a rehearsal aid, not a forecast.
Worked example and the rules in prose: `big-five-personality-conflict-styles.html`.

## Optional AI voicing (your own key)

Under "Optional: write the lines in each character's voice" on the page, pick Anthropic, OpenAI, Gemini, any OpenAI-compatible
endpoint, or a model on your own computer (Ollama, LM Studio, llama.cpp). One call rewrites the transcript's wording in each
character's voice. The rules still decide who speaks, what they do and every number. A rewrite that drops or changes a number
is thrown away. With no key, or if the call fails, the rules' lines stand and the page says so. Shared client:
`platform/llm/byok.mjs` (`byok.mjs` here is a synced copy; `ai.test.mjs` fails if they drift).

## CLI

```
node cli.mjs --list
node cli.mjs --scenario salary --seed 7 --runs 500
node cli.mjs --scenario team-deadline --people 5 --format json
node cli.mjs --scenario offsite --cast cast.json   # [{"name": "Ava Juniper", "role": "founder", "description": "blunt, organised, calm"}]
```

Exit 0 on success, 2 on bad input (including a character field that points at a real person). Zero dependencies, Node 18+.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is a rules-based
simulation of invented characters, not psychological, medical, HR, legal or career advice, and not a personality assessment
of anyone. It does not predict what any real person will do. **You are responsible for how you use its output.** To the
maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without
notice. Download your cast if you want to keep it.

## Privacy

Everything runs in your browser. Your characters are never uploaded unless you turn on the optional AI voicing with your own
key, in which case the character cards and transcript go straight from your browser to the provider you pick. No accounts,
cookies or analytics vendors. Anonymous feature counts (`sim_run`, `many_run`, `character_added`, `export_used`,
`ai_voice_run`) live only in your browser's local storage; the footer button deletes them and turns counting off. Do Not
Track and Global Privacy Control are honoured.

## Files

`persona.mjs`, `dynamics.mjs`, `sim.mjs` (engine, shared by page and CLI), `ai.mjs` + `byok.mjs` (optional voicing),
`cli.mjs`, `index.html`, `big-five-personality-conflict-styles.html`, `usage.mjs`. Tests:
`node --test ventures/persona-conversation-simulator/`.

MIT licensed. Free; support via [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional.
