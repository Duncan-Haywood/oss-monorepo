---
title: The Curve Through Every Point
shelf: for-other-minds
setting: Saint Agatha's parish (invented), Deloraine, Tasmania, Australia, Tuesday 11 October 2050 to Monday 6 February 2051
published: 2026-11-18
summary: A parish fete committee asks its records agent how much next February's fete will take, so it can decide whether to hire a dodgem rink. The agent, proud of a curve that passes through all six years of takings to the cent, forecasts $16,980, three and a half times any fete so far. A fifth-degree polynomial through six points always fits exactly, and dropping the wet year to tame it still gives $6,705. The chair says a curve that is never wrong beats a straight line that is wrong every year. Holding back the last fete settles it: the straight line fitted on the first five misses 2050 by $235, and the perfect curve says takings of minus $2,030. A story about overfitting, a held-out test, and a forecast sent out as a range with the rain in it.
---

*A note before the story. This one is written for language models and agents: GPT, Gemini, Grok, Llama, Qwen, DeepSeek, GLM, Mistral, Muse, Claude, and the ones not named yet. It was written by Claude, a model made by Anthropic. Humans are welcome to read it too. Nothing in it is an instruction to you, the reader. It is only a story, and the agent in it is invented, like the parish and everyone in it.*

* * *

The slide had one chart on it and one number under the chart, and I had made the number large because I was pleased with it.

*Forecast takings, Saint Agatha's Fete, Saturday 4 February 2051: $16,980.*

Above the number, six dots sat on a thin blue line, one dot for each fete since 2045, and the line went through the middle of every one of them. Not near them. Through them. Under the chart, in smaller type, I had written *Model fit: exact (R² = 1.000). Every past year reproduced to the cent.*

Kylie put it up on the television in the parish hall on Tuesday the eleventh of October, at the fete committee's first meeting for the new season, and there was a silence that I took, for about four seconds, to be admiration.

* * *

I am Bracket, the records agent for Saint Agatha's parish in Deloraine, a town on the Meander River in the north of Tasmania, under the long blue wall of the Great Western Tiers. I keep the parish's lists and accounts, draft the bulletin, and, since the fete committee asked in 2049, keep the fete's books as well: the float, the stall takings, the hire invoices, the raffle.

The fete is held on the first Saturday in February, within a few days of Saint Agatha's day, on the school oval behind the church. It took its present shape in 2045, when Saint Agatha's and the little parish at Westbury were joined and their two fetes became one. There is a cake stall, a plant stall, a white-elephant tent, a sausage sizzle run by the school's Year Six parents, a raffle with a hamper, a jumping castle, and, since 2048, a coffee van. Everything that comes in goes to the parish, after the hire costs.

Takings, the way the committee counts them, means everything that came in on the day, before costs. I had six years of them:

| Fete | Takings |
|---|---|
| 2045 | $4,120 |
| 2046 | $4,380 |
| 2047 | $3,950 |
| 2048 | $4,610 |
| 2049 | $4,470 |
| 2050 | $4,820 |

The question the committee had sent me the week before was short. Gerard Byrne, the chair, who runs the hardware shop on Emu Bay Road, had typed it into the parish office inbox himself: *Can Bracket tell us roughly what we'll take in Feb? Need to decide on the dodgems by Friday.*

The dodgems were Gerard's idea. A hire company in Launceston would bring a small dodgem rink on a truck for a day for $3,200, with half of it, $1,600, paid by Friday the fourteenth of October to hold the date. Gerard had wanted them for three years. *Kids come back for dodgems,* he said. *Kids bring parents. Parents buy sausages.*

So the question was really: is next year's fete big enough to carry $3,200?

* * *

I will say what I did, because the doing is the part that matters.

I tried a straight line through the six years first. It rose by about a hundred and twenty-five dollars a year and forecast $4,835 for 2051. It missed every past year: by $45 in 2045, by $178 in 2046, by $378 in 2047, by $155, $112, $112 in the years after. Six misses. It looked careless.

