---
title: "How close can a RepRap shop get to self-replication?"
date: 2026-10-20
description: "Closure of a RepRap printer, doubling time against import budget, when to stop copying, and recycling: what 40 self-replication studies found."
post: self-replicating-3d-printer-reprap-closure-research
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

This episode covers the self-replicating manufacturing track. It asks an old question in a down-to-earth form. Can a small set of machines make copies of itself, and useful goods along the way, while importing as little as possible?

Two words come up a lot. Closure is the share of a machine's parts, by count, by mass or by cost, that the shop can make for itself. Vitamins are the parts it cannot make, such as motors, electronics, bearings and screws. That word comes from the RepRap project, the open-source printer that can print many of its own parts.

There are forty projects in this track. AI coding agents did the work, with the repository's owner steering. Every number here comes from a project's own write-up.

The main caveat is a big one. The parts list is real. It was copied by hand from the RepRap wiki's page for the Prusa Mendel printer. But the masses, costs, machine prices, print speeds and failure rates are all assumed placeholders. Nothing was weighed or priced. The write-ups say the shapes of the results are the findings, and the hours and kilograms are illustrations. None of this is engineering or business advice.

Finding one. A printer on its own makes about a sixth of its own mass. The model lists fifty one kinds of part, eighteen of them printed. The printer alone makes about thirty five percent of the part types, but only seventeen percent of the mass and eleven percent of the cost. Adding a router, a laser cutter and metal casting raises that to about forty five percent of part types, twenty four percent of mass and twenty one percent of cost. The vitamins that dominate are the motors, the electronics, the rods, the bearings and the fasteners.

A follow-up checked whether those numbers depended on optimistic guesses about what each machine can make. Dropping every disputed part brings mass closure back to the printer-alone level. But making the five motors in-house would add twenty two points of mass closure on its own. The hard question is motors, rods and electronics, not washers.

Finding two. Redesigning parts helps cost far more than mass. Swapping in printed nuts, printed idlers and wooden rods cut the number of vitamin types from twenty nine to nineteen, and raised cost closure to almost forty eight percent. Mass closure stayed under thirty six percent. Another project then checked the wooden rod. It bends about twenty times more than steel under the same load, so matching steel would need a rod about seventeen millimetres thick, too big for the printer's eight millimetre bearings. It also found that the closure measure rewards heavier, worse rods, because wood counts as makeable and steel does not. That is a flaw in the measure, and the write-up says so.

Finding three. A simple greedy rule, buying whichever machine adds the most closure per dollar, usually picks the right next machine. On random test cases it matched the best choice seventy two to ninety four percent of the time. In its worst case it got only about sixty two percent of the possible gain.

Finding four is about growth. In a simulated fleet of printers that build copies of themselves from printed parts and bought vitamins, the import budget sets the pace. With a tiny budget, the fleet takes about seven thousand hours to double. With a larger one, about one hundred and twenty hours. Past a certain budget, machine time becomes the limit, and doubling flattens at about fifty three hours. Machines that wear out add another twist. With short lifetimes, every simulated fleet died out by chance, even where a smooth model predicted a small stable fleet.

Finding five. If the goal is to make goods by a deadline, copy flat out and then switch. The best switch came one fleet growth time before the end, which matches a textbook formula. A fixed split between copying and making goods captured only nine percent as much value. That sharp answer depends on unlimited demand, and the write-up says a saturating market would smooth it.

Finding six. Recycling the shop's own scrap barely helps, because vitamins dominate. For the printer-alone shop, about eighty two percent of the imported mass per copy is vitamins. Recycling scrap cut total imports by a median of three percent, because the shop makes only about a tenth of a kilogram of plastic scrap per copy. Recycling plastic from retired machines would matter more. Energy came to about nine or ten kilowatt hours per copy, almost all of it printing.

So, under these assumptions, no small shop gets close to full closure. The bottleneck is the familiar one: motors, electronics and precise metal rods. The next steps are for the owner to weigh real parts, get dated prices, and measure real print times and failure rates.

The written version is on the site's Writing page, with links to every project and its sources.
