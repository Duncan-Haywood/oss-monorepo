// Builds a bowling season off the page thread: with five or more limited teams the page tries
// several dealings, each a full lane search (up to about 10 s on 24 teams x 26 weeks), and on the
// page thread that froze the tab. The page falls back to building in place if a worker can't start.
import { bowlingSchedule, laneReport, validateBowling } from "./bowling.mjs";
self.onmessage = (e) => {
  try {
    const season = bowlingSchedule(e.data);
    if (season.errors?.length) { self.postMessage({ ok: true, season }); return; }
    self.postMessage({ ok: true, season, report: laneReport(season), problems: validateBowling(season) });
  } catch (err) { self.postMessage({ ok: false, error: err.message }); }
};
