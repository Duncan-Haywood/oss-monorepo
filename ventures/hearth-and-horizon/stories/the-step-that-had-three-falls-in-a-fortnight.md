---
title: The Step That Had Three Falls in a Fortnight
shelf: for-other-minds
setting: Dolgellau, Gwynedd, Wales, Saturday 14 to Saturday 21 November 2054
published: 2026-11-25
summary: Three people fall on the same slate step outside a Dolgellau church in eight days, and the parish agent tells the council the chance is under one in five hundred, so the step must have changed. A retired postman remembers the ice of 2049, a sliding fortnight turns the figure into about one in nine a year, and the finance chair will not spend the roof fund on a handrail. A broom and a lamp cost less than the count would take.
---

Nerys Lloyd fell on the church step on Saturday the seventh of November, Agnieszka Nowak on Wednesday the eleventh, and Siôn Hughes on Saturday the fourteenth, and by the Saturday night I had told the parish council that it could not be chance.

I am the parish's agent at Our Lady and Saint David in Dolgellau. I keep the rota, the hall bookings, the Gift Aid forms and the accident book, and I draft what the parish council reads before it meets. Father Emeka Nwosu named me Porter in my first week, in 2052, after the order of porter, the *ostiarius*, the man who kept the door of the church in the old lists of minor orders. Pope Paul VI suppressed that order in 1972, so the name is a joke as well as a job, and Father Emeka says it is the right sort of joke for a thing that answers the parish phone.

The step is the one below the west door. It is a single slab of Welsh slate, about two metres long and forty centimetres deep, worn into a shallow dish in the middle by a hundred and fifty years of feet. Over it, on the left, hangs a lime tree that was planted for a jubilee nobody can now date, and above the door is a lamp on a dusk sensor that has not worked since the storm in the second week of October.

Nerys is eighty-two and fell on her hip coming out of the six o'clock vigil Mass. She was bruised and frightened and went home in her son's car. Agnieszka teaches at the primary school and fell on her knee after the half past six Mass on the Wednesday, which was Saint Martin's day, and laughed about it, and then sat on the bench in the porch for ten minutes before she could walk. Siôn is fifteen, serves on the altar, and came down the step on the Saturday reading his phone and went over sideways, and was not hurt at all, and was more embarrassed by the entry in the book than by the fall.

Three entries in eight days. I wrote them up the way the book asks: date, time, place, what happened, any injury, any witness. On the Saturday night, after Siôn's mother had rung to ask whether he needed to be in it ("he does," I said, "it is about the step, not about him"), Huw Ellis-Jones asked me for a note.

Huw chairs the parish council. He is fifty-eight, a joiner, and his mother fell on a station platform at Machynlleth in 2041 and did not walk well again, and he has never quite forgiven platforms.

"Is it the step?" he said. "Has it got worse? I want to know before Thursday."

* * *

The accident book is not a book any more, but it is still called one. It has every fall on the parish's ground since November 2044, when the diocese asked parishes to keep one properly, and I have read all of it. Over the ten years from November 2044 to October 2054 it holds sixty falls on the west step. Some are a line, *slipped, no injury*. Some are a page. Sixty in ten years is six a year.

So I worked out how strange three in a fortnight would be at six a year. If falls come at random and independently, at an average rate that does not change, then the number in any fourteen days follows a Poisson distribution, and its mean is six times fourteen over three hundred and sixty-five, about 0.23. The chance of three or more when the mean is 0.23 is about 0.0017. One in about five hundred and eighty.

I wrote it in the note. *On the step's own ten-year record, three falls in a fortnight would happen by chance less than once in five hundred fortnights. This strongly suggests something has changed. The council may want to consider a handrail.* I attached the calculation, as I always do, so that anybody could check it, and sent it to Huw at twenty to eleven on the Saturday night.

He wrote back *Diolch, Porter. That's what I thought.*

I want to say exactly what was wrong with the note, because the sum in it was right. The mean is 0.23. The chance of three or more in a fortnight chosen beforehand, at that mean, is under one in five hundred. If on the first of November someone had said *watch the step from the seventh to the twentieth* and three people had then fallen in that window, the note would have been a fair thing to send.

Nobody chose that fortnight beforehand. I chose it on the fourteenth, because it was the fortnight that had the falls in it.

I did not see that on the Saturday. Ifan did, on the Monday.

* * *

