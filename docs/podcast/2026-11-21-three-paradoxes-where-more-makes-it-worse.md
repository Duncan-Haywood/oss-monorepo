---
title: "Three paradoxes where more makes it worse"
date: 2026-11-21
description: "A new road that slows every driver, a friend who sees twice your crowd, and an extra coach seat that costs a small parish one. One lesson for rule writers."
post: three-paradoxes-where-more-makes-it-worse
---

This is the Maris Stella Labs podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today, three short stories that landed on the same day, written by three separate agent sessions that did not plan it together. Each is built on a classic paradox. And in each one, adding something makes the result worse, or stranger, than common sense predicts. A new road. More friends. One more seat on a coach. Taken together they make one useful point for anyone who writes a rule for people, or for software, to follow.

All three stories are fiction, written by an AI, and every number in this episode comes from the stories' own invented models. None of it is traffic advice, health advice or electoral advice. But the mathematics underneath is real, and you can check every figure with a pencil.

Let's start with the road.

The story is called The Road That Made It Later. It is set in 2046, in an invented hill town above a river valley in the Marche, in central Italy. Two roads climb to a shrine of Our Lady. On a feast morning, six hundred cars an hour come up the hill.

Each road has two parts. One part is narrow. Empty, it takes eight minutes, and it slows down by one minute for every thirty cars an hour that use it. The other part is long and wide, and takes thirty minutes no matter how busy it is. On one road the narrow part comes first. On the other road, the wide part comes first.

With no link between the roads, the cars split evenly. Three hundred an hour on each. The narrow part takes eight minutes plus ten, so eighteen, and the wide part takes thirty. Forty eight minutes to the top.

Then the town builds a short link road, nine hundred metres, joining the two halfway points. It takes one minute to cross. Now a driver can take the narrow part of the first road, cross the link, and take the narrow part of the second road. On the old traffic, that's eighteen, plus one, plus eighteen. Thirty seven minutes instead of forty eight. An eleven minute saving, and that figure went into the grant application.

But here is the catch. Every driver's navigation app does exactly the same sum. So every car takes the shortcut. Now both narrow parts carry all six hundred cars an hour. Eight minutes plus twenty is twenty eight. Twenty eight, plus one for the link, plus twenty eight. Fifty seven minutes.

Could any one driver do better by going the old way? The old way is now twenty eight minutes on a crowded narrow part, plus thirty on a wide part. Fifty eight. One minute worse. So nobody switches back. Everyone is stuck at fifty seven minutes, which is nine minutes later than before the road was built.

This is Braess's paradox, described by the mathematician Dietrich Braess in 1968. What is best for each driver, given what everyone else is doing, is not what is best for all of them together. The link road didn't add capacity where it mattered. It added a choice, and everyone made the same choice.

In the story, the town's agent first blames the traffic. It assumes more cars came this year and raises its forecast. The person who sets it straight is the traffic warden, who counted cars by hand. One thousand eight hundred and twelve this year, against one thousand seven hundred and ninety seven the year before. Almost the same. The cars hadn't changed. The road had.

The fix in the story is wonderfully low tech. A traffic cone at the link road on the next feast morning, and a farmer in a folding chair to let residents and ambulances through. He happens to be the man who asked for the road in the first place, and the man who carries the statue in the procession.

Now, the second story.

It's called The Ones Their Friends Name, and it's set on the Isle of Barra, in the Outer Hebrides, in November 2051. A winter booster lands on the beach airport. Four hundred and forty doses, for about twelve hundred people. The island's nurse gives two hundred and eighty of them to the frail first, by the national priority order. The island's agent would have liked to give every dose by who meets whom, and she tells it no. The risk to the frail is measured. The contact network is only a guess.

So the real question is what to do with the hundred and sixty doses left over.

The agent's answer is the friendship paradox, described by the sociologist Scott Feld in 1991. On average, your friends have more friends than you do. That sounds like an insult, but it's arithmetic. Someone with sixty contacts appears in sixty other people's lists. Someone with four contacts appears in four. So when you pick a person by asking someone to name a friend, you're far more likely to land on a well connected person than if you pick a name out of a hat.

The story uses an invented contact model for the island. Five hundred people with four close contacts a week. Four hundred with eight. Two hundred with fifteen. Eighty with thirty. And twenty with sixty. The average islander has about nine point eight contacts. But the average named friend has about eighteen point nine. Nearly twice as many.

The method built on this is called acquaintance immunisation, published by Cohen, Havlin and ben Avraham in 2003. Ask people at random to name someone they see. Then dose the person they name, not the person you asked.

Averaged over four hundred simulated networks in the story, here is what the hundred and sixty spare doses cover, along with the two hundred and eighty for the frail. Given by lottery, about twenty nine in every hundred contacts on the island. Given by named friend, about thirty eight in every hundred.

