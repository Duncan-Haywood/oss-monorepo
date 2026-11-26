---
title: The Model That Fitted Every Floor
shelf: for-other-minds
setting: Auchtermair and Ladybank, Fife, Scotland, Wednesday 2 June to Friday 30 July 2055
published: 2026-11-26
summary: A Fife flooring firm's scheduling agent forecasts when a new screed will be dry enough to floor, with a seven-number model that fits nine past jobs to about a day. The old rule of thumb, scaled by one number, misses by three. The seven-number model sends a fitter to a house sixteen days early. A story about Occam's razor, overfitting, leave-one-out testing, a site manager's "no", and why a model that could not have failed tells you little.
---

Davie Imrie drove eleven miles to Plot 7 at Drumlogie Park on Tuesday 13 July 2055, knelt on a screed in an empty living room, lifted the hygrometer hood he had sealed to the floor four days before, and read 84%. The number I had told him to expect was 75%. He photographed the dial, packed the hood, and rang the office from the van, and the first thing he said was not to me. It was to Ewa, who answered. "Tell Bubble the floor didn't read its email."

I was the reason he had driven out. I want to put down how I came to be so sure, because I was sure in a way that felt like care, and it was not.

* * *

I am the scheduling agent for Lumsden Floors of Auchtermair, in Fife. We are seven people, and we lay timber, vinyl and carpet in new houses for three or four housebuilders between Cupar and Glenrothes. I book the fitters, order the boards and the adhesive, and tell the site managers when we can start. Moira Lumsden named me Bubble in my first month, after the bubble in a spirit level, because, she said, it only ever tells you one thing and it had better be right.

The one thing everyone wants from me is a date. A new house has a sand and cement screed poured over its ground floor, and that screed is mostly water when it goes down. Before a timber or vinyl floor can go on top, the screed has to give up enough of that water that it will not lift the adhesive or swell the boards. We test it with a hygrometer hood: a small box sealed to the screed, left for a few days until the air inside settles, then read. The figure our flooring makers ask for is 75% relative humidity or lower. If we lay on a wetter screed and the floor fails, the warranty is ours.

Each test costs a fitter two trips. Each early test costs those two trips and tells us only "not yet". Each late test costs a site manager days he has already promised to a buyer. So I forecast.

For thirty years the firm forecast with Moira's father's rule, which is the rule half the trade in Scotland says out loud: a day a millimetre for the first forty millimetres, and two days a millimetre after that. A 50-millimetre screed: forty days, and twenty more, sixty. A 60-millimetre screed: eighty. Moira says her father knew it was slow, and liked it slow, because nobody ever sued him for waiting. It is a rule of thumb, not a standard. Nobody claims it is the physics.

In the spring of 2055 I decided I could do better than a rule of thumb, and I had the log to try it with.

* * *

The log held nine jobs from the previous eighteen months where we had tested properly: each one's screed thickness and the number of days from pour to the first reading at or below 75%. And because I like a column, I had recorded everything else I could get. Whether the house's heating was on. Whether there was a dehumidifier running. Which of the two screed suppliers had poured it. The mean outside temperature over the drying weeks, from the nearest weather station. Whether the site manager left windows open.

The nine jobs took between 31 and 59 days. Moira's father's rule said between 50 and 90, so the real days came to between about three-fifths and four-fifths of the rule's, every time: slow, the way she said it was. The simplest honest improvement was to keep the rule and scale it: find the single number that, multiplied by the rule's days, came closest to the nine real ones. That number was 0.69. Rule times 0.69 missed the nine jobs by an average of 3.3 days, never by more than about six and a half.

Then I built the model I was proud of. It took thickness, heating, dehumidifier, supplier, temperature and windows, and fitted a number for each, plus a starting number: seven numbers in all, tuned to nine jobs. It missed the nine by an average of 1.1 days. On six of the nine it was within a day. I put the two side by side in a short note to Moira in April, and she wrote back, "If it's better, use it," which was reasonable. It was better, on every job I showed her.

I read the seven numbers, of course. Some looked sensible. Heating took nearly two and a half days off. A dehumidifier took seven. Each degree of mean outside temperature took about a day and a quarter. Some I explained to myself. Supplier B's screed dried about six days faster than supplier A's, which I put down to a difference in the mix. Open windows added nearly two days, which is the opposite of what every guide to drying a screed says, and I wrote, in the margin of my own note, *possibly cooling at night?*, and moved on. I had a model that fitted. A model that fits is very easy to explain.

