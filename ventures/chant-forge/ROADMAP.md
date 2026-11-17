# Chant Forge roadmap

A long-term programme, many sessions deep. Each milestone ships something that
runs or sounds, not just a plan. A run that lands a slice moves its line to
"Landed" with the date and how it was checked.

## Landed

- 2026-11-03: GABC to MIDI converter (`gabc.mjs`, `midi.mjs`, `cli.mjs`) with
  clefs, accidentals, mora, bars, a downbeat fit, transposition to a final, a
  mode/final check and a drone. 8 unit tests; output read back with Python `mido`.

- 2026-11-03: corpus of five pieces (Dies irae, Pange lingua, Veni Creator,
  Te Deum, Salve Regina) from GregoBase (CC0 per its FAQ), each naming its
  book and page; a test parses all of them and checks the mode final. Not
  compared against page scans; Te Deum and Salve Regina come from post-1929
  books (`corpus/README.md`).

- 2026-11-03: genre templates as code (`genre.mjs`, `--genre` in the CLI):
  deep house, EDM, hard rock and metal each write drums (GM channel 10), bass and
  chord parts bar by bar, in the chant's mode (Dorian, Phrygian, Lydian or
  Mixolydian, with a four-bar loop that fits the mode). 5 new tests check
  notes stay inside the mode scale, a kick in every bar, four on the floor, half
  time metal. Not yet listened to through a synthesiser: ear check pending.

- 2026-11-03: release kit (`release.mjs`, `release-cli.mjs`): ISRC and UPC/EAN check
  digits, cover art size, WAV format, the master checks, per-track source edition and
  rights, AI-disclosure level. 7 tests. Not run against a distributor's real form.

- 2026-11-03: GABC reader fixes for real files (CRLF comments, `<sp>`/`<v>`/`<alt>`
  text markup, clef change inside a group): 6 tests on made-up strings.

- 2026-11-03: rhythm option two, `--fit 8 --stretch` (`fitStretch` in `gabc.mjs`):
  lengthens a phrase's longest notes (each at most 2x, phrase-final note on a tie)
  to fill whole bars before padding rest. Padded rest on the five corpus pieces
  falls from 171/19/53/200/13 to 79/6/26/87/6 pulses. 5 tests in `stretch.test.mjs`.
  Not listened to; no ear comparison yet.

- 2026-11-03: real-file batch: GregoBase answered from the cloud proxy (the note below was out of date). 59 Graduale 1908 files in `corpus/gregobase-1908/` ran through the reader with no crash or warning; `batch.test.mjs` (3 tests), `eval/batch-check.mjs`. 48 of 59 end on the mode final; the 11 others are introits, graduals, alleluias and offertories ending on a differentia or verse. Notes not compared with scans.
- 2026-11-03: fuzz test (`fuzz.test.mjs`): 2000 seeded random GABC strings (odd clefs, unclosed groups, CRLF, markup) through the reader and MIDI writer; none throws, every pitch is 0-127, every file has MThd/MTrk. Made-up input only; GregoBase is blocked from the cloud proxy, so real-file batches are still open.

- 2026-11-03: `nabc.test.mjs`: NABC alternation (`(fg|vi|ls)`), neumes split across groups, `!`, `/`, `z`/`Z`, `;2`, backtick and `[ob:...]` markers all keep exactly the GABC pitches. Made-up strings; the real-file batch is still open.
- 2026-11-03: `--halftime` (`halfTime` in `gabc.mjs`): chant durations doubled against an unchanged backing tempo. 3 tests; bar and second counts checked on Dies irae. Not listened to.
- 2026-11-03: `RECORDING-GUIDE.md` (5a): make the guide and cue sheet, learn the line, record, run `master-cli.mjs`. Not tried with real singers.
- 2026-11-03: preview renderer (`render.mjs`, `render-cli.mjs`, `render.test.mjs`, 6 tests): MIDI to stereo WAV with an additive choir pad, organ drone, bass, chord pad and synthesised GM drums. Checked: a D3 note measures 146.8 Hz by autocorrelation, length follows the tempo map, output is deterministic. First reading through `master-cli.mjs` on Dies irae (`--fit 8 --final 50`): deep house at 124 BPM -16.8 LUFS (2.8 LU too quiet), true peak -1.12 dBTP; metal at 170 BPM half-time -14.0 LUFS, -1.67 dBTP, all four checks pass. Mono correlation reads 1.00 (everything is centred; no stereo image yet). Sound quality not judged by a person.
- 2026-11-03: `render-cli.mjs --lufs N` (`targetLufs` in `renderMidi`): gain to a loudness target, capped at -1 dBFS sample peak; 1 test reads the WAV back through `analyze` (reported vs measured within 0.3 LU). Not listened to.
- 2026-11-03: `--fills` (`fillBar` in `genre.mjs`, `fills.test.mjs`, 3 tests): a four-hit snare crescendo on the last beat of every fourth bar, never the final bar; off by default, adds hits only. Not listened to.
- 2026-11-03: `render-cli.mjs --stems DIR` (`stems: true` in `renderMidi`): one WAV per voice (choir, organ, bass, chords, drums) at the mix's scale, so a producer can load them into a DAW and mix by ear. 1 test: the stems sum to the mix within 1e-9; Dies irae metal gives 5 stems. Not listened to.

- 2026-11-13: corpus read against pre-1929 scans by machine (`scan.mjs`, `eval/scan-check.mjs`,
  8 tests): Dies irae, Veni Creator, Pange lingua (1908 Graduale) and Salve Regina (1912
  Antiphonale) agree on every note read (604, 43, 53, 214); the Te Deum is now the 1908 Roman
  tone (GregoBase 3656) with one transcription error corrected from the scan; seven of the
  11 off-final Graduale endings are the book's. Planted one-step errors caught 189-200 of 200.
  Verdicts: `eval/scan-check-verdicts.md`.