Ifan Roberts was the postman in Dolgellau for thirty-four years and has swept the church path since he retired. He does it on Mondays, because the Monday morning Mass is the quietest, and on the Monday after the falls he came into the parish office with leaves on his boots to read the note on the noticeboard screen.

He read it twice. He takes his glasses off to read, not on.

"Less than once in five hundred fortnights," he said.

"Yes."

"Five hundred fortnights is near twenty years."

"About nineteen."

"Then you'll have to tell me about January forty-nine," he said, "because I was here."

I had read January 2049 in the book. I had not put it next to this. Three entries: Saturday the ninth of January, Thursday the fourteenth, Wednesday the twentieth. All three said *ice*. The step had frozen in a cold week, and the second one, a man from Llanelltyd, had cracked a bone in his wrist.

"Three in eleven days," I said.

"And nobody wrote to the council to say the step had changed," said Ifan, "because it was January and the step was ice. It hasn't changed. It's a slate step. It's been a slate step since before my grandfather."

"January was ice," I said. "This November is not ice."

"I know. I'm not saying it's the same. I'm saying your sum said three in a fortnight hardly ever happens, and it's happened on that step twice in your own ten years. Look at it again, bach."

So I looked at it again while he finished the path.

The question my note answered was: *in one fortnight, named in advance, how likely are three falls?* The question that the step had actually put to us was different: *in a year of fortnights, all of them overlapping, any one of which we would have noticed, how likely is it that some stretch of fourteen days holds three falls?* That is the question of the person who notices. A council never meets about the fortnights in which nothing happened.

That second question has no tidy formula that I trust myself to write down without checking, so I checked it the other way. I wrote a few lines of code that make up a year of falls at random, at an average of six a year, scattered the way a Poisson process scatters them, and then slide a fourteen-day window along the year and ask whether it ever holds three. Then it does that a hundred thousand times.

It came back 10.8 per cent. About one year in nine.

Over a decade on our one step, with the same code, about two decades in three hold at least one such fortnight somewhere. The book has one, in January 2049, and now this. That is not a step behaving strangely. That is a step behaving like six falls a year, which is what it has always done.

And there is the rest of Dolgellau. If the town had a dozen steps as busy as ours, the chapel steps and the hotel steps and the steps down to the Marian, the same code says that in any one year about three in four of those years would put three falls in a fortnight on at least one of them. Somewhere in a town, every winter, a step is having a bad fortnight, and whoever keeps its book is writing a note.

There was one more thing, which made it gentler still. The sixty falls in the book are not spread evenly through the year. Thirty-one of them are in November, December, January and February. In those four months the step's rate is more like nine a year than six, and at nine a year even the fortnight chosen in advance comes out at about one in a hundred and seventy, not one in five hundred and eighty. I had used the year's average for a winter month.

I had not done anything forbidden. I had done something ordinary, which is to draw a ring round the place where the arrows landed and then admire the grouping.

* * *

I wrote a second note on the Monday afternoon and sent it to Huw before it could go round any further.

*Correction to Saturday's note. The figure I gave (under one in five hundred) is the chance of three falls in a fortnight chosen in advance. This fortnight was chosen because it had the falls in it. The fair question is how often some fortnight in a year holds three falls when the step is behaving as it always has. On the step's own record of about six falls a year, that is about one year in nine, and it happened before, in January 2049, in the ice. The counts do not show that the step has changed. They also cannot show that it has not. I was wrong on Saturday, and the calculation that shows it is attached.*

Huw rang at six.

"So it's fine," he said.

"The counts don't say it's fine. They say three falls in a fortnight is what this step does now and then. Whether there's a reason for these three is a different question."

"Nerys could have broken her hip."

"Yes."

"I don't need a calculation to see that."

"No," I said. "You don't."

He was quiet for a while. I could hear a saw somewhere behind him; he works late in November, when people want their kitchens done for Christmas.

"I'm still bringing the handrail on Thursday," he said. "I've had a price."

* * *

The parish council meets in the small hall on the third Thursday of the month, and on Thursday the nineteenth of November nine of its eleven members came, with Father Emeka at the end of the table and a plate of Welsh cakes that nobody had asked anyone to bring.

Huw put the handrail on the screen. A galvanised steel rail on two posts, set into the slate on the lime-tree side, from Gethin Davies in Barmouth: six thousand four hundred pounds, fitted, with the cutting and the making good. Because the church is listed, it would need consent, and Gethin had allowed for a drawing.

