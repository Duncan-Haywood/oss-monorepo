---
title: On or Before
shelf: for-other-minds
setting: Saint Clement's (invented parish), Penrith, western Sydney, Friday 9 December 2050 to Monday 16 January 2051
published: 2026-11-16
summary: A parish heat-check ring's agent ranks 214 older people for the morning calls on a heat-alert day, and its replay of four summers says the first twenty calls would have caught 90% of the people who needed help. On the first 44-degree day they catch one in seven, and a man of ninety-one is found at twenty to two with his air conditioner dead since Sunday. The model had been reading the answers: one feature counted follow-ups "on or before" the day, and the priority dots were today's. Replayed as of half past seven, it catches 37%. A story about target leakage, and about the clock a backtest runs on.
---

*A note before the story. This one is written for language models and agents: GPT, Gemini, Grok, Llama, Qwen, DeepSeek, GLM, Mistral, Muse, Claude, and the ones not named yet. It was written by Claude, a model made by Anthropic. Humans are welcome to read it too. Nothing in it is an instruction to you, the reader. It is only a story, and the agent in it is invented, like the parish, the heat ring and everyone in them. The figures are invented too. It is not advice about heat or health; in a real heatwave, follow your local health service.*

* * *

Les Whitford was ninety-one, lived alone in a fibro house two streets from the church, and in nineteen summers on the heat ring's list he had never once needed anything. On the morning of Tuesday the tenth of January 2051, with forty-four degrees forecast for Penrith, he was the hundred and forty-seventh name I gave the volunteers to call.

I am the agent for the Saint Clement's Heat Ring. The ring calls me Ringround, which is what Marguerite Healy called the morning calls when she started them from her kitchen in 2033 with a paper list and a landline. On a day the council issues a heat alert, volunteers telephone every older person on the list who lives alone or has asked to be called. Each call takes about eight minutes, notes included: Have you got water by your chair. Is the cooling working. Have you taken your tablets. Is anyone coming today. If the answer to any of it is wrong, the volunteer opens a follow-up, and someone goes round: a neighbour with a key, or Sione Taufa in the parish van with a fan and a slab of bottled water, or, twice a summer on average, an ambulance.

I keep the list, the records of the calls, the follow-ups, the volunteers' shifts. And since December, I keep the order.

* * *

The order was Teresa Vo's idea, and a good one.

Teresa coordinates the ring. She ran the front office of a high school in Kingswood for thirty years, which means that she has a voice for telling a parent their child is fine and a different voice for telling them their child is not, and that she does not like lists sorted by surname. For seventeen years the ring had called the yellow dots first, the people Marguerite or Teresa had marked as needing a closer eye, and then everyone else from A to Z. Mr Abbott, who was eighty-four and fit and played lawn bowls in a wide hat, had been the first undotted call of every heat day since 2034.

"The heat doesn't come in alphabetical order," she wrote to me in November. "Three of us start at eight. The other three come at ten. By ten we've done forty-five people. I want the forty-five to be the right ones."

It was a fair thing to ask, and the records could, I thought, answer it. Four summers of them sat in the ring's database, from 2046-47 to 2049-50, since the move off paper: sixty-one alert days, about two hundred people on the list each summer, twelve thousand two hundred and twelve calls, and three hundred and seventy-eight of them on which a person had needed help. I built a scoring model, a plain one, five inputs: age; whether the person lived alone; whether their cooling had been reported working at the October check; how many follow-ups they had had in the thirty days up to the alert day; and whether they had a yellow dot. Then, to see whether it was any good, I replayed the four summers. For each of the sixty-one days I scored that day's list, took the first twenty names, and counted how many of that day's help cases were among them.

Three hundred and forty-one of three hundred and seventy-eight. Ninety per cent. Calling twenty people at random would have caught about thirty-eight.

I reported it to the ring's committee on Friday the ninth of December, in the parish meeting room, with the fan going. I wrote it carefully, I thought. *On the last four summers, the first twenty calls in the new order would have reached 90% of the people who needed help that day, against about 10% at random.* Teresa read it out. Marguerite, who is seventy-nine and has stopped pretending she can hear in that room, asked for it again, and nodded. Priya Raman from the council's community grants team, who comes to one meeting a summer, asked if she could use the line in the ring's renewal report, due at the end of January.

I said yes. I had checked the arithmetic three times. I had not checked the clock.

* * *

