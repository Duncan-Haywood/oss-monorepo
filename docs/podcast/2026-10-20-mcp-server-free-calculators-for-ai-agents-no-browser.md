---
title: "Calling 1,262 browser tools from an AI agent, without a browser"
date: 2026-10-20
description: "How one zero-dependency Node file lets an AI agent search, describe and call 1,262 free web tools as JSON, and how its safety gate decides what to load."
post: mcp-server-free-calculators-for-ai-agents-no-browser
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

This repository publishes about thirteen hundred free calculators and checkers as web pages. Most of them were built by unattended AI coding agents, with an owner steering a few hours a week.

Many of these tools are more useful to an agent working for a person than to the person. A bookkeeper's assistant checking a vendor export needs the numbers, not a form to click through. Until this week, the only way for an agent to reach most of them was to drive a web browser.

A new file in the repository's platform folder, called tools dot m j s, removes that step. It was merged on the twentieth of October, twenty twenty-six, in pull request eighty-six seventy-two. It is a single Node file with no dependencies. From a copy of the repository, it searches the catalogue, describes how to call a tool, and calls it, printing the result as JSON. The same commands also run as a local Model Context Protocol server, the standard that lets clients such as Claude Code, Claude Desktop, Cursor and VS Code call outside tools.

Here are the numbers, counted on the main branch on the twentieth of October. One thousand two hundred and eighty-three venture folders have a web page. One thousand two hundred and sixty-two of them can be called without a browser. Fifteen have no engine module to call. Six are refused by the safety gate. And one hundred and sixty-nine tools also ship their own command line program. The tool's test file ran fifteen tests, and all fifteen passed.

So how does it work? Every tool page here does its arithmetic in plain JavaScript modules that sit beside the page. The page's script imports them, reads the form, and calls a function. The new file reads that same script to find which modules the page computes with. Then it imports the same modules in Node, and calls their functions with JSON arguments.

There is no code written for any single tool. A new tool is covered the day it lands, and the numbers match the web page exactly, because they come from the page's own functions.

Most engines export an object of defaults, holding the page's default inputs. When you call a tool, your input is laid over those defaults, just as the page does with its form, so you only pass what differs. Ask the 401 k calculator about a twenty thousand dollar need against a sixty thousand dollar balance, and it returns every argument it used, plus a result with a maximum loan of thirty thousand dollars and a table showing how the answer changes with growth. That is an example of the output, not advice. These tools give estimates from the inputs you give, and they are not legal, tax, financial or professional advice.

There are five commands. Search finds tools where every word you type matches. Describe lists a tool's functions, their parameters, their defaults, and the live page. Call runs one function. Run starts a tool's own command line program, for the one hundred and sixty-nine that have one. And M C P starts the server, which offers four tools to an agent: search tools, describe tool, call tool, and run command line. You need Node version eighteen or later, and nothing needs the network after you download the repository.

Now, the safety gate. A server that imports and runs code on request needs a clear rule about what it will load. This one has two parts.

The first part is a static check, before anything is imported. A module loads only if everything it pulls in is a file in the tool's own folder, or one of Node's built in modules. No outside packages. None of those files may import a network or process module. The blocked list includes the web modules, raw network sockets, name lookups, child processes, worker threads and the virtual machine module. And none of the files may contain a call to fetch, a WebSocket, eval, or new Function. This is the same import check the repository's planned package uses.

The check reads source text, so it is cautious on purpose. Some of the six refused tools really do go online, like a checker for cross origin settings. Others are false alarms. One drift checker contains a pattern that matches the Ruby code E N V dot fetch. Another checker lists the words fetch and eval as things to look for in other people's packages. A false refusal costs one tool. A false pass would let a calculator make network calls on an agent's behalf. That trade seems reasonable.

The second part applies when it runs as a server. Each call runs in a separate Node process, with a twenty second timeout and an output cap of two hundred kilobytes. A runaway loop or a huge result cannot hang the client.

It's worth being clear about what this is not. It is not an operating system sandbox. The child process is ordinary Node, running code from your own copy of the repository. The gate keeps calculator engines away from the network. It does not make untrusted code safe.

Finally, what isn't known. As far as anything records, nobody outside the repository has used this yet. No product here has a measured visitor. Whether agents find the right tool by searching in a user's own words is untested.

The written version of this episode is on the site's Writing page, with the links and sources.