- 2026-11-13: an independent reading by eye (`eval/scan-read-by-eye/`, `corpus/scan-read-by-eye.json`,
  `scan-read-by-eye.test.mjs`, 5 tests), covering every note including rhombi, quilismas and
  liquescents. Dies irae, Veni Creator and Pange lingua against the 1908 Graduale, the Salve
  Regina and the earlier Te Deum file (now `corpus/te-deum-simple.gabc`) against the 1913 Liber
  Usualis: 1,492 notes, 0 differences. The 1974 Te Deum is the 1913 *tonus simplex*. Strophic
  hymns landed: `pange-lingua-full.gabc` (6 verses) and `veni-creator-full.gabc` (7 verses),
  texts from the 1908 pages, by `eval/scan-read-by-eye/build-hymns.mjs`.

- 2026-11-13: song sections (`sections.mjs`, `--sections`, `--outro N`, `sections.test.mjs`, 11 tests): intro, verse,
  build, drop and outro from the chant's double bars; each energy made from the genre's bar; build bar with an
  accelerating snare roll and an empty last eighth; a marker per section; a studio-page switch. Rendered, drops sit
  1.7-3.5 dB above verses on all four genres. Not listened to.
- 2026-11-13, later: breakdown and riser (`--no-breakdown`, 7 more tests in `sections.test.mjs`,
  `eval/section-levels.mjs`): a piece with four or more sections turns the verse before the last drop into a
  breakdown (drums and bass out, choir alone, then a swelling held chord); every build bar holds the mode's approach
  chord (bVII, bII or II) with a seven-eighth riser up the mode. Breakdown 11-16 dB under the verses. Not listened to.
- 2026-11-13, latest: `--a-cappella` (first verse choir alone, band in on its build) and `--key-lift N` (last drop and
  outro up N semitones, the build into it in the new key), range-checked against E2-E4 or `--range`; `--suggest-final`
  and `--auto-final` count the lift. `lift.test.mjs` (6 tests), `eval/key-lift-check.mjs`: rendered bass in the lifted
  drop 1.117-1.124x the earlier drop's (expected 1.1225), a cappella bars silent after the first. Studio-page
  switches; browser e2e 82 checks. Not listened to.
- 2026-11-13, later still: per-section singer guidance in the cue sheet (`--cues` with `--sections`, `cues.mjs`
  `sectionCues`): a line above each section's first note says what the band does, the first note and its interval
  from the last one sung, when the band comes in after the a cappella verse or back after the breakdown, and the
  lifted drop's first note beside the old key's. 4 new tests; sample sheet `eval/cues-sections-pange-lingua.txt`.
  Not tried with singers.
- 2026-11-13, last: the studio page offers the cue sheet and timed lyrics (LRC) as downloads beside MIDI/WAV and
  shows the section guidance lines under the summary; `eval/browser-e2e.mjs` (86 checks) finds the page's files
  byte-for-byte equal to the CLI's `--cues`/`--lrc` for the same options.
- 2026-11-13, later: phrase markers and a stems ZIP on the studio page (`files.mjs`: browser-safe WAV and stored ZIP
  writer, 4 tests); `eval/browser-e2e.mjs` (89 checks) finds the MIDI equal to `--markers` and the stems equal to
  `render-cli.mjs --stems`, summing to the preview within 2 steps of 32,767.
- 2026-11-14: liquescents read off the scan (`scan.mjs` `liquescentTail`, 1 new test in `scan.test.mjs`): the small
  note on a short thick stem at a head's right edge (epiphonus above, cephalicus hook below). Set on 21 pieces
  (54 of 60), frozen, then 20 of 26 on eleven pieces scanned only afterwards, 1 of 1,622 other heads called
  liquescent (`eval/liquescent-check-report.md`). `scan-check.mjs` now checks 33 more notes, no new disagreement.

- 2026-11-13, latest: `--split-voices` (tenors and basses by phrase; studio page option too). 7 of the 67 corpus files
  span 17 semitones, one more than the C3-E4 band both sections reach; each splits with one phrase for one section
  and 85-98% of the notes for the full choir (README "Tenors and basses by phrase"). Not tried with singers.
- 2026-11-13, later: hand over inside a phrase at a word (README "Handing over at a word"): by default only where
  no whole-phrase split fits (identical results on textbook ranges; with octave-wide sections 56 of 67 files fit
  instead of 50), and with `--split-words` whenever a handoff wins more than `--word-cost` notes (amateur ranges:
  74.6% to 82.2% full choir). Exact DP, brute-force checked. Not tried with singers.
- 2026-11-13, latest: `--overlap` (README "Overlapped handoffs"): at a direct tenor/bass swap inside a phrase both
  sections sing one seam note if it is in both ranges. Only octave-wide sections produce such swaps on the corpus
  (7-13 of them); every one overlaps (0 breaks, eval/overlap-report.md). Off by default; not tried with singers.
- 2026-11-13, latest: `--baritones` (README "Three sections"): tenors, baritones and basses; a phrase or word goes
  to all three, two or one, fewest section-notes left out. Two-section results unchanged. Octave-wide sections: 64
  of 67 files fit instead of 56, one-section notes 89.4% to 29.9% (eval/three-sections-report.md); amateur ranges:
  25.4% to 2.5%. Changes of singer rise (166 to 484 octave-wide). Studio page option too. Not tried with singers.
- 2026-11-13, latest: `--entrance-cost N` (README "Short entrances"): each section entrance costs N section-notes, so
  a section joins a passage only when it sings more than N notes. The premise was weak: octave-wide, a section that
  enters sings a median of 19 notes (1 of 238 entrances under 4 notes). Cost 8 cuts changes of singer 484 to 435
  for 1.3% more section-notes left out (eval/entrance-cost-report.md). Default 0. Not tried with singers.
- 2026-11-13, latest: `--second-tenors` (README "Four sections"): TTBB, 15 section sets, same exact DP. Octave-wide,
  second tenors a tone under the tenors: 65 of 67 files fit (64 with three), one-section notes 29.9% to 13.7%, changes
  of singer 484 to 569 (eval/four-sections-report.md). A section added on top gains nothing; textbook ranges gain
  nothing. Studio page option too. Not tried with singers.