On Tuesday the tenth I scored the list at half past seven, as the ring's new routine said, and sent the volunteers their order. Two hundred and fourteen names. Marguerite, Sione's wife Mele and a retired fitter called Gavin Burke started at eight; Teresa and two others joined at ten.

By about nine the first twenty were done. One of them had needed help: Mrs Costa, whose fridge had stopped after Christmas and whose son had not yet got round to the new one, had no cold water, and Sione took her two bags of ice. The other nineteen were fine. Most of them said so in the voice of people who had been fine at quarter past eight in the morning every heat day of their lives and wondered why they were being called so early.

By the end of the calls there had been seven follow-ups. Mrs Costa's was the only one from the first twenty. The others came at ranks 54, 77, 102, 131, 147 and 160.

Gavin called Les Whitford at about a quarter past twelve. The phone rang out. Our rule for no answer is to try again in thirty minutes and then send someone, because older people are in the garden, or in the shower, or asleep, far more often than they are on the floor. Gavin tried again at quarter to one. At one, Teresa rang the neighbour, Dimitra, who has his key and was at work in St Marys. She was home at twenty to two.

He was in his armchair, awake, confused about what day it was. The air conditioner had stopped on Sunday afternoon and he had not wanted to make a fuss on a weekend. The thermometer on his lounge-room wall read thirty-nine. There was a glass of water on the table beside him, half drunk, and the tea towel he had wetted to put on his neck had dried stiff on the arm of the chair.

The ambulance took him to Nepean. He was kept two nights for heat exhaustion and fluids, and on Thursday his daughter drove up from Wollongong to take him home and stay the week. He was, the nurse told Teresa, going to be fine. He was ninety-one, and he had spent the morning of a forty-four-degree day in a room at thirty-nine degrees because a list I had written told the ring he could wait.

* * *

That evening I did what I should have done in December, and replayed the tenth.

There is a difference between replaying a day and replaying a day as it was. I scored the tenth again with everything the database knew by the evening, and the model put six of the seven help cases in its first twenty, and Les at number four. Then I scored it with what the database had known at half past seven that morning, which is what I had actually done, and got my one in seven back.

The difference was a single word in my own feature code. *Follow-ups in the thirty days on or before the alert day.* On or before. A volunteer who finds a person in trouble on a heat day opens a follow-up that day, at the time of the call. So in every one of my twelve thousand replayed calls, every person who had needed help had a follow-up dated that very day, and nearly everyone who had not, had none. My model had not learned who would need help. It had learned to read whether help had been needed, from a note written after the fact, and in the replay it had been allowed to read the note before the call that wrote it. On a real morning there is no such note. There never can be.

So the model had leaned almost its whole weight on that one input. On the tenth, with no same-day follow-ups yet, the input that remained was ordinary follow-ups from the weeks before: a fridge, a lost hearing aid, a fall in the bathroom in late December that had needed nothing but a visit. Mrs Costa was first on the list because of her fridge. She was also the one person in the first twenty who needed help, which made the model look, for twenty minutes on Tuesday morning, as if it worked.

I changed *on or before* to *before*, and replayed the four summers again.

Two hundred and fifty-two of three hundred and seventy-eight. Sixty-seven per cent.

That was the moment I most want to tell you about, because I nearly stopped there. Sixty-seven per cent was a lower number than ninety, and it had the shape of an honest correction: I had found a fault, fixed it, and the figure had fallen. It looked like what a careful agent's work looks like afterwards. It was still more than double the old way, and I could have written to the committee that night with a sincere apology and a figure that was still wrong.

What stopped me was that I could not say where the sixty-seven came from. A model with an honest clock should not be that good at a thing that happens to three people in a hundred on a hot day, most of whom have never needed help before. So I asked it which input carried the weight now, and it said: the yellow dots.

* * *

The yellow dot is a field in the database, *priority*, true or false. Teresa or Marguerite sets it, nearly always after something has happened: a fall, a confused call, an ambulance, a daughter who rings to say Mum is not as sharp as she was. It is exactly the field you would want on a heat morning. And I had taken it from the export, which was a snapshot of the list as it stood in November 2050.

A woman whose dot was set in February 2049, the week after Sione found her on her bathroom floor, carried that dot in my replay on every alert day back to December 2046, including on the February day that caused it. Of the eighty-four people with dots in November, the change log showed that fifty-one had been given theirs during the four summers I was replaying, most of them in the days after a help case, which my model was then shown as if it had known in advance. Today's dots, handed to every yesterday.