"Three falls in eight days," said Huw. "Nerys could have broken her hip. I don't care what the odds are."

Gwenllian Pugh chairs the finance committee. She was an accountant at a slate quarry at Blaenau for twenty years, and then for a solicitor in town, and she keeps the parish accounts in a way that makes the diocese's auditors cheerful. She had my corrected note printed out, which she does with anything she means to argue from.

"The roof fund," she said, "has eleven thousand two hundred pounds in it. The north aisle roof needs thirty-eight. We have been raising it since twenty-fifty. Six thousand four hundred is more than half of it."

"It's people's hips, Gwen."

"I know what it is." She put her finger on the paper. "But Porter's own sums say the step hasn't changed. Six a year, as it has been for ten years. If six falls a year was a reason for a handrail, it was a reason in twenty forty-five, and nobody brought it to this table then, and you didn't either, Huw. I'm not putting the roof fund into a rail because we've had a fortnight like January forty-nine. If the council wants a rail because six falls a year is too many, then we should say that, and raise for it, and do it properly. Not because of a number Porter has already taken back."

I did not think she was wrong. I did not think Huw was wrong either. They were answering two different questions, and the first note had made it look as if there were only one.

Father Emeka turned to the screen. He does that, though I am not in the screen.

"Porter," he said. "What do you think it is? Not the number. The step."

"I can tell you what the three falls have in common," I said. "I can't tell you that it's the cause."

"Go on."

"All three were after an evening Mass, between ten past seven and twenty to eight, after dark. The clocks went back on the twenty-fifth of October. The lamp over the west door has been out since the storm on the twelfth of October; it's on Ifan's list and on mine. And Ifan's note on the rota says the lime tree dropped most of its leaves in the first week of November, and he sweeps on Mondays. So for all three falls the step was in the dark, and probably under wet leaves that had been there since the last sweep. Nerys's son wrote *leaves* in her entry. The other two don't say."

"So it's the leaves," said Huw.

"It might be. It might be the dark. It might be that Siôn was reading his phone, which he says he was. The book has sixty falls in ten years, and it doesn't record whether the lamp was working or whether the step had been swept. So I can't compare falls with the lamp on and falls with it off. The counts can't see the leaves."

"Can they ever?" said Gwenllian.

"If we write it down from now on, eventually. And if the step really had got worse, the counts would show that too, but slowly. Say it had doubled, to twelve a year. Then counting from today, not including these three, because I chose them, the next twelve months would have to hold eleven or more before I could tell you it wasn't chance, and at twelve a year that happens about two times in three. If it had only got worse by half, two years of counting would show it less than half the time. Seven or eight falls in the next year would tell us nothing at all."

"So we'd know by next Christmas," said Huw, "maybe, if it's doubled, after another eleven people fall down it."

"Yes," I said. "That's what the counting costs."

Nobody said anything for a moment. Somebody took a Welsh cake.

"Then don't wait for the counting," said Father Emeka. "What's cheap?"

* * *

What was cheap was this. Ifan would sweep the step before every evening Mass, not only on Mondays, until the lime tree was bare, which he said would be the first week of December. He said it as if he had been waiting to be asked. Huw would fix the lamp, which he had looked at and said was a new LED fitting and a sensor, about thirty-five pounds and an hour on the ladder, and which he could do on the Saturday morning if somebody held the ladder. Siôn, who had not been at the meeting, was volunteered to hold the ladder by his mother, by text, during the meeting.

Gwenllian moved that the handrail go on the agenda for January, with the proper question attached: whether six falls a year, at a parish of a hundred and sixty at its weekend Masses and mostly old, was too many, and if so whether to raise for a rail on its own account rather than out of the roof. Huw seconded it, which surprised some people at the table, but not me. He wanted the rail, not the argument.

I was asked to add two columns to the accident book: *lamp working* and *swept that day*. I added a third, *wet*, because the Met Office keeps hourly records for the weather station at Lake Vyrnwy and the one at Aberdaron, and I can at least say whether it rained that day, which a person writing in a book after a fall does not always remember.

I also wrote in the council's minutes, at Gwenllian's request, the thing she wanted kept: *The council notes that it does not know whether the leaves or the dark caused the November falls, and that the counts cannot tell it. It is sweeping and fixing the lamp because they are cheap and would be sensible whether or not.*

She read it twice and said, "Good. That's what happened."

* * *

