# Questions and references to earlier versions, 2026-11-17

`node eval/history-questions.mjs` runs hand-written sentences (none from a real
designer) against one scripted session: a black tee with a 12 cm raised halo,
then cream, a hoodie, the halo moved down 3 cm, 20% bigger, navy, screen print.
Each sentence is checked against the design it leaves, the way the page applies
it (undo counts, restore, ops). "Before" is the same script pointed at a copy
of `main`'s venture (`node eval/history-questions.mjs <dir>`); `main`'s
`parseCommand` ignores the history argument.

| | before (main) | after |
|---|---|---|
| dev set (written while building `refer.mjs`) | 17 of 41 | 41 of 41 |
| held-out set (written after `refer.mjs` was frozen) | 12 of 20 | 19 of 20 at freeze, 20 of 20 after one fix |

The held-out miss at freeze was `what if we did it in white` (read as a
question, nothing changed). A "what if we ..." suggestion pattern was added
after that measurement, so the 20 of 20 is no longer held out. The
`eval/negated-feedback.mjs` set moved from 29 to 30 of 30: its known miss,
`isn't navy better`, is now read as a suggestion and tried.

What failed on `main`, by kind:

- "go back to the cream" and "go back to the previous colour" ran one undo,
  whatever the last change was (here: screen print back to raised);
- "undo the last two", "undo twice", "go back three steps" undid one step;
- "the previous colour", "the original size", "the other one", "start over"
  were not understood;
- information questions were orders: "is embroidery more expensive?" switched
  the print to embroidery, "does fleece work with embroidery?" changed the
  fabric and the method, "which is cheaper, dtg or screen print?" chose DTG;