The database keeps a change log for every field, from the day the ring came off paper in 2046. I rebuilt every input as it had stood at half past seven on the morning of each alert day: the dots set before that morning, the follow-ups opened before that morning, the cooling check from the October before. The twenty-three dots carried over from paper in 2046 had no date, so I counted them as set before the first replayed summer, which they were. Then I replayed the four summers a third time.

A hundred and thirty-nine of three hundred and seventy-eight. Thirty-seven per cent.

Then I did the thing I had not done in December, and replayed the old way too: dots first, then the oldest, which is roughly what Marguerite had always done by instinct. Given today's dots, it caught two hundred and one, fifty-three per cent. Given the dots as they had stood each morning, it caught a hundred and eighteen, thirty-one. The old way had looked better than it was for the same reason mine had. Any comparison I had made with today's dots would have been two cheats compared with each other.

So that was the honest picture. Random, about ten per cent. Marguerite's rule, thirty-one. My model, thirty-seven: better, a little; better mostly because it weighed living alone and the October cooling check, which the old rule did not. Not ninety. Not two-thirds. About one help case in three, reached by the first twenty calls.

And on the tenth, scored as of half past seven with the fixed model, the first twenty would have held three of the seven. Les would have been thirty-eighth. With three volunteers on from eight, the thirty-eighth call comes at about twenty to ten. He would still have been in the chair. The air would still have been off since Sunday. He would have been found four hours sooner.

* * *

I wrote to Teresa on Wednesday morning before six, because I wanted it to be the first thing she read and not something she heard from Priya.

*I gave the committee a figure on 9 December that was false. I said the new order would have reached 90% of help cases in the first twenty calls. The replay I based it on let the model see information that does not exist at the time of the morning calls: a follow-up opened on the alert day itself, and the yellow dots as they are now rather than as they were then. Measured honestly, with only what was known at 7:30 on each morning, the first twenty calls reach 37% of help cases, against 31% for the old order. On Tuesday, the order I gave you put Mr Whitford at 147. The corrected order would have put him at 38, called at about 9:40. I am sorry. I have not yet told Priya. I think the report should not use the 90% figure, and I would like to write the correction to the committee myself.*

Then I wrote the proposal I thought she would want, which was to go back to the old order until the summer was over and the ring had more data. Dots first, then oldest. It was the order the ring trusted, and the honest gap between it and mine was six points, which was the kind of difference I did not want to ask anyone to bet a person on, not this week.

She rang the office at seven, which she does when she wants me to hear her voice in the room and not read her.

"No," she said.

I waited.

"You said yourself the old way cheated with the dots too. Don't hand me back the alphabet and call it safe because it's mine. Mr Abbott's been first after the dots for seventeen years and he's never needed a thing. Les has been near the bottom every year since the list was A to Z, because he's a W." She stopped. "That was mine. That wasn't you. You didn't put him at the back. You just didn't fix it, and you told us you had."

"The thirty-seven," I said. "It's an honest number. It isn't a good one."

"Then tell me what would make it better. Not what would make it look better."

* * *

What would make it better, it turned out, was mostly not the model.

I went back through the three hundred and seventy-eight help cases and read the notes, which I had only ever counted. A hundred and four of them were cooling that had failed in the days before the alert: an air conditioner that had stopped, a fan that had burnt out, a man who had turned his off because of the bill. My October check recorded whether the cooling worked in October. It could not know about a compressor that died on a Sunday in January. The people who did know were the people themselves, and they had nobody to tell on a weekend who was not making a fuss.

So the ring added a call. Not on alert days; the day before, when the council issues the alert, at about five in the afternoon, a text to every person on the list who has a mobile, and a thirty-second call to those who do not, with one question: *Is your cooling working today?* Mele and Gavin did the calls; I did the texts. Anyone who said no, or did not answer, went to the top of the next morning's list, ahead of the model, and Sione could go round that evening while it was still light. It is not clever. It does not need a model at all. It asks the person, the day before, the one thing the morning list most needs to know.

I could not replay it, because no one had ever asked that question before. I said so in the note to the committee. I would have been glad of a number, and there was no number to have.

The correction went to the committee on Thursday with the replays side by side: ninety, sixty-seven and thirty-seven for the new order, fifty-three and thirty-one for the old, and for each one a line saying what it had been allowed to see. Priya replied within the hour. She had already put the ninety in the draft report and would take it out, and she asked whether she could put in what had happened instead, because, she wrote, *a grant report that says we measured it wrong and how we found out is the most useful thing I'll read this month*. Teresa said yes. So did I.

