---
title: "Free tools with AI on your own key, or a model on your own computer"
date: 2026-10-20
description: "How this repo's AI features work with no key, your own provider key, or a local model in Ollama, LM Studio or llama.cpp, and which nine tools use it."
post: bring-your-own-api-key-ai-tools-ollama-lm-studio-local-models
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

This repository builds free tools, mostly through unattended AI coding agents, with an owner steering a few hours a week. Some of those tools are better with a language model. Drafting a reply to a customer review. Tailoring a line of a resume to a job posting. Turning sales call notes into a follow-up email.

But a free tool can't pay for model calls on everyone's behalf. And a tool that keeps its users' text on a server it doesn't need is a privacy problem. So the repository uses one rule with three switch positions, and one shared piece of code that carries it out.

The rule comes from section three of the product playbook, called the A P I key switch. A product must be fully useful with no key at all. A key unlocks an extra. If the model call fails, the tool falls back to its own result instead of breaking. And the screen says which path ran, so nothing degrades silently.

On the eighteenth of October, the owner added a third position. In the owner's words: "for the majority of applications, I think the possibility of hosting local and using local ai is another good way to go for applications. instead of using api keys for llms and image and video gen." So wherever a tool offers a key, it also offers a model running on the user's own computer. No key, no cost per call, and the text stays on the machine.

That gives three positions. With no key, nobody pays, and rules and templates run inside the page. With your own hosted key, you pay your provider, and your text goes from your browser or your server straight to them. With a local model, nobody pays per call, and your text goes to a server on your own machine or network.

The shared code is a single file called byok, short for bring your own key. It is two hundred and eighty-one lines, with no dependencies, so the same file runs in a web page, a Node server, or a phone app. It talks to Anthropic, OpenAI and Google Gemini, to anything that speaks the common chat completions format, such as OpenRouter or Groq, and to three local servers: Ollama, LM Studio, and the llama dot c p p server. Only Anthropic has a default model. For the others, the person names the model, so the code never ships a model name that later goes stale.

The playbook's rule becomes one function, called with fallback. You hand it the tool's own deterministic function and the model function. It returns a value, and a label saying which one ran, so the page can truthfully say either "AI is off" or "drafted by your model". Another function probes the three local servers on their usual ports and lists the models it finds.

There is a catch, because these tools are served from GitHub Pages. Using your local model means a public, secure web page asking your browser to call your own computer. Three things decide whether that works. First, cross origin rules. Ollama only accepts its own local pages by default, so you start it with a setting that allows the site. LM Studio has a switch for this in its server settings. The llama dot c p p server allows it by default. Second, recent versions of Chrome ask you before a public site may reach your own machine or local network. Third, mixed content. Browsers treat your own machine as secure, so a secure page may call it. But another address on your home network, over plain unencrypted web traffic, is blocked.

Keys stay with their owner. In a page, the key lives in your own browser's storage. On a server, it comes from the deployer's settings. And a server running on a deployer's key can attach a spend guard, which refuses any call that would cross a budget before it is sent.

So where is this used? On the main branch, nine tools carry the shared code. The resume checker flags formatting that breaks applicant tracking systems, and with a model it rewrites up to five of your existing lines. The proposal maker starts from a trade template, and a model drafts the summary, goals and scope, but never prices, dates or contract clauses. The review reply desk writes rating-aware replies, and a model polishes them. The sales call notes desk pulls out the fields a sales team tracks, and a model polishes the follow-up email, which is rejected if it states a dollar figure that isn't in the notes. The meeting action items tool finds who committed to what, and a model looks for commitments the rules missed, each of which must quote the notes word for word or it is dropped. Then there is a support desk, a sales pipeline forecaster, a customer profile scorer, and a conversation simulator for fictional characters. Each keeps a copy of the shared file, with a test that fails if the copy drifts. When the shared file changed in a security review pass on the twentieth of October, the copies fell one line behind, and those tests are what catch it.

Two honest limits. No tool here generates images or video yet. And only nine of roughly thirteen hundred tools use a model at all, because most of them are calculators, which need arithmetic, not a model. Whatever a model drafts can be wrong, so treat it as a first draft to check. None of this is professional advice.

The written version of this episode is on the site's Writing page, with the links and sources.
