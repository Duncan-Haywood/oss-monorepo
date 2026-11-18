# Negated feedback, 2026-11-17

`node eval/negated-feedback.mjs` (30 studio commands, 12 wardrobe-chat
sentences, written by hand for this check; none came from a real designer).
"Before" is the same script pointed at a copy of `main`'s `commands.mjs` and
`guide.mjs` (`node eval/negated-feedback.mjs <dir>`).

| | before (main) | after |
|---|---|---|
| studio commands read right | 15 of 30 | 29 of 30 |
| wardrobe chat sentences read right | 3 of 12 | 12 of 12 |

Six of the 30 studio sentences are controls with no negation (or one that only
looks negative: `add the text "No Fear"`, `call it Not Today`, `never mind`);
all six pass before and after. The one miss left is a question, `isn't navy
better`, which the reader takes as turning navy down: telling a question from
a refusal needs more than keywords.

Typical misses on main: `don't make it bigger` made it 15% bigger; `no
embroidery, screen print it` applied embroidery then screen print; `not for
men` chose men's fit; `not luxury` chose luxury; `no harsh winters, mild`
chose cold.

## After

```
ok   studio   "not black, make it cream" -> ["colour:cream"]
ok   studio   "make it white not black" -> ["colour:white"]
ok   studio   "no embroidery, screen print it" -> ["method:screen"]
ok   studio   "don't make it bigger" -> []
ok   studio   "don't make it bigger, make it smaller" -> ["scale:down"]
ok   studio   "switch to a hoodie instead of a tee" -> ["garment:hoodie"]
ok   studio   "no, make it white" -> ["colour:white"]
ok   studio   "not black but cream" -> ["colour:cream"]
ok   studio   "don't move it, just make it bigger" -> ["scale:up"]
ok   studio   "not on the back, put it on the front" -> ["area:front"]
ok   studio   "no puff print" -> []
ok   studio   "I don't want it on the sleeve" -> []
ok   studio   "use organic cotton, not polyester" -> ["fabric:organic-cotton"]
ok   studio   "never use fleece" -> []
ok   studio   "navy rather than black" -> ["colour:navy"]
ok   studio   "don't rotate it" -> []
ok   studio   "move it up, not down" -> ["move:0,-1"]
ok   studio   "without embroidery" -> []
ok   studio   "not a hoodie, a crewneck" -> ["garment:crewneck"]
ok   studio   "it shouldn't be red" -> []
ok   studio   "dtg not screen print" -> ["method:dtg"]
ok   studio   "anything but white" -> []
ok   studio   "make it bigger but not too much" -> ["scale:up"]
MISS studio   "isn't navy better" -> [] (want ["colour:navy"]) [hard]
ok   studio   "add the text \"No Fear\"" -> ["add"]
ok   studio   "call it Not Today" -> ["name:not today"]
ok   studio   "never mind" -> []
ok   studio   "make it cream" -> ["colour:cream"]
ok   studio   "move the print up a bit" -> ["move:0,-1"]
ok   studio   "make 150 pieces and sell them for 55 euros" -> ["price:55","quantity:150"]
ok   wardrobe "nothing cheap, good quality" -> {"tier":"premium"}
ok   wardrobe "not for men" -> {"fit":"unisex"}
ok   wardrobe "for women, not too formal" -> {"fit":"womens","style":"statement"}
ok   wardrobe "no harsh winters, mild" -> {"climate":"temperate"}
ok   wardrobe "not office, weekends" -> {"occasions":["casual"]}
ok   wardrobe "not luxury" -> {"tier":"premium"}
ok   wardrobe "not streetwear, classic" -> {"style":"classic"}
ok   wardrobe "women, no evening wear" -> {"fit":"womens","occasions":["casual"]}
ok   wardrobe "not for students, around 40" -> {"ageBand":"35-44"}
ok   wardrobe "not just for men, women too" -> {"fit":"unisex"}
ok   wardrobe "warm climate, never cold" -> {"climate":"warm"}
ok   wardrobe "minimal, nothing bold" -> {"style":"minimal"}

studio: 29 of 30 read right; wardrobe chat: 12 of 12
```

## Before (main)

```
MISS studio   "not black, make it cream" -> ["colour:black","colour:cream"] (want ["colour:cream"])
ok   studio   "make it white not black" -> ["colour:white"]
MISS studio   "no embroidery, screen print it" -> ["method:embroidery","method:screen"] (want ["method:screen"])
MISS studio   "don't make it bigger" -> ["scale:up"] (want [])
MISS studio   "don't make it bigger, make it smaller" -> ["scale:down","scale:up"] (want ["scale:down"])
ok   studio   "switch to a hoodie instead of a tee" -> ["garment:hoodie"]
ok   studio   "no, make it white" -> ["colour:white"]
ok   studio   "not black but cream" -> ["colour:cream"]
ok   studio   "don't move it, just make it bigger" -> ["scale:up"]
MISS studio   "not on the back, put it on the front" -> ["area:back","area:front"] (want ["area:front"])
MISS studio   "no puff print" -> ["method:puff"] (want [])
MISS studio   "I don't want it on the sleeve" -> ["area:sleeve"] (want [])
MISS studio   "use organic cotton, not polyester" -> ["fabric:organic-cotton","fabric:performance-poly"] (want ["fabric:organic-cotton"])
MISS studio   "never use fleece" -> ["fabric:fleece"] (want [])
MISS studio   "navy rather than black" -> ["colour:black"] (want ["colour:navy"])
MISS studio   "don't rotate it" -> ["rotate"] (want [])
MISS studio   "move it up, not down" -> ["move:0,-1","move:0,1"] (want ["move:0,-1"])
MISS studio   "without embroidery" -> ["method:embroidery"] (want [])
ok   studio   "not a hoodie, a crewneck" -> ["garment:crewneck"]
MISS studio   "it shouldn't be red" -> ["colour:red"] (want [])
ok   studio   "dtg not screen print" -> ["method:dtg"]
MISS studio   "anything but white" -> ["colour:white"] (want [])
ok   studio   "make it bigger but not too much" -> ["scale:up"]
ok   studio   "isn't navy better" -> ["colour:navy"] [hard]
ok   studio   "add the text \"No Fear\"" -> ["add"]
ok   studio   "call it Not Today" -> ["name:not today"]
ok   studio   "never mind" -> []
ok   studio   "make it cream" -> ["colour:cream"]
ok   studio   "move the print up a bit" -> ["move:0,-1"]
ok   studio   "make 150 pieces and sell them for 55 euros" -> ["price:55","quantity:150"]
ok   wardrobe "nothing cheap, good quality" -> {"tier":"premium"}
MISS wardrobe "not for men" -> {"fit":"mens"}
MISS wardrobe "for women, not too formal" -> {"fit":"womens","style":"classic"}
MISS wardrobe "no harsh winters, mild" -> {"climate":"cold"}
MISS wardrobe "not office, weekends" -> {"occasions":["office","casual"]}
MISS wardrobe "not luxury" -> {"tier":"luxury"}
MISS wardrobe "not streetwear, classic" -> {"style":"streetwear"}
MISS wardrobe "women, no evening wear" -> {"fit":"womens","occasions":["evening"]}
ok   wardrobe "not for students, around 40" -> {"ageBand":"35-44"}
MISS wardrobe "not just for men, women too" -> {"fit":"womens"}
ok   wardrobe "warm climate, never cold" -> {"climate":"warm"}
MISS wardrobe "minimal, nothing bold" -> {"style":"statement"}

studio: 15 of 30 read right; wardrobe chat: 3 of 12
```
