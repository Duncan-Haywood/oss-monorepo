// League schedule generator: pure functions, no package dependencies (sibling modules only, among them the
// carry-over search in carryover.mjs), nothing leaves the browser.
//
// Pipeline: parse the text fields -> circle-method rounds (home/away built in) ->
// real dates (weekdays, skip dates, team blackouts, makeup rounds) -> court/time slot
// assignment by seeded simulated annealing -> outputs (tables, CSV, .ics, text) and an
// independent validator that re-checks the finished schedule from its output alone.
//
// calc.mjs is the one entry point the pages, the server and the tests import. Since 2026-11-23 the
// code lives in feature modules beside it, and this file re-exports exactly the names it exported
// before the split, so no importer changed:
//
//   dates.mjs         Dates and times: weekday names, ISO days, the next play day, parsing of dates, weekdays and clock times.
//   names.mjs         Team names: read a pasted list (lines, commas, a spreadsheet column) and find a typed name in it.
//   schedule.mjs      The season itself: text fields, slot assignment, building the dated schedule,
//   fields.mjs        Shared text-field readers (CSV rows, name and time lists, court closures), relabelling and forfeits;
//                     schedule.mjs re-exports them, and divisions.mjs takes them from here to skip the season builder.
//   rounds.mjs        Circle-method rounds: single and double round robins with home and away built in, and their breaks.
//   share.mjs         The share link (every field in the URL, read back safely), the example league and next season's fields.
//   rng.mjs           Seeded randomness: one small generator every search shares, so a seed gives the same season everywhere.
//   officials.mjs     Officials (referees, umpires, scorers): parse the list, assign them to matches, check the assignment.
//   outputs.mjs       Views and exports of a finished schedule: team views, CSV (plain, calendar, TeamSnap, SportsEngine),
//   standings.mjs     Results, standings, tie-breaks and the play-off race (clinched, eliminated, odds).
//   pools.mjs         Pool play: snake-drafted pools, clubs kept apart, advancers and crossover seeds.
//   pool-play.mjs     Each pool's own season, built by schedule.mjs on the shared dates (kept apart so the bracket pages skip it).
//   brackets.mjs      Play-off brackets: seed order, single and double elimination, typed bracket results and text.
//   swiss-system.mjs  Swiss events on the page: rounds needed, results parsing, validation and text. The pairer is swiss.mjs.
//   americano.mjs     Americano and Mexicano: rotations (whist designs), stats, score parsing, standings and the next round.
//   ladder.mjs        Ladder leagues: challenge results and the ladder after them.

export { WEEKDAYS, toDay, dayIso, dayOfWeek, dayLabel, parseDate, parseDateList, parseWeekdays, parseTime } from "./dates.mjs";
export { MAX_TEAMS, parseTeams } from "./names.mjs";
export { parseBlackouts, csvRows, blackoutsFromCsv, parseTimeLimits, parseCourtClosures, courtClosedOn, parseCourtLimits, parseNameList, parseTimes, readSpec, MAX_GAMES_PER_NIGHT, assignSlots, legalRoundSlots, limitConflicts, placeRounds, nightsOf, expandNights, relabelPlan, fitPlanToBlackouts, seedStrength, balanceSeedStrength, buildSchedule, assignFixtureIds, nightWaits, scheduleStats, slotFairness, seasonCost, deadlineCheck, restReport, forfeitReport, byeReport, homeAwayReport, rematchReport, validateSchedule, applyRainouts, changeNotices, applyPinnedMatches, applyWithdrawals, applyLateTeams, parseGrounds, groundClashes, applyGroundSharing, parseLinkedTeams, linkedClashes, separateLinkedTeams } from "./schedule.mjs";
export { roundRobin, oneDayTimetable, oneDayText, countBreaks } from "./rounds.mjs";
export { encodeFields, decodeFields, sampleFields, nextSeasonFields } from "./share.mjs";
export { mulberry32 } from "./rng.mjs";
export { parseOfficials, assignOfficials, validateOfficials } from "./officials.mjs";
export { teamSchedule, csvCell, scheduleCsv, scheduleCalendarCsv, TEAMSNAP_COLUMNS, teamSnapCsv, SPORTSENGINE_COLUMNS, parseTeamIds, sportsEngineCsv, standingsCsv, icsEscape, icsAlarm, icsFold, scheduleIcs, teamMessages, officialMessages, seasonGrid, seasonGridCsv, scheduleText, htmlEsc, leaguePageHtml, scoreSheetsHtml } from "./outputs.mjs";
export { parseResults, parsePointSystem, formString, streakOf, seasonRecords, crossTable, matchPoints, matchOutcomes, standings, tieBreakNotes, RACE_EXACT_LIMIT, playoffRace, remainingFixtures, weeklyUpdate, resultsCheck, overdueResults, gamesLeft, scheduleStrength, playoffOdds, raceText } from "./standings.mjs";
export { splitPools, clubPairsInPools, poolAdvancers, poolPlayoffSeeds } from "./pools.mjs";
export { buildPoolPlay } from "./pool-play.mjs";
export { seedOrder, playoffBracket, doubleEliminationBracket, readPlayoffLine, playBracket, bracketText } from "./brackets.mjs";
export { swissRounds, parseSwissResults, validateSwiss, swissText } from "./swiss-system.mjs";
export { americano, validateAmericano, americanoStats, americanoText, parseMexicanoScores, mexicanoStandings, mexicanoNextRound, mexicanoText } from "./americano.mjs";
export { parseLadderResults, ladderStandings, ladderChallenges, ladderText } from "./ladder.mjs";
export { swissStandings, swissPairings, swissPairingsGreedy, colourClaim, floatHistory } from "./swiss.mjs";
