// Does the singing choir (render.mjs `sing: true`, sing.mjs) sing the consonants that close each
// syllable? Read back from the rendered choir stem by onsets.mjs readCoda (closure and burst,
// frication, murmur and tap cues, run from the vowel forwards), never from the synthesiser's settings.
//   node eval/coda-check.mjs [--out eval/coda-check-report.md]
// A. Vowel-consonant syllables through the whole MIDI path, each followed by a rest: 30 of them
//    (every coda class, five vowels, clusters, and five bare vowels), at six pitches E2-E4, 120 BPM
//    quarter notes. Control: the vowel-only choir (`sing: 'vowels'`). readCoda's thresholds were set
//    on these syllables, so A is its training score.
// B. The five corpus pieces at final D3, 124 BPM: the last note of every syllable of 0.2 s or more,
//    read against latinCoda()'s first phone. No threshold was set on it, but it is not clean held-out
//    data: its first run's misses (60.5%) showed the reader's window cut off bursts at the next sound
//    and that /m/ after /u/ was barely a murmur, and both were fixed before the run reported here.
// C. Every syllable in the corpus: how often each closing consonant occurs.
// F. Fourth round (2026-11-15): final /l/ and the murmur's own tilt. Pre-registered here before the
//    first run with the change, its threshold fixed: a coda's murmur (both nasal rules in readCoda) must
//    be dark in itself, its energy above 1 kHz a median 28 dB or more under its band under 500 Hz
//    (`murmurTilt`). Set from held 0.5 s syllables measured with sing.mjs outside this script, E2-E4:
//    the sung /l/ 12-25 dB, /m/ and /n/ 38-54 dB, after every vowel. Predictions: (1) A's *al* and *el*
//    read as none on 11 or more of 12 (2 of 12 before); (2) no part's nasals read exactly less often;
//    (3) A, B, D and E totals no lower, vowel-only controls no lower; (4) F, the 51 files of the four
//    other gregobase-1908-* folders, never scored before: its /l/ codas read as a nasal on 10% or fewer,
//    its nasal codas read exactly no less often than with the rule off (`murmurTilt: 0`, printed beside).
// Seventh round (2026-11-15): the murmur against the vowel just before it (onsets.mjs NEAR). Pre-registered
//    here before D, E, H or F was run with the change. First registration (8 dB darker, 0 to -18 dB, level
//    held within 4 dB) withdrawn before any held-out part had finished: on a synthetic set (README) it read
//    9 of 9 vowel-only /u/ and /o/ releases on F3 as nasals, whose darkness wanders by 8 dB while their
//    level holds. Second registration adds the murmur's darkness held within 4 dB over its first 30 ms
//    (`tiltHold`), set on that synthetic set, A, B and I and not tuned further: A 157 to 160 of 180, B 147 to
//    155 of 162 (nasals 28 to 36 of 39), I 136 to 138 of 142 (nasals 30 to 32 of 36), every vowel-only
//    control unchanged. Against `--near off`: (1) the held-out nasals (D 11 of 12, E 18 of 22, H 38 of 46
//    on main) no fewer in any part and 71 of 80 or more together; (2) D, E and H totals no lower; their
//    vowel-only controls (68, 84, 131) and bare-vowel syllables read as none each within 1; (3) F's nasals
//    104 of 137 or more (96 on main), its /l/ none on 4 of 4; (4) no other eval calls readCoda, and the
//    synthesis is untouched, so eval/vowel-check.mjs and eval/consonant-check.mjs cannot move.
// Eighth round (2026-11-16): the n of an n-t, n-s or n-k cluster (onsets.mjs PRE, README "-unt read on its
//    stop"). Pre-registered here, committed before B, D, E, H, I or F was run with the rule. Settings (6 dB
//    darker than the vowel 25-45 ms before, entered by an 8 dB step within two hops, 40 ms, ending at most 5
//    frames before a closure or a fricative) chosen on synthetic syllables only: part J below (11 cluster
//    syllables and 28 others, E2-E4, quarter and eighth notes, sung and vowel-only), where cluster nasals read
//    46 to 124 of 132, the others 304 to 304 of 336 and the vowel-only control 445 to 445 of 468. Against
//    `--pre off` (the reader on main): (1) A's *unt* and *ant* read as nasal on 10 or more of 12 (7 now), A's
//    total 163 of 180 or more (160); (2) F's nasals 112 of 137 or more (106: 11 of its 31 misses are
//    -unt/-sunt/-tent clusters), its /l/ none on 4 of 4; (3) B, D, E, H and I totals each no lower, and their
//    cluster nasals together 9 of 11 or more (7); (4) every vowel-only control and every bare-vowel row
//    identical (the rule needs an obstruent after the murmur); (5) eval/vowel-check.mjs and
//    eval/consonant-check.mjs cannot move: readOnset and the synthesis are untouched.
// Ninth round (2026-11-16): a murmur thrown out by the obstruent after it (onsets.mjs AGAIN, README "nunc and
//    mens on C4"). readCoda's vowelAgain read every frame after a murmur, so the bright, loud /s/ of *mens* and the
//    one frame a murmur brightens as it hands over to a closure read as the vowel coming back, and the murmur was
//    thrown out. Now, when a closure or a fricative starts within 5 frames of the run's end, only the frames
//    between are read, and 2 or more must be vowel-like. Chosen on part J only (cluster nasals 124 to 127 of 132,
//    others 304 and control 445 unchanged). Pre-registered here and committed before part K or any other part
//    was run with it. Part K is new: 14 cluster syllables and 22 others never sung in any part, at B2, F3, A3, B3
//    and D4 (no pitch of A or J), 104 BPM, quarter and eighth notes, sung and vowel-only. Against `--again off`:
//    (1) K's cluster nasals no fewer, and at least 1 more; (2) K's other syllables read exactly within 1, and no
//    more of them read as a nasal than with the rule off; (3) K's vowel-only control identical; (4) A, B, D, E,
//    H, I and F totals each no lower, their nasals no fewer, every vowel-only control and bare-vowel row
//    identical; (5) eval/vowel-check.mjs and eval/consonant-check.mjs cannot move (readOnset and the synthesis are
//    untouched).
// Tenth round (2026-11-16): /i/ is not a voiced fricative (onsets.mjs VFRIC_HI5, README "/i/ is not a voiced
//    fricative"). K's misses showed /i/ read as a voiced fricative on 83 of its 119 other and vowel-only misses.
//    Read frame by frame (a vowel-only /i/ on A3): mid-note the low band sinks 8-18 dB and comes back, where the
//    five detuned voices' fundamentals beat out of phase, and /i/ keeps almost all its energy there, so the share
//    above 2.5 kHz passes 0.12 (the voiced-fricative rule) and on a short note's attack 0.5 (the fricative rule,
//    then "voiced" by its low band); its release does the same. The change: a frame counts as frication, voiced
//    or not, only with 12 dB or more energy above 5 kHz than the vowel's (`vfricHi5`). Chosen on synthetic
//    syllables at K's pitches only (sung z and v frames 66 to 110 dB over the vowel, the /i/ frames that misread
//    -13 to +3 dB; every /i/ syllable there then reads right, sung and vowel-only). Pre-registered here and
//    committed before part L or any other part was run with it. Part L is new: 16 syllables on /i/, 4
//    voiced-fricative codas (not Latin; there to show a real one still reads) and 12 others, none sung in any
//    part before, at G2, C3, D#3, G#3 and C#4 (no pitch of A, J or K), 96 BPM, half and quarter notes. Against
//    `vfricHi5: false` (printed beside, or `--vfric off`): (1) L's /i/ syllables read exactly no fewer, and at
//    least 8 more of 160; (2) L's vowel-only control on /i/ read as none no fewer, at least 8 more of 160; (3) L's
//    other syllables within 2, the rest of its vowel-only control no lower; (4) L's voiced-fricative codas read as
//    one within 4 of 40 (a lucky read on a trough frame goes); (5) A, B, D, E, H, I, F, J and K totals each no
//    lower, nasals no fewer, every vowel-only control no lower; K's other syllables 172 or more of 220 (166);
//    (6) eval/vowel-check.mjs and eval/consonant-check.mjs cannot move (readOnset and the synthesis untouched).
// Eleventh round (2026-11-16): the deep murmur on a high short note (onsets.mjs DEEP, README "E4 eighth notes: a
//    murmur read as a closure"). On J's E4 eighth notes *nunc*, *tunc*, *mens* and *sunt* read as a stop: the n sits
//    18-33 dB under the vowel and only 15-30 dB dark in itself (one harmonic of a 330 Hz voice under 500 Hz), too
//    deep for every nasal rule, and the beat's dips inside it met the closure rule with the murmur's own swell back
//    as a "burst". The change: a run of 50 ms or more at -35 to -12 dB of the vowel, a median 15 dB dark in itself,
//    is a murmur when it runs into frication that outlasts it, or within 5 frames into a closure that holds a frame
//    18 dB under the run and ends in a burst. A voiced stop's voice bar runs on up to its burst, so it never meets
//    that; the beat's dips are not 18 dB deep. Chosen on part J only (cluster nasals 128 to 132 of 132, others 306
//    to 305 of 336, control 453 unchanged; every setting from lo -30 to -40, hi -10 to -15, 40-60 ms, fall 12-24
//    and tilt 10-20 gives 888-891 of 936 on J, against 887 off). Pre-registered here and committed before part N
//    or any other part was run with it. Part N is new: 10 cluster syllables and 20 others sung in no other part, at
//    F#2, C#3, F#3, A#3, D#4 and E4, 108 BPM, quarter and eighth notes, sung and vowel-only. Against
//    `deepMurmur: false` (printed beside, or `--deep off`): (1) N's cluster nasals no fewer, and at least 3 more
//    on D#4 and E4 eighth notes; (2) N's other syllables read exactly within 2, and its voiced stops (*nab ped lud
//    gab rud tob vig cod*) read as a nasal no more than 2 more often; (3) N's vowel-only control read as none
//    identical (the rule needs a closure with a burst or a fricative, which a vowel-only "none" never has);
//    (4) A, B, D, E, H, I, F, K, L and M totals each no lower, nasals no fewer, vowel-only controls identical;
//    (5) eval/vowel-check.mjs and eval/consonant-check.mjs cannot move (readOnset and the synthesis untouched).
//    Outcome of that registration (run 2026-11-16): it failed. (1) N's cluster nasals 116 to 114 off, but its D#4
//    and E4 eighths were already 19 of 20 either way (at 108 BPM an eighth is 0.28 s, not J's 0.25); (2) N's other
//    syllables 212 against 215, voiced stops read as a nasal 5 against 1; (4) K's others 198 to 197, L's /i/ 153
//    to 152, M's others 106 to 105; (3) and (5) held, and A, B, D, E, H, I and F were byte-identical. Read frame
//    by frame, two faults: on an eighth note the reference vowel (45 ms in) is still in its attack, so a *lud*
//    voice bar on D#4 sat only 24 dB under it; and after a dark vowel's tail (*rud* on A#3, -15 dB) a voice bar
//    at -36 to -41 was "18 dB under the run". Second registration, set on J and N (now a development set: its
//    misses have been read): a run's level is taken against the louder of the reference and the vowel's peak in
//    the 50 ms before it (`peak`), it must last 60 ms, and the closure must reach silence, a frame at -50 dB of the
//    vowel or lower (`silent`; a voice bar holds at -24 to -43). J 887 to 891 of 936, N 689 to 691 of 720 (*fans*
//    and *font* on D#4 quarter notes), no syllable on either read worse. Pre-registered here and committed before
//    part O or any other part was run with it. Part O is new: 10 cluster syllables and 20 others sung in no other
//    part, at F2 (in no other part), E3, A3, D4, D#4 and E4, 126 BPM (an eighth of 0.24 s, shorter than any
//    other part's), quarter and eighth notes. Against `deepMurmur: false`: (1) O's cluster nasals no fewer, and at
//    least 2 more on D4-E4 eighth notes; (2) O's other syllables read exactly within 1, its voiced stops read as a
//    nasal no more often; (3) O's vowel-only control read as none identical; (4) A, B, D, E, H, I, F, J, K, L, M
//    and N totals each no lower, nasals no fewer, vowel-only controls identical; (5) eval/vowel-check.mjs and
//    eval/consonant-check.mjs cannot move.
//    Outcome (run 2026-11-16): failed on three. (1) O's cluster nasals 111 to 113, but its D4-E4 eighths 25 of 30
//    either way (the gains were *ment* and *pens* elsewhere); (2) its others 210 of 240 both ways, but voiced stops
//    read as a nasal 3 to 4 (a *dig* already misread as a voiced fricative); (4) M's others 106 to 105 (*og*); J
//    +4, N +2, K's cluster column, and (3) and (5) held; A, B, D, E, H, I, F, K, L byte-identical. As registered,
//    readCoda keeps the rule off (`deepMurmur: false` by default); `--deep on` runs every part with it, and parts
//    N and O print both columns.
// Twelfth round (2026-11-16): a murmur louder than the dip before it (onsets.mjs PRE.hi 4 to 12, README "A murmur
//    louder than the dip before it"). O's misses on its D4-E4 pulse-2 notes (one beat, 0.48 s at 126 BPM: the parts
//    above call these eighth notes, but at eventsToMidi's two pulses a beat a pulse-2 note is a quarter) read frame by
//    frame: *punc* and *tunt* on D#4 and *sons* on D4 and D#4 hold an n 50 ms long, a median 37-48 dB dark in itself
//    and 20 dB or more darker than the vowel just before, but the vowel dips 7-16 dB as it darkens into it and the
//    murmur then swells back to -8 to +4 dB of the reference (on these notes the nasal resonance sits on the
//    fundamental). Every nasal rule caps its level: `nasal` at -5 dB, NEAR at 0 and PRE at 4 dB over the vowel 25-45
//    ms before; the murmur sat 5-12 dB over that. Changed: PRE.hi 4 to 12, nothing else. Set on J, N and O only
//    (hi 4, 8, 12, 16: J 128 of 132 clusters, 306 others, 453 control each time; N clusters 114, 116, 116, 116; O's
//    D4-E4 pulse-2 clusters 25, 27, 28, 28; others, voiced stops read as nasal and controls unchanged in both). Left:
//    *sons* on D4 (its step into the murmur is 7.9 dB of the 8 PRE wants, not changed) and *rint* on D4 (a quiet
//    -24 to -30 dB murmur the closure rule swallows). Pre-registered here and committed before part P or any other
//    part was run with it. Part P is new: 10 cluster syllables and 20 others sung in no other part, at G2, D3, G#3,
//    C#4, D4 and F4 (F4 in no other part), 116 BPM, pulse-4 and pulse-2 notes, sung and vowel-only, printed beside
//    `preOpts: { hi: 4 }` (the reader before). Predictions: (1) P's cluster nasals no fewer, and at least 2 more on
//    its pulse-2 notes at C#4, D4 and F4 (30 cells); (2) P's other syllables read exactly within 1, its voiced stops
//    read as a nasal no more often; (3) P's vowel-only control identical (PRE needs an obstruent after the run);
//    (4) A, B, D, E, H, I, F, K, L and M totals each no lower, nasals no fewer, vowel-only controls identical
//    (`--pre hi=4` against the default); (5) eval/vowel-check.mjs and eval/consonant-check.mjs cannot move (readOnset
//    and the synthesis are untouched).
// Thirteenth round (2026-11-16): a voice bar at one level (sing.mjs VOICE_BAR_DB, README "A voice bar at one
//    level"). The synthesis changes, not the reader. L's *sub* read as nothing 3 times in 10 cells: frame by frame
//    (eval/sub-cum-diag.mjs) its closure held a voice bar 17-20 dB under the /u/ on G#3 quarters and G2 and C3 pulse-2
//    notes, too loud for the closure rule (22 dB under), and 23-38 dB under on the cells it read. The voice bar was a
//    fixed gain (VOICE_BAR 0.08) through a 180 Hz F1, so its level against the vowel swung with pitch and vowel:
//    worked out in steady state over five vowels E2-E4, 19.7 to 42.3 dB under (median 27). The change: the gain is
//    worked out per note (voiceBarGain, as nasalGain and lateralGain are) to sit VOICE_BAR_DB = 28 under the vowel
//    beside it, in codas and openings; 28 is that median rounded, an assumption, not fitted to recordings or to any
//    part. Read on L's *sub* only before this registration: misses 3 to 2 of 10 (G2 pulse-2 bar now -21 to -23,
//    still read as nothing; one G#3 pulse-2 read velar). Pre-registered here and committed before part Q or any
//    other part was run with it. Part Q is new: 12 voiced-stop codas (*tub mab cib reb sed quod pud lod ug fug*,
//    and *sub* and *ad* again) and 8 others (*pot lec sap rum nem fel hic ra*), 18 of the 20 sung in no other part,
//    at A2, F3, A#3, C4 and D#4, 100 BPM, pulse-4 and pulse-2 notes, sung and vowel-only, printed beside the fixed
//    gain (`--voice-bar off`). Predictions: (1) Q's voiced stops read exactly (class, voicing, place) at least 4
//    more of 120 than with the fixed gain; (2) of them, read as nothing: fewer; (3) Q's other syllables within 2;
//    (4) Q's vowel-only control identical (no coda, no voice bar); (5) every other part's total within 3 of
//    `--voice-bar off`, its voiced stops (where a part prints them) no fewer, its vowel-only control identical;
//    (6) eval/consonant-check.mjs A and B within 3 of before (openings with b, d, g change level too).
//    Outcome (run 2026-11-16, against `--voice-bar off` on the same code): (1) Q's voiced stops 95 to 102 of 120:
//    holds; (2) read as nothing 10 to 8: holds; (3) Q's others 75 to 75 of 80: holds; (4) control 200 of 200 both:
//    holds; (5) fails on two parts: K's other syllables 198 to 191 of 220 (*ib* and *eb* read as nothing, *ob* as a
//    nasal) and N's voiced stops read as a nasal 1 to 5 (*nab*, *gab*; N's others 215 to 212, within 3); A 173 to
//    177, B 129 to 130, J's others 306 to 318, L's /i/ 153 to 157 and others 113 to 114, M 105 to 108 and 106 to
//    107, O 210 to 217, P 202 to 209 (its voiced stops as a nasal 7 to 8), every control identical; (6) fails
//    upward: consonant-check A 195 of 210 both, B 780 to 812 of 934 (a gain far past "within 3"), and held-out G
//    1959 to 2055 of 2349, its voiced alveolar openings 116 to 172 of 227 and labial 65 to 98 of 115. Shipped on:
//    README "A voice bar at one level".
// Fourteenth round (2026-11-16): a closure against the vowel before it (onsets.mjs LOCAL_REF, README "A closure against
//    the vowel before it"). The reader changes. After the thirteenth round K's *ib*/*eb* and N's *nab*/*gab* missed,
//    nearly all on D4-E4 (eval/vstop-diag.mjs). Two faults, read frame by frame: (a) on D4 the five voices swing the
//    vowel's level 15-20 dB and the 60 ms reference fell in a trough, so a voice bar 25 dB under the vowel before it
//    read 13 dB under the reference, too loud for the closure rule (22 under); (b) on D#4 and E4 the per-note gain
//    lifts the bar's harmonics above 600 Hz, and the burst stood 9 dB over it there, under burstAfter's 12. For (a) the
//    closure rule reads each frame against the louder of the reference and the loudest five-frame median 30-120 ms
//    before it, capped at 20 dB (`localRef`); the nasal rule keeps the reference. For (b), tried in the synthesis: the
//    bar low-passed through the walls (sing.mjs `voiceBarWall`). Chosen on A-Q only (development: every part's misses
//    have been read): with localRef on the closure alone, against `--local off`, J's others 318 to 321, K's 191 to 193,
//    M 107 to 109 and 108 to 109, N's others 212 to 220, O 217 to 222, P 209 to 214 (its clusters 116 to 114), Q's
//    voiced stops 102 to 106 (others 75 to 73), H +1, L +1, F, A, B, D, E, I and every vowel-only control identical. On
//    the nasal rule too it lost 33 vowel-only control cells, so not there. The wall on top: N's others +7, but A -2, P's
//    voiced stops read as a nasal 7 to 12, and consonant-check A 195 to 192, B 812 to 808: off by default, opt-in.
//    Pre-registered here and committed before part R or any other new part was run with it. Part R is new: 10
//    voiced-stop codas (*rog sib teg vad pug hob ned dib meg nob*), 4 nasal codas (*sen pin gem don*) and 6 others (*fac
//    mox dit sat vel tus*), none sung in any other part, at A#2 (in no other part), G3, C#4, D4, E4 and F4, 112 BPM (in
//    no other part), pulse-4 and pulse-2 notes, sung and vowel-only. Against `localRef: false` (printed beside):
//    (1) R's voiced stops read exactly at least 4 more of 120; (2) R's nasal codas no fewer (of 48); (3) R's others
//    within 2 (of 72); (4) R's vowel-only control identical (no burst, no closure read); (5) every other part's
//    figures as listed above under `--local off` against the default (development, a check that nothing moved since);
//    (6) eval/consonant-check.mjs cannot move (readOnset and the default synthesis are untouched). Also registered,
//    for the opt-in wall (R's third column, against R's first): (7) R's voiced stops read as nothing fewer, and its
//    vowel-only control identical; if (7) holds and R's voiced stops gain 3 or more, the wall is a candidate for a
//    later round with its own held-out openings, not switched on here.
//    Outcome (run 2026-11-16, against `localRef: false` on the same code): (1) R's voiced stops 99 to 103 of 120: holds, at
//    the bar; (2) nasals 48 of 48 both: holds; (3) others 72 of 72 both: holds; (4) control 238 of 240 both: holds;
//    (5) holds, every figure as listed but one misquoted here: Q's others are 75 of 80 both ways (75 to 73 was the run
//    with localRef on the nasal rule too); (6) holds, consonant-check's report byte-identical; (7) the wall: R's voiced
//    stops read as nothing 8 to 3 and control identical, holds, but 5 more read as a nasal and none gains (103 both), so
//    it stays off. Shipped on: README "A closure against the vowel before it".
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseGabc, fitToBars, transposeToFinal } from '../gabc.mjs';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinOnset, latinCoda, onsetLength } from '../sing.mjs';
import { readCoda, expectedRead } from '../onsets.mjs';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : new URL('./coda-check-report.md', import.meta.url);
// --parts ABDEHIFC (default all): which parts to run; --hide-misses F: print a part's score without its misses
// (how a held-out set is scored before a round's changes without anyone reading what it gets wrong)
const PARTS = args.includes('--parts') ? args[args.indexOf('--parts') + 1] : 'ABDEHIFJKLMNOPQRC';
// --voice-bar off: the choir sung with the fixed voice-bar gain (sing.mjs `voiceBarLevel: false`, before 2026-11-16's thirteenth round)
const VOICEBAR = !(args.includes('--voice-bar') && args[args.indexOf('--voice-bar') + 1] === 'off');
// --wall on: the voice bar low-passed through the walls (sing.mjs `voiceBarWall: true`; tried in 2026-11-16's fourteenth round, off by default)
const WALL = args.includes('--wall') && args[args.indexOf('--wall') + 1] === 'on';
// --local off: readCoda's closure and nasal levels against the reference alone (`localRef: false`, before the fourteenth round)
const LOCALARG = args.includes('--local') ? args[args.indexOf('--local') + 1] : '';
const HIDE = args.includes('--hide-misses') ? args[args.indexOf('--hide-misses') + 1] : '';
// --near off: readCoda without its reading against the vowel just before the murmur (the reader before
// 2026-11-15's round); --near dark=8,lo=-18: try other settings (onsets.mjs NEAR)
const NEARARG = args.includes('--near') ? args[args.indexOf('--near') + 1] : '';
const RC0 = NEARARG === 'off' ? { nearVowel: false } : NEARARG ? { nearOpts: Object.fromEntries(NEARARG.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; })) } : {};
// --pre off: readCoda without the cluster-nasal rule (the reader before 2026-11-16's round)
const PREARG = args.includes('--pre') ? args[args.indexOf('--pre') + 1] : '';
// --again off: readCoda's vowelAgain reading every frame after a murmur, the obstruent's too (before 2026-11-16's ninth round)
const AGAINARG = args.includes('--again') ? args[args.indexOf('--again') + 1] : '';
// --deep on: readCoda with the deep-murmur rule (2026-11-16's eleventh round; off by default, it failed its registrations)
// --vfric off: readCoda's voiced fricative without its noise-above-5-kHz test (before 2026-11-16's tenth round)
const VFRICARG = args.includes('--vfric') ? args[args.indexOf('--vfric') + 1] : '';
const DEEPARG = args.includes('--deep') ? args[args.indexOf('--deep') + 1] : '';
// --pre hi=12,step=8: try other PRE settings (onsets.mjs PRE)
const PREOPTS = PREARG && PREARG !== 'off' ? { preOpts: Object.fromEntries(PREARG.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; })) } : {};
const RC = { ...RC0, ...PREOPTS, ...(PREARG === 'off' ? { preObstruent: false } : {}), ...(AGAINARG === 'off' ? { againGap: false } : {}), ...(VFRICARG === 'off' ? { vfricHi5: false } : {}), ...(DEEPARG === 'on' ? { deepMurmur: true } : {}), ...(LOCALARG === 'off' ? { localRef: false } : {}) };
const rate = 44100, corpus = new URL('../corpus/', import.meta.url);
const lines = [];
const pct = (a, b) => `${a} of ${b} (${b ? ((100 * a) / b).toFixed(1) : '-'}%)`;
const label = (e) => e.cls === 'stop' ? `${e.voiced ? 'voiced' : 'voiceless'} ${e.place} stop` : e.cls === 'affricate' ? `${e.voiced ? 'voiced' : 'voiceless'} affricate` : e.cls === 'fricative' ? `fricative ${e.place}` : e.cls;
const match = (want, got) => Object.entries(want).every(([k, v]) => got[k] === v);

