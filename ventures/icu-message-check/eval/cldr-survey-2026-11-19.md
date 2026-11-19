# CLDR plural survey, 2026-11-19

Output of `node eval/cldr-survey.mjs` on Node 22.23.5 (ICU 78.3, CLDR 48.0). For each language the runtime supports, how many of the integers 0..100 a message with only `one` and `other` gets wrong, that is, lands in a category the message lacks so the `other` text is shown.

```
{
  "runtime": {
    "node": "22.23.5",
    "icu": "78.3",
    "cldr": "48.0"
  },
  "languages": 217,
  "byCategoryCount": {
    "1": 32,
    "2": 136,
    "3": 29,
    "4": 11,
    "5": 5,
    "6": 4
  },
  "usingFewOrMany": 33,
  "usingZero": 10,
  "usingTwo": 23,
  "onlyOther": 32,
  "brokenByOneOther": 41,
  "ordinalWithMoreThanOther": 39
}
pl   100/101  few,many,one,other  e.g. 0, 2, 3, 4, 5, 6
ar    99/101  few,many,one,two,zero,other  e.g. 0, 2, 3, 4, 5, 6
ars   99/101  few,many,one,two,zero,other  e.g. 0, 2, 3, 4, 5, 6
be    92/101  few,many,one,other  e.g. 0, 2, 3, 4, 5, 6
ru    92/101  few,many,one,other  e.g. 0, 2, 3, 4, 5, 6
uk    92/101  few,many,one,other  e.g. 0, 2, 3, 4, 5, 6
lt    72/101  few,many,one,other  e.g. 2, 3, 4, 5, 6, 7
sgs   72/101  few,many,one,two,other  e.g. 2, 3, 4, 5, 6, 7
br    28/101  few,many,one,two,other  e.g. 2, 3, 4, 9, 22, 23
bs    27/101  few,one,other  e.g. 2, 3, 4, 22, 23, 24
hr    27/101  few,one,other  e.g. 2, 3, 4, 22, 23, 24
sr    27/101  few,one,other  e.g. 2, 3, 4, 22, 23, 24
lv    20/101  one,zero,other  e.g. 0, 10, 11, 12, 13, 14
prg   20/101  one,zero,other  e.g. 0, 10, 11, 12, 13, 14
mt    19/101  few,many,one,two,other  e.g. 0, 2, 3, 4, 5, 6
ro    19/101  few,one,other  e.g. 0, 2, 3, 4, 5, 6
gd    17/101  few,one,two,other  e.g. 2, 3, 4, 5, 6, 7
gv    16/101  few,many,one,two,other  e.g. 0, 2, 12, 20, 22, 32
kw    15/101  few,many,one,two,zero,other  e.g. 0, 2, 3, 21, 22, 23
ga     9/101  few,many,one,two,other  e.g. 2, 3, 4, 5, 6, 7
shi    9/101  few,one,other  e.g. 2, 3, 4, 5, 6, 7
cy     4/101  few,many,one,two,zero,other  e.g. 0, 2, 3, 6
cs     3/101  few,many,one,other  e.g. 2, 3, 4
dsb    3/101  few,one,two,other  e.g. 2, 3, 4
hsb    3/101  few,one,two,other  e.g. 2, 3, 4
sk     3/101  few,many,one,other  e.g. 2, 3, 4
sl     3/101  few,one,two,other  e.g. 2, 3, 4
blo    1/101  one,zero,other  e.g. 0
cv     1/101  one,zero,other  e.g. 0
he     1/101  one,two,other  e.g. 2
iu     1/101  one,two,other  e.g. 2
ksh    1/101  one,zero,other  e.g. 0
lag    1/101  one,zero,other  e.g. 0
naq    1/101  one,two,other  e.g. 2
sat    1/101  one,two,other  e.g. 2
se     1/101  one,two,other  e.g. 2
sma    1/101  one,two,other  e.g. 2
smi    1/101  one,two,other  e.g. 2
smj    1/101  one,two,other  e.g. 2
smn    1/101  one,two,other  e.g. 2
sms    1/101  one,two,other  e.g. 2
```
