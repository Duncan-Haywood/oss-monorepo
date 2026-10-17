package ambient

import kotlin.math.sqrt

/**
 * Energy-gate voice activity detector with hangover. A stand-in for a learned VAD
 * (for example Silero VAD, MIT): it only looks at frame RMS, so it fires on any loud noise.
 */
class EnergyVad(
    private val rmsThreshold: Double,
    private val hangoverFrames: Int,
) {
    init { require(rmsThreshold > 0 && hangoverFrames >= 0) }
    private var hang = 0

    /** True while speech is considered active (including the hangover tail). */
    fun update(frame: ShortArray): Boolean {
        if (rms(frame) >= rmsThreshold) hang = hangoverFrames + 1
        else if (hang > 0) hang -= 1
        return hang > 0
    }

    companion object {
        fun rms(frame: ShortArray): Double {
            if (frame.isEmpty()) return 0.0
            var s = 0.0
            for (x in frame) s += x.toDouble() * x
            return sqrt(s / frame.size)
        }
    }
}