function choir(midiBytes, sing, voiceBar = VOICEBAR, voiceBarWall = WALL) {
  const r = renderMidi(midiBytes, { rate, stems: true, sing, voiceBar, voiceBarWall });
  const m = parseMidi(midiBytes), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  return { x: r.stems.choir.channels[0], notes };
}
// Where the next sound starts: the next note's beat less the part of its opening consonant sung
// before it (render.mjs's lead rule: up to half this note, the consonant's full length at most).
// That and the window's start are the only things taken from the renderer's timing.
const nextSound = (notes, k, firstOf) => {
  const n = notes[k], nx = notes[k + 1];
  if (!nx) return n.t1 + 0.25;
  const on = firstOf.has(nx) ? latinOnset(nx.lyric) : [];
  const lead = on.length ? Math.min(onsetLength(on), 0.5 * (n.t1 - n.t0) + Math.max(0, nx.t0 - n.t1)) : 0;
  return Math.min(n.t1 + 0.25, nx.t0 - lead);
};
// The vowel's reference: 45 ms after whatever of the syllable's opening consonant spills past the beat
const vowelStart = (n, on) => n.t0 + (on.length ? Math.max(0, Math.min(onsetLength(on), 0.15 + 0.3 * (n.t1 - n.t0)) - 0.15) : 0) + 0.045;