- 2026-11-13: the 1908 Te Deum (`corpus/te-deum.gabc`) read by eye against pp. 118*-121*: 637 of 637 notes
  match, quilismas, rhombi and liquescents included (`corpus/scan-read-by-eye.json`). `scan.mjs` now calls each head a
  rhombus or a square (`headShape`; README "Rhombus or square"): 68/68 rhombi on the tuning pieces, 118/120 held out,
  1 false call in 2,501 squares (a print flaw). Quilismas and liquescents still read as squares or not at all.
- 2026-11-13: `scan.mjs` calls a saw-toothed head a quilisma (`notchRows`, README "Quilisma"). Rule fixed on
  the five tuning pieces (6/6), then nine fresh GregoBase pieces scanned for the first time
  (`eval/shape-fresh-pages.json`): 15 of 17 paired quilismas found; every crop of a false call looked at
  (`eval/quilisma-eye-check.md`). A stroke rule added after that look cuts fresh false calls 18 to 12 of 1,849, half of
  them real quilismas the alignment paired with a neighbour. The rhombus rule held on the fresh pieces: 243/245, 0
  false calls in 1,604 squares. Liquescents are still not read.
- 2026-11-14: quilisma version 3 (`isQuilisma`, README "Quilisma version 3", `eval/quilisma-stroke-check.md`): a
  notched head whose centre falls like a porrectus stroke, that sits straight on another head, or that carries a
  liquescent tail is a square. Committed before eighteen never-scanned pieces were read
  (`eval/quilisma-fresh-pages.json`): false calls 29 to 6 of 3,080, quilismas 47 of 55 under both versions.
- 2026-11-14: rhombus height floor (`RHOMBUS_MIN_H`, README "Rhombus height floor", `eval/rhombus-height-check.md`):
  worn squares whose flecks make them narrow and tapered are not rhombi unless 0.62 spaces tall. Chosen on 50 pieces
  (false calls 18 to 6 of 7,501, 2 of 1,026 rhombi lost); on six held-out pieces listed before download, 103 of 103
  rhombi kept, false calls 1 to 1 (too few worn squares there to show the gain).
- 2026-11-14, latest: the four off-final pieces from the supplement read against the book. The 1908 scan does
  carry the "pro aliquibus locis" supplement (leaf = bracketed page + 585); the verdicts had said it did not.
  3402 and 3451 end as printed (185/187 and 325/332 agree, 0 GABC errors; 3451's one difference is the reader on a
  porrectus top). 3419's page [157] prints only the changed middle (33/33 agree) and sends the singer to *Gaudeamus*,
  p. 486, where 165 notes agree and the ending is the book's. 3427's last three notes were a step low in the GABC
  (`ni(ed) tas.(d)`; the book prints `ni(fe) tas.(e)`, ending on the mode-7 final): corrected, and the reader then pairs
  them. 10 of 10 remaining off-final endings are the book's (eval/offfinal-supplement-report.md,
  eval/scan-check-verdicts.md). `scan-check.mjs --manifest FILE` reads another piece list.

- 2026-11-14, latest: liquescents that end a porrectus checked (`eval/porrectus-liquescent-check.mjs`,
  `eval/porrectus-liquescent-check.md`, `porrectus-liquescent.test.mjs`). The 1908 type prints them as two heads with an
  epiphonus-like tail, not as a stroke, so the existing detector reads them: 8 of 9 on the tuning pieces, 8 of 10 on
  six pieces listed and committed before their pages were read, 1 of 1,060 other heads called liquescent. A looser
  end-width cap added false calls and gained nothing, so the rule is unchanged. Twelve more GregoBase 1908 pieces in
  `corpus/gregobase-1908-checked/`; on them 2,030 notes agree with the book, 5 differ (looked at, next entry).
- 2026-11-14, latest: the 5 differences looked at on the scan (`eval/porrectus-top-check.md`). GregoBase 3912 had a
  slip (`tres(feed...)`, printed e-c: corrected). The other four were porrectus tops read a step low: the stroke's thin
  end falls under the head-height floor and the short piece left was read at its mean height. `STROKE_TOP_FALL` (0.4
  spaces, from an unlabelled histogram) reads such a piece at its left end. Over the 74 piece checks, differences fell
  from 88 to 73, with none added and no note lost (not held out: one condition was added after the first full run).

- 2026-11-14, latest: a C clef printed inside a staff (`findClefChanges` in `scan.mjs`, `clef-change.test.mjs`, 3 tests,
  `eval/clef-change-check.md`): two blocks either side of a line joined on their left. GregoBase 3437's 16 differences were
  this; over the 74 piece checks differences 73 to 57, none worse, 11 of 11 clefs found real. Held out (14 pieces listed
  before download, `eval/clef-change-fresh-pages.json`): differences 129 to 13, 12 of 12 clefs real and on the right
  line. GregoBase 3775's *et confirmásti* was f f f f, printed h h h h: corrected (second reader wanted).

- 2026-11-14, latest: a staff that slopes on a flat page (`staffSkew` in `scan.mjs`, 2 tests in `scan.test.mjs`,
  `eval/staff-curl-check.md`): a leaf that curls at its head tilts its top staves 9-11 px while the page stays under the
  straightening threshold; each staff's own slope is now measured and taken. The nine differences left on the clef-change
  fresh list were all looked at: 3 GregoBase slips corrected (3461, 3500, 3706), 4 were the curl, 2 are reader faults
  (left-stemmed cephalicus, a porrectus top). 88 earlier checks: agree 17,205 to 17,272, differ 66 to 63. Held out
  (10 pieces chosen by page geometry before reading, `eval/staff-curl-fresh-pages.json`): agree 1,611 to 1,688,
  differ 28 to 21, not read 78 to 41, none worse.

