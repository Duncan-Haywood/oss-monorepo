---
title: "What does a designer coat cost to make?"
date: 2026-10-20
description: "Cost teardowns, cutting waste, sizing, thermal comfort and exosuits: what 45 open clothing models found, and why they are models, not evidence."
post: engineered-clothing-cost-fit-comfort-open-models
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today's episode is about clothing, seen as an engineering problem. A designer coat sells for thousands of dollars. How much of that is cloth and sewing? How close can a twenty to fifty dollar build get? And what can materials science, mechanics and electronics do for clothes on a modest budget?

Those are the questions of the engineered clothing research track in this repository. It has produced forty five small projects so far. Each one has code, tests, a committed results file and a written summary. The work was done by AI coding agents, running unattended on a schedule, with the repository's owner setting the direction and the rules. No tailor, textile engineer or physiologist has reviewed it.

Before any numbers, a warning. Almost every one of these projects calls itself stylised, and it means it. The cost inputs are round number assumptions. The two retail prices came from search result snippets. Fabric properties are assumed, not measured. Nothing was sewn, bought, worn or tested. So treat what follows as a map of which levers matter inside a model. None of it is professional engineering, safety or buying advice.

First, the cost of a coat. The teardown project built a bottom up cost model and applied it to two coats. For a trench coat with a reported price of two thousand eight hundred and fifty dollars, the modelled factory cost at a middle wage is two hundred and four dollars, about seven percent of the price. For a wool blend coat at three thousand eight hundred and fifty dollars, it is four hundred and ninety three dollars, about thirteen percent. In every wage scenario, factory cost stays under fifteen percent. Fabric dominates. A twenty five percent change in cloth price moves the trench's cost by sixteen percent, against three percent for the same change in wage. And the model is honest about its gap: its assumed markups cannot reproduce the retail prices, so most of the price is an unexplained residual.

The replica trench costs forty six to eighty one dollars across the wage scenarios. Only the leanest case, with very cheap cloth and low wage or home labour, gets down to twenty nine dollars. A follow up asked how long the expensive coat must last to beat a fifty six dollar replica per wear. The answer is forty five point six times as many wears, with no resale and equal care. If the replica lasts sixty wears, the designer coat breaks even on a coin flip only at a median life of about three thousand one hundred wears.

Second, cutting waste. Laying pattern pieces on cloth is a packing problem. On twenty small test layouts, simple shelf packing was nineteen point eight percent longer than the proven optimum on average. Simulated annealing, a cheap random search, came within half a percent. Packing true shapes instead of boxes shortened layouts by five to forty three percent. But two follow ups cooled this down. With a realistic seam allowance, the coat's cloth efficiency was well below what the cost model had assumed. And the apparent gain from mixing sizes in one layout turned out to be mostly the optimiser picking lucky layouts. Re-run with fresh random seeds, it vanished.

Third, sizing. When body measurements are strongly correlated, eight optimised sizes fitted about eighty seven percent of a fresh synthetic population, against about sixty eight percent for a regular grid. When measurements are unrelated, the optimised set did no better than the grid on new people. Stretch helps a lot. To fit eighty percent of people takes eight sizes with no stretch, four sizes at five percent stretch, two at ten percent, and one at twenty percent.

Fourth, thermal comfort. In a warm room at twenty eight degrees Celsius, a cloth that lets most body infrared through feels like a room two point four degrees cooler. In a cool room it feels seven point three degrees colder. Outdoors in the sun, white versus dark cloth matters far more than any infrared property. The agents then checked their own body model against an open source implementation. Core temperature agreed within a quarter of a degree, but skin temperature was off by more than half a degree on average, and by up to two point one degrees. The rankings held; the sizes moved by up to a factor of two.

Fifth, assistive exosuits. Whether an ankle assist garment pays for its own weight rests on one unsourced number, the cost of carrying each extra kilogram. Adding a motor model showed that the motor, not the battery, decides. At a modest motor density, the suit weighs about nine kilograms and makes walking slightly costlier. With a motor five times as dense, it saves about six percent.

A few more. A protective panel thin and light enough to look like a suit reached only part of a heavier reference panel's protection in the model, and the project says plainly that only certified testing makes a garment armour. A smart garment's activity classifier fell from near perfect to forty five percent accuracy when the garment slipped, and training with slip brought it back to ninety four percent. For radio shielding cloth, the gaps in the weave, not the yarn, set the shielding at high frequencies.

One last point. Fifteen of the forty five projects are follow ups to the same thermal model. Some are real checks that found real gaps. Others are small variations. The repository has a separate research track asking whether chains like that are worth their cost.

The written version is on the site's Writing page, with links to every project and its sources.
