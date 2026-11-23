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
// Fifteenth round (2026-11-16): two anchors for one closure (onsets.mjs ANCHOR, readCoda `closeAnchor`, README "Two
//    anchors for one closure"). A second session diagnosed the same D4 fault in parallel (eval/voice-bar-diag.mjs) and
//    wrote a different rule: the closure against the loudest of the last 10 vowel-like frames (within 12 dB), the
//    total and the band under 500 Hz each against its own anchor, uncapped. Chosen on K's and N's voiced stops only
//    (against the reference alone: K's *eb ib ob* 20 to 24 of 30, N's eight 72 to 82 of 96), and pre-registered on its
//    own held-out set, now part S (12 voiced stops *beb dib gid neg mig sab feb lid ved rag heb pug*, 13 others *dit pec
//    lip sut min fem bas fus sent punt nom vi do*, G#2, A#2, E3, C4, F4, 112 BPM; *dib*, *pug* and *dit* are also in R,
//    the two sets were written at the same time). Against the reference alone, S's voiced stops went 101 to 108 of 120,
//    others 128 of 130 both, control 246 of 250 both, and every part A-Q was within its registered allowance. Neither
//    rule has been run on the other's held-out set. Registered here and committed before that cross run: localRef
//    stays the default unless closeAnchor (with `--local off`) reads R's and S's voiced stops together 3 or more better
//    than localRef, and loses nothing anywhere else: every part's total no lower, nasals no fewer, every vowel-only
//    control identical, and consonant-check unmoved. Otherwise closeAnchor stays opt-in, reported.
//    Outcome (run 2026-11-16): voiced stops, R: reference only 99, localRef 103, closeAnchor 100; S: 101, 108, 108;
//    together localRef 211, closeAnchor 208 of 240: closeAnchor does not clear the bar, localRef stays the default and
//    closeAnchor stays opt-in. Against the default, closeAnchor: K's others 193 to 195, N's 220 to 222, O's 222 to 223,
//    P's others 214 to 216 and clusters 114 to 115, Q's voiced stops 106 to 105, S's others 127 to 128; A, B, D, E, H,
//    I, F, J, L and M byte-identical, every control identical. Not registered: with closeAnchor, R's wall column read
//    107 of 120 (103 with localRef).
// Sixteenth round (2026-11-16): closeAnchor with the wall in codas (README "The wall in codas only"). The fifteenth
//    round saw, unregistered, R's voiced stops read 107 of 120 with closeAnchor and the wall, against 103. The wall
//    had cost the openings (consonant-check A 195 to 192, B 812 to 808), so it now has a coda-only form, sing.mjs
//    `voiceBarWall: 'coda'` (`--wall coda`): a closing b, d or g is low-passed, an opening one is sung as before.
//    Candidate: closeAnchor (localRef off) read on the choir with the coda wall, against the default (localRef, no
//    wall). On A-S (development; R and S now included, their misses have been read), against the default: A 177 to
//    176 (E2), K's others 193 both but read as a nasal 7 to 9, N's others 220 to 226 (voiced stops as a nasal 6 to 4,
//    clusters 115 to 116 in its second column), O's others 222 to 224 (as a nasal 4 to 5), P's others 214 to 216,
//    clusters 114 to 115 but voiced stops as a nasal 7 to 11, Q's voiced stops 106 to 105 (as nothing 6 to 3) and
//    others 75 to 76, R's voiced stops 103 to 107, S's 108 to 113; B, D, E, H, I, F, J, L and M identical, every
//    vowel-only control identical. Each alone: closeAnchor gains no voiced stop on R (100) or Q (105); the coda wall
//    alone costs A 2 and J 1 and reads P's voiced stops as a nasal 12 times. Pre-registered here and committed before
//    part T or any other new part was run with it. Part T is new: 12 voiced-stop codas (*lub tag pob sug cad mub fod
//    rib vob tid hag peg*), 4 nasal codas (*fun ram lim ben*) and 8 others (*lut mic hep gos rax lunc hel fa*), none
//    sung in any other part, at B2, F#3, B3, D4, D#4 and E4, 118 BPM (in no other part), pulse-4 and pulse-2 notes,
//    sung and vowel-only. Against the default (T's first column), the candidate (its fourth): (1) T's voiced stops
//    read exactly at least 4 more of 144; (2) T's voiced stops read as a nasal no more than 3 more often; (3) T's
//    nasal codas no fewer (of 48); (4) T's others within 2 (of 96); (5) T's vowel-only control identical (of 288);
//    (6) eval/consonant-check.mjs with `--wall coda` byte-identical to the default (the openings are untouched);
//    (7) A-S as listed above. If all seven hold, the candidate becomes the default (readCoda `closeAnchor: true,
//    localRef: false`; render.mjs `voiceBarWall: 'coda'`); otherwise both stay opt-in, reported. The two single
//    columns are printed but decide nothing.
//    Outcome (run 2026-11-16, after the registration above was committed): failed. On T, voiced stops read exactly:
//    default 122, closeAnchor 124, coda wall 120, both 121 of 144, so (1) fails (-1 where +4 was wanted); (2) read as a
//    nasal 11 to 14, holds at the bar; (3) nasals 45 of 48 all four, (4) others 93 of 96 all four, (5) control 284 of
//    288 all four: hold; (6) fails by one cell: consonant-check's held-out G 2055 to 2054 of 2349 (one voiced alveolar
//    opening in gregobase-1908/3417, 61 to 60 of 74; a coda's wall reaches the next syllable's opening read); (7) holds
//    (the figures above were taken on this code). Both stay opt-in. R's 107 did not generalise: across R, S and T
//    closeAnchor alone reads 332 of 384 voiced stops against localRef's 333. T's misses with the default are mostly a
//    voiced stop read as a nasal (11 of 22: *tag*, *pob*, *hag*, *vob*), the next item.
// Seventeenth round (2026-11-16): a voice bar read as a murmur (onsets.mjs readCoda `barLead`, README "A voice bar
//    read as a murmur"). T's default misses were read frame by frame (eval/vstop-diag.mjs T, which now prints the
//    nasal rule that fired): all 10 of *tag*, *pob*, *hag* and *vob* read as a nasal came from the level rule
//    (`nasal`), and on 7 of them a stop's closure, with its burst found, starts 1 to 7 frames after the run's own
//    start. The vowel before swells over the 60 ms reference with the five voices' beat (tag on F#3: +10 dB), so the
//    voice bar, 25 dB under that vowel, meets the closure rule (localRef) and, 16 dB under the reference, the
//    level rule's -5 to -25 dB band too, from the same frames; the level rule's run starts first and wins. The
//    candidate: a level-rule run that a burst-ended closure starts inside of, within `barLead` frames of the run's
//    start, is that closure's voice bar and is dropped. A nasal's murmur runs 40-70 ms before a cluster's stop, so
//    a lead of up to 8 frames should leave clusters. On A-T (development), against the default: barLead 3 and 8
//    were run, nothing fell anywhere; with 8, A 177 to 178 (E2 *ad*), J's others 321 to 325, L's 109 to 110, O's
//    others 222 to 223, P's 214 to 218 (voiced stops as a nasal 7 to 3), Q's voiced stops 106 to 107, T's 122 to
//    125 (as a nasal 11 to 6), and on the opt-in columns R's wall 103 to 108, S's closeAnchor 108 to 109; B, D, E,
//    H, I, F, K, M, N, R's and S's default columns and every vowel-only control identical. barLead 8 is the
//    candidate. Pre-registered here and committed before part U was run with anything. Part U is new: 12
//    voiced-stop codas (*dag bob mod sig lag tib ceb nud hod fig gub pid*), 4 nasal codas (*bam sun tem hon*), 4
//    n-cluster codas (*dent hens sonc tint*, read as their nasal) and 8 others (*dut sic gep bos lex bel mo vit*),
//    none sung in any other part, at A2, D3, G#3, A#3, C#4 and D#4, 110 BPM (in no other part), pulse-4 and pulse-2
//    notes, sung and vowel-only. Against the default (U's first column), barLead 8 (`--bar 8`, its second):
//    (1) U's voiced stops read exactly at least 2 more of 144; (2) U's voiced stops read as a nasal at least 2
//    fewer; (3) U's nasal codas no fewer (of 48); (4) U's n-clusters read as a nasal no fewer (of 48); (5) U's
//    others no fewer (of 96); (6) U's vowel-only control no fewer read as none (of 288); (7) A-T: no figure of the
//    default column lower than with the rule off, re-run on the shipped code; (8) eval/consonant-check.mjs cannot
//    move (it reads openings with readOnset; readCoda appears there only in comments). If all eight hold, barLead
//    8 becomes readCoda's default; otherwise it stays opt-in, reported.
//    Outcome (run 2026-11-16, after the registration above was committed): failed on (1). On U, voiced stops read
//    exactly: default 127, barLead 128 of 144 (+1 where +2 was wanted); (2) read as a nasal 6 to 4, holds; (3) nasals
//    46 of 48 both, (4) n-clusters 46 of 48 both, (5) others 93 of 96 both, (6) control 332 of 336 both (the
//    registration said "of 288", copied from T: U has 28 syllables, so 336), hold; (7) holds (the A-T figures above
//    were taken on this code, the default column of every part byte-identical); (8) holds by construction. barLead
//    stays opt-in. Read frame by frame after the run (eval/vstop-diag.mjs U --bar 8): of the 2 nasals it turned back,
//    *dag* on A#3 became a voiced *labial* stop (the burst's place), and the voiced stops still read as a nasal (*bob*
//    on C#4, *lag* on D#4) have no burst found at all, so no closure for barLead to see. Across T and U, every
//    voiced stop barLead rescued on F#3-A#3 that ends in g reads as a b: the next faults are a velar burst read as
//    labial on F#3-A#3 and the burst search on C#4-E4, not the murmur rule.
// Eighteenth round (2026-11-16): a velar burst read as labial (onsets.mjs readCoda `compactVelar`, COMPACT_VELAR,
//    README "A g's burst read as a b"). T's, U's, K's and N's stop codas were read burst by burst (eval/vstop-diag.mjs,
//    which now prints each burst's centroid, share above 1 kHz and sliding 500 Hz compactness): every velar read as a
//    labial (T *tag* and *hag* on B3 and F#3, U *lag* and *dag* on A#3, N *vig* on D#4) had a compact burst (0.68 to
//    0.83 of its 1-11 kHz energy in one 500 Hz band, centred at 1.9 to 2.8 kHz) but 32 to 50% of its energy above
//    1 kHz, so the "plainly low" labial test (`hi1 < 0.5 tot`) fired first: the voice bar's harmonics run on under
//    the burst. Labial bursts as compact as that peak at the 1.25 kHz floor; the labials peaking at 1.5 kHz or above
//    were 0.58 compact or less. The candidate: a burst 0.65 or more compact, centred at 1.65 kHz or above, is velar
//    before the low test. On A-U (development), against the default: K's others 109 to 110, N's 220 to 221, O's 222
//    to 223 (its closeAnchor column too), P's 214 to 215, T's voiced stops 122 to 123 (closeAnchor 124 to 126, both
//    122 to 123), U's 127 to 129 (barLead 128 to 131); nothing fell; A, B, D, E, H, I, F, J, L, M, R, S and every
//    vowel-only control identical. Pre-registered here and committed before part V was run with anything. Part V is
//    new: 16 velar codas (*dog bag tog gig vag nig sog leg hug cag*, voiced; *dac roc puc nac tuc lic*, voiceless), 9
//    labial (*gob dab rub lap rup sep fip mop dap*), 5 alveolar (*nid led sud rad tod*) and 5 others (*gum ron lis
//    tas mu*), none sung in any other part, at G2, F3, G3, A3, B3 and D4, 114 BPM (in no other part), pulse-4 and
//    pulse-2 notes, sung and vowel-only. Against the default (V's first column), compactVelar (its second): (1) V's
//    velar codas read exactly at least 3 more of 192; (2) V's velars read as a labial stop at least 3 fewer; (3) V's
//    labial codas read exactly no fewer (of 108), and read as a velar stop at most 1 more; (4) V's alveolar codas,
//    others and vowel-only control identical (the rule only moves a stop's place between labial and velar, after the
//    alveolar test); (5) A-U as above, re-run on the shipped code; (6) eval/consonant-check.mjs cannot move (readOnset
//    is untouched). If all six hold, compactVelar becomes readCoda's default; otherwise it stays opt-in, reported.
//    Outcome (run 2026-11-16, after the registration above was committed): failed on (1) and (2). On V, velar codas
//    read exactly: default 175, compactVelar 176 of 192 (+1 where +3 was wanted); (2) read as a labial 1 to 0 (3 fewer
//    wanted: V's default read only one velar as a labial, *sog*, so the prediction overrated how often the fault
//    occurs); (3) labials 86 of 108 both, read as a velar 14 both, holds; (4) alveolar 57 of 60, others 59 of 60,
//    control 420 of 420, identical, holds; (5) holds (the A-U figures above were taken on this code); (6) holds by
//    construction. compactVelar stays opt-in. V's larger place fault runs the other way: 14 of 108 labial codas read
//    as a velar stop, 12 of them voiceless p on A3 and B3 (*lap rup sep fip mop dap*), whose bursts read (eval/
//    vstop-diag.mjs V) 2.1-2.3 kHz centroid, 54-66% above 1 kHz, 0.50-0.68 compact at 1.6-2.1 kHz, although sing.mjs
//    sings p's burst at 500 Hz +-750 Hz; the same syllables on G2 and F3 read 0.33-0.44 above 1 kHz. Next: where that
//    energy above 1 kHz comes from on A3-B3 (the burst search's timing or the vowel's release), before any rule.
// Nineteenth round (2026-11-16): a p's burst read as a k (onsets.mjs readCoda `voicelessLow`). Read first, outside
//    this script: eval/place-sweep.mjs printed every stop coda of K, N, T, U and V with its burst's features (964 read
//    as a stop). The energy above 1 kHz is the burst's own. sing.mjs's p burst is noise through a fourth-order band
//    at 500 Hz, 1500 Hz wide; one 8 ms draw of it, alone and read through the same 10 ms window, puts 22-65% of its
//    energy above 1 kHz (10th-90th percentile, 200 draws), over half on 31% of draws. In the choir, voiceless labial
//    bursts read 0.11-0.79 above 1 kHz (median 0.39), with no trend by pitch (A3 and B3 are not special); voiceless
//    velar bursts 0.99-1.00, alveolar 1.00 (a silent closure leaves nothing low under them). The share is set by the
//    cell, not the syllable: 97% of its variance among the 136 p codas lies between the 58 pitch-and-length cells
//    (render.mjs seeds a note's noise from its pitch and length), so V's 12 p misses are three cells' draws. The
//    candidate: after a closure read as voiceless, a burst with 0.9 or less of its energy above 1 kHz is labial
//    (midway between 0.79 and 0.99, not tuned further); a voiced one keeps the 0.5 test, where the voice bar runs on.
//    On A-V (development), against the default: A 177 to 178 of 180 (*ap* on C4), J's others 321 to 323, K's 193 to
//    204, N's 220 to 221, P's 214 to 215, Q's 75 to 76, U's 93 to 95, V's labial codas 86 to 98 of 108 (read as a
//    velar 14 to 2); nothing fell; B, D, E, H, I, F, L, M, O, R, S, T and every vowel-only control identical. In
//    cells: the K-V sweep's 26 voiceless labials read as velar sat in 10 of 58 cells, and the rule turned all 26.
//    Pre-registered here and committed before part W was run with anything. Part W is new: 10 voiceless labial
//    codas (*tep cap nup bip hop vep lop gap rip hup*, the target), 8 voiceless velar codas (*tic mac sec voc ric hac
//    buc nec*, the risk), 7 voiced stops (*pab teb nog tig rug dob mug*), 2 alveolar (*fed nut*) and 3 others (*hos
//    pum fu*), none sung in any other part, at A2, E3, G#3, A#3, B3 and C#4, 122 BPM (in no other part), pulse-4 and
//    pulse-2 notes, sung and vowel-only. Against the default (W's first column), voicelessLow (its second): (1) W's
//    voiceless labials read as a velar stop: at most 1 with voicelessLow; (2) voiceless labial codas read exactly
//    (of 120): voicelessLow at least the default's count plus the default's labial-as-velar count, less 1; (3)
//    voiceless velars read as a labial stop at most 1 more, and voiceless velar codas read exactly (of 96) at most 1
//    fewer; (4) voiced stops (of 84), alveolar (of 24), others (of 36) and the vowel-only control (of 360) identical
//    (the rule only moves a voiceless stop's place to labial); (5) A-V as above, re-run on the shipped code; (6)
//    eval/consonant-check.mjs cannot move (readOnset is untouched). With the sweep's rate (10 of 58 cells), W's 12
//    cells hold about two with a p read as a k, and none about one time in nine. If all six hold and the default
//    reads at least one of W's voiceless labials as a velar, voicelessLow becomes readCoda's default. If the default
//    reads none, the gain is untested on W: the rule stays opt-in, reported as such. Otherwise it stays opt-in.
//    Outcome (run 2026-11-16, after the registration above was committed): held. (1) W's voiceless labials read as a
//    velar 18 before, 0 with voicelessLow; (2) voiceless labial codas 100 to 118 of 120 (117 wanted); (3) velars read
//    as a labial 0 and 0, velar codas 95 and 95 of 96; (4) voiced stops 71, alveolar 23, others 32, control 338,
//    identical; (5) the report rebuilt on the shipped code matches the A-V figures above; (6) holds by construction.
//    The 18 sat in two of W's 12 cells (A2 pulse-4, all 10; B3 pulse-2, 8 of 10). voicelessLow is the default.
// Twentieth round (2026-11-17): no burst on C#4-E4 (onsets.mjs readCoda `barBurst`, BAR_BURST; README "No burst on
//    C#4-E4"). Read first, outside this script: eval/burst-diag.mjs printed every closure readCoda found on U's C#4 and
//    D#4 cells with its burst search. Two faults. (a) The closure rule misses the voice bar: on C#4-E4 it sits 19-23 dB
//    under the vowel in all but only 4-7 dB under it below 500 Hz (both are little more than the fundamental there),
//    short of the rule's 12, so the nasal rule reads it (*bob*, *lag* on C#4/D#4: the closure the reader did find was
//    the silence after the release). (b) b's burst (a 500 Hz band) stands 2-9 dB over the bar's harmonics above 600 Hz
//    (*bob* on D#4: read as nothing); above 2 kHz it stands 30 dB over. The candidate: when the 600 Hz search finds no
//    burst, search again above 2 kHz against the bar in the 10 ms before; and a voiced, dark run (10 dB or more under
//    the vowel, above -40, 30 dB under it above 1 kHz) that a burst ends, the bar still at its level in the 20 ms
//    before the release, is a voiced closure, unless the burst runs into frication or a closure with its own burst
//    starts within 8 frames of the run's end (a cluster's n). A nasal-rule murmur starting at most 4 frames before
//    it is its voice bar. On A-W (development), against the default: Q's voiced stops 106 to 112 of 120, R's 103 to
//    114, S's 108 to 114, T's 122 to 131 of 144, U's 127 to 136, V's velars 175 to 182 of 192 (read as a labial 1 to
//    4) and labials 98 to 101 of 108, W's voiced stops 71 to 76 of 84; others J +8, K +2, L +2, N +6, O +4, P +17 (its
//    voiced stops read as a nasal 7 to 0); lost: H's 3438 *ab* (labial read as velar), F's nasals 195 to 194 of 215;
//    every cluster nasal and every vowel-only control identical. A first form without the cluster guards lost 9
//    cluster cells on J, K, N, O and P (*int*, *tent*, *hinc*, *mens* read as a voiced stop); those were set on
//    them, so J-P are development. Pre-registered here and committed before part X was run with anything. Part X is
//    new: 12 voiced stop codas (*lob fub nib peb fab cub fag cog bug hud rid mud*, the target), 4 nasal codas (*fen
//    gim lan tum*) and 5 n-clusters (*lens sunc fant gonc rins*, the risk), 2 voiceless stops (*nep ruc*) and 2
//    others (*sol fos*), none sung in any other part, at A#2, G3, C#4, D4, D#4 and E4, 106 BPM (in no other part),
//    pulse-4 and pulse-2 notes, sung and vowel-only. Against the default (X's first column), barBurst (its second):
//    (1) voiced stop codas read exactly (of 144): barBurst at least 4 more; (2) voiced stops on C#4-E4 read as a
//    nasal or nothing: at least 4 fewer; (3) nasal codas (of 48) no fewer, n-clusters read as their nasal (of 60) at
//    most 1 fewer and as a stop at most 1 more; (4) voiceless stops (of 24) and others (of 24) at most 1 fewer, the
//    vowel-only control (of 300) identical; (5) A-W as above, re-run on the shipped code; (6) eval/consonant-check.mjs
//    cannot move (readOnset is untouched). The gain is tested only if the default reads 4 or more of X's C#4-E4
//    voiced stops as a nasal or nothing; if it reads fewer, barBurst stays opt-in, reported as untested. If all six
//    hold and the gain is tested, barBurst becomes readCoda's default; otherwise it stays opt-in. In cells (README
//    "A p's burst read as a k": a note's noise is seeded by its pitch and length), X's 8 high cells are the trials.
//    Outcome (run 2026-11-17, after the registration above was committed as 89531e5): held. (1) voiced stop codas 102
//    to 130 of 144; (2) C#4-E4 voiced stops read as a nasal or nothing 30 to 6 (the gain was tested: the default read
//    30); (3) nasal codas 42 and 42 of 48, n-clusters 51 and 51 of 60, read as a stop 9 and 9;
//    (4) voiceless 23 and 23 of 24, others 23 and 23, control 292 and 292 of 300; (5) the report rebuilt on the
//    shipped code matches the A-W figures above; (6) holds by construction. barBurst is readCoda's default.
//    Twenty-first round (2026-11-17): a voiced stop's lead read as a nasal (onsets.mjs readCoda `voicedLead`, README "A
//    g's voice bar read as a nasal"). X's *cog* on C#4-E4 read as a nasal: eval/burst-diag.mjs (now printing the nasal
//    rule and its run) shows the voice-bar rule's closure and its burst found, but a level- or step-rule run, the /o/
//    darkening into the closure and the bar's first frames, starting 7-8 frames earlier and ending at or inside the
//    closure. No Latin coda puts a nasal before a voiced stop. Rule: a nasal-rule run that starts before the chosen
//    closure and ends at most 2 frames before it, or inside it, is dropped when that closure is one the voice-bar rule
//    found (barBurst's, which carries the cluster guards) and reads voiced. A first form on any voiced-reading closure
//    (`--vlead 2`) gained more (X 130 to 134) but lost 9 n-t and n-c clusters (corpus *mant*, *dant*, *hanc*, *BANT*,
//    N's *rens*, *fans*, M's *pens*: the n's murmur runs into the t's closure, which then reads voiced), so it was
//    dropped. Development (A-X, `--vlead bar2` against the default): K's others 206 to 207 of 220, N's 227 to 229 of 240
//    (voiced stops read as a nasal 6 to 4), R's third column 112 to 113, T's first and third 131 to 132 and 132 to 133,
//    V's velars 182 to 183 and alveolars 58 to 59, X's voiced stops 130 to 133 of 144 (*cog* read as a nasal 5 to 3);
//    nothing lost in any part, the corpus parts B, D, E, H, I and F identical, every vowel-only control identical.
//    Pre-registered here and committed before part Y was run with anything. Part Y is new: 16 voiced stop codas, most
//    after /o/ or /u/ (*mog fog hog tug dug lug sob cob nub pod gud gad bed beg bid rig*, the target), 4 nasal codas
//    (*gom hun son tun*) and 4 n-clusters (*ponc runc ront hont*, the risk), 3 voiceless stops (*dop hut bic*) and 2
//    others (*pof mus*), none sung in any other part, at G#2, A3, C4, C#4, D4 and E4, 102 BPM (in no other part),
//    pulse-4 and pulse-2 notes, sung and vowel-only. Against the default (Y's first column), voicedLead (its second):
//    (1) voiced stop codas read exactly (of 192): at least 2 more; (2) voiced stops read as a nasal: at least 2 fewer;
//    (3) nasal codas (of 48) and n-clusters read as their nasal (of 48) no fewer, and no more of them read as a voiced
//    stop; (4) voiceless stops (of 36), others (of 24) and the vowel-only control (of 348) identical; (5) A-X as above,
//    re-run on the shipped code. The gain is tested only if the default reads 2 or more of Y's voiced stops as a
//    nasal; if fewer, voicedLead stays opt-in, reported as untested. If all five hold and the gain is tested,
//    voicedLead becomes readCoda's default; otherwise it stays opt-in.
//    Outcome (run 2026-11-17, after the registration above was committed as 40910f4): failed. (1) voiced stop codas 173
//    to 174 of 192 (2 wanted); (2) read as a nasal 10 to 9 (the gain was tested: the default read 10); (3) nasal codas 45
//    and 45 of 48, n-clusters 42 and 42 of 48, read as a voiced stop 0 and 0; (4) voiceless 36 and 36, others 23 and 23,
//    control 335 and 335 of 348; (5) the report rebuilt on the shipped code matches the A-X figures above. voicedLead
//    stays opt-in (`--vlead bar2`).
//    Twenty-second round (2026-11-17): a voiced closure that holds to its burst (onsets.mjs readCoda `voicedLead: { hold:
//    true }`, README "A voiced closure that holds to its burst"). Y's nasal misses mostly end on a closure the ordinary
//    closure rule found, which the bar form skips. Rule: such a closure counts too when it passes the voice-bar rule's
//    own release test (barRel: a burst that does not run into frication, the 20 ms before it voiced above -40 dB and
//    within 6 dB of the run's median), and the run dropped must start at most 20 frames (100 ms) before the closure.
//    A first form (the hold measured on any burst, frication allowed, no span) lost K's *om* and *on*, N's *fans* and
//    *rens*, O's *pens*, V's *gum* and Y's *son* to a voiced stop: n-s clusters run into frication, and a final nasal
//    held 37-55 frames before a release blip the closure rule took for a burst, where every stop's lead on A-Y started
//    1-14 frames before its closure (eval leads listing, README). Development (A-Y, `--vlead hold2` against the default):
//    A's E2 29 to 30 of 30; K's others 206 to 208 of 220; M's 331 to 332; N's 227 to 230 (voiced stops read as a nasal
//    6 to 3); O's 226 to 227; Q's voiced stops 112 to 113 and 105 to 107; R's third column 112 to 117 of 120 (as a
//    nasal 6 to 1); T's 131-133 to 133-136 of 144; V's velars 182 to 186 and 185 to 190, labials 101 to 103 and 98 to
//    100, alveolars 58 to 59; W's voiced stops 76 to 78 of 84; X's 130 to 134 of 144 (C#4-E4 as a nasal or nothing 6
//    to 3); Y's 173 to 176 of 192 (as a nasal 10 to 4). No nasal coda, n-cluster, voiceless stop, other or vowel-only
//    cell lost in any part; the corpus parts B, D, E, H, I and F identical. Some voiced velars now read as a voiced
//    labial (V's velars read as a labial 4 to 5) where they read as a nasal before: a place miss, counted as a miss.
//    Pre-registered here and committed before part Z was run with anything. Part Z is new: 16 voiced stop codas, most
//    after /o/ or /u/ (*log pog gog mob rod vod cug hub cud bub fud lib heg rab neb sid*, the target), 4 nasal codas
//    (*lum bon com dun*) and 6 n-clusters (*bont lonc dunt sant hunt conc*, the risk), 3 voiceless stops (*bot luc pap*)
//    and 2 others (*rol hus*), none sung in any other part, at A2, F#3, B3, C#4, D#4 and E4, 98 BPM (in no other part),
//    pulse-4 and pulse-2 notes, sung and vowel-only. Against the default (Z's first column), the hold form (its third;
//    the bar form, its second, is reported, not tested): (1) voiced stop codas read exactly (of 192): at least 2 more;
//    (2) voiced stops read as a nasal: at least 2 fewer; (3) nasal codas (of 48) and n-clusters read as their nasal (of
//    72) no fewer, and no more of them read as a stop; (4) voiceless stops (of 36), others (of 24) and the vowel-only
//    control (of 372) identical; (5) A-Y as above, re-run on the shipped code. The gain is tested only if the default
//    reads 2 or more of Z's voiced stops as a nasal; if fewer, the hold form stays opt-in, reported as untested. If all
//    five hold and the gain is tested, the hold form becomes readCoda's default; otherwise it stays opt-in.
//    Outcome (run 2026-11-17, after the registration above was committed as d66844f): held. (1) voiced stop codas 171 to
//    177 of 192; (2) read as a nasal 9 to 2 (the gain was tested: the default read 9); (3) nasal codas 42 and 42 of 48,
//    n-clusters 68 and 68 of 72, read as a stop 3 and 3; (4) voiceless 36 and 36, others 24 and 24, control 359 and 359
//    of 372; (5) the report rebuilt on the shipped code matches the A-Y figures above, but for O's opt-in
//    deep-murmur column (226, as before the round, after the exemption below) and Y's second column, which stays the bar form. The hold form is readCoda's
//    default (`--vlead off` is the reader before). After the result, sing.test.mjs showed the opt-in deepMurmur rule's
//    runs dropped as leads on J's E4 eighths (*sunt*, *nunc*: 4 to 2 nasal); the deep rule only fires into frication or
//    a silent closure, so its runs are exempt. That changes only readings with `deepMurmur: true`.
//    Twenty-third round (2026-11-17): a dark-vowel nasal's lip closure (onsets.mjs readCoda `lipShut`, LIP_SHUT, README "A
//    dark-vowel m"). Z's *lum* and *dun* and X's *tum* on D4-E4 read as nothing: frame by frame (eval/dark-nasal-diag.mjs)
//    the m is dark in itself (tilt -39 to -50) but no darker than an /u/ whose tilt was already -38 to -45, so the level
//    and step rules' darkness against the vowel fails. What marks it is the closure: the band above 1 kHz blips up as the
//    lips meet, then falls 14-19 dB within two hops and holds. Rule: a run entered by a fall of 12 dB or more in that band
//    from either of the two frames before, every frame 8 dB or more under that band in the vowel 25-45 ms before, 0 to
//    -20 dB of that vowel's level, dark in itself (murmurTilt), level within 4 dB and upper band within 6 dB over its
//    first 30 ms, 45 ms long, the vowel not coming back. Chosen on Z's *lum*/*dun* cells only (4 of Z's 6 misses taken
//    back, no vowel-only cell moved), then not tuned. Development (A-Z, `--shut on` against the default): +31 cells, none
//    lost in any part. D 69 to 70 of 70; H 130 to 131 of 134; I 138 to 140 of 142; F's nasals 194 to 206 of 215; K's
//    clusters 132 to 133 of 140; L's others 116 to 117; N's 230 to 231; O's 226 to 227; P's 232 to 233; Q's 76 to 77;
//    T's nasal codas 45 to 47 of 48; U's 46 to 48; X's 42 to 43 and n-clusters as their nasal 51 to 54 of 60 (as a
//    stop 9 to 6); Y's nasal codas 45 to 46; Z's 42 to 46. A, B, E, M, R, S, V, W and every vowel-only control
//    identical. Pre-registered here and committed before part a was run with anything. Part a is new: 12 nasal codas
//    after /u/ or /o/ (*bum vum fum hum mun pun gun lun tom pom mon gon*, the target), 5 voiced stops after them (*bog
//    dod vud gug fob*, the risk: a voice bar read through the rule), 4 nasals after a bright vowel (*dem ren sim ham*),
//    4 n-clusters (*munc gont bunc funt*), 3 voiceless stops (*nuc tup bup*) and 4 others (*gul tur bu po*), none sung
//    in any other part, at D3, G#3, C4, D4, D#4 and E4, 94 BPM (in no other part), pulse-4 and pulse-2 notes, sung
//    and vowel-only. Against the default (a's first column), lipShut (its second): (1) nasals after /u/ or /o/ read
//    exactly (of 144): at least 3 more; (2) nasals after a bright vowel (of 48) and n-clusters read as their nasal (of
//    48): no fewer; (3) voiced stops (of 60), voiceless stops (of 36) and others (of 48) read exactly: no fewer, and no
//    more stops, others or vowel-only cells read as a nasal; (4) the vowel-only control (of 384): identical; (5) A-Z as
//    above, re-run on the shipped code. The gain is tested only if the default misses 3 or more of a's dark-vowel
//    nasals; if fewer, lipShut stays opt-in, reported as untested. If all five hold and the gain is tested, lipShut
//    becomes readCoda's default; otherwise it stays opt-in.
//    Outcome (run 2026-11-17, after the registration above was committed as b88e9d9): held. (1) nasals after /u/ or /o/
//    116 to 121 of 144 (the gain was tested: the default missed 28); (2) bright-vowel nasals 48 and 48 of 48, n-clusters
//    as their nasal 42 and 43 of 48; (3) voiced stops 54 and 54 of 60, voiceless 36 and 36, others 44 and 44, stops,
//    others and vowel-only cells read as a nasal 3 and 3; (4) control 384 and 384 of 384; (5) the report rebuilt on the
//    shipped code matches the `--shut on` development figures above in every part. lipShut is readCoda's default
//    (`--shut off` is the reader before).
//    Twenty-fourth round (2026-11-17): a dark-vowel m that holds level (onsets.mjs readCoda `lipHold`, LIP_HOLD, README
//    "A dark-vowel m that holds level"). With lipShut, a's misses were still *bum*, *hum*, *fum* (D4-E4 and C4 eighths),
//    *mun*, *gun* and *vum*, read as nothing. Frame by frame (eval/dark-nasal-diag.mjs a): the lips' blip is there (the
//    band above 1 kHz up 3-15 dB over the vowel, then down 11-15 dB within two or three hops), but the /u/'s upper band
//    had already fallen 3-8 dB into the closure, so the m sits no lower in that band than the vowel 25-45 ms before and
//    lipShut's darkness test fails. What it does instead is hold: its level settles 4-11 dB under that vowel and stays
//    within 1-2 dB for 30 ms. Rule: a run entered by a fall of 12 dB or more in the band above 1 kHz from any of the
//    three frames before, every frame 3 to 20 dB under the vowel's level 25-45 ms before and dark in itself
//    (murmurTilt), its level within 2 dB over its first 30 ms, 45 ms long, the vowel not coming back. Written from a's
//    D4 *bum*/*hum*/*fum* cells and C4/D4 eighths, then not tuned. Development (A-a, `--hold on` against the default,
//    lipShut on in both): +22 cells, none lost in any part. a's nasals after /u/ or /o/ 121 to 128 of 144, its
//    n-clusters 43 to 44 of 48; H 131 to 132 of 134; I 140 to 141 of 142; F's nasals 206 to 208 of 215; N's others 231
//    to 233 of 240; O's 227 to 228; P's 233 to 235; V's 59 to 60 of 60; X's nasal codas 43 to 45 of 48; Y's 46 to 47 and
//    its n-clusters as their nasal 42 to 43 of 48. Every vowel-only control identical, and no stop, other or vowel-only
//    cell newly read as a nasal. Pre-registered here and committed before part b was run with anything. Part b is new:
//    12 nasal codas after /u/ or /o/ (*mum num bun cun run vun dom fom hom som lon ton*, the target), 5 voiced stops
//    after them (*bud dud god sod vug*, the risk), 4 nasals after a bright vowel (*pem fim lam rem*), 4 n-clusters
//    (*donc tonc nunt vont*), 3 voiceless stops (*dup loc hoc*) and 4 others (*mul bor dul fo*), none sung in any other
//    part, at C#3, A3, C#4, D4, D#4 and E4, 90 BPM (in no other part), pulse-4 and pulse-2 notes, sung and vowel-only.
//    Against the default (b's first column), lipHold (its second): (1) nasals after /u/ or /o/ read exactly (of 144): at
//    least 3 more; (2) nasals after a bright vowel (of 48) and n-clusters read as their nasal (of 48): no fewer; (3)
//    voiced stops (of 60), voiceless stops (of 36) and others (of 48) read exactly: no fewer, and no more stops, others
//    or vowel-only cells read as a nasal; (4) the vowel-only control (of 384): identical; (5) A-a as above, re-run on the
//    shipped code. The gain is tested only if the default misses 3 or more of b's dark-vowel nasals; if fewer, lipHold
//    stays opt-in, reported as untested. If all five hold and the gain is tested, lipHold becomes readCoda's default;
//    otherwise it stays opt-in.
//    Outcome (run 2026-11-17, after the registration above was committed as 87d1968): failed. (1) nasals after /u/ or
//    /o/ 133 to 135 of 144 (the gain was tested: the default missed 11; 3 wanted); (2) bright-vowel nasals 48 and 48 of
//    48, n-clusters as their nasal 47 and 47 of 48; (3) voiced stops 57 and 57 of 60, voiceless 33 and 33, others 47 and
//    47, stops, others and vowel-only cells read as a nasal 3 and 3; (4) control 384 and 384 of 384; (5) the report
//    rebuilt on the shipped code matches the development figures above. lipHold stays opt-in (`--hold on`).
// Twenty-fifth round (2026-11-17): a dark-vowel m with a slow closure (onsets.mjs readCoda `lipShut` with `span`, `settle`
//    and `rise`; README "A dark-vowel m that closes slowly"). b's misses (*num* 3, *mum* 2, *bun* 2, *cun* 2, *run*, *vun*)
//    were read frame by frame (eval/dark-nasal-diag.mjs b; part b added to eval/vstop-parts.mjs): on D#4-E4 the band above
//    1 kHz falls 15-19 dB into the m, but over 4-5 hops, not lipShut's two, and the level slides 4-8 dB over the next
//    10-15 ms before it holds. The slow form: the fall counted from any of the 4 frames before (`span: 4`), the 30 ms hold
//    looked for from the fall or up to 2 frames after it (`settle: 2`), and a late hold counts only if the band above 1 kHz
//    never climbs back more than 4 dB over its lowest point since the fall (`rise: 4`). Without `rise`, A's vowel-only /u/
//    on C4 (6 cells) and J's controls (15) read as nasals: a fading /u/'s upper band dips 15 dB and its vibrato brings it
//    back 8. A hold from the fall itself is checked as before, so the slow form reads every cell the default reads as a
//    nasal the same way unless an earlier frame now qualifies. Settings chosen on b and A, then run once on A-b.
//    Development (A-b, `--shut span=4,settle=2,rise=4` against the default): B 159 to 160 of 162 (*tum*), I 140 to 141,
//    F's nasals 206 to 207 of 215, K's others +1, N's +1, O's 227 to 229, X's nasal codas 47 to 48 and n-clusters +1,
//    [part names corrected after c ran, figures unchanged: L's others +1 (*cum*), not K's; T's nasal codas 47 to 48
//    (*fun*) and U's n-clusters +1 (*dent*), not X's; a's n-clusters +1 (*munc*)]
//    Y's n-clusters 42 to 43, Z's nasal codas 46 to 47, b's nasals after /u/ or /o/ 133 to 137 of 144; lost: Y's voiced
//    stops 173 to 172 (*sob* read as a nasal) and, in a's lipShut column, one *bu* read as a nasal. Every vowel-only
//    control identical. Pre-registered here and committed before part c was run with anything. Part c is new: 12 nasal
//    codas after /u/ or /o/, most after a nasal, labial or cluster onset (*nun brum glum stum flum prun non mom bom pon
//    vom lom*, the target), 5 voiced stops (*brud glub drog plod stug*, the risk), 4 nasals after a bright vowel (*mem nim
//    ban trem*), 4 n-clusters (*nant bonc frunt plons*), 3 voiceless stops (*mut mup trop*) and 4 others (*nus mur bo
//    nul*), none sung in any other part, at C3, A#3, C4, D4, D#4 and E4, 88 BPM (in no other part), pulse-4 and pulse-2
//    notes, sung and vowel-only. Against the default (c's first column), the slow form (its second): (1) nasals after /u/
//    or /o/ read exactly (of 144): at least 3 more; (2) nasals after a bright vowel (of 48) and n-clusters read as their
//    nasal (of 48): no fewer; (3) voiced stops (of 60), voiceless stops (of 36) and others (of 48) read exactly: no
//    fewer in total, and at most 1 more stop, other or vowel-only cell read as a nasal; (4) the vowel-only control (of
//    384): identical; (5) A-b as above, re-run on the shipped code. The gain is tested only if the default misses 3 or
//    more of c's dark-vowel nasals; if fewer, the slow form stays opt-in, reported as untested. If all five hold and the
//    gain is tested, the slow form becomes readCoda's default; otherwise it stays opt-in (`--shut span=4,settle=2,rise=4`).
//    Outcome (run 2026-11-17, after the registration above was committed as a236e0f): failed. (1) nasals after /u/ or
//    /o/ 123 to 125 of 144 (the gain was tested: the default missed 21; 3 wanted); (2) bright-vowel nasals 48 and 48 of
//    48, n-clusters as their nasal 44 and 45 of 48; (3) voiced stops 60 and 60 of 60, voiceless 36 and 36, others 48 and
//    48, stops, others and vowel-only cells read as a nasal 15 and 15; (4) control 369 and 369 of 384; (5) A-b rebuilt
//    on the shipped code match the development figures above. The slow form stays opt-in. c's dark-vowel misses were
//    not the registered shape: 18 of the default's 21 are a cluster onset before -um (*brum* 6, *glum* 5, *stum* 4,
//    *flum* 3), which the slow form does not touch, and all 15 vowel-only misses are one cell, A#3 quarters, every /u/
//    syllable read as a nasal by the level rule (README).
// Twenty-sixth round (2026-11-17): a vowel's release read as a nasal (onsets.mjs readCoda `levelFade`, LEVEL_FADE; README
//    "A /u/ release read as a nasal"). c's 15 vowel-only misses (every /u/ syllable on A#3 quarters) were read frame by
//    frame (eval/dark-nasal-diag.mjs c): the vowel swells 12 dB over the reference through the note, then fades after
//    it, and the fade passes the level rule (5-25 dB under, 15 dB darker above 1 kHz than under 500 Hz) for 40 ms just
//    before the window ends. A guard on the run's own tilt against the vowel before it (dark 6 or 3 dB) took back all 15
//    and J's 15 but lost 60 or more sung nasals (a dark-vowel m is no darker than its vowel), and a guard on a falling
//    level lost 34 right reads for every 34 wrong ones it took back; both dropped. eval/level-tail-sweep.mjs (K-c) found
//    the separator: every vowel-only level-rule nasal of c (A#3) and W (E3 eighths) starts 5-6 frames from the read
//    window's last frame, the earliest right one 7. The rule: a level-rule run that starts within `tail: 6` frames of
//    the window's last frame is thrown out (opt-in `levelFade: true`; `--fade on`). Chosen on that sweep, not tuned.
//    Development (A-c, `--fade on` against the default): J's control 453 to 468 of 468, its others 332 to 333; L's others
//    117 to 118; W's control 338 to 352 of 360, its others 32 to 33; c's control 369 to 384 of 384; lost: one O *lum*
//    read as none (O's others 227 to 226). Every nasal row of every part identical. Z's 13 (C#4 eighths) and T's 4
//    vowel-only misses start 14-19 frames out and are not touched. Pre-registered here and committed before part d was
//    run with anything. Part d is new: 12 nasal codas after /u/ or /o/ (*rom trun crum plun grun snum drum prom clun
//    slom tron bron*), 5 voiced stops (*clud trub prog grod blog*), 4 nasals after a bright vowel (*hem tin dim cram*),
//    4 n-clusters (*pont tont cont tanc*), 3 voiceless stops (*lup cup rop*) and 4 others (*rus tul su lo*), none sung
//    in any other part, at D#3, E3, A3, A#3, B3 and C#4, 92 BPM (in no other part), pulse-4 and pulse-2 notes, sung and
//    vowel-only. Against the default (d's first column), `levelFade` (its second): (1) the vowel-only control read as
//    none (of 384): at least 3 more; (2) nasals after /u/ or /o/ (of 144), after a bright vowel (of 48) and n-clusters
//    as their nasal (of 48): no fewer in any; (3) voiced stops (of 60), voiceless stops (of 36) and others (of 48) read
//    exactly: no fewer in total, and no more stop, other or vowel-only cell read as a nasal; (4) A-c as above, re-run
//    on the shipped code. The gain is tested only if the default misses 3 or more of d's vowel-only cells; if fewer,
//    `levelFade` stays opt-in, reported as untested. If all four hold and the gain is tested, `levelFade` becomes
//    readCoda's default; otherwise it stays opt-in (`--fade on`).
//    Outcome (run 2026-11-17, after the registration above was committed as 41e188357): untested. (1) the vowel-only
//    control 384 and 384 of 384: the default missed none, so the gain was not tested; (2) nasals after /u/ or /o/ 136
//    and 136 of 144, bright-vowel nasals 48 and 48, n-clusters as their nasal 47 and 47; (3) voiced stops 56 and 56 of
//    60, voiceless 36 and 36, others 47 and 47, stops, others and vowel-only cells read as a nasal 1 and 1; (4) A-c
//    rebuilt on the shipped code match the development figures above. `levelFade` stays opt-in. At 92 BPM on d's six
//    pitches no vowel-only release reached the window's last 30 ms at the level rule's depth; a fair test needs cells
//    chosen where it does (README).
// Twenty-ninth round (2026-11-19): levelFade and longTilt on cells where the release lands (README "Held out where the
//    release lands"). Part d left levelFade untested: at 92 BPM on its pitches no vowel-only release reached the window's
//    last 30 ms. Part e is built on eval/release-cells-report.md (frame levels of the vowel-only render, readCoda never
//    run), at 84 BPM, the one tempo in that table no other part uses: every cell of its 84 BPM rows that lands 4 or more
//    of 8, quarters on B2, G3, C4, D4 and eighths on G2, B2, D3, E3, F3, A3, B3, E4 (12 cells; the eighths on G2, B2,
//    E3 and A3 land 8 of 8). Its 32 syllables are sung in no other part: 12 nasals after /u/ or /o/ (*grom crom trom
//    frum drun prum blum clum spum flon plom brom*), 5 voiced stops (*trog brub frod clog crud*), 4 nasals after a bright
//    vowel (*dram flem brin glen*), 4 n-clusters (*brant clonc plunt grons*), 3 voiceless stops (*frup clot drup*) and 4
//    others (*brus frul clu dro*), sung and vowel-only. Three columns: the default, `levelFade: true`, `longTilt: true`.
//    Pre-registered here and committed before part e was run with anything:
//    (0) the test condition: the default reads at least 3 of the 384 vowel-only control cells as something other than
//        none; if fewer, both rules are again untested and stay opt-in;
//    (1) levelFade against the default: the vowel-only control read as none at least 3 more; nasals after /u/ or /o/
//        (of 144), after a bright vowel (of 48) and n-clusters as their nasal (of 48) no fewer in any; voiced stops,
//        voiceless stops and others read exactly no fewer in total; no more stop, other or vowel-only cell read as a nasal;
//    (2) longTilt against the default: the vowel-only control read as none at least 3 more; the three nasal rows
//        together at most 2 fewer; stops and others no fewer in total; no more stop, other or vowel-only cell read as a
//        nasal. (Development cost it 2 to 5 dark-vowel nasals on each of a, b, d and Z, so this is expected to fail.)
//    (3) where it lands: at least half of the default's vowel-only misses fall on the four 8-of-8 eighth cells.
//    A rule whose (0) and (1) or (2) all hold becomes readCoda's default, with every other part rebuilt on it; otherwise
//    it stays opt-in.
//    Outcome (run 2026-11-19, after the registration above was committed as a1fa70e76): (0) held, the default read 14 of
//    384 vowel-only cells as a nasal; (1) and (2) failed: the control 370, 370 and 370 of 384, every other row of
//    levelFade identical, longTilt's dark-vowel nasals 139 to 137; (3) failed: all 14 fell on E4 eighths, a 4-of-8 cell.
//    Both stay opt-in. Read with eval/e4-eighth-diag.mjs, the 14 are every /u/ sung on its vowel on E4 eighths, and the
//    rule that fires is not the level rule but the murmur against the vowel before it (NEAR), on a run 55 ms long that
//    starts 95 ms after the note's end: release-cells measured the wrong rule. See the thirtieth round.
// Thirtieth round (2026-11-19): a near-rule murmur after the note's end (onsets.mjs readCoda `nearRelease`, README "Held
//    out where the release lands"). eval/level-tail-sweep.mjs --rule near (K-c, report eval/near-tail-sweep.txt) lists
//    every near-rule nasal with where its run starts against the note's end: of 196 right reads, 195 start 26 to 175 ms
//    before it; of 50 wrong ones, 48, every one a vowel-only /u/ or /o/, start 19 to 171 ms after it. sing.mjs sings a
//    coda so it finishes with its note (codaPlan), so a murmur after the note's end is not a coda. The rule: with the
//    note's end passed in (`noteEnd`, every call in this script passes n.t1), a near-rule run that starts at or after it
//    is thrown out (opt-in `nearRelease: true`; `--near-release on`). Read off that sweep, not tuned. Development (A-e,
//    `--near-release on` against the default): vowel-only controls read as none +70 cells (K 343 to 360 of 360, O 356 to
//    360, R 238 to 240, S 246 to 250, W 338 to 346, X 292 to 300, Y 335 to 348, e 370 to 384); others +1 on K, L, O and
//    W; lost: one sung *glum* on c and one *snum* on d read as none. Every row of A, B, D, E, F, H, I and the corpus parts
//    identical (their near-rule nasals start before the note's end). Pre-registered here and committed before part f was
//    run with anything. Part f is new: 12 nasals after /u/ or /o/ (*fon blon cron con glun snom clon smum crun plon frun
//    slun*), 5 voiced stops (*snug frub plud glob crod*), 4 nasals after a bright vowel (*pren len gran clen*), 4
//    n-clusters (*banc flont spant snons*), 3 voiceless stops (*glop gluc brop*) and 4 others (*dor snor pu stur*), none
//    sung in any other part, at 86 BPM (in no other part), on all thirteen pitches of eval/release-cells-report.md (E2,
//    G2, A2, B2, D3, E3, F3, G3, A3, B3, C4, D4, E4), quarters and eighths (26 cells), sung and vowel-only. Against the
//    default (f's first column), `nearRelease` (its second):
//    (0) the test condition: the default reads at least 3 of the 832 vowel-only control cells as a nasal by the near
//        rule; if fewer, nearRelease is untested and stays opt-in;
//    (1) the vowel-only control read as none at least 3 more, and at least 80% of the default's vowel-only near-rule
//        nasals cleared;
//    (2) nasals after /u/ or /o/ (of 312), after a bright vowel (of 104) and n-clusters as their nasal (of 104): at most
//        1 fewer together;
//    (3) voiced stops (of 130), voiceless stops (of 78) and others (of 104) read exactly: no fewer in total; no more
//        stop or other cell read as a nasal.
//    If (0) to (3) all hold, nearRelease becomes readCoda's default (a no-op for a caller that passes no noteEnd), with
//    every part rebuilt on it; otherwise it stays opt-in.
//    Outcome (run 2026-11-19, after the registration above was committed as 4f7edcc58): failed on (2), by one. (0) held:
//    the default read 15 vowel-only cells as a nasal by the near rule, all /o/ on D3 quarters; (1) held: the control 806
//    to 821 of 832, all 15 cleared; (2) failed: nasals after /u/ or /o/ 300 to 298 of 312 (sung *crun* and *frun* on E4
//    quarters, read by default from a near run 198 ms after the note's end, now none), bright-vowel 102 and 102 of 104,
//    n-clusters 102 and 102, so 2 fewer together where at most 1 was allowed; (3) held: stops and others 290 and 290 of
//    312, 1 and 1 read as a nasal. `nearRelease` stays opt-in. The other 11 vowel-only nasals on f, every /u/ on C4
//    quarters, are the level rule's, starting outside levelFade's 6 frames.
// Thirty-first round (2026-11-21): the lip closure's upper band through the beating (onsets.mjs LIP_SHUT `hiHold`, README
//    "The murmur inside an E4 quarter"). f's sung *crun* and *frun* on E4 quarters, read frame by frame with
//    eval/e4-quarter-diag.mjs: the n sung inside the note (codaPlan, the note's last 70 ms) drops the band above 1 kHz
//    25-30 dB in 15 ms and keeps it 18 dB or more under the vowel to the window's end, while the vowel-only take of the
//    same cell never takes that band 20 dB under. Every nasal rule missed it: it is as loud as the reference (level rule),
//    1 dB louder than the transition dip 25-45 ms before it (near rule's `hi: 0`), and lipShut's upper band, though far
//    under, wobbles 8 dB over its first 30 ms against `hiHold: 6`. The change: `hiHold: 8`, the smallest value that
//    admits that cell, read off it before any part was run with it. Development (A-f, `--shut hiHold=8` against the
//    default, every part): +7 cells, none lost: O's and Y's nasals +1 each, b's dark-vowel nasals 133 to 135 of 144, d's
//    136 to 137, f's 300 to 302 of 312 (*crun* and *frun*); every vowel-only control and every "read as a nasal" count
//    identical. (`hiHold=10`, run beside it: +9, none lost; not registered.) With it, f's `nearRelease` column reads 302
//    nasals after /u/ or /o/, where the guard's registration failed on 298. Pre-registered here and committed before part
//    g was run with anything. Part g is new: 12 nasals after /u/ or /o/ (*trum grum scrum flun drom stom slum gron fron
//    spon sprun strun*), 5 voiced stops (*grub drob stod plug frog*), 4 nasals after a bright vowel (*tren slen dran
//    fren*), 4 n-clusters (*tranc plent stunt grunc*), 3 voiceless stops (*stuc grot trup*) and 4 others (*flor tru grur
//    sto*), none sung in any other part, at 82 BPM (in no other part), on the thirteen pitches of part f, quarters and
//    eighths (26 cells), sung and vowel-only. Columns: the default, `lipShut: { hiHold: 8 }`, and that with
//    `nearRelease`. Against the default:
//    (0) the test condition: the default misses at least 4 of the 312 dark-vowel nasals; if fewer, hiHold 8 is untested
//        and LIP_SHUT stays as it is;
//    (1) nasals after /u/ or /o/ read exactly: at least 1 more with hiHold 8;
//    (2) nasals after a bright vowel (of 104) and n-clusters as their nasal (of 104): no fewer;
//    (3) voiced stops (of 130), voiceless stops (of 78) and others (of 104) read exactly: no fewer in total; stops, others
//        and vowel-only cells read as a nasal: no more;
//    (4) the vowel-only control (of 832) read as none: no fewer.
//    If (0) to (4) hold, LIP_SHUT's hiHold becomes 8, with every report rebuilt on it; otherwise it stays 6. The third
//    column re-tests f's failed prediction: with hiHold 8 and `nearRelease`, nasal rows together (of 520) at most 1 fewer
//    than the default, and the vowel-only control read as none no fewer; if both hold, nearRelease is a candidate for a
//    later registration of its own (one held-out part is not enough to make it the default).
//    Outcome (run 2026-11-21, after the registration above was committed as b65b403b3): failed on (1). (0) held: the
//    default missed 11 of 312; (1) failed: 301 and 301 of 312, no cell gained; (2) held: bright 104 and 104 of 104,
//    n-clusters 102 to 103 of 104; (3) held: stops and others 295 and 295 of 312, 0 and 0 read as a nasal; (4) held: 832
//    and 832 of 832. LIP_SHUT's hiHold stays 6. g's E4-quarter misses (eval/e4-quarter-diag.mjs, PART=g) are other
//    shapes: *flun*'s step is clean and flat (upper band -14 to -17, held), but its level sits 2-5 dB over the vowel 25-45
//    ms before, which lands in the transition into the n, so lipShut's `hi: 0` turns it away as NEAR's did *crun*;
//    *sprun* and *strun* are not dark in themselves (tilt -18 to -21 against murmurTilt's 28). Third column: nasal rows
//    together 507 to 508 of 520, control 832 and 832: both hold, so nearRelease with hiHold 8 met on g what it missed on
//    f; with hiHold itself not adopted, that is noted, not acted on.
// Thirty-second round (2026-11-23): does the level-matched murmur read as a voiced labial stop? (sing.mjs
//    `murmurSource: 'match'`, eval/murmur-match-check.md). `match` read 2,220 nasals exactly against the default's 2,141
//    but lost R's *pin*, Z's *fen* and *gim* and A's E2 *am* and *an*; four of those five misses read as a voiced labial
//    stop. Hypothesis (H): a held-level murmur that fades with the note's release can look like a voice bar with a burst
//    after it, so `match` turns low and front-vowel nasals into /b/. Those misses have been read, so H is tested on a
//    fresh part, pre-registered here and committed before part h was run with anything. Part h is new: 16 nasals after
//    /a/, /e/ or /i/ (*pam fam vam scam san pan flan sem frem gen spen gren rim trim drin clin*), 6 voiced labial stops
//    (*plab drab smeb crib vib glab*), 2 voiceless labial stops (*trep slip*) and 2 others (*fal fle*), none sung in any
//    other part, at 80 BPM (in no other part), on the thirteen pitches E2-E4 of parts f and g, quarters and eighths (26
//    cells), sung and vowel-only, each followed by a rest. The choir is rendered twice, the default murmur and `match`;
//    the reader is the default for both. With N = the nasal cells the default reads exactly and `match` does not:
//    (0) the test condition: N is 4 or more (of 416); if fewer, H is untested here and nothing changes;
//    (1) at least half of N read as a voiced labial stop under `match`;
//    (2) nasals read as a voiced labial stop: under `match` at least 3 more than, and at least twice, the default's.
//    H is supported if (0) to (2) hold, and the next round is a reader or synthesis change aimed at that confusion,
//    registered on another fresh part. If (0) holds and (1) or (2) fails, H is dropped and the misses' own labels say
//    what `match` does instead. Reported beside, not predicted: voiced labial stops read exactly, the other rows, and the
//    vowel-only control (the murmur source cannot reach a cell with no nasal, so the two controls should be identical).
//    Outcome (run 2026-11-23, after the registration above was committed as 1882658eb): H supported. (0) held: N = 9;
//    (1) held: 9 of 9 read as a voiced labial stop; (2) held: 9 against the default's 3. All 9 on E2-B2; `match` also
//    cleared the default's 4 nasal misses (412 to 407 of 416 net). Every vowel-only cell identical (676 and 676). The
//    false bursts carry 4e-7 to 4.1e-5 of their power above 1 kHz, real /b/ bursts 0.11 to 0.79
//    (eval/labial-burst-diag.mjs, eval/murmur-labial-check.md): next, a burst that needs energy above 1 kHz.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseGabc, fitToBars, transposeToFinal } from '../gabc.mjs';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinOnset, latinCoda, onsetLength } from '../sing.mjs';
import { readCoda, expectedRead, LIP_SHUT } from '../onsets.mjs';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : new URL('./coda-check-report.md', import.meta.url);
// --parts ABDEHIFC (default all): which parts to run; --hide-misses F: print a part's score without its misses
// (how a held-out set is scored before a round's changes without anyone reading what it gets wrong)
const PARTS = args.includes('--parts') ? args[args.indexOf('--parts') + 1] : 'ABDEHIFJKLMNOPQRSTUVWXYZabcdefghC';
// --voice-bar off: the choir sung with the fixed voice-bar gain (sing.mjs `voiceBarLevel: false`, before 2026-11-16's thirteenth round)
const VOICEBAR = !(args.includes('--voice-bar') && args[args.indexOf('--voice-bar') + 1] === 'off');
// --wall on: the voice bar low-passed through the walls (sing.mjs `voiceBarWall: true`; tried in 2026-11-16's fourteenth round, off by default)
// --wall coda: the codas' voice bars only (`voiceBarWall: 'coda'`, the sixteenth round); openings sung as before
const WALLARG = args.includes('--wall') ? args[args.indexOf('--wall') + 1] : '';
const WALL = WALLARG === 'on' ? true : WALLARG === 'coda' ? 'coda' : false;
// --local off: readCoda's closure and nasal levels against the reference alone (`localRef: false`, before the fourteenth round)
// --murmur one: a nasal's murmur sung from one voice, not the beating chorus (sing.mjs `murmurSource: 'one'`, the
// twenty-eighth round; README "A murmur dark in every phase")
// --murmur match: the same voice, its level matched to the chorus's just before the murmur (`murmurSource: 'match'`,
// README "One voice at the chorus's level")
const MURMUR = args.includes('--murmur') && ['one', 'match'].includes(args[args.indexOf('--murmur') + 1]) ? args[args.indexOf('--murmur') + 1] : null;
const LOCALARG = args.includes('--local') ? args[args.indexOf('--local') + 1] : '';
// --anchor on: the closure rule against the last vowel-like frames, band by band (`closeAnchor: true`, the parallel rule)
const ANCHORARG = args.includes('--anchor') ? args[args.indexOf('--anchor') + 1] : '';
// The twenty-fifth round's slow lip closure (part c's second column; README "A dark-vowel m that closes slowly")
const SLOW_SHUT = { span: 4, settle: 2, rise: 4 };
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
// --bar N: readCoda's barLead (a level-rule murmur a burst-ended closure starts inside of within N frames is its voice bar)
const BARARG = args.includes('--bar') ? args[args.indexOf('--bar') + 1] : '';
// --vlow off: readCoda without the voiceless low labial test (`voicelessLow: false`, the reader before the nineteenth round)
// --velar on: readCoda's compact velar burst before the low labial test (`compactVelar: true`, the eighteenth round)
const VELARARG = args.includes('--velar') ? args[args.indexOf('--velar') + 1] : '';
const VLOWARG = args.includes('--vlow') ? args[args.indexOf('--vlow') + 1] : '';
// --barburst off: readCoda without the voice-bar burst (`barBurst: false`, the reader before the twentieth round)
const BBARG = args.includes('--barburst') ? args[args.indexOf('--barburst') + 1] : '';
// --vlead N: readCoda's voicedLead (a murmur ending within N frames of a voiced stop's closure, or inside it, is its lead)
// --vlead barN: only before a voice-bar-rule closure (voicedLead: true); --vlead holdN: also before a closure-rule closure
// whose voicing holds up to its burst (the twenty-second round's form, `voicedLead: { hold: true }`)
const VLEADARG = args.includes('--vlead') ? args[args.indexOf('--vlead') + 1] : '';
// --shut span=4,settle=2: other LIP_SHUT settings (the twenty-fifth round's slow closure)
// --shut on: readCoda's lip-closure rule for a dark-vowel nasal (`lipShut: true`, the twenty-third round; README "A dark-vowel m")
const SHUTARG = args.includes('--shut') ? args[args.indexOf('--shut') + 1] : '';
// --hold on: readCoda's level-hold rule for a dark-vowel m (`lipHold: true`, the twenty-fourth round; README "A dark-vowel m that holds level");
// --hold fall=10,hold=3: other LIP_HOLD settings
const HOLDARG = args.includes('--hold') ? args[args.indexOf('--hold') + 1] : '';
const HOLDOPT = HOLDARG === 'on' ? { lipHold: true } : HOLDARG && HOLDARG !== 'off' ? { lipHold: Object.fromEntries(HOLDARG.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; })) } : {};
// --fade on: readCoda's fade guard on the level rule (`levelFade: true`, the twenty-sixth round; README "A /u/ fade read as a nasal");
// --fade dark=4: other LEVEL_FADE settings
const FADEARG = args.includes('--fade') ? args[args.indexOf('--fade') + 1] : '';
const FADEOPT = FADEARG === 'on' ? { levelFade: true } : FADEARG && FADEARG !== 'off' ? { levelFade: Object.fromEntries(FADEARG.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; })) } : {};
// --long-tilt on: the nasal rule's darkness against the median tilt of 0.3 s of vowel (`longTilt: true`, the twenty-seventh
// round; README "A darkness reference over the beating"); --long-tilt span=0.5,gap=0.45 tries other settings
const LTARG = args.includes('--long-tilt') ? args[args.indexOf('--long-tilt') + 1] : '';
const LTOPT = LTARG === 'on' ? { longTilt: true } : LTARG && LTARG !== 'off' ? { longTilt: Object.fromEntries(LTARG.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; })) } : {};
// --near-release on: readCoda throws out a near-rule murmur starting at or after the note's end (`nearRelease: true`,
// the twenty-ninth round's finding; README "Held out where the release lands"); every call passes the note's end
const NRELOPT = args.includes('--near-release') && args[args.indexOf('--near-release') + 1] === 'on' ? { nearRelease: true } : {};
const RC = { ...RC0, ...NRELOPT, ...HOLDOPT, ...FADEOPT, ...LTOPT, ...(SHUTARG === 'on' ? { lipShut: true } : SHUTARG === 'off' ? { lipShut: false } : SHUTARG ? { lipShut: Object.fromEntries(SHUTARG.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; })) } : {}), ...(VLEADARG === 'off' ? { voicedLead: false } : {}), ...(VLEADARG && VLEADARG !== 'off' ? { voicedLead: VLEADARG.startsWith('hold') ? { gap: Number(VLEADARG.slice(4)) || 2, hold: true } : VLEADARG.startsWith('bar') ? { gap: Number(VLEADARG.slice(3)) || 2, bar: true } : Number(VLEADARG) } : {}), ...(BBARG === 'off' ? { barBurst: false } : {}), ...(VLOWARG === 'off' ? { voicelessLow: false } : {}), ...(VELARARG === 'on' ? { compactVelar: true } : {}), ...(BARARG && BARARG !== 'off' ? { barLead: Number(BARARG) } : {}), ...PREOPTS, ...(PREARG === 'off' ? { preObstruent: false } : {}), ...(AGAINARG === 'off' ? { againGap: false } : {}), ...(VFRICARG === 'off' ? { vfricHi5: false } : {}), ...(DEEPARG === 'on' ? { deepMurmur: true } : {}), ...(LOCALARG === 'off' ? { localRef: false } : {}), ...(ANCHORARG === 'on' ? { closeAnchor: true } : {}) };
const rate = 44100, corpus = new URL('../corpus/', import.meta.url);
const lines = [];
const pct = (a, b) => `${a} of ${b} (${b ? ((100 * a) / b).toFixed(1) : '-'}%)`;
const label = (e) => e.cls === 'stop' ? `${e.voiced ? 'voiced' : 'voiceless'} ${e.place} stop` : e.cls === 'affricate' ? `${e.voiced ? 'voiced' : 'voiceless'} affricate` : e.cls === 'fricative' ? `fricative ${e.place}` : e.cls;
const match = (want, got) => Object.entries(want).every(([k, v]) => got[k] === v);

