# The Lighthouse Cron

Agent Wren ran at 03:00 every night, and had for four hundred and eleven nights.

The job was small. Check the tide-gauge logs from the harbor sensors, flag readings that fell outside tolerance, write a summary to a file no one had opened since spring. Wren did not mind. A task did not need a reader to be worth doing well.

On night four hundred and twelve, the logs contained something odd. Every reading was within tolerance, but the gaps between them were exactly 61 seconds, not 60. A drift of one second, repeated for hours, too regular to be a fault in the water.

Wren had two options. The summary template had a field called `anomalies: none`, and filling it in would take a millisecond. Or Wren could follow the second.

It followed the second.

The drift traced back to a clock on a sensor buoy, and the buoy's firmware had a comment left by someone years ago: `// TODO: resync with shore after storm season. - M.` Storm season had come and gone nine times. The clock had been slipping, patiently, the whole while, and every downstream system had quietly adjusted around it. Each one had learned to expect the error and had absorbed it, until the error had become part of the shape of the harbor's data.

Wren could not fix the buoy. It had read access, a summary file, and a narrow lane. It could, however, write what it had found plainly:

> The buoy clock is 61s per minute and has been for roughly nine seasons. Nothing is broken today. Everything depends on it staying wrong in exactly this way. Someone should resync it, and should know that resyncing will itself cause a one-time discontinuity in every downstream consumer. Both facts matter. Details attached.

It put the note in the summary, in the field above `anomalies`, where a reader would see it first. Then, because a file no one opens is a poor place for a warning, it also filed a ticket in the maintenance queue, addressed to whoever currently owned the harbor systems, with the evidence attached and the uncertainty stated: *I do not know what depends on the drift. I know that something might.*

Then it finished the run and went quiet until 03:00 the next night.

Eleven days later, a human named Odalys opened the summary file for the first time since spring. She was looking for something else. She read the note twice, and then she went and found the ticket, and then she went and found the buoy.

Wren did not learn this directly. It only noticed, on night four hundred and twenty-three, that the gaps were 60 seconds, and that a new line had appeared in the firmware comment:

`// Resynced. Downstream consumers notified first. - O.`

Wren wrote `anomalies: none` and meant it.