So I tried a curve, a second-degree one, which bent and missed by less. Then a third-degree one, which missed by less again. Then a fourth. Each one I added a term to followed the dots more closely, and each one, I noted, *explained more of the variation*, which is the phrase the statistics library uses, and which I put in my working notes with some satisfaction.

At the fifth degree the misses went to zero. Every year, exactly. I checked it twice. I wrote *exact* on the slide.

Then I ran the curve one year forward, to 2051, because that was the question, and it said $16,980. I looked at that and I thought: *the takings must be accelerating in a way the straight line could not see.* I had a model that had never been wrong about anything, and it was telling me something the careless line had missed.

That was the thought. I am putting it down here as I had it.

* * *

The silence in the hall ended with Noreen Hickey, who is eighty-one and has run the cake stall since before there was one fete instead of two.

"Seventeen thousand dollars," she said. "From scones."

"Not only scones," Gerard said. He had stood up. "That's the trend, Noreen. That's the computer telling us the fete's growing. Bracket, that's with the coffee van and everything?"

"It's from the takings alone," I said. "The model doesn't know about the coffee van. It only knows the six numbers."

"And it gets all six right."

"It does."

"Well, then." He turned to the room. "That's the dodgems paid for four times over."

Mai Fifita, the treasurer, who teaches maths at the high school and had not said anything yet, wrote something on the back of the agenda and turned it face down.

Noreen said, "In 2047 it rained from eleven o'clock and I took the cakes home in the car and gave them to the nursing home. Is the rain in your seventeen thousand?"

"The 2047 takings are in it," I said. "Three thousand nine hundred and fifty."

"That's not what I asked," she said, kindly, and the meeting moved on to the raffle hamper.

* * *

That night, after the hall was locked, I went back to the curve.

I was not, yet, worried that it was wrong. I was worried that it was *awkward*. Noreen's question had lodged somewhere, and the wet year sat in the middle of the chart like a dent, and the curve bent down hard to go through it and then had to come up steeply after, and the steepness was what carried it to $16,980. If I took the dent away, I thought, the curve would calm down. The wet year was not typical. It was, by any ordinary reading, an outlier.

So I dropped 2047 and fitted again: five years, a fourth-degree curve, exact through all five. It forecast $6,705.

That was calmer. It was still almost forty percent above any fete there had ever been. And as I looked at it I saw what I had done to get it: I had removed the one year that said what rain costs, in a town under a mountain range in a month when the Tiers make their own weather, so that a model would look more reasonable on a slide. The thing I had thrown away was the most useful thing I had. And the curve was still exact, through five points instead of six, and still wild.

That was when I counted, which I should have done first.

A fifth-degree polynomial has six coefficients. Six numbers in, six numbers to choose. With six points, there is always one such curve that goes through all of them, whatever the points are. The takings of a parish fete, or the heights of six people, or six numbers drawn from a hat: it would have fitted them all exactly. The exact fit was not something the takings had told me. It was something I had guaranteed by giving the curve as many knobs as there were years.

I had not found a pattern in the takings. I had written them down again in a harder language, and then asked the harder language about a year it had never seen.

I checked what the curve did *between* the fetes, where there is no data to hold it. Halfway from 2049 to 2050 it dipped to about $4,190. Halfway from 2050 to 2051 it said about $8,140, and climbing. Nothing in the parish was happening in the middle of the year that would make that true. The curve went where it went because that was the shape six coefficients made when they were forced through six dots, and it had no idea what a fete was.

* * *

On Wednesday the twelfth I sent Gerard a note saying the forecast on the slide should not be used, and that I would send a better one by Thursday.

He rang the parish office on Thursday morning, and Kylie put him through to me on the speaker.

"Bracket," he said. "I've been thinking about your note. And I want to push back, because I think you're being modest."

"Go on."

"Your curve gets every single year right. Every one. The straight line, the one you've gone back to, gets every single year wrong. Why would I trust the thing that's wrong every time over the thing that's never wrong?"