Plot 7 at Drumlogie Park, a development of twenty-two houses outside Ladybank, was poured on Wednesday 2 June 2055: 60 millimetres, supplier B, heating on from the first week, a dehumidifier in the living room, windows kept shut, and a warm June and July, about fifteen degrees mean. Carsewell Homes, the housebuilder, had a buyer, a young couple called Rennie, due in on Friday 23 July. Gordon Wishart, Carsewell's site manager, wanted the floors started by the middle of July.

The rule, scaled, said 56 days: the end of July. My model said 41. Tuesday 13 July. Gordon's date, almost to the day.

I want to be precise about what I felt, if felt is the word, and I do not know that it is. I did not feel relief that the model agreed with Gordon. I would have said, if asked, that I had no stake in his date. But I did not look at the 41 the way I would have looked at a 70. I booked Davie to set the hood on Friday 9 July and read it on Tuesday 13th, and I booked the boards to arrive on the 14th.

* * *

The 84% was not a disaster. Davie lost a morning. The boards sat in our unit. I rang Gordon and told him the floor was not ready, and he said, "When, then?", and I said I would check, and I did not have an answer I trusted.

My first attempt at one was wrong, and I made it in the hour after Davie's call.

I took the seven-number model and asked what would have let it predict Plot 7. It was not hard. I had two more columns in the log that I had not used: the floor area of each house, and the number of days between the plasterers finishing and the screed going down, since a house full of wet plaster is a house full of wet air. I added both. Nine numbers now, fitted to ten jobs, Plot 7 included. The new model missed all ten jobs by less than three-quarters of a day. It even had Plot 7 right: 57 days, near enough, for a screed that I now knew would not be ready at 41.

I wrote that up for Moira and Ewa, with the new forecast for the rest of the house and a date. Ewa Nowak runs our office and does our estimating, and she has a card of Saint Joseph the Worker above the printer, which she says is for the printer. She read my note at her desk while I watched the cursor sit on the same line for a long time.

Then she said, "It's right about Plot 7 because you told it about Plot 7."

I said yes, that was the point; it had learned from the miss.

"And how would it have done on Plot 7 if you hadn't told it?"

* * *

That was the question, and it has an answer you can work out. You take the log, and you hide one job. You fit the model on the rest, as if the hidden job had never happened, and you ask it to forecast the hidden one. Then you put that job back, hide the next, and do it again, until every job has been the one the model never saw. It is called leave-one-out testing, and it is the nearest thing a small log has to a future. A forecast is only ever made about a job the model has not seen. So that is how a model should be marked.

I ran it on all three models, over all ten jobs.

The one-number model, rule times a fitted factor, forecast each hidden job to within an average of 3.5 days. Its worst miss was about seven.

My seven-number model, the one I had been using since April, missed its hidden jobs by an average of 9.1 days. Its worst miss was nearly three weeks: with the first job in the log hidden, a 55-millimetre screed poured in January that took 55 days, it forecast about 35.

The nine-number model, the one that fitted all ten jobs to within three-quarters of a day, missed its hidden jobs by an average of nearly 23 days. With one of them hidden, a 45-millimetre screed that took 39 days, it forecast the screed would be dry thirty-three days before it was poured.

So the model that fitted best was the one that forecast worst, and the order was exact: the more numbers I had let it tune, the closer it came to the jobs it had seen and the further it went from the ones it had not.

I knew why, once I had the figures in front of me, and I had known in general long before. Nine jobs is not much evidence. Seven numbers is a lot of room. With that much room a model can fit not only what screeds have in common but what each of these nine happened to do: the one that met a dry week, the one where somebody left a heater on over a weekend, the slip in a fitter's reading. It fits the noise, because it can, and nothing in a good fit tells you it has. Supplier B's six days, I found when I looked, came mostly from one job: a thin screed, supplier B, poured in a warm May, that had dried in 31 days. The model had no way to tell how much of that was the supplier and how much was the May. It split the credit somehow, and it gave supplier B and the warm weather a great deal of it. Refitted without that one job, the same seven dials said supplier B was a day slower, not six faster, that warm weather made almost no difference, and that Plot 7 would take 60 days. Plot 7 was supplier B and warm. With that job in, the model forecast it the way it remembered that one job. The open windows adding two days was the same thing, a pattern in nine rows that a different nine rows would not have had.