lines.push('# Does the singing choir sing the final consonants?', '', 'Written by `node eval/coda-check.mjs`. The last note of each syllable is read from the rendered choir stem by',
  '`onsets.mjs` `readCoda`, from 60 ms of steady vowel on: a closure and then one short burst (a stop; voiced when a voice',
  'bar sounds under the closure; place from the burst), noise above 2.5 kHz (a fricative), a deep murmur of 55 ms or more',
  'before an obstruent or 30 ms otherwise (a nasal), a brief dip with voice after it (a tap). /l/ and a bare vowel should',
  'read as none. A cluster is scored on its first phone (*nunc* on its /n/).', '');

// ---- A ----
if (PARTS.includes('A')) {
const SY = ['as', 'es', 'is', 'os', 'us', 'at', 'et', 'ad', 'ab', 'ac', 'ap', 'am', 'an', 'em', 'um', 'al', 'el', 'ar', 'er', 'ax', 'ex', 'unt', 'ant', 'ost', 'unc', 'a', 'e', 'i', 'o', 'u'];
const PITCHES = [['E2', 40], ['A2', 45], ['D3', 50], ['G3', 55], ['C4', 60], ['E4', 64]];
const ctlMiss = [], aRows = [], aScore = { true: [0, 0, 0], vowels: [0, 0] }, misses = [];
for (const [name, midi] of PITCHES) {
  const ev = [];
  for (const s of SY) ev.push({ type: 'note', midi, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 120, title: 'vc' });
  const row = { true: 0, vowels: 0 };
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], cd = latinCoda(s), want = expectedRead(cd[0]);
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25;
      const got = readCoda(x, rate, n.t0 + 0.1, tEnd, RC);
      const sc = aScore[sing];
      sc[1]++;
      if (sing === true) { if (match(want, got)) { sc[0]++; row.true++; } else misses.push(`${name} *${s}* (${label(want)}) read as ${label(got)}`); if (want.cls === got.cls) sc[2]++; }
      else if (got.cls === 'none') { sc[0]++; row.vowels++; } else ctlMiss.push(`${name} *${s}* read as ${label(got)}`);
    });
  }
  aRows.push(`| ${name} | ${pct(row.true, SY.length)} | ${pct(row.vowels, SY.length)} |`);
}
lines.push('## A. Syllables before a rest (the set the reader was tuned on)', '', `${SY.map((s) => `*${s}*`).join(', ')}; quarter notes at 120 BPM, each followed by a quarter rest.`, '',
  '| pitch | singing: read exactly as written | vowel-only control: read as no consonant |', '|---|---|---|', ...aRows, '',
  `All pitches: ${pct(aScore.true[0], aScore.true[1])} read exactly (class, voicing, place); ${pct(aScore.true[2], aScore.true[1])} by class alone. `
  + `The vowel-only choir on the same syllables reads as no consonant ${pct(aScore.vowels[0], aScore.vowels[1])}.`, '', 'Misses:', '', ...misses.map((m) => `- ${m}`), '', 'Vowel-only control, read as a consonant:', '', ...ctlMiss.map((m) => `- ${m}`), '');
}