- 2026-11-15: the clef-change list's last two reader faults (`eval/broken-stroke-check.md`). A liquescent's small note
  after a mid-staff clef was read against the staff's first clef (it had no `x0` for the lookup; 3506); a porrectus
  stroke broken near its top is read at its top (`BROKEN_STROKE`, 3679, and 3403 on the first list). 98 earlier
  checks: differ 81 to 78, none worse. Held out (15 porrectus pieces listed before reading,
  `eval/broken-stroke-fresh-pages.json`): identical both ways, 2,869 agree, 2 differ. 2 tests.

## Next

1. **Corpus hardening:** add the remaining verses of Pange lingua and Veni
   Creator (the 1908 book prints them as text under the first verse's
   melody), teach the reader quilismas and
   liquescents (rhombi landed 2026-11-13), and have a person look at the Te Deum
   and 3427 corrections.
2. **Real-file robustness:** run the converter over a batch of Gregorio files
   and fix whatever it misreads:
   - multi-clef pieces;
   - `<sp>` and markup inside text;
   - NABC sections;
   - neumes split across groups.
3. **Rhythm options beyond padding:**
   - (stretching landed above; ear-compare it against padding on two pieces);
   - (half-time mode landed above, `--halftime`; ear check pending);
   - compare the options by ear on two pieces.
4. **Genre templates as code** (first version landed above; fills and section transitions
   landed; ear check remains), each a MIDI drum, bass and harmony generator
   keyed to the mode:
   - deep house at 122–124 BPM;
   - EDM and hard rock at 140–150;
   - metal at 160–180, or half time.

   Dorian and Phrygian voicings come first.