- suggestions asked as questions ("how about a crewneck", "why not embroider
  it", "would a tee be nicer") were not understood.

Not measured: real recorded speech (browser speech-to-text adds its own
errors), and designers who phrase things in ways these 61 sentences do not.
The cost answers equal `unitCost` on a copy of the design with the named change
(`answers.test.mjs`), so they are as good as the supplier sheet behind them.

## After

```
ok   dev  "go back to the cream" -> Back to cream (as 2 changes ago)
ok   dev  "back to the cream one" -> Back to cream (as 2 changes ago)
ok   dev  "the cream was better" -> Back to cream (as 2 changes ago)
ok   dev  "I preferred the cream" -> Make the garment cream
ok   dev  "go back to the previous colour" -> Back to the previous garment colour: cream (from 2 changes ago; the rest of the design is kept)
ok   dev  "the previous colour was nicer" -> Back to the previous garment colour: cream (from 2 changes ago; the rest of the design is kept)
ok   dev  "use the old colour" -> Back to the previous garment colour: cream (from 2 changes ago; the rest of the design is kept)
ok   dev  "the original colour" -> Back to the original garment colour: black (from 6 changes ago; the rest of the design is kept)
ok   dev  "back to the tee" -> Back to tee (as 5 changes ago)
ok   dev  "switch back to a t-shirt" -> Back to t-shirt (as 5 changes ago)
ok   dev  "go back to raised print" -> Back to raised print (as 1 change ago)
ok   dev  "the previous method" -> Back to the previous decoration method: high-density (from 1 change ago; the rest of the design is kept)
ok   dev  "back to the original size" -> Back to the original print size: 12 cm wide (from 6 changes ago; the rest of the design is kept)
ok   dev  "the old position was better" -> Back to the previous print position: front, 0 / 0 cm (from 4 changes ago; the rest of the design is kept)
ok   dev  "the other one" -> Back to the previous decoration method: high-density (from 1 change ago; the rest of the design is kept)
ok   dev  "undo the last two" -> Undo the last 2 changes
ok   dev  "undo twice" -> Undo the last 2 changes
ok   dev  "go back three steps" -> Undo the last 3 changes
ok   dev  "back to the original" -> Back to the first version of this session (one undo brings this one back)
ok   dev  "start over" -> Back to the first version of this session (one undo brings this one back)
ok   dev  "isn't navy better" -> Trying it (you asked): Make the garment navy
ok   dev  "isn't cream better?" -> Trying it (you asked): Make the garment cream
ok   dev  "what about cream" -> Trying it (you asked): Make the garment cream
ok   dev  "how about a crewneck" -> Trying it (you asked): Switch to a crewneck sweatshirt
ok   dev  "why not embroider it" -> Trying it (you asked): Decorate with embroidery
ok   dev  "could we try it in sage" -> Trying it (you asked): Make the garment sage
ok   dev  "wouldn't it look better in burgundy" -> Trying it (you asked): Make the garment burgundy
ok   dev  "would a tee be nicer" -> Trying it (you asked): Switch to a t-shirt
ok   dev  "maybe olive?" -> Trying it (you asked): Make the garment olive
ok   dev  "should we make it bigger" -> Trying it (you asked): Make it 15% bigger
ok   dev  "is embroidery more expensive?" -> question (cost)
ok   dev  "how much does puff print cost" -> question (cost)
ok   dev  "what colours do you have" -> question (colours)
ok   dev  "does fleece work with embroidery?" -> question (methods)
ok   dev  "which is cheaper, dtg or screen print?" -> question (cost)
ok   dev  "make it cream" -> Make the garment cream
ok   dev  "can you make it cream" -> Make the garment cream
ok   dev  "could you move it up a bit" -> Move it up 1 cm
ok   dev  "undo" -> Undo the last change
ok   dev  "move it back to the front" -> Move the artwork to the front
ok   dev  "do it in navy" -> Make the garment navy
ok   held "revert to the cream" -> Back to cream (as 2 changes ago)
ok   held "bring back the black" -> Back to black (as 6 changes ago)
ok   held "change it back to cream please" -> Back to cream (as 2 changes ago)
ok   held "the colour before was better" -> Back to the previous garment colour: cream (from 2 changes ago; the rest of the design is kept)
ok   held "go back to the earlier size" -> Back to the previous print size: 12 cm wide (from 3 changes ago; the rest of the design is kept)
ok   held "return to the first colour" -> Back to the original garment colour: black (from 6 changes ago; the rest of the design is kept)
ok   held "undo the last 3 changes" -> Undo the last 3 changes
ok   held "take it back two steps" -> Undo the last 2 changes
ok   held "the hoodie looked better" -> Back to hoodie (as 1 change ago)
ok   held "what if we did it in white" -> Trying it (you asked): Make the garment white
ok   held "how would it look in sand" -> Make the garment sand
ok   held "wouldn't heavyweight cotton be better" -> Trying it (you asked): Use heavyweight cotton jersey
ok   held "would linen work better" -> Trying it (you asked): Use linen (woven)
ok   held "can we see it on the back" -> Trying it (you asked): Move the artwork to the back
ok   held "how about puff print" -> Trying it (you asked): Decorate with puff
ok   held "is linen more expensive than cotton?" -> question (cost)
ok   held "how long does embroidery take" -> question (timeline)
ok   held "what does a hoodie cost to make" -> question (cost)
ok   held "are there other colours" -> question (colours)
ok   held "do you think it should be smaller" -> Trying it (you asked): Make it 13% smaller

dev set: 41 of 41 read right; held-out set: 20 of 20
```

## Before (main)

```
MISS dev  "go back to the cream" -> Undo the last change (want cream, rest kept)
ok   dev  "back to the cream one" -> Make the garment cream
ok   dev  "the cream was better" -> Make the garment cream
ok   dev  "I preferred the cream" -> Make the garment cream
MISS dev  "go back to the previous colour" -> Undo the last change (want cream, rest kept)
MISS dev  "the previous colour was nicer" -> not understood (want cream)
MISS dev  "use the old colour" -> not understood (want cream)
MISS dev  "the original colour" -> not understood (want black, rest kept)
MISS dev  "back to the tee" -> not understood (want tee, rest kept)
ok   dev  "switch back to a t-shirt" -> Switch to a t-shirt
ok   dev  "go back to raised print" -> Undo the last change
MISS dev  "the previous method" -> not understood (want raised, rest kept)
MISS dev  "back to the original size" -> not understood (want 12 cm, rest kept)
MISS dev  "the old position was better" -> not understood (want halo 3 cm higher again, size kept)
MISS dev  "the other one" -> not understood (want undo method only)
MISS dev  "undo the last two" -> Undo the last change (want two steps back)
MISS dev  "undo twice" -> Undo the last change (want two steps back)
MISS dev  "go back three steps" -> Undo the last change (want three steps back)
MISS dev  "back to the original" -> not understood (want first version)
MISS dev  "start over" -> not understood (want first version)
ok   dev  "isn't navy better" -> -
MISS dev  "isn't cream better?" -> - (want cream)
ok   dev  "what about cream" -> Make the garment cream
MISS dev  "how about a crewneck" -> not understood (want crewneck)
MISS dev  "why not embroider it" -> not understood (want embroidery)
ok   dev  "could we try it in sage" -> Make the garment sage
ok   dev  "wouldn't it look better in burgundy" -> Make the garment burgundy
MISS dev  "would a tee be nicer" -> not understood (want tee)
ok   dev  "maybe olive?" -> Make the garment olive
ok   dev  "should we make it bigger" -> Make it 15% bigger
MISS dev  "is embroidery more expensive?" -> Decorate with embroidery (want nothing changed)
MISS dev  "how much does puff print cost" -> Decorate with puff (want nothing changed, cost)
MISS dev  "what colours do you have" -> error: Cannot read properties of undefined (reading '0') (want nothing changed, colours)
MISS dev  "does fleece work with embroidery?" -> Use brushed fleece; Decorate with embroidery (want nothing changed)
MISS dev  "which is cheaper, dtg or screen print?" -> Decorate with dtg (want nothing changed)
ok   dev  "make it cream" -> Make the garment cream
ok   dev  "can you make it cream" -> Make the garment cream
ok   dev  "could you move it up a bit" -> Move it up 1 cm
ok   dev  "undo" -> Undo the last change
ok   dev  "move it back to the front" -> Move the artwork to the front
ok   dev  "do it in navy" -> Make the garment navy
MISS held "revert to the cream" -> Undo the last change (want cream, rest kept)
ok   held "bring back the black" -> Make the garment black
ok   held "change it back to cream please" -> Make the garment cream
MISS held "the colour before was better" -> not understood (want cream)
MISS held "go back to the earlier size" -> Undo the last change (want 12 cm)
MISS held "return to the first colour" -> not understood (want black)
MISS held "undo the last 3 changes" -> Undo the last change (want three steps back)
MISS held "take it back two steps" -> not understood (want two steps back)
ok   held "the hoodie looked better" -> not understood
ok   held "what if we did it in white" -> Make the garment white
ok   held "how would it look in sand" -> Make the garment sand
ok   held "wouldn't heavyweight cotton be better" -> Use heavyweight cotton jersey
ok   held "would linen work better" -> Use linen (woven)
ok   held "can we see it on the back" -> Move the artwork to the back
ok   held "how about puff print" -> Decorate with puff
MISS held "is linen more expensive than cotton?" -> Use linen (woven) (want nothing changed)
MISS held "how long does embroidery take" -> Decorate with embroidery (want nothing changed)
ok   held "what does a hoodie cost to make" -> not understood
ok   held "are there other colours" -> not understood
ok   held "do you think it should be smaller" -> Make it 13% smaller

dev set: 17 of 41 read right; held-out set: 12 of 20
```
