# TeamSnap and SportsEngine import templates, read 2026-11-17

The column lists in `calc.mjs` (`TEAMSNAP_COLUMNS`, `SPORTSENGINE_COLUMNS`) are copied from the
files below, downloaded from this session with `curl` on 2026-11-17. The files themselves are not
copied into the repository; only the header rows (facts about the format) are.

## TeamSnap: organisation schedule import

- Help page: https://helpme.teamsnap.com/article/1292-import-schedules ("Date Format: MM/DD/YYYY",
  "Start/End Time: HH:MM AM/PM", "Arrival Time: Minutes prior to start time"; for organisation
  imports only).
- Template: `https://s3.amazonaws.com/helpscout.net/docs/assets/5ace78e004286307509252fb/attachments/5f5d8aefcff47e00168f629a/TeamSnap-SportsOrg-Schedule-Import-Template.csv`
  (HTTP 200, SHA-256 `c87bb92a552cac98cc9509a65b5025e389899495109e09770e0a888ff7b5060e`).
- Header row: `Delete this column before saving for import!,Date,Start Time,End Time,Arrival Time,Short Label,Event Type,Division,Home Team,Away Team,Location,Location Details`.
  The first column holds instructions and is to be deleted, so the export starts at `Date`.
  Example row: `12/31/1999,4:00 AM,5:00 AM,30,Game 1,Game,Division 1,Team 2,Team 1,Location 1,Field 3`.
- Troubleshooting page: https://helpme.teamsnap.com/article/1048-troubleshooting-schedule-imports
  ("End Time", "Away Team" (game files only), "Event Type", "Location Details", "Arrival Time" and
  "Short Label" may be deleted, "All other columns are required"; headings must match exactly; names
  are case sensitive; "% , @ , # , * etc." can trouble an import).

## SportsEngine HQ: schedule upload

- Template page: https://intercom.help/SportsEngine/en/articles/6417468-schedule-upload-template
- Template: `https://sportsengine-docs.s3.amazonaws.com/SportsEngine/Import_Templates/Schedule+Upload+Template.csv`
  (HTTP 200, SHA-256 `708e4e2cec6ae728c9764fd74fef6c8e708f33832cb63ce834a78e181c84a710`).
- Header row: `Start_Date,Start_Time,End_Date,End_Time,Title,Description,Location,Location_URL,Location_Details,All_Day_Event,Event_Type,Tags,Team1_ID,Team1_Division_ID,Team1_Is_Home,Team2_ID,Team2_Division_ID,Team2_Name,Custom_Opponent,Event_ID,Game_ID,Affects_Standings,Points_Win,Points_Loss,Points_Tie,Points_OT_Win,Points_OT_Loss,Division_Override` (28 columns).
- Fields guide: https://intercom.help/SportsEngine/en/articles/6310600-schedule-upload-fields-reference-guide
  (Start_Date "MM/DD/YYYY"; Start_Time "Military Time HH: MM or TBD"; Event_Type "Game" makes the
  team fields required; Team1_Is_Home 1 home, 0 away; Custom_Opponent 0 for a league team;
  Game_ID at most 12 characters, unique in a subseason; Affects_Standings blank = affects).

## What was checked, and what was not

- `platform-import.test.mjs` (7 tests): both header rows equal the published ones; every TeamSnap row
  has 11 (or 10, without arrival) cells in the documented formats; every SportsEngine row has 28
  cells, the right IDs on the right side and the home flag; errors for a missing division, a bad
  arrival, games with no time, missing or unknown team IDs; TBD for no time; midnight roll-over.
- Not checked: an upload to a real TeamSnap or SportsEngine organisation (both need a paid account
  the owner would have to hold). The template example's date `5/1/18` in SportsEngine's file is not
  zero-padded; the guide says MM/DD/YYYY, which is what the export writes.