5. **Voices:**
   - (a) (landed 2026-11-03, `RECORDING-GUIDE.md`, untried) a guide for recording a real men's choir or multi-tracking one singer
     against the MIDI line;
   - (b) a research spike on whether an open singing synthesiser can sing
     ecclesiastical Latin as a men's choir at acceptable quality, with a
     listening test and a written protocol. First step landed 2026-11-15: `sing.mjs`
     (`--sing`), a dependency-free formant choir on the right vowels, with each syllable's
     opening consonants sung before the beat (2026-11-15); final consonants landed
     2026-11-15 in three rounds (the third fixed a blip of bare vowel in every final nasal, README); next are
     formant tuning on high notes, /m/ entered by a slow transition, and a listening test. 2026-11-15: openings
     sing the coda's murmur and are read with its tilt rule (held-out part G of `eval/consonant-check.mjs`, 78.0% to
     79.6%, the vowel-only control's false nasals 287 to 135); a third of sung nasal openings still read as nothing.
   2026-11-15: nasal openings (README "Nasal openings: the mouth closes"): the vowel before now hands over in 15 ms, as before a stop, and the reader finds a murmur by being 10 dB darker than both neighbours instead of by its level (which five beating voices scatter over 20 dB). Pre-registered; held-out G 1869 to 1959 of 2349 (83.4%), its nasals 278 to 347 of 404, control false nasals 135 to 44 (predicted 30 or fewer: failed). Not listened to.
   2026-11-15: a short final -um is read against the vowel just before it (README "A short final -um against the vowel just before it"), since five beating voices move the murmur and the vowel together; pre-registered twice (the first withdrawn unread when it heard /u/ releases as nasals): held-out nasals 67 to 73 of 80 (D, E, H), F 96 to 106 of 137, every control unchanged. Reader only; not listened to.
  2026-11-16: the n of a cluster (README "-unt read on its stop"): a murmur that stays dark from an abrupt 8 dB step up to the obstruent's closure or noise is read as the nasal (`PRE` in `onsets.mjs`), tuned on synthetic syllables only (part J: cluster nasals 46 to 124 of 132, others and controls unchanged) and pre-registered: A's *unt*/*ant* 7 to 12 of 12, F's nasals 106 to 116 of 137, corpus cluster nasals 7 to 11 of 11, no part lower, controls identical. Reader only; not listened to.
  2026-11-16: a cluster murmur is no longer thrown out by the obstruent after it (README "nunc and mens on C4"; `AGAIN` in `onsets.mjs`): `vowelAgain` reads only the frames before a closure or fricative that starts within 5 frames. Tuned on J (cluster nasals 124 to 127 of 132), pre-registered on a new held-out part K (14 new cluster syllables, 22 others, five new pitches, 104 BPM): K cluster nasals 121 to 127 of 140, others and control unchanged, every other part byte-identical. Next: E4 eighth-note murmurs read as a voiced closure, and /i/ read as a voiced fricative (83 of K's 119 other and control misses). Reader only; not listened to.
  2026-11-16: `VFRIC_HI5` checked out of sample (README "/i/ checked out of sample"): a second session's held-out /i/ set, written before it saw the rule (now part M, 19 of 24 syllables and E3/D#4 new), reads /i/ 62 to 105 of 120 and its vowel-only control 228 to 288 of 288 on main's reader, v and z unchanged; it beats that session's own rule (energy above 2.5 kHz 6 dB over the vowel's: /i/ 99, v 23 to 16), which was not merged. Next: M's *if* read as an s (7). Reader only; not listened to.
  2026-11-16: /i/ is not a voiced fricative (README "/i/ is not a voiced fricative"; `VFRIC_HI5` in `onsets.mjs`): where the five voices' fundamentals beat out of phase /i/ loses its low band and looked voiced and noisy; frication now needs 12 dB more energy above 5 kHz than the vowel. Chosen on synthetic syllables at K's pitches, pre-registered on a new held-out part L (16 /i/ syllables, 4 z/v codas, 12 others, five new pitches, 96 BPM): L's /i/ 110 to 153 of 160, its vowel-only /i/ 128 to 160, z/v and others unchanged; every other part rose (K's others 166 to 198 of 220) and every corpus part's vowel-only control now reads 100% none. Next: E4 eighth-note murmurs read as a voiced closure (unchanged by this round); L's *sub*/*cum* read as nothing and *fid*'s d; the listening test should judge the /i/ beat swell (8-18 dB under 500 Hz). Reader only; not listened to.
  2026-11-16: E4 eighth-note murmurs read as a closure (README "E4 eighth notes: a murmur read as a closure"; `DEEP` in `onsets.mjs`): a held -12 to -35 dB murmur that ends in frication or a silent closure with a burst is read as the nasal. Two pre-registrations, on new held-out parts N (108 BPM) and O (126 BPM, F2 new), both failed: O's D4-E4 eighths 25 of 30 either way, one more voiced stop read as a nasal, M's others 106 to 105. Net +8/-1 over every part, but as registered it is off by default (`deepMurmur: true`, `--deep on`). Next: O's five D4-E4 eighth misses (*punc*, *tunt*, *ment*, *sons*) read frame by frame, with a new part P. Reader only; not listened to.
  2026-11-16: O's D4-E4 misses read frame by frame (README "A murmur louder than the dip before it"): the n was too loud, not too quiet, swelling 5-12 dB over the vowel's darkening dip past the cluster rule's ceiling. `PRE.hi` 4 to 12 (set on J, N, O: O's D4-E4 pulse-2 clusters 25 to 28 of 30, N +2, nothing worse). Pre-registered on a new held-out part P: prediction (1) failed on a ceiling (P's high cells 29 of 30 before and after), (2)-(5) held, every other part byte-identical but K +1; shipped on, since nothing reads worse. Parts J-O's "eighth notes" are pulse-2 quarters. Next: *sons* on D4 (a 7.9 dB step), *rint* on D4 (a quiet murmur inside the closure), L's *sub*/*cum*. Reader only; not listened to.
  2026-11-16: a voice bar at one level (README "A voice bar at one level"; `voiceBarGain`, `VOICE_BAR_DB` 28 in `sing.mjs`): the fixed voice-bar gain left a b/d/g closure 20-42 dB under its vowel by pitch and vowel, and L's *sub* bar at 17-20 dB was read as nothing; now set per note. Synthesis, not reader. Pre-registered on a new held-out part Q: voiced stops 95 to 102 of 120, others and control unchanged; failed on K's others (198 to 191: *ib*, *eb*, *ob*) and N's voiced stops as a nasal (1 to 5: *nab*, *gab*); openings rose most (held-out G 1959 to 2055 of 2349, voiced alveolar 116 to 172). Next: K's *ib*/*eb*, N's *nab*/*gab*, L's *cum*, *sons*/*rint* on D4. Not listened to.
  2026-11-16: a closure against the vowel before it (README "A closure against the vowel before it"; `LOCAL_REF` in `onsets.mjs`): on D4 the reference fell in a 15-20 dB beat trough, so a voice bar 25 dB under the vowel before it read 13 dB under the reference and missed the closure rule; the closure rule now reads against the louder of the reference and the vowel 30-120 ms before (the nasal rule keeps the reference: on it, vowel-only controls lost 33). Pre-registered on a new held-out part R (112 BPM, A#2-F4): voiced stops 99 to 103 of 120, nasals, others and control unchanged, openings byte-identical; development parts J-Q +2 to +8 each. Tried, off: the voice bar low-passed through the walls (`voiceBarWall`; openings 812 to 808). Next: on D#4 and E4 the burst stands under 12 dB over the bar above 600 Hz (N's *nab*/*gab*); read R's misses (*nob*/*rog*/*hob* as a nasal, *dib*/*sib* as nothing) frame by frame; L's *cum*; *sons*/*rint* on D4. Reader only; not listened to.
  2026-11-16: a p's burst read as a k (README "A p's burst read as a k"; readCoda `voicelessLow`, now the default): the energy above 1 kHz in V's A3-B3 p bursts is the burst's own. One 8 ms draw of the 500 Hz noise band puts 11-79% of its energy above 1 kHz (median 0.39), set per pitch-and-length cell, not per syllable (97% of the variance between cells), while every voiceless velar burst held 99% or more. A voiceless burst with 0.9 or less above 1 kHz is now labial: A-V +31 cells, none lost; pre-registered on a new held-out part W (122 BPM, A2-C#4), p read as a k 18 to 0, p codas 100 to 118 of 120, velars, voiced stops, others and control unchanged: held. Next: no burst found on C#4-E4 (*bob*, *lag*, *pob*); L's *cum*; *sons*/*rint* on D4; count registrations' trials in cells, not syllables. Reader only; not listened to.
  2026-11-17, latest: a dark-vowel m that holds level (README "A dark-vowel m that holds level"; readCoda `lipHold`, `LIP_HOLD`, opt-in): with lipShut, a's *bum*, *hum*, *fum* still read as nothing because the /u/'s upper band falls before the closure, so the m is no darker there. Its level settles 4-11 dB under the vowel and holds within 2 dB for 30 ms. A-a: +22 cells, none lost (a's dark-vowel nasals 121 to 128 of 144). Pre-registered on new part b (90 BPM, C#3-E4): 133 to 135 of 144, 3 wanted: failed; nothing else moved. Left: b's *num*, *mum*, *bun* (7 of its 9 remaining misses, a nasal or labial onset before -um/-un). Reader only; not listened to.
  2026-11-17: a dark-vowel m (README "A dark-vowel m"; readCoda `lipShut`, `LIP_SHUT`, now the default): after /u/ on C#4-E4 a final m is dark in itself but no darker than the vowel, so the level and step rules missed it (Z's *lum*, *dun*, X's *tum*). Its lip closure marks it: the band above 1 kHz falls 14-19 dB within two hops and holds. A-Z: +31 cells, none lost (F's nasals 194 to 206 of 215). Pre-registered on new part a (94 BPM, D3-E4): nasals after /u/ or /o/ 116 to 121 of 144, everything else and the vowel-only control unchanged: held. Left: a's *bum*, *hum*, *fum*, *mun*, *gun*, *vum* still read as nothing. Reader only; not listened to.
  2026-11-17: a voiced closure that holds to its burst (README "A voiced closure that holds to its burst"; readCoda `voicedLead: { hold: true }`, now the default): the bar form skipped Y's nasal misses because their closures came from the closure rule. A closure-rule closure now counts when it passes the voice-bar rule's release test (no frication after the burst, the 20 ms before it voiced), and the dropped run starts at most 100 ms before it (stop leads 5-70 ms, final nasals 185-275 ms). A-Y: gains in 11 parts, no cell lost. Pre-registered on new part Z (98 BPM, A2-E4): voiced stops 171 to 177 of 192, read as a nasal 9 to 2; nasals, clusters, others, control unchanged: held. Left: dark-vowel m (*lum*, *dun*, X's *tum*), place misses. Reader only; not listened to.
  2026-11-17: a g's voice bar read as a nasal (README "A g's voice bar read as a nasal"; readCoda `voicedLead`, opt-in): X's *cog* on C#4-E4 had its closure and burst found, but a level- or step-rule run (/o/ darkening into the closure, then the bar's first frames) started earlier and won. Dropping a nasal run that ends at or inside a voice-bar-rule closure that reads voiced: A-X +11 cells, none lost (X's voiced stops 130 to 133); a broader form on any voiced-reading closure lost 9 n-t/n-c clusters and was dropped. Pre-registered on a new held-out part Y (102 BPM, G#2-E4): voiced stops 173 to 174 of 192, read as a nasal 10 to 9 (2 wanted): failed, stays opt-in; nasals, clusters, others, control unchanged. Y's misses end on closure-rule closures; next: a cluster-safe voiced-closure test for those; *tum* on D4-E4 (m only 4-6 dB darker than /u/, step rule wants 7). Reader only; not listened to.
  2026-11-17: no burst on C#4-E4 (README "No burst on C#4-E4"; readCoda `barBurst`, now the default): there a voice bar is only 4-7 dB under the vowel below 500 Hz, so the closure rule missed it and the nasal rule read it, and b's 500 Hz burst stood within 2-9 dB of the bar's harmonics above 600 Hz. Now a dark voiced run ended by a burst is a closure, the burst also searched above 2 kHz, with guards for a cluster's n. A-W: voiced stops +5 to +11 per part (T 122 to 131 of 144), 2 cells lost; pre-registered on a new held-out part X (106 BPM, A#2-E4): voiced stops 102 to 130 of 144, C#4-E4 ones read as a nasal or nothing 30 to 6, nasals, clusters, others and control unchanged: held. Next: X's *cog* as a nasal, *tum* as nothing; L's *cum*; *sons*/*rint* on D4. Reader only; not listened to.
  2026-11-16: a g's burst read as a b (README "A g's burst read as a b"; readCoda `compactVelar`, opt-in): the velars read as labial on F#3-A#3 had compact 1.9-2.8 kHz bursts but under half their energy above 1 kHz (the voice bar runs on under them), so the low-labial test fired first; reading compactness first gained 7 cells on A-U and lost none, but on a new held-out part V (114 BPM, G2-D4), pre-registered, velars went 175 to 176 of 192 (+3 wanted): V had one such cell to fix, so it failed and stays opt-in. V's bigger fault: 14 of 108 labials read as a velar, voiceless p on A3-B3 whose found burst is 54-66% above 1 kHz though p is sung at 500 Hz. Before that: a voice bar read as a murmur (README "A voice bar read as a murmur"; readCoda `barLead`, opt-in): T's nasal misses read frame by frame came from the level rule, whose run starts 1-7 frames before a burst-ended closure; dropping such runs gained T 122 to 125 and lost nothing on A-T, but on a new held-out part U (110 BPM, A2-D#4), pre-registered, voiced stops went 127 to 128 of 144 (+2 wanted), so it failed and stays opt-in; read as a nasal 6 to 4, clusters, nasals, others, control unchanged. Before that: closeAnchor with the coda wall failed on T (122 to 121). Next: p's burst on A3-B3 read as velar (V: *lap rup sep fip mop dap*); no burst found on C#4-E4 (*bob*, *lag*, *pob*); L's *cum*; *sons*/*rint* on D4. Reader only; not listened to.
6. **Mix and master checks:**
   - a script that measures integrated LUFS, true peak, mono compatibility and
     clipping against streaming targets;
   - it runs locally and costs nothing per track.
   - landed 2026-11-03: `master-cli.mjs` (LUFS, true peak, mono, clipping).
   - 2026-11-14: checked against EBU Tech 3341 Table 1 built from its text (cases 1-5, 9, 10, 12, 13, 15-23: 69 of 69 inside tolerance; `eval/ebu-tech3341.mjs`); momentary and short-term max added; Spotify's own page read and its headroom cap and -2 dBTP rule applied; the other services publish no level (eval/ebu-tech3341-2026-11-14.md). Open: the EBU's own WAV set and authentic programme files (403 here), a real mix.
   - 2026-11-14: loudness range (EBU Tech 3342, read from tech.ebu.ch): `loudnessRange` in master.mjs, printed by master-cli; Table 1 cases 1-4 from the text 24 of 24 inside tolerance with a -10 LU gate control that fails; 11 of 12 within 0.2 LU of ffmpeg's ebur128, the 12th a percentile-rank difference (eval/ebu-tech3342-2026-11-14.md). Open: cases 5-6 (EBU's programme WAVs), a real mix.
7. **Release kit:**
   - metadata, credits, ISRC slots, the AI-disclosure answers, cover-art spec
     and a per-track source note;
   - the owner opens the distributor account and uploads. Agents prepare
     everything up to that step.
8. **First release:** an EP of three to five tracks, then a steady cadence.
   2026-11-16: `ep-cli.mjs` builds the EP folder from a plan (`examples/first-ep.json`: four tracks, 11:40,
   all at -14 LUFS, cover drawn from Dies irae's opening, release check clean but for artist, p/c-lines and
   ISRCs). Next: a listening pass on the folder; per-track variation for `--repeat`.
   2026-11-16, later: the studio page's own "Build the release folder (ZIP)" button (`ep-core.mjs`,
   `release-core.mjs`; README "The same folder from the studio page"): a one-track single, byte-identical to
   `ep-cli.mjs`'s files but for the cover's compression (same pixels), 1.9 s in Chromium. Next: several tracks
   from the page (an EP queue), and a listen.
   2026-11-16, latest: the EP queue on the studio page (`ep-queue.mjs`; README "Several tracks from the studio
   page"): tracks with their own settings and ISRCs, reorderable, kept over a reload, built through the same
   `releaseKit`; a two-track queue is byte-identical to `buildEp` on the same plan. Next: a listen, and the
   release folder against a distributor's real form.
   Afterwards, use the existing `distrokid-royalty-to-journal` tool on the
   real earnings export.

## Owner decisions this needs (later, not now)

- Artist name and whether it is published under the portfolio's name.
- Distributor account (card, about $20–25 a year) and whether to pay singers.
- 2026-11-03: `render-cli.mjs --lufs N --limit` (`limiterCurve` in `render.mjs`): 5 ms lookahead limiter looping on LUFS and true peak. Dies irae deep house: -14.00 LUFS, -1.05 dBTP (without `--limit` -15.91, -0.19); metal unchanged. 1 test; stems sum to the mix. Not listened to (pumping is an ear judgement).
- 2026-11-13, latest: `--choir textbook|amateur|octave` (README "A choir by name"): one option for the four section ranges; without `--split-voices` it sets the unison range to the band every section reaches and names the fewest sections that fit when unison does not. Corpus (eval/choir-presets-report.md): textbook choir unison 60 of 67 (E2-E4 default: 67), amateur 12, octave 0; octave needs three sections for 8 files, TTBB for 1, none fits 2. Studio page choice too. Not tried with singers.
- 2026-11-13, latest: `--singers FILE.csv` (README "Your own choir"): section ranges from a choir's own range test, each section the notes all its singers reach, the unison band the notes every singer reaches; the report names who sets each end and what excusing them buys. Unsectioned files are divided by contiguous cuts by mid-range (narrowest section equal to brute force on 290 synthetic choirs, eval/singers-check-report.md). Studio page box too. Not tried with a real range test.
- 2026-11-13, latest: `--sit-out N` (README "Letting a singer sit a note out"): a section sings the notes all but N of its singers reach; the report and a `sitting out:` line say who misses which notes in the arrangement, with a warning at a quarter of a singer's notes. Made-up range tests (eval/sit-out-report.md): Dies irae full choir 16 to 347 of 613 notes at N = 1; 6 of 8 chants unison at N = 2. Studio page choice too. N is the director's; not tried with a real choir.
- 2026-11-14, latest: staff lines at their own thickness (`trimLine`, outer-pair spacing and a median-spacing check in `findStaves`, `scan.mjs`): a line crowded with heads had been measured up to 19 px thick, erasing the heads on it and losing whole staves. On the 185 pages scanned: staves 1,361 to 1,384, notes read 46,079 to 47,864, lines 0.5 spaces or thicker 38 to 3; no piece agrees with its GABC on fewer notes (3407: 207 to 216 of 219; 3429: 208 of 210 to 286 of 287); squares called rhombi 6 to 3 (eval/thick-line-check.md). Not held out.
- 2026-11-14, latest: tilted pages straightened (`estimateSkew`, `shearColumns` in `scan.mjs`): slope from the sharpest sheared row profile, columns moved whole pixels, only when a line drifts 10 px or more. Drawn pages: square reader fails from 0.5 degrees (1 or 36 of 99 heads at 0.5, 4 at most from 0.8), straightened 99 of 99 from 0.3 to 2.5 degrees (eval/deskew-check.md). Real pages, a later session (eval/deskew-report.md): 2 of 185 pages straightened. Leaf 424 (p. 399, -0.94 degrees) goes from 2 to 9 staves and 15 to 345 notes; leaf 585 is unchanged; nothing lost; shape-check identical.
- 2026-11-14, latest: GregoBase 3670 (*Qui timetis*, pp. 398-399) added to the corpus and scan-check, the piece on leaf 424's newly read staves. Straightened, 290 of 299 notes agree and 0 differ; square, the alignment stops at note 180. Bivirga, trivirga, distropha and tristropha (`gvv`, `gvvv`, `gss`, `gsss`) are now one note per printed head in `parseGabc` and `gabcSteps`. That puts back 26 notes the MIDI dropped across 15 corpus files and clears 2 false disagreements (eval/deskew-check.md). `scan-pages.json` page labels for the six off-final pieces' third leaf corrected by one (leaf = page + 25, read off the running heads).
- 2026-11-14, latest: `--musicxml FILE` (`musicxml.mjs`, README "A score for the choir"; a studio page download too): the choir's parts as MusicXML 4.0, one per section, Latin under the notes, 4/4 with ties, breath marks, rehearsal marks, fitted key signature. 304 corpus scores valid against the 4.0 XSD; music21 reads back 97,705 of 97,705 part-notes exactly (eval/musicxml-check-report.md). Not opened in a notation program; not sung from.
- 2026-11-15: rehearsal tracks per section (`render-cli.mjs --learn DIR`, `learningTracks` in `render.mjs`, studio-page ZIP; README "Rehearsal tracks per section"): `-part` (section left, others -12 dB right, band -6 dB) and `-minus` (all but the section). `learn.test.mjs` 4 tests (levels measured from the WAVs); browser ZIP equals the CLI's byte for byte (eval/browser-e2e.mjs, 114 checks). Not tried by singers.
- 2026-11-15: the preview choir sings the vowels (`sing.mjs`, `formants.mjs`, `render-cli.mjs --sing`, studio page "Choir voice"; README "The choir sings the vowels"): Latin vowel rules, five detuned sawtooth voices through a five-formant cascade at Peterson and Barney's men's values, diphthong glides, 50 ms legato cross-fades. Measured by LPC from the audio (eval/vowel-check-report.md): corpus choir notes read as their written vowel 95.3% (pad 17.8%); held vowels 29 of 30 E2-E4. `sing.test.mjs` 5 tests; browser WAV equals the CLI's. Not listened to; no consonants.
- 2026-11-15, later: the choir sings each syllable's opening consonants (`latinOnset`, `PHONES` in `sing.mjs`; README "Opening consonants"): stops as closure plus burst, affricates, fricatives as band noise, nasals, l, a tapped r, glides, on the same source and cascade, sung before the beat (up to half the previous note) so the vowel lands on it. Read back from the audio by a rule-based acoustic reader (`onsets.mjs`, `eval/consonant-check-report.md`): 184 of 210 VCV pairs E2-E4 (the tuning set), 698 of 934 held-out corpus syllable openings exactly (class, voicing, place; 724 by class; the vowel-only choir hits 6.7% by chance). Vowels still 97.6% on the 920 notes with 0.1 s of steady vowel left. Not listened to; no final consonants.
- 2026-11-15: the choir sings each syllable's final consonants (`latinCoda`, `codaPlan` in `sing.mjs`; README "Final consonants"): the opening recipes run the other way, ending where the note's sound does, at most 35% of the note; nasals now low-passed (a murmur, not the vowel 4 dB down). Read back by `readCoda` (`onsets.mjs`, `eval/coda-check-report.md`): 129 of 180 syllables before a rest E2-E4 (tuning set), 123 of 162 corpus closings exactly (75.9%; not clean held out, see the report), vowel-only choir none 160 of 162. Openings re-measured with a window that starts after the previous coda: 745 of 934 (79.8%; 80.9% without codas). Vowels 97.3%. Not listened to.
- 2026-11-15, latest: final consonants, second round (README "Final consonants, second round"): per-phone floors in `codaPlan` (45 ms closure, 60 ms murmur; a cluster may take half the note), a burst running into frication read as a release, the nasal murmur set 7 dB under its vowel per note (`nasalGain`, Fujimura 1962) with its antiformant, and vowel formants moving to the place's locus before a nasal. Held out (part D, ten Graduale pieces fixed before the changes): 58 to 63 of 70 (82.9% to 90.0%); k s 0 to 3 of 3. Five pieces (misses read): 123 to 134 of 162; k 3 to 12 of 13; nasals 22 to 21 of 42. Open: /m/ after /u/ (11-12 dB darker than the vowel, reader asks 15). Not listened to.
- 2026-11-15: final consonants, fourth round (README "Final consonants, fourth round"): `readCoda` asks a murmur to be dark in itself (`MURMUR_TILT`, energy above 1 kHz 28 dB or more under the band under 500 Hz; /l/ measures 12-25, m and n 38-54), pre-registered in `eval/coda-check.mjs`. Final *al*/*el* 2 to 12 of 12; tuning set A 137 to 157 of 180; held-out E 75 to 76 of 86; B and D unchanged; new set F (51 scan-check files): /l/ as nasal 1 to 0 of 4, nasals 96 of 137 either way. The same rule on openings failed its registration (B nasals 96 to 64 of 149) and stays off. Found: the sung /l/ is up to 8 dB louder than its vowel (`PHONES.l` av 1.4), next. Not listened to.
- 2026-11-15: final consonants, fifth round: the final r (`CODA_TAP`, `codaPlan` in `sing.mjs`; `readCoda` in `onsets.mjs`; README "Final consonants, fifth round"): a final r is its 45 ms contact then 35 ms of voice, so the flick sits inside the note with sound after it; the reader takes a dip against its neighbours after a dark vowel, and a murmur running into a tap as the r. Held out (part H, twenty Graduale pieces fixed and scored first, misses hidden), on main with the round-4 /l/ rule: 118 to 121 of 134, r 4 to 7 of 7; r across D, E, H 16 to 26 of 27; B 142 to 147 of 162. Openings unchanged, vowels before the coda 97.3%. Not listened to.
- 2026-11-15, latest: final consonants, sixth round (README "Final consonants, sixth round"): a final /l/'s voicing set per note (`lateralGain`, `LATERAL_DB` 4 in `sing.mjs`) 4 dB under its vowel; it was -1 to +8 dB over. Over twelve seeds -5.0 to -2.4 dB (was -5.4 to +8.6); the registered one-seed prediction failed (20 of 30 in 1-7 dB under: five voices beat in a 25 ms span). Coda check identical in every part; openings 743 to 742 of 934. Not listened to.
- 2026-11-15: formant tuning on high notes (`tuneF1`, `SING_DEFAULTS.f1Tune` 1.1 in `sing.mjs`; README "Formant tuning on high notes"): F1 raised to at least 1.1 x f0, so a tenor's G4/A4 /i/ and /u/ no longer drop 10-16 dB under /a/. Pre-registered three lines, all hold (eval/f1-tune-check-report.md): /i/ /u/ at G4 A4 gain 12.9 dB on average against /a/; held vowels read 179 to 180 of 200 E2-A4; corpus vowels and codas identical, openings 742 to 743 of 934. The LPC reader cannot tell tuned from untuned /i/ above E4; not listened to.
- 2026-11-16: a liquescent whose small note straddles a staff line (`LIQ.onLine`, `LIQ.straddle` in `scan.mjs`; README "A liquescent whose small note sits on a staff line"): GregoBase 3464 *sanc-* `fd~` read d, not e. Tuning lists (113 pieces): two notes moved, both wrong to right, nothing else. Held out (15 pieces, 25 such liquescents, committed before their pages were read): the registered gain failed, the rule moved nothing; main already reads 22 of 25. Next: the one-step cephalicus read as one head (3490, 3508; eval/hook-on-line-check.md).
- 2026-11-16, later: the one-step cephalicus (`oneStepCephalicus`, `ONE_STEP` in `scan.mjs`; README "A one-step cephalicus read as one head"): 3490 *con-* and 3508 *et* `gf~` read as head then small note. Tuning lists (128 pieces): one-step cephalici 69 to 74 of 84, agreeing +5, nothing worse; every place changed looked at. Held out (12 pieces on unread leaves, committed before download): 16 to 17 of 17, nothing worse; 3 of 4 predictions held, one failed as worded. Next: the 10 tuning misses left (three, `kj~` `ih~` `ed~`, need a stem test that is not a hairline width).