// ---- B and D ----
// Score the last note of each syllable over a list of corpus files (paths under corpus/, no .gabc).
function scorePieces(list, hide = false) {
  const byClass = new Map(), conf = new Map(), miss = [], rows = [];
  const t = { all: [0, 0], manner: 0, ctl: [0, 0], bare: [0, 0], bareCtl: [0, 0], skipped: 0, beforeCons: [0, 0], beforeVow: [0, 0] };
  for (const p of list) {
    const src = parseGabc(readFileSync(new URL(`${p}.gabc`, corpus), 'utf8'));
    const mid = eventsToMidi(fitToBars(transposeToFinal(src.events, 50), 8), { bpm: 124, title: p });
    const sungR = choir(mid, true), ctlR = choir(mid, 'vowels');
    const firstOf = new Set(), lastOf = new Map();
    for (const n of sungR.notes) if (n.syl) { if (![...firstOf].some((f) => f.syl === n.syl)) firstOf.add(n); lastOf.set(n.syl, n); }
    let right = 0, all = 0, cRight = 0;
    sungR.notes.forEach((n, k) => {
      if (!n.syl || lastOf.get(n.syl) !== n || n.t1 - n.t0 < 0.2) return;
      const cd = latinCoda(n.lyric), on = firstOf.has(n) ? latinOnset(n.lyric) : [];
      const vAt = vowelStart(n, on), tEnd = nextSound(sungR.notes, k, firstOf);
      // the reference must be steady vowel: before the coda's room (35% of the note and its transition)
      if (vAt + 0.06 > n.t1 - 0.35 * (n.t1 - n.t0) - 0.045 || tEnd - vAt < 0.15) { t.skipped++; return; }
      const got = readCoda(sungR.x, rate, vAt, tEnd, RC), gotC = readCoda(ctlR.x, rate, vAt, tEnd, RC);
      if (!cd.length) { t.bare[1]++; if (got.cls === 'none') t.bare[0]++; t.bareCtl[1]++; if (gotC.cls === 'none') t.bareCtl[0]++; return; }
      const nx = sungR.notes[k + 1], nxOn = nx && firstOf.has(nx) ? latinOnset(nx.lyric) : [];
      const want = expectedRead(cd[0]), ok = match(want, got);
      all++; if (ok) right++; else miss.push(`${p} *${n.lyric}*${nxOn.length ? ` (then ${nx.lyric})` : ''}, ${Math.round((n.t1 - n.t0) * 1000)} ms: ${label(want)} read as ${label(got)}`);
      if (want.cls === got.cls) t.manner++;
      if (gotC.cls === 'none') cRight++;
      const side = nxOn.length ? t.beforeCons : t.beforeVow; side[1]++; if (ok) side[0]++;
      const key = cd.length > 1 ? `${label(want)} (cluster ${cd.join(' ')})` : label(want), c = byClass.get(key) || [0, 0];
      c[1]++; if (ok) c[0]++; byClass.set(key, c);
      const cm = conf.get(want.cls) || new Map(); cm.set(got.cls, (cm.get(got.cls) || 0) + 1); conf.set(want.cls, cm);
    });
    t.all = [t.all[0] + right, t.all[1] + all]; t.ctl = [t.ctl[0] + cRight, t.ctl[1] + all];
    rows.push(`| ${p} | ${all} | ${pct(right, all)} | ${pct(cRight, all)} |`);
  }
  return [
    '| piece | syllables | singing: read exactly as written | vowel-only control: read as none |', '|---|---|---|---|', ...rows,
    `| all | ${t.all[1]} | ${pct(...t.all)} | ${pct(...t.ctl)} |`, '',
    `By class alone: ${pct(t.manner, t.all[1])}. Before a syllable that opens on a consonant: ${pct(...t.beforeCons)}; before a vowel or a rest: ${pct(...t.beforeVow)}. `
    + `Syllables that close on their vowel: ${pct(...t.bare)} read as no consonant (vowel-only choir: ${pct(...t.bareCtl)}). Too short for a steady vowel before the coda, skipped: ${t.skipped}.`, '',
    'By written consonant (a cluster scored on its first phone is listed apart):', '', '| written | read exactly |', '|---|---|',
    ...[...byClass].sort((x, y) => y[1][1] - x[1][1]).map(([k, [r, n]]) => `| ${k} | ${pct(r, n)} |`), '',
    'Class written (rows) against class read (columns):', '', `| written | ${CLS.join(' | ')} |`, '|---|' + CLS.map(() => '---').join('|') + '|',
    ...CLS.filter((c) => conf.has(c)).map((c) => `| ${c} | ${CLS.map((d) => conf.get(c).get(d) || 0).join(' | ')} |`), '',
    ...(hide ? [`Misses: ${miss.length}, not printed (held out).`, ''] : ['Misses:', '', ...miss.map((m) => `- ${m}`), ''])];
}
const CLS = ['stop', 'fricative', 'nasal', 'tap', 'none'];
const PIECES = ['dies-irae', 'pange-lingua', 'veni-creator', 'te-deum', 'salve-regina'];
if (PARTS.includes('B')) lines.push('## B. The corpus pieces (final D3, fitted to 4/4 at 124 BPM)', '',
  'Not a clean held-out set: no threshold was set on it, but its first run (60.5%) was read for misses, which showed the window cutting off bursts at the next sound and /m/ after /u/ barely a murmur; both were fixed (in the reader\'s window and in sing.mjs) before this run. One looser nasal rule was also tried and dropped: it read 136 of 162 here (84.0%) but called 13 of 30 vowel-only A2 fades in part A nasals. Its misses were read again for the second round (README "Final consonants, second round") and the third, which found the blip of bare vowel at the end of every final nasal\'s murmur (README "Final consonants, third round").', '',
  'The last note of every syllable that closes on a consonant, 0.2 s or more, with 60 ms of steady vowel before the coda\'s room. The window ends where the next sound starts (the next beat, less its opening consonant sung before it). The vowel-only control column is the same notes from the choir with no consonants: how often the reader (rightly) finds none.', '',
  ...scorePieces(PIECES, HIDE.includes('B')));