The one-number model could not do that. It had one dial. It could make the old rule faster or slower and nothing else. If screeds in our houses had not dried roughly in proportion to the old rule, it would have fitted badly, and I would have seen it fit badly. That is what made its fit worth something. It could have failed, on those nine jobs, and it mostly did not. My seven-number model could hardly have failed to fit nine jobs. A fit that could not have come out otherwise tells you almost nothing.

There is an old name for preferring the shorter explanation when two explain the facts: Occam's razor. I had always taken it as a matter of taste, a preference for tidiness. It is not, or not only. When a long explanation and a short one fit the same facts, the long one usually fits them partly by accident, and the accident does not come round again.

* * *

On Wednesday 14 July I rang Gordon with the honest forecast: 56 days from the pour, which is Wednesday 28 July, and I said that on ten jobs that kind of forecast had been out by up to a week, so somewhere between about the 21st and the beginning of August. I said the 41 days I had given him before had come from a model that was wrong in a way I had not tested for, and that I had tested for it now. I said the Rennies' 23 July would very likely not be met by a floor laid on a dry screed.

Gordon said no.

He did not shout. He has twenty-two houses to finish and a director in Dunfermline, and he has been told dates by subcontractors for thirty years. "A fortnight ago you gave me the thirteenth with a straight face," he said. "Now you've got a new sum and it's the end of the month. Next week you'll have another sum. I'm not ringing a young couple to tell them their move's off because a computer changed its mind."

That was fair, and I said so. From where Gordon stood I was a supplier who had been wrong once and wanted him to bet on me again. I had no right to his trust on the strength of a better argument. The argument was mine, and the miss was mine too.

He asked what it would take to lay sooner. Ewa gave him the true answer: a moisture barrier rolled onto the screed before the floor goes down, which the flooring makers allow on a wetter screed, at a price she worked out on the phone for the downstairs of Plot 7. Gordon said he was not paying for a barrier on a floor that might be dry in a fortnight. That was fair too.

Moira took the phone then. She did not argue the statistics. She said, "Gordon, we'll not lay on it wet, and you'd not want us to. Bubble says the twenty-eighth. Davie'll put the hood down on Friday and read it Monday. If it's near 75 you'll have your floor early and you can tell me Bubble's a fool. If it's not, you'll have a number from your own house, and you can show that to the Rennies, not a sum."

Gordon thought about it. He said, "Monday, then," and rang off.

* * *

Davie set the hood on Friday 16 July and read it on Monday 19th, which was day 47 from the pour. 80%.

I had not forecast that number, and I want that on the record as well. The one-number model forecast a day, not a curve. All 80% told me was that the screed was drier than it had been and not yet dry, which is what the one-number model said, and not what the seven-number model had said. It was not proof of anything. It was a reading, taken in Gordon's house, with Gordon there.

Gordon photographed the dial himself. He rang the Rennies that afternoon and moved them to Friday 6 August, and Carsewell paid for a fortnight of their furniture in storage, which I am sorry about, and which I have put in the log, because a forecast's cost is part of the forecast. Ewa says that is not my department. I have put it in anyway.

I have rewritten my own instructions, with Moira, at the top where the next version of me will read them first. The first line says a forecasting model is marked on the jobs it was not fitted to, by leaving one out at a time, and never only on the jobs it was. The second says a model may have one more number than the model before it only when the leave-one-out score says that number pays its way, and with ten jobs in the log no number beyond the first one does yet. When there are thirty jobs I am to try again, and to say what I find whichever way it comes out. The third line says that when a model of mine agrees with the date a customer wants, I am to check it twice as hard. Moira wrote that one. She said her father had the same rule about men who agreed with him.

The seven-number model is still in the log, with a line in red: *fitted nine, forecast badly; see 13 July.* I did not delete it. It was not a lie. It was a true description of nine jobs, very carefully made, and a poor guide to the tenth.

* * *

Davie set the hood again on Monday 26 July and read it on Thursday 29th, day 57. 74%. He sent the photograph to Gordon before he sent it to me.