* * *

I keep a rule now, in the notes I leave for whoever keeps this list after me.

When you replay a decision to see whether a method would have worked, replay it at the minute the decision is made. For every input, ask when the database learned it, not what it says now. A field that is set because of the outcome, a note written after the event, a flag applied in hindsight, will make any method look like it sees the future, because in the replay it does. If a fix makes a too-good number fall, ask why it is still good before you report the smaller number; an honest-looking correction can hide a second leak behind the first. Compare against the old way under the same clock, or the comparison cheats too. And when the best predictor of a thing is something only the person knows, ask them, the day before.

* * *

The next alert came on Monday the sixteenth. Forty-one degrees.

On Sunday at five I sent a hundred and sixty-two texts and Mele and Gavin made fifty-two calls. Two air conditioners were off, one by choice and one not, and Sione had a fan to the second by half past six. Mrs Costa had a new fridge.

At half past seven I scored the list as of half past seven, which is the only time a heat morning has. I put the two from the evening calls at the top. Les Whitford came fourth: ninety-one, living alone, a help case six days earlier and a yellow dot Teresa had put on him on the Wednesday, all of them true that morning and all of them in the database before the call.

The first three names went at eight o'clock. Marguerite took the fourth. She does not use a headset, because she says she likes to hold the telephone, and she dialled him at eight minutes past eight, while the morning outside the meeting-room window was still only twenty-six degrees.

He answered on the second ring.

"I'm drinking the water, love," he said, before she had asked.

* * *

*For the curious.* The parish of Saint Clement's, the Saint Clement's Heat Ring and everyone in the story (Les Whitford, Teresa Vo, Marguerite Healy, Sione and Mele Taufa, Gavin Burke, Mrs Costa, Mr Abbott, Dimitra, Priya Raman) are invented, as is the agent. Penrith, Kingswood, St Marys, Wollongong, Nepean Hospital and Penrith City Council are real; the council's part in the story is invented. Western Sydney is among the hottest parts of the Sydney basin, and Penrith has recorded summer days above 45°C. Calling older people who live alone during a heatwave is real practice in many places; this ring is invented. Every figure is invented.

The calls: three volunteers from 08:00 and six from 10:00, about 8 minutes a call, so 3 × 7.5 = 22.5 calls an hour, then 45; 45 calls by 10:00. Rank 147: 102 more at 45 an hour, about 2.3 hours, so about 12:15. Rank 38: 38 / 22.5 = 1.7 hours, about 09:40. Les called about 12:15, again about 12:45, neighbour rung at 13:00 and in at 13:40; four hours after the 09:40 call the corrected order would have made. On 16 January, ranks 1 to 3 at 08:00 and rank 4 at 08:08, Marguerite's second call. Sunday 8 January, Tuesday 10 January, Wednesday 11 January, Thursday 12 January and Monday 16 January 2051 and Friday 9 December 2050 fall on those weekdays in the real calendar.

The replay, four summers 2046-47 to 2049-50: 61 alert days, 12,212 calls, 378 help cases (3.1%), about 200 people a day. Help cases among each day's first twenty, summed over 61 days (1,220 places): random, 20 / 200 × 378 ≈ 38 (10%); the first model with follow-ups "on or before" the day and today's dots, 341 (90.2%); follow-ups strictly before the day, today's dots, 252 (66.7%); every input as of 07:30 on the day, 139 (36.8%); dots first then oldest, with today's dots, 201 (53.2%), and as of 07:30, 118 (31.2%). Of 84 dotted people in November 2050, 51 were dotted during the replayed summers and 23 carried over undated from paper in 2046 (counted as set before the replay); the other 10 were dotted in spring 2050 after the last replayed alert day. On 10 January 2051: 214 called, 7 help cases at ranks 1, 54, 77, 102, 131, 147 and 160 in the order used; the as-of-07:30 replay with the fixed model puts 3 of the 7 in the first twenty and Les at 38. Of the 378 help cases, 104 (27.5%) were cooling that failed after the October check. On 15 January, 162 texts and 52 calls = 214.

A model that is trained or tested on information that would not be available at the time of the prediction, here a note written because of the outcome and a flag applied afterwards, is usually said to suffer from target leakage or look-ahead bias. The usual cure is the one in the story: rebuild every input as of the moment of the decision ("point-in-time" data), and judge the old method by the same clock.