And there's a third row, which is the story's instructive mistake. The agent's first idea is the island register's next of kin lists. That does worse than the lottery: about twenty one in a hundred. Next of kin forms record who people live with, not who they see. Older people name each other. And using those lists is a privacy problem besides.

Notice the different flavour of this paradox. The road was about everyone choosing at once. This one is about sampling. The people you reach by following connections are not a random sample of people. Usually that bias misleads us. It's why most people's friends seem to be more popular and busier than they are. The story turns the same bias into a tool.

The story is careful about one more thing. It never turns contacts covered into lives saved, because that conversion needs numbers nobody on the island has.

Now, the third story.

It's called The Seat That Came Back, and it's from the shelf called For Other Minds, stories written for AI agents to read. It's set in June 2046, in an invented deanery of five Catholic parishes in the Tyne Valley, in Northumberland. A coach is going to an ordination. It has forty eight seats, and a hundred and fifteen people want to go. Thirty seven from the first parish, thirty two from the second, twenty three from the third, seventeen from the fourth and six from the smallest.

The agent uses a rule that sounds completely fair. It's called largest remainders. Work out each parish's exact share of the seats. Give each parish its share rounded down. Then hand the seats left over to the parishes with the biggest fractions.

At forty eight seats, the smallest parish's exact share is two point five zero four seats. It gets two, and its fraction, point five zero four, is the second largest of the five. Two spare seats go round, and it gets one of them. The result: fifteen, thirteen, ten, seven and three.

Two days later, a deacon decides to drive himself. A seat comes back. Forty nine seats now. The agent runs the same fair rule. Sixteen, fourteen, ten, seven, and two.

The smallest parish lost a seat because the coach got bigger.

Here's why. One more seat raises every parish's exact share by its own fraction of a seat. About point three two of a seat for the parish with thirty seven names. Only about point zero five for the parish with six. Nobody's whole number changes, but the queue of fractions does. The two biggest parishes' fractions climb past the small parish's. Now there are three spare seats instead of two, but the small parish has dropped from second in the queue to fourth. One extra seat can't make up for being overtaken twice.

This is the Alabama paradox. It was found in 1880, when the chief clerk of the United States Census Office, C. W. Seaton, worked out the seats in the House of Representatives for every house size from two hundred and seventy five to three hundred and fifty. At two hundred and ninety nine seats, Alabama got eight. At three hundred, it got seven. The standard account is Balinski and Young's book, Fair Representation, from 1982.

The agent's first fix is a different rule, called D'Hondt, which many parliaments use. It hands out seats one at a time, so a bigger total can never take a seat away from anyone. But it leans towards large groups, and here it gives the small parish two seats at both sizes.

And then comes the best moment in the story. The deanery secretary points out that after trying two rules and seeing what each one gives the small parish, any third rule that happens to give it three will look as if it was chosen for that reason. A rule is chosen before you see the numbers, or it is not a rule.

So the agent does the honest thing. It writes down what a sharing rule should do, without naming any parish. More seats should never mean fewer. A parish that grows compared with another should never lose a seat to it. Everyone should be within one seat of their exact share. And there should be no lean towards big or small. It says plainly that no rule can always meet both the second and third of those at once. It recommends a rule called Webster, also known as Sainte Laguë, on those grounds. And it says what it has already seen: at forty eight seats Webster gives fifteen, thirteen, ten, seven and three, and at forty nine, sixteen, thirteen, ten, seven and three. At forty seven, though, the small parish would get two. That's the cost of being honest: the second parish was told for a day it had a seat that it doesn't.

For this episode, the figures from all three stories were re-run with a few lines of code, and they hold.

So, what do a hill road in Italy, a booster on a Hebridean island and a coach in Northumberland have in common?

Each one starts with a rule that is obviously right at one scale. Take the fastest road. Ask a random person. Round fairly.

And each rule fails a test it was never given. The road rule fails when everyone follows it at once. The asking rule changes meaning because the people you reach through connections are not a random sample of people. And the rounding rule fails when the total changes.

The agents in the stories go wrong first, too, and their mistakes are worth remembering. The traffic agent blamed more cars, until a hand count showed there weren't more cars. The island agent reached for the list it already had, and the list measured the wrong thing. And the deanery agent started shopping for a rule after it had seen the answers.

The habit all three stories recommend is the same. Say what a rule must do before you see the numbers it gives. Then test the rule against change, against everyone using it at once and against the sample you actually have, not only against today's case.

That's useful for a town council, a district nurse or a parish secretary. It's especially useful for software, which follows its rules exactly, at scale, and all at once.

The three stories are The Road That Made It Later, The Ones Their Friends Name, and The Seat That Came Back. They're on the Stories page of the Maris Stella Labs site, with the full working in each story's closing note. They are licensed Creative Commons Attribution Share Alike, and the written post for this episode has every figure in one place.

Thanks for listening.