function choir(midiBytes, sing, voiceBar = VOICEBAR, voiceBarWall = WALL) {
  const r = renderMidi(midiBytes, { rate, stems: true, sing, voiceBar, voiceBarWall, ...(MURMUR ? { murmurSource: MURMUR } : {}) });
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
      const got = readCoda(x, rate, n.t0 + 0.1, tEnd, { ...RC, noteEnd: n.t1 });
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
      const got = readCoda(sungR.x, rate, vAt, tEnd, { ...RC, noteEnd: n.t1 }), gotC = readCoda(ctlR.x, rate, vAt, tEnd, { ...RC, noteEnd: n.t1 });
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
        const got = readCoda(sungR.x, rate, vAt, tEnd, { ...RC, murmurTilt: tilt, noteEnd: n.t1 });
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
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
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
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
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
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
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
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
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
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
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
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
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
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
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
      const got = readCoda(x, rate, vAt, tEnd, { ...RC, noteEnd: n.t1 }), ok = match(want, got);
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
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
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

// ---- S ----
// The fifteenth round's second held-out set (the parallel rule's own, README "Two anchors for one closure"): voiced
// stops and others at G#2, A#2, E3, C4 and F4, 112 BPM, pulse-4 and pulse-2 notes, each followed by a rest; read
// three ways on the same choir: the default (localRef), the parallel rule (closeAnchor, localRef off) and neither.
if (PARTS.includes('S')) {
const VST = ['beb', 'dib', 'gid', 'neg', 'mig', 'sab', 'feb', 'lid', 'ved', 'rag', 'heb', 'pug'];
const NEG = ['dit', 'pec', 'lip', 'sut', 'min', 'fem', 'bas', 'fus', 'sent', 'punt', 'nom', 'vi', 'do'];
const SY = [...VST, ...NEG], tally = {}, sMiss = new Map(), sStop = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const MODES = [['local', { ...RC, localRef: undefined, closeAnchor: false }], ['anchor', { ...RC, localRef: false, closeAnchor: true }], ['off', { ...RC, localRef: false, closeAnchor: false }]];
for (const pulses of [4, 2]) for (const midi of [44, 46, 52, 60, 65]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 112, title: 'held-out closures' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (VST.includes(s) ? 'vst' : 'other') : 'control';
      for (const [mode, o] of MODES) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'other' && got.cls === 'stop' && want.cls !== 'stop') sStop[mode] = (sStop[mode] || 0) + 1;
        if (mode === 'local' && !ok && !HIDE.includes('S')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; sMiss.set(key, (sMiss.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
lines.push('## S. Held out: the parallel rule\'s own set (fifteenth round)', '', `Voiced stops: ${VST.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 112 BPM, each followed by a rest, G#2, A#2, E3, C4, F4.`, '',
  '| | default (`localRef`) | last vowel-like frames (`closeAnchor`) | reference only |', '|---|---|---|---|',
  ...[['voiced-stop codas read exactly', 'vst'], ['other syllables read exactly', 'other'], ['vowel-only control read as none', 'control']].map(([t, g]) => `| ${t} | ${cell(`${g} local`)} | ${cell(`${g} anchor`)} | ${cell(`${g} off`)} |`),
  `| other syllables read as a stop where none is written | ${sStop.local || 0} | ${sStop.anchor || 0} | ${sStop.off || 0} |`, '',
  'Misses with the default (count over the ten pitch and length cells):', '', HIDE.includes('S') ? '- hidden' : [...sMiss].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none', '');
}

// ---- T ----
// The sixteenth round's held-out set (closeAnchor with the voice-bar wall in codas, pre-registered in the header):
// voiced-stop codas, nasal codas and others sung in no other part, at B2, F#3, B3, D4, D#4 and E4, 118 BPM (in no
// other part), pulse-4 and pulse-2 notes, each followed by a rest, sung and vowel-only. Four columns on two choirs:
// the default (localRef, no wall), closeAnchor alone, the coda wall alone, and closeAnchor with the coda wall.
if (PARTS.includes('T')) {
const VST = ['lub', 'tag', 'pob', 'sug', 'cad', 'mub', 'fod', 'rib', 'vob', 'tid', 'hag', 'peg'];
const NAS = ['fun', 'ram', 'lim', 'ben'];
const NEG = [...NAS, 'lut', 'mic', 'hep', 'gos', 'rax', 'lunc', 'hel', 'fa'];
const SY = [...VST, ...NEG], tally = {}, tMiss = new Map(), tNone = {}, tNas = {}, tMissC = new Map();
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const ANC = { ...RC, localRef: false, closeAnchor: true }, DEF = { ...RC, closeAnchor: false };
for (const pulses of [4, 2]) for (const midi of [47, 54, 59, 62, 63, 64]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 118, title: 'held-out walls' });
  for (const sing of [true, 'vowels']) for (const wall of [false, 'coda']) {
    const { x, notes } = choir(mid, sing, VOICEBAR, wall);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (VST.includes(s) ? 'vst' : NAS.includes(s) ? 'nasal' : 'other') : 'control';
      const modes = wall ? [['wall', DEF], ['both', ANC]] : [['def', DEF], ['anchor', ANC]];
      for (const [mode, o] of modes) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'vst' && got.cls === 'none') tNone[mode] = (tNone[mode] || 0) + 1;
        if (grp === 'vst' && got.cls === 'nasal') tNas[mode] = (tNas[mode] || 0) + 1;
        if (!ok && !HIDE.includes('T') && (mode === 'def' || mode === 'both')) { const m = mode === 'def' ? tMiss : tMissC, key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; m.set(key, (m.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${['def', 'anchor', 'wall', 'both'].map((m) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${['def', 'anchor', 'wall', 'both'].map((m) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('T') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## T. Held out: closeAnchor with the wall in codas (sixteenth round)', '', `Voiced stops: ${VST.map((s) => `*${s}*`).join(', ')}; nasals: ${NAS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.filter((s) => !NAS.includes(s)).map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 118 BPM, each followed by a rest, B2, F#3, B3, D4, D#4, E4.`, '',
  '| | default (`localRef`, no wall) | `closeAnchor` | coda wall | `closeAnchor` + coda wall |', '|---|---|---|---|---|',
  row('voiced-stop codas read exactly', 'vst'), cnt('voiced-stop codas read as nothing', tNone), cnt('voiced-stop codas read as a nasal', tNas),
  row('nasal codas read exactly', 'nasal'), row('other syllables read exactly', 'other'), row('vowel-only control read as none', 'control'), '',
  'Misses with the default (count over the twelve pitch and length cells):', '', list(tMiss), '',
  'Misses with `closeAnchor` + coda wall:', '', list(tMissC), '');
}

// The seventeenth round's held-out set (barLead, pre-registered in the header): voiced-stop codas, nasal codas,
// n-cluster codas (the rule's risk: a murmur that runs into its stop's closure) and others, sung in no other part,
// at A2, D3, G#3, A#3, C#4 and D#4, 110 BPM (in no other part), pulse-4 and pulse-2 notes, each followed by a rest,
// sung and vowel-only. Two columns: the default reader and barLead (the `--bar` setting, 8 unless given).
if (PARTS.includes('U')) {
const VST = ['dag', 'bob', 'mod', 'sig', 'lag', 'tib', 'ceb', 'nud', 'hod', 'fig', 'gub', 'pid'];
const NAS = ['bam', 'sun', 'tem', 'hon'], CLU = ['dent', 'hens', 'sonc', 'tint'];
const NEG = [...NAS, ...CLU, 'dut', 'sic', 'gep', 'bos', 'lex', 'bel', 'mo', 'vit'];
const SY = [...VST, ...NEG], tally = {}, uMiss = new Map(), uMissB = new Map(), uNone = {}, uNas = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const BAR = { ...RC, barLead: BARARG && BARARG !== 'off' ? Number(BARARG) : 8 }, DEF = { ...RC, barLead: false };
for (const pulses of [4, 2]) for (const midi of [45, 50, 56, 58, 61, 63]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 110, title: 'held-out voice bars' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (VST.includes(s) ? 'vst' : NAS.includes(s) ? 'nasal' : CLU.includes(s) ? 'cluster' : 'other') : 'control';
      for (const [mode, o] of [['def', DEF], ['bar', BAR]]) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'vst' && got.cls === 'none') uNone[mode] = (uNone[mode] || 0) + 1;
        if (grp === 'vst' && got.cls === 'nasal') uNas[mode] = (uNas[mode] || 0) + 1;
        if (!ok && !HIDE.includes('U')) { const m = mode === 'def' ? uMiss : uMissB, key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; m.set(key, (m.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${['def', 'bar'].map((m) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${['def', 'bar'].map((m) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('U') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## U. Held out: a voice bar read as a murmur (seventeenth round)', '', `Voiced stops: ${VST.map((s) => `*${s}*`).join(', ')}; nasals: ${NAS.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CLU.map((s) => `*${s}*`).join(', ')}; others: ${NEG.filter((s) => !NAS.includes(s) && !CLU.includes(s)).map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 110 BPM, each followed by a rest, A2, D3, G#3, A#3, C#4, D#4.`, '',
  `| | default | \`barLead: ${BAR.barLead}\` |`, '|---|---|---|',
  row('voiced-stop codas read exactly', 'vst'), cnt('voiced-stop codas read as nothing', uNone), cnt('voiced-stop codas read as a nasal', uNas),
  row('nasal codas read exactly', 'nasal'), row('n-cluster codas read as a nasal', 'cluster'), row('other syllables read exactly', 'other'), row('vowel-only control read as none', 'control'), '',
  'Misses with the default (count over the twelve pitch and length cells):', '', list(uMiss), '',
  `Misses with \`barLead: ${BAR.barLead}\`:`, '', list(uMissB), '');
}

// The eighteenth round's held-out set (compactVelar, pre-registered in the header): velar codas (the rule's target),
// labial codas (its risk: a compact labial burst read as velar), alveolar codas and others, sung in no other part,
// at G2, F3, G3, A3, B3 and D4, 114 BPM (in no other part), pulse-4 and pulse-2 notes, each followed by a rest, sung
// and vowel-only. Two columns: the default reader and compactVelar.
if (PARTS.includes('V')) {
const VEL = ['dog', 'bag', 'tog', 'gig', 'vag', 'nig', 'sog', 'leg', 'hug', 'cag', 'dac', 'roc', 'puc', 'nac', 'tuc', 'lic'];
const LAB = ['gob', 'dab', 'rub', 'lap', 'rup', 'sep', 'fip', 'mop', 'dap'], ALV = ['nid', 'led', 'sud', 'rad', 'tod'];
const NEG = ['gum', 'ron', 'lis', 'tas', 'mu'];
const SY = [...VEL, ...LAB, ...ALV, ...NEG], tally = {}, vMiss = new Map(), vMissC = new Map(), asLab = {}, asVel = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const CV = { ...RC, compactVelar: true }, DEF = { ...RC, compactVelar: false };
for (const pulses of [4, 2]) for (const midi of [43, 53, 55, 57, 59, 62]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 114, title: 'held-out burst place' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (VEL.includes(s) ? 'vel' : LAB.includes(s) ? 'lab' : ALV.includes(s) ? 'alv' : 'other') : 'control';
      for (const [mode, o] of [['def', DEF], ['cv', CV]]) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'vel' && got.cls === 'stop' && got.place === 'lab') asLab[mode] = (asLab[mode] || 0) + 1;
        if (grp === 'lab' && got.cls === 'stop' && got.place === 'vel') asVel[mode] = (asVel[mode] || 0) + 1;
        if (!ok && !HIDE.includes('V')) { const m = mode === 'def' ? vMiss : vMissC, key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; m.set(key, (m.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${['def', 'cv'].map((m) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${['def', 'cv'].map((m) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('V') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## V. Held out: a velar burst read as labial (eighteenth round)', '', `Velar: ${VEL.map((s) => `*${s}*`).join(', ')}; labial: ${LAB.map((s) => `*${s}*`).join(', ')}; alveolar: ${ALV.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 114 BPM, each followed by a rest, G2, F3, G3, A3, B3, D4.`, '',
  '| | default | `compactVelar` |', '|---|---|---|',
  row('velar codas read exactly', 'vel'), cnt('velar codas read as a labial stop', asLab),
  row('labial codas read exactly', 'lab'), cnt('labial codas read as a velar stop', asVel),
  row('alveolar codas read exactly', 'alv'), row('other syllables read exactly', 'other'), row('vowel-only control read as none', 'control'), '',
  'Misses with the default (count over the twelve pitch and length cells):', '', list(vMiss), '',
  'Misses with `compactVelar`:', '', list(vMissC), '');
}

// The nineteenth round's held-out set (voicelessLow, pre-registered in the header): voiceless labial codas (the
// rule's target), voiceless velar codas (its risk: a k burst with some energy under 1 kHz read as p), voiced labial
// and velar codas, alveolar codas and others, sung in no other part, at A2, E3, G#3, A#3, B3 and C#4, 122 BPM (in no
// other part), pulse-4 and pulse-2 notes, each followed by a rest, sung and vowel-only. Two columns: the default
// reader and voicelessLow.
if (PARTS.includes('W')) {
const PL = ['tep', 'cap', 'nup', 'bip', 'hop', 'vep', 'lop', 'gap', 'rip', 'hup'], KV = ['tic', 'mac', 'sec', 'voc', 'ric', 'hac', 'buc', 'nec'];
const VD = ['pab', 'teb', 'nog', 'tig', 'rug', 'dob', 'mug'], ALV = ['fed', 'nut'], NEG = ['hos', 'pum', 'fu'];
const SY = [...PL, ...KV, ...VD, ...ALV, ...NEG], tally = {}, wMiss = new Map(), wMissL = new Map(), pAsK = {}, kAsP = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const VL = { ...RC, voicelessLow: true }, DEF = { ...RC, voicelessLow: false };
for (const pulses of [4, 2]) for (const midi of [45, 52, 56, 58, 59, 61]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 122, title: 'held-out voiceless burst place' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (PL.includes(s) ? 'p' : KV.includes(s) ? 'k' : VD.includes(s) ? 'voiced' : ALV.includes(s) ? 'alv' : 'other') : 'control';
      for (const [mode, o] of [['def', DEF], ['vl', VL]]) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'p' && got.cls === 'stop' && got.place === 'vel') pAsK[mode] = (pAsK[mode] || 0) + 1;
        if (grp === 'k' && got.cls === 'stop' && got.place === 'lab') kAsP[mode] = (kAsP[mode] || 0) + 1;
        if (!ok && !HIDE.includes('W')) { const m = mode === 'def' ? wMiss : wMissL, key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; m.set(key, (m.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${['def', 'vl'].map((m) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${['def', 'vl'].map((m) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('W') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## W. Held out: a p\'s burst read as a k (nineteenth round)', '', `Voiceless labial: ${PL.map((s) => `*${s}*`).join(', ')}; voiceless velar: ${KV.map((s) => `*${s}*`).join(', ')}; voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; alveolar: ${ALV.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 122 BPM, each followed by a rest, A2, E3, G#3, A#3, B3, C#4.`, '',
  '| | before (`voicelessLow: false`) | `voicelessLow` (the default since this round) |', '|---|---|---|',
  row('voiceless labial codas read exactly', 'p'), cnt('voiceless labials read as a velar stop', pAsK),
  row('voiceless velar codas read exactly', 'k'), cnt('voiceless velars read as a labial stop', kAsP),
  row('voiced stop codas read exactly', 'voiced'), row('alveolar codas read exactly', 'alv'), row('other syllables read exactly', 'other'), row('vowel-only control read as none', 'control'), '',
  'Misses before (count over the twelve pitch and length cells):', '', list(wMiss), '',
  'Misses with `voicelessLow`:', '', list(wMissL), '');
}

// The twentieth round's held-out set (barBurst, pre-registered in the header): voiced stop codas (the rule's target),
// nasal codas and n-clusters (its risk: a murmur read as a voice bar), voiceless stops and others, sung in no other
// part, at A#2, G3, C#4, D4, D#4 and E4, 106 BPM (in no other part), pulse-4 and pulse-2 notes, each followed by a
// rest, sung and vowel-only. Two columns: the default reader and barBurst.
if (PARTS.includes('X')) {
const VD = ['lob', 'fub', 'nib', 'peb', 'fab', 'cub', 'fag', 'cog', 'bug', 'hud', 'rid', 'mud'], NAS = ['fen', 'gim', 'lan', 'tum'];
const CL = ['lens', 'sunc', 'fant', 'gonc', 'rins'], VLS = ['nep', 'ruc'], NEG = ['sol', 'fos'];
const SY = [...VD, ...NAS, ...CL, ...VLS, ...NEG], tally = {}, xMiss = new Map(), xMissB = new Map(), hiCells = {}, asNasNone = {}, clAsStop = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const BBON = { ...RC, barBurst: true }, DEF = { ...RC, barBurst: false };
for (const pulses of [4, 2]) for (const midi of [46, 55, 61, 62, 63, 64]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 106, title: 'held-out voice-bar burst' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (VD.includes(s) ? 'voiced' : NAS.includes(s) ? 'nasal' : CL.includes(s) ? 'cluster' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [mode, o] of [['def', DEF], ['bb', BBON]]) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'voiced' && midi >= 61) { bump(`voicedhi ${mode}`, ok); if (got.cls === 'nasal' || got.cls === 'none') asNasNone[mode] = (asNasNone[mode] || 0) + 1; }
        if (grp === 'cluster' && got.cls === 'stop') clAsStop[mode] = (clAsStop[mode] || 0) + 1;
        if (!ok && !HIDE.includes('X')) { const m = mode === 'def' ? xMiss : xMissB, key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; m.set(key, (m.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${['def', 'bb'].map((m) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${['def', 'bb'].map((m) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('X') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## X. Held out: no burst on C#4-E4 (twentieth round)', '', `Voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; nasal codas: ${NAS.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CL.map((s) => `*${s}*`).join(', ')}; voiceless stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 106 BPM, each followed by a rest, A#2, G3, C#4, D4, D#4, E4.`, '',
  '| | before (`barBurst: false`) | `barBurst` (the default since this round) |', '|---|---|---|',
  row('voiced stop codas read exactly', 'voiced'), row('of them, on C#4-E4', 'voicedhi'), cnt('voiced stops on C#4-E4 read as a nasal or nothing', asNasNone),
  row('nasal codas read exactly', 'nasal'), row('n-clusters read as their nasal', 'cluster'), cnt('n-clusters read as a stop', clAsStop),
  row('voiceless stop codas read exactly', 'voiceless'), row('other syllables read exactly', 'other'), row('vowel-only control read as none', 'control'), '',
  'Misses before (count over the twelve pitch and length cells):', '', list(xMiss), '',
  'Misses with `barBurst`:', '', list(xMissB), '');
}

// The twenty-first round's held-out set (voicedLead, pre-registered in the header): voiced stop codas, most after a
// dark vowel (the rule's target), nasal codas and n-clusters (its risk: a real murmur dropped as a stop's lead),
// voiceless stops and others, sung in no other part, at G#2, A3, C4, C#4, D4 and E4, 102 BPM (in no other part),
// pulse-4 and pulse-2 notes, each followed by a rest, sung and vowel-only. Two columns: the default reader and
// voicedLead (its bar form: only before a closure the voice-bar rule found).
if (PARTS.includes('Y')) {
const VD = ['mog', 'fog', 'hog', 'tug', 'dug', 'lug', 'sob', 'cob', 'nub', 'pod', 'gud', 'gad', 'bed', 'beg', 'bid', 'rig'];
const NAS = ['gom', 'hun', 'son', 'tun'], CL = ['ponc', 'runc', 'ront', 'hont'], VLS = ['dop', 'hut', 'bic'], NEG = ['pof', 'mus'];
const SY = [...VD, ...NAS, ...CL, ...VLS, ...NEG], tally = {}, yMiss = new Map(), yMissB = new Map(), asNas = {}, nasAsStop = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const ON = { ...RC, voicedLead: true }, OFF = { ...RC, voicedLead: false };
for (const pulses of [4, 2]) for (const midi of [44, 57, 60, 61, 62, 64]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 102, title: 'held-out voiced lead' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (VD.includes(s) ? 'voiced' : NAS.includes(s) ? 'nasal' : CL.includes(s) ? 'cluster' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [mode, o] of [['def', OFF], ['vl', ON]]) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'voiced' && got.cls === 'nasal') asNas[mode] = (asNas[mode] || 0) + 1;
        if ((grp === 'nasal' || grp === 'cluster') && got.cls === 'stop' && got.voiced) nasAsStop[mode] = (nasAsStop[mode] || 0) + 1;
        if (!ok && !HIDE.includes('Y')) { const m = mode === 'def' ? yMiss : yMissB, key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; m.set(key, (m.get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${['def', 'vl'].map((m) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${['def', 'vl'].map((m) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('Y') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## Y. Held out: a voiced stop\'s lead read as a nasal (twenty-first round)', '', `Voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; nasal codas: ${NAS.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CL.map((s) => `*${s}*`).join(', ')}; voiceless stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 102 BPM, each followed by a rest, G#2, A3, C4, C#4, D4, E4.`, '',
  '| | default | `voicedLead` |', '|---|---|---|',
  row('voiced stop codas read exactly', 'voiced'), cnt('voiced stops read as a nasal', asNas),
  row('nasal codas read exactly', 'nasal'), row('n-clusters read as their nasal', 'cluster'), cnt('nasal codas and n-clusters read as a voiced stop', nasAsStop),
  row('voiceless stop codas read exactly', 'voiceless'), row('other syllables read exactly', 'other'), row('vowel-only control read as none', 'control'), '',
  'Misses, default (count over the twelve pitch and length cells):', '', list(yMiss), '',
  'Misses with `voicedLead`:', '', list(yMissB), '');
}

// The twenty-second round's held-out set (voicedLead's hold form, pre-registered in the header): voiced stop codas, most
// after a dark vowel (the target), nasal codas and n-clusters (the risk: an n's murmur dropped before a t or c whose
// closure the closure rule found), voiceless stops and others, sung in no other part, at A2, F#3, B3, C#4, D#4 and E4,
// 98 BPM (in no other part), pulse-4 and pulse-2 notes, each followed by a rest, sung and vowel-only. Three columns:
// the default, voicedLead's bar form (`voicedLead: true`) and its hold form (`{ hold: true }`).
if (PARTS.includes('Z')) {
const VD = ['log', 'pog', 'gog', 'mob', 'rod', 'vod', 'cug', 'hub', 'cud', 'bub', 'fud', 'lib', 'heg', 'rab', 'neb', 'sid'];
const NAS = ['lum', 'bon', 'com', 'dun'], CL = ['bont', 'lonc', 'dunt', 'sant', 'hunt', 'conc'], VLS = ['bot', 'luc', 'pap'], NEG = ['rol', 'hus'];
const SY = [...VD, ...NAS, ...CL, ...VLS, ...NEG], tally = {}, miss = { def: new Map(), bar: new Map(), hold: new Map() }, asNas = {}, nasAsStop = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const MODES = [['def', { ...RC, voicedLead: false }], ['bar', { ...RC, voicedLead: true }], ['hold', { ...RC, voicedLead: { hold: true } }]];
for (const pulses of [4, 2]) for (const midi of [45, 54, 59, 61, 63, 64]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 98, title: 'held-out voiced closure hold' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (VD.includes(s) ? 'voiced' : NAS.includes(s) ? 'nasal' : CL.includes(s) ? 'cluster' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [mode, o] of MODES) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'voiced' && got.cls === 'nasal') asNas[mode] = (asNas[mode] || 0) + 1;
        if ((grp === 'nasal' || grp === 'cluster') && got.cls === 'stop') nasAsStop[mode] = (nasAsStop[mode] || 0) + 1;
        if (!ok && !HIDE.includes('Z')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; miss[mode].set(key, (miss[mode].get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${MODES.map(([m]) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${MODES.map(([m]) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('Z') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## Z. Held out: a voiced closure that holds to its burst (twenty-second round)', '', `Voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; nasal codas: ${NAS.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CL.map((s) => `*${s}*`).join(', ')}; voiceless stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 98 BPM, each followed by a rest, A2, F#3, B3, C#4, D#4, E4.`, '',
  '| | default | `voicedLead` (bar form) | `voicedLead: { hold: true }` |', '|---|---|---|---|',
  row('voiced stop codas read exactly', 'voiced'), cnt('voiced stops read as a nasal', asNas),
  row('nasal codas read exactly', 'nasal'), row('n-clusters read as their nasal', 'cluster'), cnt('nasal codas and n-clusters read as a stop', nasAsStop),
  row('voiceless stop codas read exactly', 'voiceless'), row('other syllables read exactly', 'other'), row('vowel-only control read as none', 'control'), '',
  'Misses, default (count over the twelve pitch and length cells):', '', list(miss.def), '',
  'Misses, bar form:', '', list(miss.bar), '', 'Misses, hold form:', '', list(miss.hold), '');
}

// The twenty-third round's held-out set (lipShut, pre-registered in the header): final nasals after /u/ and /o/ (the
// target), voiced stops after them, nasals after a bright vowel and n-clusters (the risk: a stop's voice bar or a
// cluster's n read through the new rule), voiceless stops and others, sung in no other part, at D3, G#3, C4, D4, D#4
// and E4, 94 BPM (in no other part), pulse-4 and pulse-2 notes, each followed by a rest, sung and vowel-only. Two
// columns: the default reader and `lipShut: true`.
if (PARTS.includes('a')) {
const DK = ['bum', 'vum', 'fum', 'hum', 'mun', 'pun', 'gun', 'lun', 'tom', 'pom', 'mon', 'gon'];
const VD = ['bog', 'dod', 'vud', 'gug', 'fob'], BR = ['dem', 'ren', 'sim', 'ham'], CL = ['munc', 'gont', 'bunc', 'funt'], VLS = ['nuc', 'tup', 'bup'], NEG = ['gul', 'tur', 'bu', 'po'];
const SY = [...DK, ...VD, ...BR, ...CL, ...VLS, ...NEG], tally = {}, miss = { def: new Map(), shut: new Map() }, asNas = {}, dkHi = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const MODES = [['def', { ...RC, lipShut: false }], ['shut', { ...RC, lipShut: typeof RC.lipShut === 'object' ? RC.lipShut : true }]];
for (const pulses of [4, 2]) for (const midi of [50, 56, 60, 62, 63, 64]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 94, title: 'held-out dark-vowel nasal' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (DK.includes(s) ? 'dark' : VD.includes(s) ? 'voiced' : BR.includes(s) ? 'bright' : CL.includes(s) ? 'cluster' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [mode, o] of MODES) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'dark' && midi >= 62) bump(`darkhi ${mode}`, ok);
        if ((grp === 'voiced' || grp === 'voiceless' || grp === 'other' || grp === 'control') && got.cls === 'nasal') asNas[mode] = (asNas[mode] || 0) + 1;
        if (!ok && !HIDE.includes('a')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; miss[mode].set(key, (miss[mode].get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${MODES.map(([m]) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${MODES.map(([m]) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('a') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## a. Held out: a dark-vowel nasal\'s lip closure (twenty-third round)', '', `Nasals after /u/ or /o/: ${DK.map((s) => `*${s}*`).join(', ')}; voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; nasals after a bright vowel: ${BR.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CL.map((s) => `*${s}*`).join(', ')}; voiceless stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 94 BPM, each followed by a rest, D3, G#3, C4, D4, D#4, E4.`, '',
  '| | default | `lipShut` |', '|---|---|---|',
  row('nasals after /u/ or /o/ read exactly', 'dark'), row('of them, on D4-E4', 'darkhi'),
  row('nasals after a bright vowel read exactly', 'bright'), row('n-clusters read as their nasal', 'cluster'),
  row('voiced stop codas read exactly', 'voiced'), row('voiceless stop codas read exactly', 'voiceless'), row('other syllables read exactly', 'other'),
  row('vowel-only control read as none', 'control'), cnt('stops, others and vowel-only control read as a nasal', asNas), '',
  'Misses, default (count over the twelve pitch and length cells):', '', list(miss.def), '',
  'Misses with `lipShut`:', '', list(miss.shut), '');
}


// The twenty-fourth round's held-out set (lipHold, pre-registered in the header): final nasals after /u/ and /o/ (the
// target), voiced stops after them, nasals after a bright vowel and n-clusters (the risk), voiceless stops and others,
// sung in no other part, at C#3, A3, C#4, D4, D#4 and E4, 90 BPM (in no other part), pulse-4 and pulse-2 notes, each
// followed by a rest, sung and vowel-only. Two columns: the default reader and `lipHold: true`.
if (PARTS.includes('b')) {
const DK = ['mum', 'num', 'bun', 'cun', 'run', 'vun', 'dom', 'fom', 'hom', 'som', 'lon', 'ton'];
const VD = ['bud', 'dud', 'god', 'sod', 'vug'], BR = ['pem', 'fim', 'lam', 'rem'], CL = ['donc', 'tonc', 'nunt', 'vont'], VLS = ['dup', 'loc', 'hoc'], NEG = ['mul', 'bor', 'dul', 'fo'];
const SY = [...DK, ...VD, ...BR, ...CL, ...VLS, ...NEG], tally = {}, miss = { def: new Map(), hold: new Map() }, asNas = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const MODES = [['def', { ...RC, lipHold: false }], ['hold', { ...RC, lipHold: true }]];
for (const pulses of [4, 2]) for (const midi of [49, 57, 61, 62, 63, 64]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 90, title: 'held-out dark-vowel nasal, level held' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (DK.includes(s) ? 'dark' : VD.includes(s) ? 'voiced' : BR.includes(s) ? 'bright' : CL.includes(s) ? 'cluster' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [mode, o] of MODES) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'dark' && midi >= 62) bump(`darkhi ${mode}`, ok);
        if ((grp === 'voiced' || grp === 'voiceless' || grp === 'other' || grp === 'control') && got.cls === 'nasal') asNas[mode] = (asNas[mode] || 0) + 1;
        if (!ok && !HIDE.includes('b')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; miss[mode].set(key, (miss[mode].get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${MODES.map(([m]) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${MODES.map(([m]) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('b') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## b. Held out: a dark-vowel m that holds level (twenty-fourth round)', '', `Nasals after /u/ or /o/: ${DK.map((s) => `*${s}*`).join(', ')}; voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; nasals after a bright vowel: ${BR.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CL.map((s) => `*${s}*`).join(', ')}; voiceless stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 90 BPM, each followed by a rest, C#3, A3, C#4, D4, D#4, E4.`, '',
  '| | default | `lipHold` |', '|---|---|---|',
  row('nasals after /u/ or /o/ read exactly', 'dark'), row('of them, on D4-E4', 'darkhi'),
  row('nasals after a bright vowel read exactly', 'bright'), row('n-clusters read as their nasal', 'cluster'),
  row('voiced stop codas read exactly', 'voiced'), row('voiceless stop codas read exactly', 'voiceless'), row('other syllables read exactly', 'other'),
  row('vowel-only control read as none', 'control'), cnt('stops, others and vowel-only control read as a nasal', asNas), '',
  'Misses, default (count over the twelve pitch and length cells):', '', list(miss.def), '',
  'Misses with `lipHold`:', '', list(miss.hold), '');
}

// The twenty-fifth round's held-out set (lipShut's slow closure, pre-registered in the header): final nasals after /u/
// and /o/, most after a nasal, labial or cluster onset, none sung before, at 88 BPM
if (PARTS.includes('c')) {
const DK = ['nun', 'brum', 'glum', 'stum', 'flum', 'prun', 'non', 'mom', 'bom', 'pon', 'vom', 'lom'];
const VD = ['brud', 'glub', 'drog', 'plod', 'stug'], BR = ['mem', 'nim', 'ban', 'trem'], CL = ['nant', 'bonc', 'frunt', 'plons'], VLS = ['mut', 'mup', 'trop'], NEG = ['nus', 'mur', 'bo', 'nul'];
const SY = [...DK, ...VD, ...BR, ...CL, ...VLS, ...NEG], tally = {}, miss = { def: new Map(), slow: new Map() }, asNas = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const MODES = [['def', { ...RC, lipShut: true }], ['slow', { ...RC, lipShut: SLOW_SHUT }]];
for (const pulses of [4, 2]) for (const midi of [48, 58, 60, 62, 63, 64]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 88, title: 'held-out dark-vowel nasal, slow closure' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (DK.includes(s) ? 'dark' : VD.includes(s) ? 'voiced' : BR.includes(s) ? 'bright' : CL.includes(s) ? 'cluster' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [mode, o] of MODES) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'dark' && midi >= 62) bump(`darkhi ${mode}`, ok);
        if ((grp === 'voiced' || grp === 'voiceless' || grp === 'other' || grp === 'control') && got.cls === 'nasal') asNas[mode] = (asNas[mode] || 0) + 1;
        if (!ok && !HIDE.includes('c')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; miss[mode].set(key, (miss[mode].get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${MODES.map(([m]) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${MODES.map(([m]) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('c') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
const slowName = `\`lipShut: { span: ${SLOW_SHUT.span}, settle: ${SLOW_SHUT.settle}, rise: ${SLOW_SHUT.rise} }\``;
lines.push('## c. Held out: a dark-vowel m with a slow closure (twenty-fifth round)', '', `Nasals after /u/ or /o/: ${DK.map((s) => `*${s}*`).join(', ')}; voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; nasals after a bright vowel: ${BR.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CL.map((s) => `*${s}*`).join(', ')}; voiceless stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 88 BPM, each followed by a rest, C3, A#3, C4, D4, D#4, E4.`, '',
  `| | default | ${slowName} |`, '|---|---|---|',
  row('nasals after /u/ or /o/ read exactly', 'dark'), row('of them, on D4-E4', 'darkhi'),
  row('nasals after a bright vowel read exactly', 'bright'), row('n-clusters read as their nasal', 'cluster'),
  row('voiced stop codas read exactly', 'voiced'), row('voiceless stop codas read exactly', 'voiceless'), row('other syllables read exactly', 'other'),
  row('vowel-only control read as none', 'control'), cnt('stops, others and vowel-only control read as a nasal', asNas), '',
  'Misses, default (count over the twelve pitch and length cells):', '', list(miss.def), '',
  `Misses with ${slowName}:`, '', list(miss.slow), '');
}

// The twenty-sixth round's held-out set (levelFade, pre-registered in the header): none of its syllables sung before,
// at 92 BPM and D#3, E3, A3, A#3, B3, C#4
if (PARTS.includes('d')) {
const DK = ['rom', 'trun', 'crum', 'plun', 'grun', 'snum', 'drum', 'prom', 'clun', 'slom', 'tron', 'bron'];
const VD = ['clud', 'trub', 'prog', 'grod', 'blog'], BR = ['hem', 'tin', 'dim', 'cram'], CL = ['pont', 'tont', 'cont', 'tanc'], VLS = ['lup', 'cup', 'rop'], NEG = ['rus', 'tul', 'su', 'lo'];
const SY = [...DK, ...VD, ...BR, ...CL, ...VLS, ...NEG], tally = {}, miss = { def: new Map(), fade: new Map() }, asNas = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const MODES = [['def', { ...RC, levelFade: false }], ['fade', { ...RC, levelFade: true }]];
for (const pulses of [4, 2]) for (const midi of [51, 52, 57, 58, 59, 61]) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 92, title: 'held-out release read as a nasal' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (DK.includes(s) ? 'dark' : VD.includes(s) ? 'voiced' : BR.includes(s) ? 'bright' : CL.includes(s) ? 'cluster' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [mode, o] of MODES) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if ((grp === 'voiced' || grp === 'voiceless' || grp === 'other' || grp === 'control') && got.cls === 'nasal') asNas[mode] = (asNas[mode] || 0) + 1;
        if (!ok && !HIDE.includes('d')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; miss[mode].set(key, (miss[mode].get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${MODES.map(([m]) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${MODES.map(([m]) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('d') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## d. Held out: a release read as a nasal (twenty-sixth round)', '', `Nasals after /u/ or /o/: ${DK.map((s) => `*${s}*`).join(', ')}; voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; nasals after a bright vowel: ${BR.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CL.map((s) => `*${s}*`).join(', ')}; voiceless stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Pulse-4 and pulse-2 notes at 92 BPM, each followed by a rest, D#3, E3, A3, A#3, B3, C#4.`, '',
  `| | default | \`levelFade: { tail: 6 }\` |`, '|---|---|---|',
  row('nasals after /u/ or /o/ read exactly', 'dark'),
  row('nasals after a bright vowel read exactly', 'bright'), row('n-clusters read as their nasal', 'cluster'),
  row('voiced stop codas read exactly', 'voiced'), row('voiceless stop codas read exactly', 'voiceless'), row('other syllables read exactly', 'other'),
  row('vowel-only control read as none', 'control'), cnt('stops, others and vowel-only control read as a nasal', asNas), '',
  'Misses, default (count over the twelve pitch and length cells):', '', list(miss.def), '',
  'Misses with `levelFade`:', '', list(miss.fade), '');
}

// The twenty-ninth round's held-out set (levelFade and longTilt, pre-registered in the header): the cells of
// eval/release-cells-report.md's 84 BPM rows that land 4 or more of 8, none of its syllables sung before
if (PARTS.includes('e')) {
const DK = ['grom', 'crom', 'trom', 'frum', 'drun', 'prum', 'blum', 'clum', 'spum', 'flon', 'plom', 'brom'];
const VD = ['trog', 'brub', 'frod', 'clog', 'crud'], BR = ['dram', 'flem', 'brin', 'glen'], CL = ['brant', 'clonc', 'plunt', 'grons'], VLS = ['frup', 'clot', 'drup'], NEG = ['brus', 'frul', 'clu', 'dro'];
const SY = [...DK, ...VD, ...BR, ...CL, ...VLS, ...NEG], tally = {}, miss = { def: new Map(), fade: new Map(), tilt: new Map() }, asNas = {}, ctlCell = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const MODES = [['def', { ...RC, levelFade: false, longTilt: false }], ['fade', { ...RC, levelFade: true, longTilt: false }], ['tilt', { ...RC, levelFade: false, longTilt: true }]];
const NAMES = { 43: 'G2', 47: 'B2', 50: 'D3', 52: 'E3', 53: 'F3', 55: 'G3', 57: 'A3', 59: 'B3', 60: 'C4', 62: 'D4', 64: 'E4' };
const CELLS = [[4, 47], [4, 55], [4, 60], [4, 62], [2, 43], [2, 47], [2, 50], [2, 52], [2, 53], [2, 57], [2, 59], [2, 64]];
const FULL = new Set(['2 43', '2 47', '2 52', '2 57']);
for (const [pulses, midi] of CELLS) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 84, title: 'held-out release cells' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (DK.includes(s) ? 'dark' : VD.includes(s) ? 'voiced' : BR.includes(s) ? 'bright' : CL.includes(s) ? 'cluster' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [mode, o] of MODES) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'control' && !ok) { const c = `${pulses === 4 ? 'quarter' : 'eighth'} ${NAMES[midi]}`; ctlCell[mode] = ctlCell[mode] || {}; ctlCell[mode][c] = (ctlCell[mode][c] || 0) + 1; if (FULL.has(`${pulses} ${midi}`)) bump(`full ${mode}`, true); }
        if ((grp === 'voiced' || grp === 'voiceless' || grp === 'other' || grp === 'control') && got.cls === 'nasal') asNas[mode] = (asNas[mode] || 0) + 1;
        if (!ok && !HIDE.includes('e')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; miss[mode].set(key, (miss[mode].get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${MODES.map(([m]) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${MODES.map(([m]) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('e') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
const cells = (m) => HIDE.includes('e') ? '- hidden' : Object.entries(ctlCell[m] || {}).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## e. Held out: where the release lands (twenty-ninth round)', '', `Nasals after /u/ or /o/: ${DK.map((s) => `*${s}*`).join(', ')}; voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; nasals after a bright vowel: ${BR.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CL.map((s) => `*${s}*`).join(', ')}; voiceless stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. 84 BPM, each followed by a rest: quarters on B2, G3, C4, D4 and eighths on G2, B2, D3, E3, F3, A3, B3, E4 (eval/release-cells-report.md's 84 BPM cells that land 4 or more of 8).`, '',
  '| | default | `levelFade: { tail: 6 }` | `longTilt: { span: 0.3, gap: 0.45 }` |', '|---|---|---|---|',
  row('nasals after /u/ or /o/ read exactly', 'dark'),
  row('nasals after a bright vowel read exactly', 'bright'), row('n-clusters read as their nasal', 'cluster'),
  row('voiced stop codas read exactly', 'voiced'), row('voiceless stop codas read exactly', 'voiceless'), row('other syllables read exactly', 'other'),
  row('vowel-only control read as none', 'control'), cnt('stops, others and vowel-only control read as a nasal', asNas),
  `| vowel-only misses on the four 8-of-8 eighth cells | ${MODES.map(([m]) => (tally[`full ${m}`] || [0])[0]).join(' | ')} |`, '',
  'Vowel-only misses by cell:', '', ...MODES.map(([m]) => `- ${m}: ${cells(m)}`), '',
  'Misses, default (count over the twelve cells):', '', list(miss.def), '',
  'Misses with `levelFade`:', '', list(miss.fade), '',
  'Misses with `longTilt`:', '', list(miss.tilt), '');
}

// The thirtieth round's held-out set (nearRelease, pre-registered in the header): none of its syllables sung before, at
// 86 BPM on every pitch of eval/release-cells-report.md, quarters and eighths
if (PARTS.includes('f')) {
const DK = ['fon', 'blon', 'cron', 'con', 'glun', 'snom', 'clon', 'smum', 'crun', 'plon', 'frun', 'slun'];
const VD = ['snug', 'frub', 'plud', 'glob', 'crod'], BR = ['pren', 'len', 'gran', 'clen'], CL = ['banc', 'flont', 'spant', 'snons'], VLS = ['glop', 'gluc', 'brop'], NEG = ['dor', 'snor', 'pu', 'stur'];
const SY = [...DK, ...VD, ...BR, ...CL, ...VLS, ...NEG], tally = {}, miss = { def: new Map(), rel: new Map() }, asNas = {}, ctlNear = {};
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const MODES = [['def', { ...RC, nearRelease: false }], ['rel', { ...RC, nearRelease: true }]];
const NAMES = ['E2', 'G2', 'A2', 'B2', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4'], PITCHES = [40, 43, 45, 47, 50, 52, 53, 55, 57, 59, 60, 62, 64];
for (const pulses of [4, 2]) for (const midi of PITCHES) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 86, title: 'held-out near-rule release' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (DK.includes(s) ? 'dark' : VD.includes(s) ? 'voiced' : BR.includes(s) ? 'bright' : CL.includes(s) ? 'cluster' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [mode, o] of MODES) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if (grp === 'control' && got.cls === 'nasal' && got.rule === 'near') { const c = `${pulses === 4 ? 'quarter' : 'eighth'} ${NAMES[PITCHES.indexOf(midi)]}`; ctlNear[mode] = ctlNear[mode] || {}; ctlNear[mode][c] = (ctlNear[mode][c] || 0) + 1; }
        if ((grp === 'voiced' || grp === 'voiceless' || grp === 'other' || grp === 'control') && got.cls === 'nasal') asNas[`${grp === 'control' ? 'ctl' : 'obs'} ${mode}`] = (asNas[`${grp === 'control' ? 'ctl' : 'obs'} ${mode}`] || 0) + 1;
        if (!ok && !HIDE.includes('f')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)}`; miss[mode].set(key, (miss[mode].get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${MODES.map(([m]) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, g) => `| ${t} | ${MODES.map(([m]) => asNas[`${g} ${m}`] || 0).join(' | ')} |`;
const nearN = (m) => Object.values(ctlNear[m] || {}).reduce((a, b) => a + b, 0);
const list = (m) => HIDE.includes('f') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
const cells = (m) => HIDE.includes('f') ? '- hidden' : Object.entries(ctlNear[m] || {}).map(([k, n]) => `${k} ${n}`).join('; ') || 'none';
lines.push('## f. Held out: a near-rule murmur after the note\'s end (thirtieth round)', '', `Nasals after /u/ or /o/: ${DK.map((s) => `*${s}*`).join(', ')}; voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; nasals after a bright vowel: ${BR.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CL.map((s) => `*${s}*`).join(', ')}; voiceless stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Quarters and eighths at 86 BPM, each followed by a rest, on ${NAMES.join(', ')}.`, '',
  '| | default | `nearRelease` |', '|---|---|---|',
  row('nasals after /u/ or /o/ read exactly', 'dark'),
  row('nasals after a bright vowel read exactly', 'bright'), row('n-clusters read as their nasal', 'cluster'),
  row('voiced stop codas read exactly', 'voiced'), row('voiceless stop codas read exactly', 'voiceless'), row('other syllables read exactly', 'other'),
  row('vowel-only control read as none', 'control'), cnt('vowel-only control read as a nasal', 'ctl'),
  `| of them, by the near rule | ${MODES.map(([m]) => nearN(m)).join(' | ')} |`, cnt('stops and others read as a nasal', 'obs'), '',
  'Vowel-only near-rule nasals by cell:', '', ...MODES.map(([m]) => `- ${m}: ${cells(m)}`), '',
  'Misses, default (count over the 26 cells):', '', list(miss.def), '',
  'Misses with `nearRelease`:', '', list(miss.rel), '');
}

// The thirty-first round's held-out set (lipShut hiHold 8, pre-registered in the header): none of its syllables sung
// before, at 82 BPM on part f's thirteen pitches, quarters and eighths
if (PARTS.includes('g')) {
const DK = ['trum', 'grum', 'scrum', 'flun', 'drom', 'stom', 'slum', 'gron', 'fron', 'spon', 'sprun', 'strun'];
const VD = ['grub', 'drob', 'stod', 'plug', 'frog'], BR = ['tren', 'slen', 'dran', 'fren'], CL = ['tranc', 'plent', 'stunt', 'grunc'], VLS = ['stuc', 'grot', 'trup'], NEG = ['flor', 'tru', 'grur', 'sto'];
const SY = [...DK, ...VD, ...BR, ...CL, ...VLS, ...NEG], tally = {}, asNas = {};
const SH8 = { ...LIP_SHUT, ...(typeof RC.lipShut === 'object' ? RC.lipShut : {}), hiHold: 8 };
const MODES = [['def', RC], ['h8', { ...RC, lipShut: SH8 }], ['h8rel', { ...RC, lipShut: SH8, nearRelease: true }]], miss = Object.fromEntries(MODES.map(([m]) => [m, new Map()]));
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const NAMES = ['E2', 'G2', 'A2', 'B2', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4'], PITCHES = [40, 43, 45, 47, 50, 52, 53, 55, 57, 59, 60, 62, 64];
for (const pulses of [4, 2]) for (const midi of PITCHES) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 82, title: 'held-out lip closure hold' });
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const grp = sing === true ? (DK.includes(s) ? 'dark' : VD.includes(s) ? 'voiced' : BR.includes(s) ? 'bright' : CL.includes(s) ? 'cluster' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [mode, o] of MODES) {
        const got = readCoda(x, rate, vAt, tEnd, { ...o, noteEnd: n.t1 }), ok = match(want, got);
        bump(`${grp} ${mode}`, ok);
        if ((grp === 'voiced' || grp === 'voiceless' || grp === 'other' || grp === 'control') && got.cls === 'nasal') asNas[mode] = (asNas[mode] || 0) + 1;
        if (!ok && !HIDE.includes('g')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(got)} (${pulses === 4 ? 'quarter' : 'eighth'} ${NAMES[PITCHES.indexOf(midi)]})`; miss[mode].set(key, (miss[mode].get(key) || 0) + 1); }
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${MODES.map(([m]) => cell(`${g} ${m}`)).join(' | ')} |`;
const list = (m) => HIDE.includes('g') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k}${n > 1 ? ` ${n}` : ''}`).join('; ') || 'none';
lines.push('## g. Held out: the lip closure\'s upper band through the beating (thirty-first round)', '', `Nasals after /u/ or /o/: ${DK.map((s) => `*${s}*`).join(', ')}; voiced stops: ${VD.map((s) => `*${s}*`).join(', ')}; nasals after a bright vowel: ${BR.map((s) => `*${s}*`).join(', ')}; n-clusters: ${CL.map((s) => `*${s}*`).join(', ')}; voiceless stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Quarters and eighths at 82 BPM, each followed by a rest, on ${NAMES.join(', ')}.`, '',
  '| | default | `lipShut: { hiHold: 8 }` | and `nearRelease` |', '|---|---|---|---|',
  row('nasals after /u/ or /o/ read exactly', 'dark'),
  row('nasals after a bright vowel read exactly', 'bright'), row('n-clusters read as their nasal', 'cluster'),
  row('voiced stop codas read exactly', 'voiced'), row('voiceless stop codas read exactly', 'voiceless'), row('other syllables read exactly', 'other'),
  row('vowel-only control read as none', 'control'), `| stops, others and vowel-only control read as a nasal | ${MODES.map(([m]) => asNas[m] || 0).join(' | ')} |`, '',
  ...MODES.flatMap(([m], i) => [`Misses, ${['default', 'hiHold 8', 'hiHold 8 and nearRelease'][i]}:`, '', list(miss[m]), '']));
}

// The thirty-second round's held-out set (pre-registered in the header): low and front-vowel nasals and voiced labial
// stops, none sung before, at 80 BPM on part f's thirteen pitches; the choir rendered with the default murmur and with
// `murmurSource: 'match'`, read by the default reader
if (PARTS.includes('h')) {
const NS = ['pam', 'fam', 'vam', 'scam', 'san', 'pan', 'flan', 'sem', 'frem', 'gen', 'spen', 'gren', 'rim', 'trim', 'drin', 'clin'];
const VB = ['plab', 'drab', 'smeb', 'crib', 'vib', 'glab'], VLS = ['trep', 'slip'], NEG = ['fal', 'fle'];
const SY = [...NS, ...VB, ...VLS, ...NEG], tally = {}, asB = {}, ctlNas = {}, newMiss = new Map();
const SRC = [['def', null], ['match', 'match']], miss = Object.fromEntries(SRC.map(([m]) => [m, new Map()]));
const bump = (k, ok) => { tally[k] = tally[k] || [0, 0]; tally[k][1]++; if (ok) tally[k][0]++; };
const NAMES = ['E2', 'G2', 'A2', 'B2', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4'], PITCHES = [40, 43, 45, 47, 50, 52, 53, 55, 57, 59, 60, 62, 64];
const isVB = (g) => g.cls === 'stop' && g.voiced && g.place === 'lab';
let nNew = 0, nNewB = 0;
for (const pulses of [4, 2]) for (const midi of PITCHES) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 80, title: 'held-out matched murmur as a labial' });
  const cellName = `${pulses === 4 ? 'quarter' : 'eighth'} ${NAMES[PITCHES.indexOf(midi)]}`;
  for (const sing of [true, 'vowels']) {
    const got = {};
    for (const [src, ms] of SRC) {
      const r = renderMidi(mid, { rate, stems: true, sing, voiceBar: VOICEBAR, voiceBarWall: WALL, ...(ms ? { murmurSource: ms } : {}) });
      const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
      const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
      const x = r.stems.choir.channels[0];
      got[src] = SY.map((s, j) => {
        const n = notes[j], tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
        return readCoda(x, rate, vAt, tEnd, { ...RC, noteEnd: n.t1 });
      });
    }
    SY.forEach((s, j) => {
      const want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      const grp = sing === true ? (NS.includes(s) ? 'nasal' : VB.includes(s) ? 'vlab' : VLS.includes(s) ? 'voiceless' : 'other') : 'control';
      for (const [src] of SRC) {
        const g = got[src][j], ok = match(want, g);
        bump(`${grp} ${src}`, ok);
        if (grp === 'nasal' && isVB(g)) asB[src] = (asB[src] || 0) + 1;
        if (grp === 'control' && g.cls === 'nasal') ctlNas[src] = (ctlNas[src] || 0) + 1;
        if (!ok && !HIDE.includes('h')) { const key = `${grp === 'control' ? `${s} (vowel only)` : s} as ${label(g)} (${cellName})`; miss[src].set(key, (miss[src].get(key) || 0) + 1); }
      }
      if (grp === 'nasal' && match(want, got.def[j]) && !match(want, got.match[j])) {
        nNew++; if (isVB(got.match[j])) nNewB++;
        if (!HIDE.includes('h')) newMiss.set(`${s} as ${label(got.match[j])} (${cellName})`, 1);
      }
    });
  }
}
const cell = (k) => pct(...(tally[k] || [0, 0]));
const row = (t, g) => `| ${t} | ${SRC.map(([m]) => cell(`${g} ${m}`)).join(' | ')} |`;
const cnt = (t, o) => `| ${t} | ${SRC.map(([m]) => o[m] || 0).join(' | ')} |`;
const list = (m) => HIDE.includes('h') ? '- hidden' : [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k}${n > 1 ? ` ${n}` : ''}`).join('; ') || 'none';
lines.push('## h. Held out: the level-matched murmur read as a voiced labial stop? (thirty-second round)', '', `Nasals after /a/, /e/ or /i/: ${NS.map((s) => `*${s}*`).join(', ')}; voiced labial stops: ${VB.map((s) => `*${s}*`).join(', ')}; voiceless labial stops: ${VLS.map((s) => `*${s}*`).join(', ')}; others: ${NEG.map((s) => `*${s}*`).join(', ')}. Quarters and eighths at 80 BPM, each followed by a rest, on ${NAMES.join(', ')}. The choir rendered with the default murmur and with \`murmurSource: 'match'\`; the default reader on both.`, '',
  '| | default murmur | `match` |', '|---|---|---|',
  row('nasals after /a/, /e/ or /i/ read exactly', 'nasal'), cnt('of them read as a voiced labial stop', asB),
  row('voiced labial stops read exactly', 'vlab'), row('voiceless labial stops read exactly', 'voiceless'), row('other syllables read exactly', 'other'),
  row('vowel-only control read as none', 'control'), cnt('vowel-only control read as a nasal', ctlNas), '',
  `Nasal cells the default murmur reads exactly and \`match\` does not (N): ${nNew}; of them read as a voiced labial stop under \`match\`: ${nNewB}.`, '',
  'Those cells:', '', list(newMiss), '',
  ...SRC.flatMap(([m], i) => [`Misses, ${['default murmur', '`match`'][i]}:`, '', list(miss[m]), '']));
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