// Held out: every sixth Graduale piece (1908 edition) by file name, fixed before the second round's
// changes and scored once before and once after them; its misses were not read while tuning.
const HELD = readdirSync(new URL('gregobase-1908/', corpus)).filter((f) => f.endsWith('.gabc')).sort().filter((_, i) => i % 6 === 0).map((f) => `gregobase-1908/${f.slice(0, -5)}`);
if (PARTS.includes('D')) lines.push('## D. Held out: ten Graduale pieces (every sixth file of corpus/gregobase-1908)', '',
  `${HELD.map((h) => h.split('/')[1]).join(', ')}; same settings and rules as B. Chosen by file name before the second round's changes, and scored before and after them without its misses being read in between; scored again after the third round (README "Final consonants, third round"), when E below is the clean set.`, '',
  ...scorePieces(HELD, HIDE.includes('D')));

// Held out, second set (2026-11-15, third round): every sixth file from the fourth (3403 ... 3459), fixed and
// scored before the third round's changes (README "Final consonants, third round"); its misses were not
// read while tuning. D had been printed three times by then, so this is the round's clean score.
const HELD2 = readdirSync(new URL('gregobase-1908/', corpus)).filter((f) => f.endsWith('.gabc')).sort().filter((_, i) => i % 6 === 3).map((f) => `gregobase-1908/${f.slice(0, -5)}`);
if (PARTS.includes('E')) lines.push('## E. Held out, second set: ten more Graduale pieces (every sixth file from the fourth)', '',
  `${HELD2.map((h) => h.split('/')[1]).join(', ')}; same settings and rules as B. Chosen by file name and scored before the third round's changes (README "Final consonants, third round"), then once after them; its misses were not read in between.`, '',
  ...scorePieces(HELD2, HIDE.includes('E')));

// Held out, third set (2026-11-15, fifth round: final r): every other Graduale piece D and E do not take
// (files 1 and 4 of every six, 20 pieces), fixed and scored before the fifth round's changes with its misses
// hidden (--hide-misses H), so the round's tap changes have a clean score with enough r to count (E has 11).
const GRAD = readdirSync(new URL('gregobase-1908/', corpus)).filter((f) => f.endsWith('.gabc')).sort();
const HELD3 = GRAD.filter((_, i) => i % 6 === 1 || i % 6 === 4).map((f) => `gregobase-1908/${f.slice(0, -5)}`);
if (PARTS.includes('H')) lines.push('## H. Held out, third set: twenty more Graduale pieces (files 1 and 4 of every six)', '',
  `${HELD3.map((h) => h.split('/')[1]).join(', ')}; same settings and rules as B. Chosen by file name and scored before the fifth round's changes (README "Final consonants, fifth round") with its misses hidden.`, '',
  ...scorePieces(HELD3, HIDE.includes('H')));
// The fifth round's development set: the remaining Graduale pieces (files 2 and 5 of every six), read for
// misses alongside B while tuning the final r. Not held out.
const DEV = GRAD.filter((_, i) => i % 6 === 2 || i % 6 === 5).map((f) => `gregobase-1908/${f.slice(0, -5)}`);
if (PARTS.includes('I')) lines.push('## I. Development set: the other twenty Graduale pieces (files 2 and 5 of every six)', '',
  `${DEV.map((h) => h.split('/')[1]).join(', ')}; same settings and rules as B. Read for misses while tuning the fifth round (final r); not held out.`, '',
  ...scorePieces(DEV, HIDE.includes('I')));

// ---- F ----
// The 51 files of the other gregobase-1908-* folders (scan-check sets), never scored here before: their
// final /l/ and nasal codas, read with the murmur-tilt rule and without it.
const OTHER = !PARTS.includes('F') ? [] : readdirSync(corpus).filter((d) => d.startsWith('gregobase-1908-')).sort()
  .flatMap((d) => readdirSync(new URL(`${d}/`, corpus)).filter((f) => f.endsWith('.gabc')).sort().map((f) => `${d}/${f.slice(0, -5)}`));
{
  const tally = { l: { on: [0, 0, 0], off: [0, 0, 0] }, nasal: { on: [0, 0], off: [0, 0] } }, lMiss = [], nMiss = [];
  for (const p of OTHER) {
    const src = parseGabc(readFileSync(new URL(`${p}.gabc`, corpus), 'utf8'));
    const mid = eventsToMidi(fitToBars(transposeToFinal(src.events, 50), 8), { bpm: 124, title: p });
    const sungR = choir(mid, true);
    const firstOf = new Set(), lastOf = new Map();
    for (const n of sungR.notes) if (n.syl) { if (![...firstOf].some((f) => f.syl === n.syl)) firstOf.add(n); lastOf.set(n.syl, n); }
    sungR.notes.forEach((n, k) => {
      if (!n.syl || lastOf.get(n.syl) !== n || n.t1 - n.t0 < 0.2) return;
      const cd = latinCoda(n.lyric);
      if (!cd.length || !(cd[0] === 'l' || 'mnN'.includes(cd[0]))) return;
      const on = firstOf.has(n) ? latinOnset(n.lyric) : [], vAt = vowelStart(n, on), tEnd = nextSound(sungR.notes, k, firstOf);
      if (vAt + 0.06 > n.t1 - 0.35 * (n.t1 - n.t0) - 0.045 || tEnd - vAt < 0.15) return;
      for (const [mode, tilt] of [['on', undefined], ['off', 0]]) {
        const got = readCoda(sungR.x, rate, vAt, tEnd, { ...RC, murmurTilt: tilt });
        if (cd[0] === 'l') {
          const t = tally.l[mode]; t[2]++; if (got.cls === 'none') t[0]++; if (got.cls === 'nasal') t[1]++;
          if (mode === 'on' && got.cls !== 'none') lMiss.push(`${p} *${n.lyric}*: read as ${label(got)}`);
        } else {
          const t = tally.nasal[mode]; t[1]++; if (got.cls === 'nasal') t[0]++;
          if (mode === 'on' && got.cls !== 'nasal') nMiss.push(`${p} *${n.lyric}*: read as ${label(got)}`);
        }
      }
    });
  }
  const L = tally.l, M = tally.nasal;
  if (PARTS.includes('F')) lines.push('## F. Final /l/ against the nasals: the 51 files of the other gregobase-1908-* folders', '',
    `${OTHER.length} files, none scored by this check before (the scan-check sets); same settings and filters as B. Pre-registered in this script's header before its first run: the murmur's own tilt (readCoda \`murmurTilt\`, 28 dB) against the same reader without it.`, '',
    '| final consonant | read with the tilt rule | without it |', '|---|---|---|',
    `| /l/ (should read as none) | none ${pct(L.on[0], L.on[2])}, nasal ${pct(L.on[1], L.on[2])} | none ${pct(L.off[0], L.off[2])}, nasal ${pct(L.off[1], L.off[2])} |`,
    `| m, n, gn (should read as nasal) | ${pct(...M.on)} | ${pct(...M.off)} |`, '',
    '/l/ not read as none (with the rule):', '', ...(lMiss.length ? lMiss.map((m) => `- ${m}`) : ['- none']), '',
    'Nasals not read as nasal (with the rule):', '', ...(nMiss.length ? nMiss.map((m) => `- ${m}`) : ['- none']), '');
}