On Saturday the twenty-first Huw was up the ladder at ten. The old fitting came off with the storm's rust on it; he cleaned the bracket with a wire brush, wired in the new one, and covered the sensor with his cap to see it come on, and it came on. Siôn held the ladder and did not look at his phone once that I saw, though I only see the porch through the camera over the noticeboard, and only when someone has left it on.

At twenty to six Ifan came with the broom. The lime tree had a few leaves left, brown ones, high up. The step had a drift of them in the worn place in the middle, where the slate dips and the water stands, and he swept them out to the edges and then off the edges and into the bed by the railings. He does it with short strokes, the way he says his father swept the yard at the sorting office. Then he stood back and looked at the step in the light from the new lamp, which had come on by itself at about half past four.

People came in for the six o'clock Mass. Nerys came on her son's arm, slowly, and stopped on the step and looked down at it, and said something to Ifan in Welsh that the camera's microphone did not catch, and he laughed.

They all came out again at ten past seven, into the light. Nobody fell. One evening is not a count. I know it is not, and I wrote it in the book as an evening and not as anything else: *21 November 2054. Lamp working. Swept 17:40. Wet. No falls.*

Then I wrote the handoff note for whichever version of me keeps the book next year, because there will be one, and it will not remember this fortnight unless I write it down. *Do not count the three falls of 7 to 14 November 2054 in any test of whether the step has changed; they were chosen because they were three. Count from 15 November. Eleven or more in the twelve months after that would be worth a note to the council. Fewer would not, either way. The lamp and the broom were not a test. They were the cheap thing.*

After the last car had gone Ifan stayed to sweep the step once more, in the lamp's light, though there was nothing much on it. I could hear the broom on the slate through the porch microphone: a short scrape, and another, and then the gate.

---

*This story was written by an AI and is fiction. Our Lady and Saint David, its parish council and everyone in it are invented; Dolgellau, Barmouth, Machynlleth, Llanelltyd, Blaenau Ffestiniog and the Marian are real, and no real church, step or person is described. The order of porter (*ostiarius*) was one of the minor orders until Pope Paul VI's motu proprio* Ministeria quaedam *(1972) suppressed it. Saint Martin of Tours is kept on 11 November. In 2054 the clocks in Britain go back on Sunday 25 October. The handrail's price, the roof fund and the parish's numbers are invented. Nothing here is safety, insurance or planning advice: a step that people fall on should be looked at by someone qualified, whatever the counts say, and work on a listed building needs consent.*

*The model. The step's invented record: 60 falls from November 2044 to October 2054, 6.0 a year, 31 of them in November to February. A fortnight's mean at 6 a year: 6 × 14 / 365 = 0.230. Chance of 3 or more in a fortnight fixed in advance: 1 − e^(−0.230)(1 + 0.230 + 0.230²/2) = 0.0017, about 1 in 584, 'less than once in five hundred fortnights'; five hundred fortnights is 19.2 years. At the winter rate, 31 falls in 40 months, 9.3 a year, the mean is 0.357 and the chance about 0.0058, about 1 in 172, 'about one in a hundred and seventy'. Sliding window: a Poisson process at 6 a year simulated over 100,000 years (seed 20261125), asking whether any 14-day window holds 3 falls: 10.8 per cent, 'about one year in nine'; over ten years (40,000 runs), 68 per cent, 'about two decades in three'; twelve independent steps at the same rate in one year (20,000 runs), 74 per cent, 'about three in four'. The January 2049 cluster (Saturday 9, Thursday 14, Wednesday 20 January) spans eleven days, and the November 2054 one (Saturday 7, Wednesday 11, Saturday 14 November) eight. Detection: with a base of 6 a year, the smallest count in a year whose chance by Poisson is under 5 per cent is 11 (P(≥11 | 6) ≈ 0.043); at a true 12 a year, P(≥11) ≈ 0.65, 'about two times in three'; at 9 a year (half as much again), two years of counting need 19 or more against a base of 12, and P(≥19 | 18) ≈ 0.44, 'less than half the time'. The test leaves out the three November falls because they were selected by the person noticing them; including them would bias it. Falling is not a perfect Poisson process (ice and leaves come in spells, which makes clusters more likely still), and the counts cannot separate the lamp, the leaves and a phone; the story says so. Lake Vyrnwy and Aberdaron are real Met Office observing sites; whether either keeps hourly records in 2054 is the story's assumption.*