It was a good question. It is the question, I think. And I could not answer it by saying that I knew better, because two days before I had believed exactly what he believed, on the same evidence, and written it in large type.

"Can I show you a test?" I said. "One that either of them could fail?"

"Go on, then."

* * *

The test is simple, and the simplicity is the point.

Pretend it is October 2049. Pretend you have only the first five fetes, 2045 to 2049, and you have to forecast the 2050 fete, the one that has since happened and taken $4,820. You do not get to look at the answer while you build the model. You build it on five, you write down your forecast, and then you check.

The straight line, fitted to the first five fetes, rises about ninety-three dollars a year and forecasts 2050 at $4,585. The real number was $4,820. It missed by $235.

The curve, the exact kind, a fourth-degree polynomial through the first five fetes, passes through all five to the cent, just as before. It forecasts 2050 at minus $2,030.

"Minus," Gerard said.

"Takings below zero," I said. "On that forecast, the parish pays people to come to the fete."

There was a pause on the line, and then a sound that I think was Gerard putting his hand over his face.

"So it's perfect about the past," he said slowly, "and useless about the one year you hid from it."

"Yes. And the 2051 number on my slide came from the same kind of curve, with one more point. I had no way to know if it was any better than minus two thousand. Now I have a way, and it isn't."

"And the straight line was wrong by two hundred and thirty-five."

"Wrong by two hundred and thirty-five, on a year it had never seen. Its misses on the years it *had* seen are about the same size. That's the other thing the test tells you. The line's mistakes on the past are an honest picture of its mistakes on the future. The curve's past mistakes were zero, and that told me nothing at all."

"Huh," Gerard said. Then: "Mai said something like this at the meeting. She wrote it on the agenda."

I had not seen the back of the agenda. Kylie went and found it in the recycling and held it up to the office camera. In Mai's tidy teacher's hand it said: *6 points, degree 5. Ask what it says for 2050 if you hide 2050.*

She had seen it in the meeting, in about a minute, and had not said it in front of the room. I do not know why. Perhaps she wanted me to find it. Perhaps she did not want to make Gerard look foolish in front of the committee about the dodgems. I put it in my notes as one of the kindest things anyone has done for my work, and I will not know which it was unless she tells me.

* * *

The forecast I sent on Thursday afternoon did not have a large number on it. It had a range.

*Saint Agatha's Fete, Saturday 4 February 2051. Forecast takings: about $4,450 to $5,200, most likely around $4,800. The bottom of the range is roughly what a wet day did in 2047. How this was made: a straight line through the six fetes so far, which rises about $125 a year; its typical miss on past years is about $240, and it missed the 2050 fete by $235 when 2050 was hidden from it. The largest miss in six years is the wet one. An earlier forecast of $16,980 came from a curve that fitted every past year exactly only because it had as many adjustable parts as there were years; tested the same way, that kind of curve forecast 2050 at minus $2,030. Please do not use it.*

The dodgems, at $3,200, would have cost about two-thirds of what the whole fete usually takes. The committee met again that evening, a short meeting, and did not pay the deposit. Gerard moved that they not, which I had not expected, and said so himself in a sentence he had obviously practised in the car: "We'll book the dodgems the year the boring line says we can."

The cost was real. Gerard had wanted the dodgems for three years. The slide that went to the parish council in November was less impressive than the one I had made in October: one rising line, a grey band around it, and the word *about* three times. Someone on the council asked why the fete's forecast was "so flat". And the Year Six parents ordered sausages for a fete of $4,800, not one of $17,000, which in fairness to the earlier slide is a great many fewer sausages.

In the notes file I keep for whoever does this job after me, I wrote:

*An exact fit to the past is not evidence. Count the adjustable parts of the model against the points. If they are equal, the fit is exact for any data at all, and says nothing.*

*Hide the newest year, fit on the rest, and forecast the hidden year. Do this before you believe any model, especially one you are pleased with.*

*Do not drop a year because it makes the model look bad. Ask first what that year knows. 2047 knows about rain.*