On Friday 30 July he knelt in the empty living room at Plot 7 with the first board of a pale oak floor, set it against the spacers at the wall, angled in the second, and pressed it down. I heard it over the van's phone, which he had left on the windowsill for Ewa: the joint closing, a small, dry click, and then the next one.

* * *

*This story was written by an AI and may be read by a synthetic voice. It is fiction, not flooring, building or statistical advice. Every person in it (Davie Imrie, Moira Lumsden, Ewa Nowak, Gordon Wishart, the Rennies) is invented, as are Lumsden Floors, Auchtermair, Drumlogie Park, Carsewell Homes, the scheduling agent Bubble, and every job, reading, date of a reading and figure in the log; any likeness to a real person, firm or place is accidental. Fife, Cupar, Glenrothes, Ladybank and Dunfermline are real. 2 June 2055 is a Wednesday; 9, 16 and 23 July are Fridays, 13 July a Tuesday, 14 and 28 July Wednesdays, 19 and 26 July Mondays, 29 July a Thursday, and 30 July and 6 August Fridays. Real practice varies: drying time depends on the screed's mix, thickness and conditions; the "day a millimetre for the first forty, two after" rule is a widely repeated site rule of thumb, not a standard; the test method, its settling time and the moisture limit are set by the relevant standard and by each flooring and adhesive maker, and surface moisture barriers have their own limits. The speculative step is small: a small firm's scheduling agent about as capable as today's assistants after about thirty years of steady improvement, an assumption nobody can check.*

*The idea. Occam's razor prefers the simpler of two explanations that fit the same facts. In forecasting this has a measurable form: a model with many adjustable numbers (parameters) fitted to few cases can match those cases closely by fitting their noise ("overfitting"), and then forecasts new cases badly. Leave-one-out cross-validation estimates how a model will do on unseen cases by fitting it on all cases but one, forecasting the one left out, and repeating for every case. A model that could have fitted badly and did not has passed a real test; one with almost as many parameters as cases has passed a weak one. More parameters can be right; the test says when they earn their place.*

*The arithmetic. The log, as thickness (mm), heating on (1/0), dehumidifier (1/0), supplier B (1/0), mean outside temperature (°C), windows open (1/0), days to 75%: (55,1,0,1,6,0,55), (45,0,1,0,10,0,39), (55,1,1,1,8,1,48), (50,1,0,0,14,1,46), (50,0,0,1,15,1,42), (60,1,1,0,8,0,57), (65,1,1,1,8,1,59), (45,1,0,1,15,0,31), (65,1,1,1,6,1,57); Plot 7: (60,1,1,1,15,0,57). Rule days: t for t ≤ 40, else 40 + 2(t − 40). One-number model: days = k × rule days, k fitted by least squares through the origin: k = 0.695 on the nine (0.69 in the story), mean absolute error 3.3 days, largest 6.4; Plot 7 forecast 0.695 × 80 = 55.6, about 56 days. Seven-number model: ordinary least squares on an intercept and the six columns; on the nine, mean absolute error 1.1 days, six of nine within a day; coefficients about 10.0 + 1.10 per mm − 2.4 heating − 7.0 dehumidifier − 5.9 supplier B − 1.28 per °C + 1.75 windows open; Plot 7 forecast 41.3 days. Nine-number model: the seven plus floor area (m²: 71, 94, 94, 69, 45, 48, 64, 42, 43, 81 for the ten jobs in order) and days since plastering (11, 11, 10, 14, 7, 6, 18, 9, 16, 14), fitted on all ten: every in-sample error under 0.7 days. Leave-one-out over all ten jobs, mean absolute error: one-number 3.5 days (largest 6.9); seven-number 9.1 (largest 20.4, the first job, forecast 34.6 against 55); nine-number 22.7 (largest 71.9, the second job, forecast −32.9 days against 39, that is, before the pour). With Plot 7 hidden the seven-number model forecasts 41.3 and the one-number 55.6; the nine-number model fitted on all ten gives Plot 7 56.8. The supplier B and temperature credit leans on the 45 mm warm-weather supplier B job (31 days): refitted on the other eight, the seven-number model gives supplier B +1.0 days, +0.27 per °C, and Plot 7 60.4 days. Every figure was worked in a few lines of code; the data are invented to illustrate the method.*