// ---- J ----
// The eighth round's development set (2026-11-16): cluster syllables, whose first phone is a nasal, and
// others, quarter (0.5 s) and eighth (0.25 s) notes at 120 BPM, each followed by a rest, E2-E4; sung and
// vowel-only. PRE's settings were chosen here, so it is a training score, printed beside `preObstruent: false`.
if (PARTS.includes('J')) {
const POS = ['unt', 'ant', 'ent', 'int', 'sunt', 'nunc', 'tunc', 'ens', 'mens', 'ans', 'ont'];
const NEG = ['at', 'et', 'it', 'ut', 'ot', 'ost', 'ust', 'ad', 'ud', 'ab', 'ub', 'ac', 'uc', 'ap', 'up', 'as', 'us', 'os', 'es', 'ax', 'ux', 'um', 'am', 'un', 'em', 'a', 'u', 'o'];
const SY = [...POS, ...NEG], tally = {}, jMiss = [];
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
for (const pulses of [4, 2]) for (const midi of [40, 45, 50, 55, 60, 64]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 120, title: 'clusters' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (POS.includes(s) ? 'cluster' : 'other') : 'control';
      for (const [mode, o] of [['on', RC], ['off', { ...RC, preObstruent: false }]]) {
        const got = readCoda(x, rate, vAt, tEnd, o), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (mode === 'on' && !ok && grp === 'cluster') jMiss.push(`${pulses === 4 ? 'quarter' : 'eighth'} ${midi} *${s}* read as ${label(got)}`);
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
lines.push('## J. Cluster syllables (the set the eighth round\'s rule was tuned on)', '', `Clusters: ${POS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Quarter and eighth notes at 120 BPM, each followed by a rest, E2, A2, D3, G3, C4, E4.`, '',
  '| | with the cluster rule | without (`preObstruent: false`) |', '|---|---|---|',
  `| cluster syllables read exactly (on their nasal) | ${cell('cluster on')} | ${cell('cluster off')} |`,
  `| other syllables read exactly | ${cell('other on')} | ${cell('other off')} |`,
  `| vowel-only control read as none | ${cell('control on')} | ${cell('control off')} |`, '', 'Cluster misses with the rule:', '', ...(jMiss.length ? jMiss.map((m) => `- ${m}`) : ['- none']), '');
}

// ---- K ----
if (PARTS.includes('K')) {
const POS = ['fons', 'dens', 'pons', 'mons', 'gens', 'hinc', 'runt', 'bunt', 'tent', 'cant', 'frons', 'sanct', 'lunt', 'quent'];
const NEG = ['ep', 'ip', 'op', 'ec', 'ic', 'oc', 'eb', 'ib', 'ob', 'ef', 'of', 'ot', 'ux', 'ix', 'ox', 'im', 'om', 'on', 'in', 'e', 'i', 'u'];
const SY = [...POS, ...NEG], tally = {}, kMiss = [], kNasal = {}, kOther = new Map();
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
for (const pulses of [4, 2]) for (const midi of [47, 53, 57, 59, 62]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 104, title: 'held-out clusters' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (POS.includes(s) ? 'cluster' : 'other') : 'control';
      for (const [mode, o] of [['on', RC], ['off', { ...RC, againGap: false }]]) {
        const got = readCoda(x, rate, vAt, tEnd, o), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'other' && got.cls === 'nasal' && want.cls !== 'nasal') kNasal[mode] = (kNasal[mode] || 0) + 1;
        if (mode === 'on' && !ok && grp !== 'cluster') { const key = `${grp === 'other' ? s : `${s} (vowel only)`} as ${label(got)}`; kOther.set(key, (kOther.get(key) || 0) + 1); }
        if (mode === 'on' && !ok && grp === 'cluster' && !HIDE.includes('K')) kMiss.push(`${pulses === 4 ? 'quarter' : 'eighth'} ${midi} *${s}* read as ${label(got)}`);
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
lines.push('## K. Held-out cluster syllables (ninth round, pre-registered)', '', `Clusters: ${POS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Quarter and eighth notes at 104 BPM, each followed by a rest, B2, F3, A3, B3, D4.`, '',
  '| | with the obstruent gap | without (`againGap: false`) |', '|---|---|---|',
  `| cluster syllables read exactly (on their nasal) | ${cell('cluster on')} | ${cell('cluster off')} |`,
  `| other syllables read exactly | ${cell('other on')} | ${cell('other off')} |`,
  `| other syllables read as a nasal | ${kNasal.on || 0} | ${kNasal.off || 0} |`,
  `| vowel-only control read as none | ${cell('control on')} | ${cell('control off')} |`, '', 'Cluster misses with the rule:', '', ...(HIDE.includes('K') ? ['- hidden (--hide-misses K)'] : kMiss.length ? kMiss.map((m) => `- ${m}`) : ['- none']), '',
  'Other and vowel-only misses with the rule (count over the ten pitch and length cells):', '', HIDE.includes('K') ? '- hidden' : [...kOther].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none', '');
}

// ---- L ----
// Tenth round (2026-11-16): held out, never sung before this round's registration. Syllables on /i/ (the vowel
// the voiced-fricative rule misread), others, and four voiced-fricative codas (*iz*, *az*, *ev*, *uv*: not
// Latin, there to show a real voiced fricative still reads), at G2, C3, D#3, G#3 and C#4 (no pitch of A, J or
// K), 96 BPM, half and quarter notes, sung and vowel-only; printed beside `vfricHi5: false` (the reader before).
if (PARTS.includes('L')) {
const IS = ['vis', 'sit', 'dic', 'nis', 'mil', 'vir', 'fid', 'bis', 'rit', 'tim', 'lin', 'qui', 'tri', 'pi', 'li', 'di'];
const ZV = ['iz', 'az', 'ev', 'uv'];
const NEG = ['das', 'nos', 'mel', 'per', 'sub', 'cum', 'tet', 'rec', 'pa', 'te', 'ro', 'lu'];
const SY = [...IS, ...ZV, ...NEG], tally = {}, lMiss = new Map();
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
for (const pulses of [4, 2]) for (const midi of [43, 48, 51, 56, 61]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 96, title: 'held-out i' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (IS.includes(s) ? 'i' : ZV.includes(s) ? 'zv' : 'other') : IS.includes(s) ? 'control i' : 'control';
      for (const [mode, o] of [['on', RC], ['off', { ...RC, vfricHi5: false }]]) {
        const got = readCoda(x, rate, vAt, tEnd, o), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (mode === 'on' && !ok && !HIDE.includes('L')) { const key = `${sing === true ? s : `${s} (vowel only)`} as ${label(got)}`; lMiss.set(key, (lMiss.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
lines.push('## L. Held out: syllables on /i/ (tenth round, pre-registered)', '', `On /i/: ${IS.map((s) => `*${s}*`).join(', ')}; voiced fricatives: ${ZV.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Half and quarter notes at 96 BPM, each followed by a rest, G2, C3, D#3, G#3, C#4.`, '',
  '| | with the noise-above-5-kHz test | without (`vfricHi5: false`) |', '|---|---|---|',
  `| syllables on /i/ read exactly | ${cell('i on')} | ${cell('i off')} |`,
  `| voiced-fricative codas read as one | ${cell('zv on')} | ${cell('zv off')} |`,
  `| other syllables read exactly | ${cell('other on')} | ${cell('other off')} |`,
  `| vowel-only control on /i/ read as none | ${cell('control i on')} | ${cell('control i off')} |`,
  `| vowel-only control, the rest, read as none | ${cell('control on')} | ${cell('control off')} |`, '', 'Misses with the test (count over the ten pitch and length cells):', '', HIDE.includes('L') ? '- hidden (--hide-misses L)' : [...lMiss].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none', '');
}

// ---- M ----
// An out-of-sample check of the tenth round's VFRIC_HI5, written by a second session that fixed the same fault
// in parallel with a different rule (energy above 2.5 kHz 6 dB over the vowel's) before it had seen VFRIC_HI5 or
// part L. Run unchanged on main's reader, nothing tuned on it. 24 syllables, 19 of them sung in no other part
// (li, di, iz, az and ev are in L), at G2, C3, E3, G#3, C#4 and D#4 (E3 and D#4 in no other part), 96 BPM.
if (PARTS.includes('M')) {
const IS = ['id', 'il', 'ir', 'if', 'ist', 'ins', 'li', 'di', 'ri', 'mi'];
const OTH = ['ag', 'eg', 'og', 'ul', 'ol', 'ur', 'or', 'ed', 'od', 'uf'];
const ZV = ['iz', 'az', 'iv', 'ev'];
const SY = [...IS, ...OTH, ...ZV], tally = {}, lMiss = new Map();
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
for (const pulses of [4, 2]) for (const midi of [43, 48, 52, 56, 61, 63]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 96, title: 'held-out i' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (IS.includes(s) ? 'i' : OTH.includes(s) ? 'other' : s.endsWith('z') ? 'z' : 'v') : 'control';
      for (const [mode, o] of [['on', RC], ['off', { ...RC, vfricHi5: false }]]) {
        const got = readCoda(x, rate, vAt, tEnd, o), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'control' && got.cls === 'fricative' && got.place === 'voiced') bump(`cvf ${mode}`, true);
        if (mode === 'on' && !ok && !HIDE.includes('M')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; lMiss.set(key, (lMiss.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
lines.push('## M. Out-of-sample check of the tenth round (a second session\'s /i/ set)', '', `With /i/: ${IS.map((s) => `*${s}*`).join(', ')}; others: ${OTH.map((s) => `*${s}*`).join(', ')}; synthetic z and v codas (none in the corpus): ${ZV.map((s) => `*${s}*`).join(', ')}. Quarter and eighth notes at 96 BPM, each followed by a rest, G2, C3, E3, G#3, C#4, D#4.`, '',
  '| | with the noise-above-5-kHz test | without (`vfricHi5: false`) |', '|---|---|---|',
  `| /i/ syllables read exactly | ${cell('i on')} | ${cell('i off')} |`,
  `| other syllables read exactly | ${cell('other on')} | ${cell('other off')} |`,
  `| z codas read as a voiced fricative | ${cell('z on')} | ${cell('z off')} |`,
  `| v codas read as a voiced fricative | ${cell('v on')} | ${cell('v off')} |`,
  `| vowel-only control read as none | ${cell('control on')} | ${cell('control off')} |`,
  `| vowel-only control read as a voiced fricative | ${(tally['cvf on'] || [0])[0]} | ${(tally['cvf off'] || [0])[0]} |`, '',
  'Misses with the rule (count over the twelve pitch and length cells):', '', HIDE.includes('M') ? '- hidden' : [...lMiss].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none', '');
}

// ---- N ----
// The eleventh round's held-out set (DEEP, pre-registered in the header): 10 cluster syllables and 20 others sung in
// no other part, at F#2, C#3, F#3, A#3, D#4 and E4, 108 BPM, quarter and eighth notes, each followed by a rest.
if (PARTS.includes('N')) {
const POS = ['dant', 'lent', 'sint', 'gunt', 'hunc', 'rens', 'tens', 'fans', 'font', 'vint'];
const VST = ['nab', 'ped', 'lud', 'gab', 'rud', 'tob', 'vig', 'cod'];
const NEG = [...VST, 'pet', 'lac', 'sup', 'rot', 'tac', 'dum', 'ven', 'nam', 'pes', 'vos', 'ma', 'ne'];
const SY = [...POS, ...NEG], tally = {}, nMiss = new Map(), nVst = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
for (const pulses of [4, 2]) for (const midi of [42, 49, 54, 58, 63, 64]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 108, title: 'held-out deep murmurs' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (POS.includes(s) ? 'cluster' : 'other') : 'control';
      for (const [mode, o] of [['on', { ...RC, deepMurmur: true }], ['off', { ...RC, deepMurmur: false }]]) {
        const got = readCoda(x, rate, vAt, tEnd, o), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'cluster' && pulses === 2 && midi >= 63) bump(`high ${mode}`, ok);
        if (grp === 'other' && VST.includes(s) && got.cls === 'nasal') nVst[mode] = (nVst[mode] || 0) + 1;
        if (mode === 'on' && !ok && !HIDE.includes('N')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; nMiss.set(key, (nMiss.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
lines.push('## N. Deep murmurs (eleventh round; held out for the first registration, a development set for the second)', '', `Clusters: ${POS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Quarter and eighth notes at 108 BPM, each followed by a rest, F#2, C#3, F#3, A#3, D#4, E4.`, '',
  '| | with the deep-murmur rule | without (`deepMurmur: false`) |', '|---|---|---|',
  `| cluster syllables read exactly (on their nasal) | ${cell('cluster on')} | ${cell('cluster off')} |`,
  `| of them, eighth notes on D#4 and E4 | ${cell('high on')} | ${cell('high off')} |`,
  `| other syllables read exactly | ${cell('other on')} | ${cell('other off')} |`,
  `| voiced stops read as a nasal | ${nVst.on || 0} | ${nVst.off || 0} |`,
  `| vowel-only control read as none | ${cell('control on')} | ${cell('control off')} |`, '',
  'Misses with the rule (count over the twelve pitch and length cells):', '', HIDE.includes('N') ? '- hidden' : [...nMiss].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none', '');
}

// ---- O ----
// The eleventh round's second held-out set (DEEP's second registration, in the header): 10 cluster syllables and 20
// others sung in no other part, at F2, E3, A3, D4, D#4 and E4, 126 BPM, quarter and eighth notes, each followed by a rest.
if (PARTS.includes('O')) {
const POS = ['mant', 'rint', 'bant', 'tunt', 'vens', 'pens', 'lans', 'ment', 'punc', 'sons'];
const VST = ['mad', 'red', 'bod', 'dig', 'lab', 'nod', 'tud', 'reg'];
const NEG = [...VST, 'mat', 'bec', 'rap', 'nit', 'doc', 'lum', 'men', 'tam', 'mos', 'nes', 'so', 'fe'];
const SY = [...POS, ...NEG], tally = {}, oMiss = new Map(), oVst = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
for (const pulses of [4, 2]) for (const midi of [41, 52, 57, 62, 63, 64]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 126, title: 'held-out deep murmurs 2' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (POS.includes(s) ? 'cluster' : 'other') : 'control';
      for (const [mode, o] of [['on', { ...RC, deepMurmur: true }], ['off', { ...RC, deepMurmur: false }]]) {
        const got = readCoda(x, rate, vAt, tEnd, o), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'cluster' && pulses === 2 && midi >= 62) bump(`high ${mode}`, ok);
        if (grp === 'other' && VST.includes(s) && got.cls === 'nasal') oVst[mode] = (oVst[mode] || 0) + 1;
        if (mode === 'on' && !ok && !HIDE.includes('O')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; oMiss.set(key, (oMiss.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
lines.push('## O. Held-out deep murmurs, second registration (eleventh round)', '', `Clusters: ${POS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Quarter and eighth notes at 126 BPM, each followed by a rest, F2, E3, A3, D4, D#4, E4.`, '',
  '| | with the deep-murmur rule | without (`deepMurmur: false`) |', '|---|---|---|',
  `| cluster syllables read exactly (on their nasal) | ${cell('cluster on')} | ${cell('cluster off')} |`,
  `| of them, eighth notes on D4, D#4 and E4 | ${cell('high on')} | ${cell('high off')} |`,
  `| other syllables read exactly | ${cell('other on')} | ${cell('other off')} |`,
  `| voiced stops read as a nasal | ${oVst.on || 0} | ${oVst.off || 0} |`,
  `| vowel-only control read as none | ${cell('control on')} | ${cell('control off')} |`, '',
  'Misses with the rule (count over the twelve pitch and length cells):', '', HIDE.includes('O') ? '- hidden' : [...oMiss].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none', '');
}

// ---- P ----
// The twelfth round's held-out set (PRE.hi, pre-registered in the header): 10 cluster syllables and 20 others sung in
// no other part, at G2, D3, G#3, C#4, D4 and F4, 116 BPM, pulse-4 and pulse-2 notes (two pulses a beat), each followed
// by a rest; the reader as it stands beside `preOpts: { hi: 4 }`.
if (PARTS.includes('P')) {
const POS = ['cent', 'pint', 'dons', 'tans', 'munt', 'lint', 'sanc', 'genc', 'rons', 'fent'];
const VST = ['sad', 'ted', 'rob', 'lig', 'dub', 'mag', 'vid', 'nug'];
const NEG = [...VST, 'pat', 'fec', 'tip', 'lot', 'duc', 'sum', 'ten', 'gam', 'las', 'dos', 'me', 'tu'];
const SY = [...POS, ...NEG], tally = {}, pMiss = new Map(), pVst = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const RCB = { ...RC, preOpts: { ...(RC.preOpts || {}), hi: 4 } };
for (const pulses of [4, 2]) for (const midi of [43, 50, 56, 61, 62, 65]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 116, title: 'held-out loud murmurs' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (POS.includes(s) ? 'cluster' : 'other') : 'control';
      for (const [mode, o] of [['on', RC], ['off', RCB]]) {
        const got = readCoda(x, rate, vAt, tEnd, o), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'cluster' && pulses === 2 && midi >= 61) bump(`high ${mode}`, ok);
        if (grp === 'other' && VST.includes(s) && got.cls === 'nasal') pVst[mode] = (pVst[mode] || 0) + 1;
        if (mode === 'on' && !ok && !HIDE.includes('P')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; pMiss.set(key, (pMiss.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
lines.push('## P. Held out: murmurs louder than the dip before them (twelfth round)', '', `Clusters: ${POS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes (two pulses a beat) at 116 BPM, each followed by a rest, G2, D3, G#3, C#4, D4, F4.`, '',
  '| | the reader (PRE.hi 12) | `preOpts: { hi: 4 }` (before) |', '|---|---|---|',
  `| cluster syllables read exactly (on their nasal) | ${cell('cluster on')} | ${cell('cluster off')} |`,
  `| of them, pulse-2 notes on C#4, D4 and F4 | ${cell('high on')} | ${cell('high off')} |`,
  `| other syllables read exactly | ${cell('other on')} | ${cell('other off')} |`,
  `| voiced stops read as a nasal | ${pVst.on || 0} | ${pVst.off || 0} |`,
  `| vowel-only control read as none | ${cell('control on')} | ${cell('control off')} |`, '',
  'Misses (count over the twelve pitch and length cells):', '', HIDE.includes('P') ? '- hidden' : [...pMiss].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none', '');
}

// ---- Q ----
// The thirteenth round's held-out set (VOICE_BAR_DB, pre-registered in the header): voiced-stop codas and others at
// A2, F3, A#3, C4 and D#4, 100 BPM, pulse-4 and pulse-2 notes, each followed by a rest; the choir with the voice bar
// at one level beside the fixed gain (`voiceBarLevel: false`). The reader is the same in both columns.
if (PARTS.includes('Q')) {
const VST = ['tub', 'mab', 'cib', 'reb', 'sed', 'quod', 'pud', 'lod', 'ug', 'fug', 'sub', 'ad'];
const NEG = ['pot', 'lec', 'sap', 'rum', 'nem', 'fel', 'hic', 'ra'];
const SY = [...VST, ...NEG], tally = {}, qMiss = new Map(), qNone = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
for (const pulses of [4, 2]) for (const midi of [45, 53, 58, 60, 63]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 100, title: 'held-out voice bars' });
  for (const sing of [true, 'vowels']) for (const [mode, vb] of [['on', true], ['off', false]]) {
    const { x, notes } = choir(mid, sing, vb);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (VST.includes(s) ? 'vst' : 'other') : 'control';
      const got = readCoda(x, rate, vAt, tEnd, RC), ok = match(want, got);
      bump(`${grp} ${mode}`, ok);
      if (grp === 'vst' && got.cls === 'none') qNone[mode] = (qNone[mode] || 0) + 1;
      if (mode === 'on' && !ok && !HIDE.includes('Q')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; qMiss.set(key, (qMiss.get(key) || 0) + 1); }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
lines.push('## Q. Held out: voice bars at one level (thirteenth round)', '', `Voiced stops: ${VST.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 100 BPM, each followed by a rest, A2, F3, A#3, C4, D#4.`, '',
  '| | voice bar VOICE_BAR_DB under the vowel | fixed gain (`--voice-bar off`) |', '|---|---|---|',
  `| voiced-stop codas read exactly | ${cell('vst on')} | ${cell('vst off')} |`,
  `| voiced-stop codas read as nothing | ${qNone.on || 0} | ${qNone.off || 0} |`,
  `| other syllables read exactly | ${cell('other on')} | ${cell('other off')} |`,
  `| vowel-only control read as none | ${cell('control on')} | ${cell('control off')} |`, '',
  'Misses (count over the ten pitch and length cells):', '', HIDE.includes('Q') ? '- hidden' : [...qMiss].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none', '');
}

// ---- R ----
// The fourteenth round's held-out set (localRef, pre-registered in the header): voiced-stop codas, nasal codas and
// others sung in no other part, at A#2, G3, C#4, D4, E4 and F4, 112 BPM, pulse-4 and pulse-2 notes, each followed by
// a rest, sung and vowel-only. Three columns: the reader as shipped, `localRef: false` (the reader before), and the
// choir with the voice bar's wall low-pass switched from its default (`voiceBarWall`), read by the reader as shipped.
if (PARTS.includes('R')) {
const VST = ['rog', 'sib', 'teg', 'vad', 'pug', 'hob', 'ned', 'dib', 'meg', 'nob'];
const NAS = ['sen', 'pin', 'gem', 'don'];
const NEG = [...NAS, 'fac', 'mox', 'dit', 'sat', 'vel', 'tus'];
const SY = [...VST, ...NEG], tally = {}, rMiss = new Map(), rNone = {}, rNas = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
for (const pulses of [4, 2]) for (const midi of [46, 55, 61, 62, 64, 65]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 112, title: 'held-out local reference' });
  for (const sing of [true, 'vowels']) for (const wall of [WALL, !WALL]) {
    const { x, notes } = choir(mid, sing, VOICEBAR, wall);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (VST.includes(s) ? 'vst' : NAS.includes(s) ? 'nasal' : 'other') : 'control';
      const modes = wall === WALL ? [['on', RC], ['off', { ...RC, localRef: false }]] : [['wall', RC]];
      for (const [mode, o] of modes) {
        const got = readCoda(x, rate, vAt, tEnd, o), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'vst' && got.cls === 'none') rNone[mode] = (rNone[mode] || 0) + 1;
        if (grp === 'vst' && got.cls === 'nasal') rNas[mode] = (rNas[mode] || 0) + 1;
        if (mode === 'on' && !ok && !HIDE.includes('R')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; rMiss.set(key, (rMiss.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
lines.push('## R. Held out: closures against the vowel before them (fourteenth round)', '', `Voiced stops: ${VST.map((s) => `*${s}*`).join(', ')}; nasals: ${NAS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.filter((s) => !NAS.includes(s)).map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 112 BPM, each followed by a rest, A#2, G3, C#4, D4, E4, F4.`, '',
  `| | the reader (localRef) | \`localRef: false\` (before) | voice bar wall ${WALL ? 'off' : 'on'} |`, '|---|---|---|---|',
  `| voiced-stop codas read exactly | ${cell('vst on')} | ${cell('vst off')} | ${cell('vst wall')} |`,
  `| voiced-stop codas read as nothing | ${rNone.on || 0} | ${rNone.off || 0} | ${rNone.wall || 0} |`,
  `| voiced-stop codas read as a nasal | ${rNas.on || 0} | ${rNas.off || 0} | ${rNas.wall || 0} |`,
  `| nasal codas read exactly | ${cell('nasal on')} | ${cell('nasal off')} | ${cell('nasal wall')} |`,
  `| other syllables read exactly | ${cell('other on')} | ${cell('other off')} | ${cell('other wall')} |`,
  `| vowel-only control read as none | ${cell('control on')} | ${cell('control off')} | ${cell('control wall')} |`, '',
  'Misses with the reader (count over the twelve pitch and length cells):', '', HIDE.includes('R') ? '- hidden' : [...rMiss].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none', '');
}

// ---- C ----
if (PARTS.includes('C')) {
const files = [];
for (const d of ['', ...readdirSync(corpus, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${e.name}/`)])
  for (const f of readdirSync(new URL(d, corpus))) if (f.endsWith('.gabc')) files.push(`${d}${f}`);
const count = new Map(); let syl = 0, closes = 0, clusters = 0;
for (const f of files) for (const e of parseGabc(readFileSync(new URL(f, corpus), 'utf8')).events) {
  if (e.type !== 'note' || !e.syllable) continue;
  syl++;
  const cd = latinCoda(e.syllable);
  if (cd.length) { closes++; if (cd.length > 1) clusters++; count.set(cd[0], (count.get(cd[0]) || 0) + 1); }
}
lines.push('## C. Closing consonants in the corpus', '', `${files.length} GABC files, ${syl} sung syllables; ${pct(closes, syl)} close on a consonant, ${clusters} on a cluster. First phone: ${[...count].sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p} ${c}`).join(', ')}.`, '');
}
writeFileSync(outFile, lines.join('\n') + '\n');
console.log(lines.join('\n'));