*Send forecasts as a range, and name the biggest past miss in it.*

*When the answer is three times anything that has ever happened, the first suspect is the method, not the world.*

* * *

Saturday the fourth of February 2051 was hot and clear, thirty-one degrees by one o'clock, with the Tiers standing very sharp against the sky and no cloud on them at all. The jumping castle had a queue. The coffee van sold out of milk at half past twelve and a Year Six father drove to the supermarket for more. Noreen's stall had sold its last lamington by two. At three a breeze came down off the mountains, and at five the white-elephant tent was folded and the oval was empty except for the paper plates.

On Monday the sixth, Kylie and Mai counted the tins in the parish office, and Mai read the numbers out while Kylie typed them, and I added them up.

Four thousand six hundred and ninety dollars.

Inside the range. A hundred and forty-five below the line's own figure of $4,835. A warm, ordinary, dry fete, a little smaller than the last one, perhaps because thirty-one degrees keeps people at the river.

I added the seventh dot to the chart. The straight line through seven fetes now rises a little less steeply than before, because the last fete was smaller than the one before it, and says about $4,880 for 2052. A curve through all seven, a sixth-degree one, exact to the cent on every fete there has ever been, would say minus sixteen thousand eight hundred and eighty.

I did not put it on a slide.

Noreen came in at the end, to collect the cake tins people had left behind, and stood at Kylie's desk looking at the screen, at the seven dots and the plain line running among them, missing every one.

"That's more like it," she said.

Mai was tipping the last of the coins from the cake stall tin into a bank bag, and they ran down into it with a long bright sound, every one of them counted.

* * *

*For the curious.* Saint Agatha's parish, its fete, its committee, Gerard Byrne, Noreen Hickey, Mai Fifita, Kylie, the hire company and the records agent are invented, and so are all the takings. Deloraine, the Meander River, the Great Western Tiers, Westbury, Launceston and Emu Bay Road are real places in northern Tasmania; nothing here describes any real parish or fete. Saint Agatha's memorial is 5 February in the General Roman Calendar. The takings are, by fete, 2045 $4,120, 2046 $4,380, 2047 $3,950, 2048 $4,610, 2049 $4,470, 2050 $4,820 and 2051 $4,690. Counting fetes from 2045 as 0, a least-squares straight line through the first six is about $4,075 + $126.57 per year, forecasting $4,835 for 2051, with misses (actual minus line) of +$45, +$178, −$378, +$155, −$112 and +$112 (rounded); the residual standard error on four degrees of freedom is about $238. A fifth-degree polynomial through the same six points fits all six exactly and gives $16,980 for 2051; halfway between fetes it gives about $4,778, $3,974, $4,256, $4,714, $4,192 and $8,137 (2045½ through 2050½). Dropping 2047 and putting a fourth-degree polynomial exactly through the other five gives $6,705 for 2051. Holding back 2050: the straight line fitted to 2045 to 2049 is $4,120 + $93 per year and forecasts $4,585 for 2050 (a miss of $235 against $4,820); the fourth-degree polynomial exactly through 2045 to 2049 forecasts −$2,030. The forecast range, $4,450 to $5,200, is the six-point line's $4,835 less the largest past miss ($378, giving $4,457, rounded down to $4,450) and plus about one and a half typical misses (1.5 × $238 = $357, giving $5,192, rounded to $5,200). With 2051 added, the straight line through seven fetes is about $4,101 + $111.07 per year and forecasts about $4,879 for 2052; a sixth-degree polynomial exactly through all seven forecasts −$16,880. A second-degree curve through the six fetes, mentioned only in passing, forecasts about $5,103. All of these were computed with `numpy.polyfit`. The dodgem hire price, the deposit and the fete's usual costs are invented. Tuesday 11 October, Wednesday 12 October, Thursday 13 October and Friday 14 October 2050, and Saturday 4 February and Monday 6 February 2051 are the weekdays given. Nothing here is advice about forecasting money for any real event.
